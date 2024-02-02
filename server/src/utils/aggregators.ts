import { TMessage } from '../db_redis/redis_chat'
import { isBefore } from 'date-fns'

export const aggregateBotChunksIntoMessage = (messages?: TMessage[] | null) => {
  const aggregatedMessages = [] as TMessage[]

  ;[...(messages ?? [])]
    ?.filter((item, index, array) => index === array.findIndex(findItem => findItem.id === item.id))
    ?.sort((a, b) => {
      const dateA = new Date(a.createdAtISO!)
      const dateB = new Date(b.createdAtISO!)
      return isBefore(dateA, dateB)
        ? //
          -1
        : isBefore(dateB, dateA)
        ? 1
        : 0
    })
    ?.forEach(msg => {
      if (msg.data?.type === 'bot_append') {
        for (let aggMsg of aggregatedMessages) {
          if (aggMsg.id === msg.data.parentMessageId) {
            aggMsg.data.message += msg.data.message
            break
          }
        }
      } else {
        aggregatedMessages.push({ ...msg, data: { ...msg.data } })
      }
    })

  return aggregatedMessages
}
