import { appEnv } from './beConfig'
import { queryParser } from 'express-query-parser'
import { redisClients, redisCore } from './db_redis/redisCore'
import { redisTxAdapter, stablePubsubTx } from './lib_stablePubsubTx'
import { routerChatbot } from './router_chatbot'
import { setupOpenAPI3_0_0Docs } from './router_developer'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'

const gracefulShutdown = async () => {
  await stablePubsubTx.closeAllOpenTransactions()
  await redisCore.closeConnection()
  process.exit()
}

process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)
process.on('SIGUSR2', gracefulShutdown)

const app = express()

app.use(cors())
app.use(express.json())
app.use(cookieParser())
app.use(queryParser({ parseBoolean: false, parseNumber: false, parseUndefined: true }))
app.use(routerChatbot)

setupOpenAPI3_0_0Docs(app)

const main = async () => {
  await redisCore.openConnection()

  redisTxAdapter.setup(redisClients)

  app.listen(appEnv.port, () => {
    console.info(
      [
        `-----------------------------------`,
        `Frontend     http://localhost:7777/`,
        `Swagger UI   http://localhost:${appEnv.port}/developer/swagger-ui/index.html`,
        `OpenAPI JSON http://localhost:${appEnv.port}/developer/api-docs/`,
        `Redis UI     http://localhost:8081/`,
        `-----------------------------------`,
      ].join('\n')
    )
    console.info()
  })
}

main()
