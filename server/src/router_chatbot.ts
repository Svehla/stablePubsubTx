import { T } from 'swagger-typed-express-docs'
import { TMessage, redis_chat, tChat, tMessage } from './db_redis/redis_chat'
import { apiHandler } from './utils/apiHandler'
import { chatbotHandler, getRedisTransactionId } from './chatbotHandler'
import { isAfter, isBefore } from 'date-fns'
import { redisCore } from './db_redis/redisCore'
import { redisTxAdapter, stablePubsubTx } from './lib_stablePubsubTx'
import { serializeErrorMessage, tWrapWithJsonStreamList } from './utils/messageError'
import { stringToEmoji } from './utils/string'
import { v4 } from 'uuid'
import { with_jsonStreamOverHTTP } from './utils/with_jsonStreamOverHTTP'
import express from 'express'

export const routerChatbot = express.Router()

// TODO: implement multi-auth users
const userId = 'user-1'

routerChatbot.get(
  '/chat',
  apiHandler({
    returns: T.list(
      T.object({
        userId: T.string,
        chatId: T.string,
        slug: T.string,
      })
    ),
  })(async (req, res) => {
    const data = await redis_chat.getChatKeys({ userId })
    res.send(
      data.map(i => ({
        userId: i.userId,
        chatId: i.chatId,
        slug: stringToEmoji(i.userId + i.chatId),
      }))
    )
  })
)

routerChatbot.post(
  '/chat/',
  apiHandler({
    returns: tChat,
  })(async (req, res) => {
    const data = await redis_chat.createChat({ userId })
    res.send(data)
  })
)

routerChatbot.delete(
  '/chat/:chatId',
  apiHandler({
    params: {
      chatId: T.string,
    },
    returns: T.enum(['OK'] as const),
  })(async (req, res) => {
    const activeTxs = await redisCore.getKeysByPrefix(getRedisTransactionId(req.params.chatId, ''))
    if (activeTxs.length > 0) return res.status(400).send('transaction is in progress')

    await redis_chat.deleteChat({
      userId,
      chatId: req.params.chatId,
    })

    res.send('OK')
  })
)

const WAIT_FOR_RACE_CONDITION_TX = 200

routerChatbot.get(
  '/chat/:chatId',
  apiHandler({
    params: {
      chatId: T.string,
    },
    query: {
      chatFromISO: T.null_string,
    },
    returns: tWrapWithJsonStreamList(tMessage),
  })(async (req, res) => {
    const chat = await redis_chat.getChat({
      userId,
      chatId: req.params.chatId,
    })

    if (!chat) return res.status(400).send('missing chat id')

    await with_jsonStreamOverHTTP(res, async (sendJson, registerOnDisconnect) => {
      const chat = await redis_chat.getChat({
        userId,
        chatId: req.params.chatId,
      })
      if (!chat?.messages) return

      chat.messages.forEach(message => {
        let shouldSent = true
        if (req.query.chatFromISO) {
          shouldSent = isAfter(new Date(message.createdAtISO), new Date(req.query.chatFromISO))
        }

        if (shouldSent) {
          sendJson(message)
        }
      })

      const activeTxs = await redisCore.getKeysByPrefix(
        getRedisTransactionId(req.params.chatId, '')
      )

      await Promise.all(
        activeTxs.map(async transactionId => {
          const redisPersistentAdapter = redisTxAdapter.getAdapter(transactionId)

          await stablePubsubTx.joinIntoTransaction<TMessage>(
            redisPersistentAdapter,
            { waitTillTransactionWillBeOpened: WAIT_FOR_RACE_CONDITION_TX, registerOnDisconnect },
            message => sendJson(message)
          )
        })
      )
    })
  })
)

routerChatbot.post(
  '/chat/:chatId/send-message',
  apiHandler({
    params: {
      chatId: T.string,
    },
    body: T.object({
      message: T.string,
    }),
    returns: tWrapWithJsonStreamList(tMessage),
  })(async (req, res) => {
    //
    // TODO: add support for multiple transaction over one chat
    const activeTxs = await redisCore.getKeysByPrefix(getRedisTransactionId(req.params.chatId, ''))
    const transactionId = getRedisTransactionId(req.params.chatId, v4())
    const MAX_TX_COUNT = 3
    if (activeTxs.length >= MAX_TX_COUNT)
      return res.status(400).send(`cannot open more than ${MAX_TX_COUNT} transactions`)

    const redisPersistentAdapter = redisTxAdapter.getAdapter(transactionId)

    const chat = await redis_chat.getChat({ userId, chatId: req.params.chatId })
    if (!chat) return res.status(400).send('chat does not exists')

    const startStream = new Date()

    await with_jsonStreamOverHTTP(res, async (sendJson, registerOnDisconnect) => {
      await Promise.all([
        stablePubsubTx.executeNewTransactionJob<TMessage>(
          redisPersistentAdapter,
          { serializeError: serializeErrorMessage },
          async sendData => {
            // there, we're joining implementation with stable lib
            await chatbotHandler({
              userId,
              chatId: req.params.chatId,
              userMessage: req.body.message,
              sendMessage: sendData,
            })
          }
        ),

        stablePubsubTx.joinIntoTransaction<TMessage>(
          redisPersistentAdapter,
          { waitTillTransactionWillBeOpened: WAIT_FOR_RACE_CONDITION_TX, registerOnDisconnect },
          message => {
            // stream only transaction information sended after this handler started execution of the operation
            // this condition is good if more execution is done on one transaction
            if (isBefore(new Date(startStream), new Date(message.createdAtISO))) {
              sendJson(message)
            }
          }
        ),
      ])
    })
  })
)
