import { RedisClientType } from "redis";

type RedisClient = RedisClientType<any, any, any>;
let redisClient: RedisClient;
let redisSubscribeClient: RedisClient;
let redisPublishClient: RedisClient;

// ------------- redis core -----------

// TODO: make less abstraction

const setItem = async <T = any>(key: string, value: T) => {
  await redisClient.set(key, JSON.stringify(value, null, 2));
};

const getItem = async <T>(key: string) => {
  const value = await redisClient.get(key);
  if (!value) {
    return null;
  }
  return JSON.parse(value) as T;
};

const deleteItem = async (key: string) => {
  const value = await redisClient.del(key);
  return value;
};

const publishToChannel = async (channelId: string, eventMessage: string) => {
  await redisPublishClient.publish(channelId, eventMessage);
};

const getCommandListener = async (
  channelId: string,
  listener: (message: string, channel: string) => void
) => {
  await redisSubscribeClient.subscribe(channelId, listener);

  return async () => {
    await redisSubscribeClient.unsubscribe(channelId, listener);
  };
};

const flushRedisData = async () => {
  await redisClient.flushDb();
};

export const redisCRUD = {
  flushRedisData,

  // crud
  getItem,
  setItem,
  deleteItem,

  pubsub: {
    publishToChannel,
    getCommandListener,
  },
};

// ---- ------------------------- ----
// ----            CRUD           ----
// ---- ------------------------- ----

export type RedisTransaction = {
  id: string;
  createdAt: string;
  log: any[];
};

const getTransactionKey = (id: string) => `TRANSACTION:${id}`;

// TODO: remove
const getNewTransactionData = (id: string) =>
  ({
    id: id,
    log: [],
    createdAt: new Date().toISOString(),
  } satisfies RedisTransaction);

const getTransaction = async (id: string) => {
  const tx = await redisCRUD.getItem<RedisTransaction>(getTransactionKey(id));

  return tx;
};

const deleteTransaction = async (id: string) => {
  const txId = getTransactionKey(id);
  await redisCRUD.deleteItem(txId);
};

const setTransaction = async (id: string, newLog: RedisTransaction) => {
  // todo propagate unhandled error
  await redisCRUD.setItem(getTransactionKey(id), newLog);
};

const appendLogToTransaction = async (id: string, event: any) => {
  const redisValue = await getTransaction(id);
  if (!redisValue) {
    throw new Error("redis transaction does not exists");
  }
  redisValue.log.push(event);
  await setTransaction(id, redisValue);
};

// ---- ------------------------- ----
// ---- handle redis transactions ----
// ---- ------------------------- ----

// if nodejs process is killed, it should revert all active transactions to false
// for debug purposes...?

const openTransaction = async (
  id: string
  // TODO: store lastSendTOken ISO and if its too old, unlock the chat... to not to have too debug app???
) => {
  const redisValue = getNewTransactionData(id);

  await setTransaction(id, redisValue);
};

const closeTransaction = async (id: string) => {
  await deleteTransaction(id);
};

/*
// import { isBefore, subMinutes } from "date-fns";
// TODO: add transaction timeouts (or automatic redis clearing cron job?)

const isCreatedAt = async (id: string) => {
  let tx = await getTransaction(id);

  if (!tx!.createdAt) return false;

  // if transaction is opened for more than 3 minutes, its automatically closed
  const threeMinAgo = subMinutes(new Date(), 3);

  const transactionCreatedAt = new Date(tx!.createdAt);

  const isTransactionExpired = isBefore(transactionCreatedAt, threeMinAgo);

  if (isTransactionExpired) {
    console.error(
      "TRANSACTION WAS CLOSED AFTER 3min EXPIRATION! SOMETHING IS PROBABLY BROKEN IF THIS CODE WAS EXECUTED"
    );
    await closeTransaction(id);
    return false;
  }
  return true;
};
*/

// ---- --------------------------- ----
// ---- pub sub event log streaming ----
// ---- --------------------------- ----

const getLogStreamSubId = (id: string) => `LOG_STREAM:${getTransactionKey(id)}`;

const closePubSubTransactionSignal = {
  type: "TRANSACTION_ENDED_SIGNAL" as const,
};
type ClosePubSubTransactionSignal = typeof closePubSubTransactionSignal;

const publishLogEvent = async (
  a: string,
  event: any | ClosePubSubTransactionSignal
) => {
  await redisCRUD.pubsub.publishToChannel(
    getLogStreamSubId(a),
    JSON.stringify(event)
  );
};

const storeAndPublishEventToLog = async (id: string, event: any) => {
  await Promise.all([
    publishLogEvent(id, event),
    appendLogToTransaction(id, event),
  ]);
};

// this just add proper types and serializing
const receiveLogStreamEvent = async (
  id: string,
  cb: (command: any | ClosePubSubTransactionSignal) => void
) => {
  const unsubscribe = await redisCRUD.pubsub.getCommandListener(
    getLogStreamSubId(id),
    (value) => cb(JSON.parse(value))
  );
  return unsubscribe;
};

// this add extra TRANSACTION_ENDED_SIGNAL abstraction to add active & inactive streams over transactions
const subscribeToTransaction = async (
  id: string,
  cb: (event: any | ClosePubSubTransactionSignal) => void
) => {
  let resolve_unsubscribeAfterTransactionEnds = undefined as
    | undefined
    | (() => void);

  const waitTillTransactionEnds = new Promise<void>(async (res) => {
    resolve_unsubscribeAfterTransactionEnds = res;
  });

  const unsubscribeRedisListener = await receiveLogStreamEvent(id, (event) => {
    // TODO: should I use END or CLOSE or signal?
    if (event.type === "TRANSACTION_ENDED_SIGNAL") {
      resolve_unsubscribeAfterTransactionEnds?.();
      // TODO: should disconnect be here?
      unsubscribeRedisListener();
      return;
    }

    cb(event);
  });

  const unsubscribeFromTransaction = async () => {
    resolve_unsubscribeAfterTransactionEnds?.();
    await unsubscribeRedisListener();
  };

  return {
    waitTillTransactionEnds,
    unsubscribeFromTransaction,
  };
};

const sendClosingTransactionSignal = async (id: string) => {
  await publishLogEvent(id, closePubSubTransactionSignal);
};

// ---- ---------------------------------- ----
// ---- --------- public exports --------- ----
// ---- ---------------------------------- ----

const setupRedisClients = (redisClients: {
  client: RedisClient;
  subscribe: RedisClient;
  publish: RedisClient;
}) => {
  redisClient = redisClients.client;
  redisSubscribeClient = redisClients.subscribe;
  redisPublishClient = redisClients.publish;
};

const getRedisPersistTXAdapter = (txId: string) => {
  return {
    getTransaction: () => getTransaction(txId),

    openTransaction: () => openTransaction(txId),

    closeTransaction: () => closeTransaction(txId),

    subscribeToTransaction: (
      cb: (command: any | ClosePubSubTransactionSignal) => void
    ) => subscribeToTransaction(txId, cb),

    pushIntoTransaction: (event: any) => storeAndPublishEventToLog(txId, event),

    sendClosingTransactionSignal: () => sendClosingTransactionSignal(txId),
  };
};

export const redisTransactionAdapter = {
  setupRedisClients,
  getRedisPersistTXAdapter,
};
