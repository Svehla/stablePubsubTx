import { RedisTransaction } from "./redis_transaction";
import { initSyncQueue } from "./SyncQueue";

// ## possible names
// - single tenancy
// - http persistent transaction
// - singleton transaction
// - http persistent transaction pool
// - keep alive transaction
// - join to transaction

const serializeErrorToJSON = (error: any) => {
  let errorDetails: {
    type: string;
    reason: any;
    stack: string | undefined;
  };

  if (error instanceof Error) {
    // General error handling
    errorDetails = {
      type: "Error",
      reason: error.message,
      stack: error.stack,
    };
  } else {
    errorDetails = {
      type: "value",
      reason: error,
      stack: error.stack,
    };
  }
  return errorDetails;
};

// ------------------------------------------------------------------------

const nodeJSInstance_activeRedisTransactions = {
  current: [] as {
    transactionId: string;
    onNodeJSSigint: (err: Error) => Promise<void>;
  }[],
};

export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const closeAllOpenTransactions = async () => {
  // TODO: should we clear open subscription to redis as well? or its closed by default?
  await Promise.all(
    nodeJSInstance_activeRedisTransactions.current.map(async (t) => {
      // await closeTransaction(t.transactionId);
      // this notify user that nodejs was killed
      const errLogEvent = new Error("Nodejs processed unexpectedly exited");
      // await appendLogToTransaction(t.transactionId, errLogEvent);
      await t.onNodeJSSigint?.(errLogEvent);
      // await publishLogEvent(t.transactionId, errLogEvent);
    })
  );

  // give some time to propagate messages into redis pubsub
  // await delay(50);
};

// this context manager is used for catching unexpected killing of nodejs instance
const with_nodejsTransaction = async (
  arg: {
    onNodeJSSigint: (err: Error) => Promise<void>;
  },
  cb: () => Promise<void>
) => {
  const internalRunningNodeTransactionId = Math.random().toString();

  try {
    nodeJSInstance_activeRedisTransactions.current.push({
      transactionId: internalRunningNodeTransactionId,
      onNodeJSSigint: arg.onNodeJSSigint,
    });

    await cb();
  } catch (err) {
    throw err;
  } finally {
    nodeJSInstance_activeRedisTransactions.current.filter(
      (i) => i.transactionId !== internalRunningNodeTransactionId
    );
  }
};
// ------------------------------------------------------------------------

const joinIntoTransaction = async (
  persistentTXStorage: {
    onUserClosed: (onUserClosed: () => void) => void;

    // // this should be implemented by redis connector
    getTransaction: () => Promise<RedisTransaction | null>;

    subscribeToTransaction: (onEventReceive: (log: any) => any) => Promise<{
      waitTillTransactionEnds: Promise<void>;
      unsubscribeFromTransaction: () => Promise<void>;
    }>;
  },
  onReceiveNewEvent: (data: any) => void
) => {
  const cbs = persistentTXStorage; // cbs => callbacks
  const transaction = await cbs.getTransaction();
  if (!transaction) return;

  const syncQueue = initSyncQueue();

  const sendSyncEvent = (data: any) => {
    // Do not have race-condition over 1 persistent CRUD operation
    syncQueue.pushAsyncCb(() => onReceiveNewEvent(data));
  };

  await with_TxEventSubscribe(cbs, async (subscribe) => {
    await Promise.all(transaction.log.map((item) => sendSyncEvent(item)));

    const unsubscribe = await subscribe((event) => {
      sendSyncEvent(event);
    });

    cbs.onUserClosed(() => unsubscribe());
  });
};

const executeNewTransactionJob = async (
  persistentTXStorage: {
    onTransactionEnds?: (data: any[]) => void; // sync data into proper redis structure
    getTransaction: () => Promise<RedisTransaction | null>;
    openTransaction: () => Promise<void>;
    closeTransaction: () => Promise<void>;
    subscribeToTransaction: (onEventReceive: (log: any) => any) => Promise<{
      waitTillTransactionEnds: Promise<void>;
      unsubscribeFromTransaction: () => Promise<void>;
    }>;

    pushIntoTransaction: (event: any) => Promise<void>;
    sendClosingTransactionSignal: () => Promise<void>;
  },

  handler: (sendData: (data: any) => void) => Promise<void>
) => {
  const cbs = persistentTXStorage; // cbs => callbacks

  const transaction = await cbs.getTransaction();
  const isTransactionOpen = Boolean(transaction);

  if (isTransactionOpen) throw new Error("transaction is in progress");

  const syncQueue = initSyncQueue();

  const pushSyncEvent = async (event: any) => {
    await syncQueue.pushAsyncCb(() => cbs.pushIntoTransaction(event));
  };

  let waitTillTransactionIsCreated_res: () => void;
  const waitTillTransactionIsCreated = new Promise<void>(
    async (res) => (waitTillTransactionIsCreated_res = res)
  );

  const execTransactionHandler = async () => {
    try {
      const onUnhandledError = async (err: any) => {
        const errText = serializeErrorToJSON(err);
        console.log(errText);
        await pushSyncEvent({ type: "UNHANDED_ERROR", errText });
      };

      const onNodeJSSigint = async (err: any) => {
        await onUnhandledError(err);
        await cbs.sendClosingTransactionSignal();
        await cbs.closeTransaction();
      };

      await with_nodejsTransaction({ onNodeJSSigint }, async () => {
        await with_mainHandlerTransaction(cbs, async () => {
          waitTillTransactionIsCreated_res();
          try {
            await delay(0); // give some time for listeners to start subscribing
            await handler(async (event) => await pushSyncEvent(event));

            await syncQueue.waitTillEmptyOrReject();
          } catch (err) {
            await onUnhandledError(err);
          }
        });
      });
    } catch (err) {
      throw err;
    } finally {
      cbs.closeTransaction?.();
    }
  };

  const waitTillHandlerIsDone = execTransactionHandler();

  return {
    waitTillTransactionIsCreated,
    waitTillHandlerIsDone,
  };
};

export const with_TxEventSubscribe = async (
  arg: {
    subscribeToTransaction: (onEventReceive: (log: any) => any) => Promise<{
      waitTillTransactionEnds: Promise<void>;
      unsubscribeFromTransaction: () => Promise<void>;
    }>;
  },
  cb: (
    subscribeToLogTransaction: (cb: (log: any) => any) => Promise<() => void>
  ) => Promise<void>
) => {
  let subscription = undefined as
    | {
        waitTillTransactionEnds: Promise<void>;
        unsubscribeFromTransaction: () => Promise<void>;
      }
    | undefined;

  try {
    await cb(async (onEventReceive) => {
      subscription = await arg.subscribeToTransaction(onEventReceive);
      return subscription.unsubscribeFromTransaction;
    });
  } catch (err) {
    throw err;
  } finally {
    // if (afterCbType === "unsubscribeAfterTransactionEnds") {
    await subscription?.waitTillTransactionEnds;
    // }
    await subscription?.unsubscribeFromTransaction();
  }
};

export const with_mainHandlerTransaction = async (
  arg: {
    openTransaction: () => Promise<void>;
    closeTransaction: () => Promise<void>;
    sendClosingTransactionSignal: () => Promise<void>;
  },
  cb: () => Promise<void>
) => {
  try {
    await arg.openTransaction();
    await cb();
  } catch (err) {
    throw err;
  } finally {
    await arg.closeTransaction();
    await arg.sendClosingTransactionSignal();
    // stop propagate errors...
  }
};

// httpKeepAlivedPubsubTransaction
export const httpKeepAlivedPubsubTx = {
  // write
  executeNewTransactionJob,
  // read
  joinIntoTransaction,
  // clearing (f.e.: when nodejs is killed)
  closeAllOpenTransactions,
};
