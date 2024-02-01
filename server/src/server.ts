import { T } from "swagger-typed-express-docs";
import { apiHandler } from "./utils/apiHandler";
import { appEnv } from "./beConfig";
import { queryParser } from "express-query-parser";
import { redisClients, redisCore } from "./db_redis/redisCore";
import { setupOpenAPI3_0_0Docs } from "./router_developer";
import { with_jsonStreamOverHTTP } from "./with_jsonStreamOverHTTP";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
// public lib api:
import {
  httpKeepAlivedPubsubTx,
  redisTransactionAdapter,
} from "./lib_stablePubsubTx/lib";

const { getRedisPersistTXAdapter } = redisTransactionAdapter;

// TODO: dependencies
// 1. redis with pubsub... ?
const gracefulShutdown = async () => {
  // TODO: this should be part of a library...
  await httpKeepAlivedPubsubTx.closeAllOpenTransactions();
  console.log("all redis open transactions reverted");
  await redisCore.closeConnection();
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("SIGUSR2", gracefulShutdown);

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(
  queryParser({ parseBoolean: false, parseNumber: false, parseUndefined: true })
);

export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

app.get(
  "/exec",
  apiHandler({
    query: {
      id: T.string,
    },
    returns: T.list(T.any),
  })(async (req, res) => {
    const transactionId = req.query.id;

    // TODO: put redis client as a init parameter
    const redisPersistentAdapter = getRedisPersistTXAdapter(transactionId);

    await with_jsonStreamOverHTTP(res, async (sendJSON, onUserClosed) => {
      const meta = await httpKeepAlivedPubsubTx.executeNewTransactionJob(
        redisPersistentAdapter,
        async (pushEvent) => {
          for (let i = 0; i < 50; i++) {
            pushEvent("a" + i);
            await delay(200);
            pushEvent("b" + i);
            pushEvent("c" + i);

            // throw new Error("x");
          }
        }
      );

      await meta.waitTillTransactionIsCreated;

      const joinCbs = { ...redisPersistentAdapter, onUserClosed };
      await httpKeepAlivedPubsubTx.joinIntoTransaction(joinCbs, (a) => {
        // console.log("exec: join into transaction", a);
        sendJSON(a);
      });

      // sendJSON("OG transaction request... DONE");
    });
  })
);

// there should be a few lines of abstraction
// 1. HTTP layer
// 2. redis/different pubsub mechanism
// 3. business logic implementation not dependents for user refresh
//   - keepAlive http connection / pub sub

app.get(
  "/listen",
  apiHandler({
    query: {
      id: T.string,
    },
    returns: T.list(T.any),
  })(async (req, res) => {
    const transactionId = req.query.id;

    const redisPersistentAdapter = getRedisPersistTXAdapter(transactionId);

    const tx = await redisPersistentAdapter.getTransaction();
    if (!tx) return res.status(400).send("transaction does not exists");

    await with_jsonStreamOverHTTP(res, async (sendJSON, onUserClosed) => {
      // TODO: wait till transaction will be opened!!!
      // await _noAwaitForPurpose.isTransactionOpen

      // this will stop sending information into dead HTTP connections, but it keeps alive main transaction
      const joinCbs = { ...redisPersistentAdapter, onUserClosed };
      await httpKeepAlivedPubsubTx.joinIntoTransaction(joinCbs, (a) => {
        console.log("listen: join into transaction", a);
        sendJSON(a);
      });
    });
  })
);

setupOpenAPI3_0_0Docs(app);

const main = async () => {
  await redisCore.openConnection();

  redisTransactionAdapter.setupRedisClients(redisClients);

  app.listen(appEnv.port, () => {
    console.info(
      [
        `-----------------------------------`,
        `Swagger UI   http://localhost:${appEnv.port}/developer/swagger-ui/index.html`,
        `OpenAPI JSON http://localhost:${appEnv.port}/developer/api-docs/`,
        `Redis UI     http://localhost:8081/`,
        `-----------------------------------`,
      ].join("\n")
    );
    console.info();
  });
};

main();
