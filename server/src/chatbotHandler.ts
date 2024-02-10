// ---- chatbot handler - stable pubsub tx independent code ----
import { TMessage, createMessageWrapper, redis_chat } from './db_redis/redis_chat'
import { aggregateBotChunksIntoMessage } from './utils/aggregators'
import { chatGptStreamCall } from './service_openAI/serviceOpenAI'
import { ffetch } from './lib_ffetch/ffetch'
import { initSyncQueue } from './lib_stablePubsubTx/SyncQueue'
import { jsonArrayStreamFetchReader } from './lib_jsonStreamOverHTTP/jsonArrayStreamFetchReader'
import { redisCore } from './db_redis/redisCore'
import { redisTxAdapter } from './lib_stablePubsubTx'

export const getRedisTransactionId = (chatId: string, id: string) => `TRANSACTION:${chatId}_${id}`

// strategy 1: sync messages when transaction will be closed
// this abstraction add
// 1. ID generation + message wrapping
// 2. syncing redis transaction into redis data structure
export const chatbotHandler = async (a: {
  userId: string
  chatId: string
  userMessage: string
  sendMessage: (message: TMessage) => void
}) => {
  const messagesToPut = [] as TMessage[]

  const syncQueue = initSyncQueue()

  const chatHistory = await redis_chat.getChat({ chatId: a.chatId, userId: a.userId })
  const activeTxs = await redisCore.getKeysByPrefix(getRedisTransactionId(a.chatId, ''))
  const txsData = await Promise.all(
    activeTxs.map(txId => redisTxAdapter.getAdapter(txId).getTransaction())
  )

  const aggregatedChatHistory = aggregateBotChunksIntoMessage([
    ...(chatHistory?.messages ?? []),
    ...txsData.flatMap(i => i?.log),
  ])

  try {
    // this is abstraction with syncQueue which syncing data into redis and trying to not to
    // enable race conditions in async callbacks
    await mainChatbotHandler({
      userId: a.userId,
      chatId: a.chatId,
      chatHistory: aggregatedChatHistory,
      userMessage: a.userMessage,
      sendMessage: async messageData => {
        // TODO: is syncQueue needed there?
        return await syncQueue.pushAsyncCb(async () => {
          const newMessage = createMessageWrapper(messageData)
          a.sendMessage(newMessage)
          messagesToPut.push(newMessage)
          // await delay(100)
          return newMessage
        })
      },
    })

    await syncQueue.waitTillEmptyOrReject()
  } catch (err) {
    throw err
  } finally {
    await redis_chat.addMessage({ chatId: a.chatId, userId: a.userId }, messagesToPut)
  }
}

const mainChatbotHandler = async (a: {
  userId: string
  chatId: string
  chatHistory: TMessage[]
  userMessage: string
  sendMessage: (message: TMessage['data']) => Promise<any> | any
}) => {
  a.sendMessage({ type: 'user' as const, message: a.userMessage })
  const createdMessage = await a.sendMessage({ type: 'bot' as const, message: '' })
  const parentMessageId = createdMessage.id

  const messages = [
    // { role: 'system', content: 'TODO: add system message' },
    ...a.chatHistory.map(i => ({
      role: i.data.type === 'bot' ? ('assistant' as const) : ('user' as const),
      content: i.data.message,
    })),
    { role: 'user' as const, content: a.userMessage },
  ]

  // TODO: retry if it fails...

  if (true) {
    await ffetch('http://localhost:2020/x/search', 'POST', {
      body: { messages, userMessage: a.userMessage },
      okResponseParser: res =>
        jsonArrayStreamFetchReader(res, message =>
          a.sendMessage({ type: 'bot_append' as const, message, parentMessageId })
        ),
    })
  } else {
    await chatGptStreamCall({
      model: 'gpt-3.5-turbo-16k', // 'gpt-4',
      messages,
      onTextChunk: message =>
        a.sendMessage({ type: 'bot_append' as const, message, parentMessageId }),
    })
  }
}
