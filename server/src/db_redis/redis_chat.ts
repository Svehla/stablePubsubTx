import { InferSchemaType, T } from 'swagger-typed-express-docs'
import { redisClients, redisCore } from './redisCore'
import { tUnionObject } from '../utils/tType'
import { v4 } from 'uuid'

const getSortedGroupId = (a: { userId: string }) => `sorted_group:userId:${a.userId}`

const tMessageData = T.oneOf([
  tUnionObject('bot', {
    message: T.string,
  }),
  tUnionObject('user', {
    message: T.string,
  }),
  tUnionObject('bot_append', {
    // TODO: this should not have id, it should has tempId: T.string... because it will be aggregated in the future...
    message: T.string,
    parentMessageId: T.string, // this is not mandatory field for chatbots, its done automatically...
  }),
  tUnionObject('debug', {
    message: T.string,
  }),
] as const)

export const tMessage = T.object({
  id: T.string,
  createdAtISO: T.string,

  // TODO: should I nested with data? its quite redundant i should maybe spread shared attrs...
  /*
  export const tUnionMessage = <T extends string, U>(type: T, attrs: U) =>
  T.object({
    type: T.enum([type] as [T]),
    id: T.string,
    createdAtISO: T.string,
    ...attrs,
  })

  export const tMessage = T.oneOf([
    tUnionMessage('bot', {
      message: T.string,
    }),
    tUnionMessage('user', {
      message: T.string,
    }),
    tUnionMessage('bot_append', {
      message: T.string,
      parentMessageId: T.string,
    }),
  ] as const)
  */

  type: T.enum(['message'] as const),
  data: tMessageData,
})

export type TMessage = InferSchemaType<typeof tMessage>
export const createMessageWrapper = (data: TMessage['data']) =>
  ({
    id: v4(),
    createdAtISO: new Date().toISOString(),
    type: 'message',
    data,
  } satisfies TMessage)

export const tChat = T.object({
  id: T.string,
  messages: T.list(tMessage),
})

export type TChat = InferSchemaType<typeof tChat>

type ParsedRedisKey = {
  userId: string
  chatId: string
}

const getChatKey = (a: { userId: string; chatId: string }) => `USER:${a.userId}:CHAT:${a.chatId}`

const parseChatKey = (a: string) => ({
  userId: a.split(':')[1],
  chatId: a.split(':')[3],
  raw: a,
})

const getChatKeys = async (a: { userId: string }, start = 0, limit = 30) => {
  const sortedKeys = await redisClients.client.zRange(getSortedGroupId(a), start, limit, {
    REV: true,
  })
  // return sortedKeys
  return sortedKeys?.map(parseChatKey)
}

const getChat = async (a: ParsedRedisKey) => {
  const chatKey = getChatKey(a)
  const chat = await redisCore.getItem<TChat>(chatKey)
  return chat
}

const createChat = async (a: { userId: string }) => {
  const chatId = v4()

  const data = {
    id: chatId,
    messages: [],
  } satisfies TChat

  const key = getChatKey({ userId: a.userId, chatId })

  await Promise.all([
    redisCore.setItem<TChat>(key, data),
    redisClients.client.zAdd(getSortedGroupId(a), {
      score: Date.now(),
      value: key,
    }),
  ])

  return data
}

const addMessage = async (id: ParsedRedisKey, message: TMessage | TMessage[]) => {
  const chatKey = getChatKey(id)
  const chat = await getChat(id)
  if (!chat) throw new Error(`chat ${chatKey} does not exist`)

  const messagesToAdd = Array.isArray(message) ? message : [message]

  const newData = {
    ...chat,
    messages: [...chat.messages, ...messagesToAdd],
  }

  await redisCore.setItem<TChat>(chatKey, newData)
  return message
}

const deleteChat = async (a: ParsedRedisKey) => {
  const chatKey = getChatKey(a)

  await Promise.all([
    //
    redisCore.deleteItem(chatKey),
    redisClients.client.zRem(getSortedGroupId(a), chatKey),
  ])
}

export const redis_chat = {
  getChat,
  createChat,
  addMessage,
  getChatKeys,
  deleteChat,
}
