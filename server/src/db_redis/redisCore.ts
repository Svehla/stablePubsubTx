import { RedisClientType, createClient } from "redis";
import { appEnv } from "../beConfig";

// TODO: do I need to have 2 clients???
// TODO: may I have multiple connections over one redis
// let redisClient: RedisClientType<any, any, any>;
// let redisSubscribeClient: RedisClientType<any, any, any>; // = redisClient
// let redisPublishClient: RedisClientType<any, any, any>; // = redisClient

export const redisClients = {
  client: null as any as RedisClientType<any, any, any>,
  subscribe: null as any as RedisClientType<any, any, any>,
  publish: null as any as RedisClientType<any, any, any>,
};

const openConnection = async () => {
  redisClients.client = await createClient({
    url: appEnv.redisConnectionUrl,
  })
    .on("error", (err) => {
      // TODO: what are those errors here? how should we handle them?
      console.error("Redis Client Error", err);
    })
    .connect();

  redisClients.subscribe = redisClients.client.duplicate();
  redisClients.publish = redisClients.client.duplicate();

  await Promise.all([
    //
    redisClients.subscribe.connect(),
    redisClients.publish.connect(),
  ]);
};

const closeConnection = async () => {
  await redisClients.client.disconnect();
};

const flushRedisData = async () => {
  await redisClients.client.flushDb();
};

// const setItem = async <T = any>(key: string, value: T) => {
//   await redisClients.client.set(key, JSON.stringify(value, null, 2));
// };

// const getItem = async <T>(key: string) => {
//   const value = await redisClients.client.get(key);
//   if (!value) {
//     return null;
//   }
//   return JSON.parse(value) as T;
// };

// const deleteItem = async (key: string) => {
//   const value = await redisClients.client.del(key);
//   return value;
// };

export const redisCore = {
  openConnection,
  closeConnection,
  flushRedisData,
};
