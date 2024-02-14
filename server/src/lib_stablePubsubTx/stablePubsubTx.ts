import { RedisTransaction } from './redisTxAdapter'
import { initSyncQueue, with_syncQueue } from './SyncQueue'

// ## possible names
// - single tenancy
// - http persistent transaction
// - singleton transaction
// - http persistent transaction pool
// - keep alive transaction
// - join to transaction

// ------------------------------------------------------------------------

const nodeJSInstance_activeRedisTransactions = {
  current: [] as {
    transactionId: string
    onNodeJSSigint: (err: Error) => Promise<void>
  }[],
}

export const delay = (ms: number) => new Promise(res => setTimeout(res, ms))

export const closeAllOpenTransactions = async () => {
  // TODO: should we clear open subscription to redis as well? or its closed by default?
  await Promise.all(
    nodeJSInstance_activeRedisTransactions.current.map(async t => {
      // await closeTransaction(t.transactionId);
      // this notify user that nodejs was killed
      const errLogEvent = new Error('Nodejs processed unexpectedly exited')
      // await appendLogToTransaction(t.transactionId, errLogEvent);
      await t.onNodeJSSigint?.(errLogEvent)
      // await publishLogEvent(t.transactionId, errLogEvent);
    })
  )

  // give some time to propagate messages into redis pubsub
  // await delay(50);
}

// this context manager is used for catching unexpected killing of nodejs instance
const with_nodejsTransaction = async (
  arg: {
    onNodeJSSigint: (err: Error) => Promise<void>
  },
  cb: () => Promise<void>
) => {
  const internalRunningNodeTransactionId = Math.random().toString()

  try {
    nodeJSInstance_activeRedisTransactions.current.push({
      transactionId: internalRunningNodeTransactionId,
      onNodeJSSigint: arg.onNodeJSSigint,
    })

    await cb()
  } catch (err) {
    throw err
  } finally {
    nodeJSInstance_activeRedisTransactions.current.filter(
      i => i.transactionId !== internalRunningNodeTransactionId
    )
  }
}
// ------------------------------------------------------------------------

// TODO: subscribe into transaction
const joinIntoTransaction = async <T>(
  persistentTXStorage: {
    // // this should be implemented by redis connector
    getTransaction: () => Promise<RedisTransaction | null>

    subscribeToTransaction: (onEventReceive: (log: any) => any) => Promise<{
      waitTillTransactionEnds: Promise<void>
      unsubscribeFromTransaction: () => Promise<void>
    }>
  },
  conf: {
    waitTillTransactionWillBeOpened: any
    registerOnDisconnect: (onDisconnect: () => void) => void
  },
  onReceiveNewEvent: (data: T) => any
) => {
  let transaction = await persistentTXStorage.getTransaction()

  await with_syncQueue(async pushAsyncCb => {
    const sendSyncEvent = (data: T) => {
      // Do not have race-condition over 1 persistent CRUD operation
      pushAsyncCb(() => onReceiveNewEvent(data))
    }

    await Promise.all((transaction?.log ?? []).map(item => sendSyncEvent(item)))

    // ----------------------------------------------------------------
    // -------- check if near future transaction will appear soon -----
    if (!transaction) {
      await with_TxEventSubscribe(
        persistentTXStorage,
        'unsubscribeAfterHandler',
        async subscribe => {
          const unsubscribe = await subscribe(event => sendSyncEvent(event))

          conf.registerOnDisconnect(() => unsubscribe())

          const MAX_DELAY_MS_FOR_NEAR_FUTURE_TRANSACTION = conf.waitTillTransactionWillBeOpened
          await delay(MAX_DELAY_MS_FOR_NEAR_FUTURE_TRANSACTION)
          transaction = await persistentTXStorage.getTransaction()
        }
      )
    }

    if (transaction) {
      await with_TxEventSubscribe(
        persistentTXStorage,
        'unsubscribeAfterTransactionEnds',
        async subscribe => {
          // WARNING!!!
          // there is race condition between executing subscription and start subscribing!!!
          const unsubscribe = await subscribe(event => sendSyncEvent(event))

          conf.registerOnDisconnect(() => unsubscribe())
        }
      )
    }
  })
}

const executeNewTransactionJob = async <T>(
  persistentTXStorage: {
    onTransactionEnds?: (data: any[]) => void // sync data into proper redis structure
    getTransaction: () => Promise<RedisTransaction | null>
    openTransaction: () => Promise<void>
    closeTransaction: () => Promise<void>
    subscribeToTransaction: (onEventReceive: (log: any) => any) => Promise<{
      waitTillTransactionEnds: Promise<void>
      unsubscribeFromTransaction: () => Promise<void>
    }>

    pushIntoTransaction: (event: T) => Promise<void>
    sendClosingTransactionSignal: () => Promise<void>
  },
  conf: { serializeError: (err: Error) => any },

  handler: (sendData: (data: T) => void) => Promise<void>
) => {
  const cbs = persistentTXStorage // cbs => callbacks

  const transaction = await cbs.getTransaction()
  const isTransactionOpen = Boolean(transaction)

  if (isTransactionOpen) throw new Error('transaction is in progress')

  const syncQueue = initSyncQueue()

  const pushSyncEvent = async (event: any) => {
    await syncQueue.pushAsyncCb(() => cbs.pushIntoTransaction(event))
  }

  try {
    const onUnhandledError = async (err: any) => {
      const data = await conf.serializeError(err)
      await pushSyncEvent(data)
    }

    const onNodeJSSigint = async (err: any) => {
      await onUnhandledError(err)
      await cbs.sendClosingTransactionSignal()
      await cbs.closeTransaction()
    }

    await with_nodejsTransaction({ onNodeJSSigint }, async () => {
      await with_mainHandlerTransaction(cbs, async () => {
        // waitTillTransactionIsCreated_res()
        try {
          await handler(async event => pushSyncEvent(event))
        } catch (err) {
          await onUnhandledError(err)
        } finally {
          await syncQueue.waitTillEmptyOrReject()
        }
      })
    })
  } catch (err) {
    throw err
  } finally {
    cbs.closeTransaction?.()
  }
}

export const with_TxEventSubscribe = async (
  arg: {
    subscribeToTransaction: (onEventReceive: (log: any) => any) => Promise<{
      waitTillTransactionEnds: Promise<void>
      unsubscribeFromTransaction: () => Promise<void>
    }>
  },
  // afterCbType?: 'unsubscribeAfterHandler',
  afterCbType: 'unsubscribeAfterTransactionEnds' | 'unsubscribeAfterHandler',
  cb: (subscribeToLogTransaction: (cb: (log: any) => any) => Promise<() => void>) => Promise<void>
) => {
  let subscription = undefined as
    | {
        waitTillTransactionEnds: Promise<void>
        unsubscribeFromTransaction: () => Promise<void>
      }
    | undefined

  try {
    await cb(async onEventReceive => {
      subscription = await arg.subscribeToTransaction(onEventReceive)
      return subscription.unsubscribeFromTransaction
    })
  } catch (err) {
    throw err
  } finally {
    if (afterCbType === 'unsubscribeAfterTransactionEnds') {
      await subscription?.waitTillTransactionEnds
    }
    await subscription?.unsubscribeFromTransaction()
  }
}

export const with_mainHandlerTransaction = async (
  arg: {
    openTransaction: () => Promise<void>
    closeTransaction: () => Promise<void>
    sendClosingTransactionSignal: () => Promise<void>
  },
  cb: () => Promise<void>
) => {
  try {
    await arg.openTransaction()
    await cb()
  } catch (err) {
    throw err
  } finally {
    await arg.closeTransaction()
    await arg.sendClosingTransactionSignal()
    // stop propagate errors...
  }
}

// httpKeepAlivedPubsubTransaction
export const stablePubsubTx = {
  // write
  executeNewTransactionJob,
  // read
  joinIntoTransaction,
  // clearing (f.e.: when nodejs is killed)
  closeAllOpenTransactions,
}
