import { appEnv } from '../beConfig'
import { ffetch } from '../lib_ffetch/ffetch'
import { openAIEventSourceFetchReader } from './openAIEventSourceFetchReader'

type GPTCallArg = {
  messages: { role: 'user' | 'system' | 'assistant'; content: string }[]
  temperature?: number
  systemPrompt?: string
  model: string
  maxTokens?: number
}

// we stopped support api openAI function calls
export const chatGptStreamCall = async (
  a: GPTCallArg & {
    onTextChunk?: (text: string) => Promise<void> | void
  }
) =>
  ffetch(
    appEnv.openAI.completionPath,
    'POST',
    {
      body: {
        model: a.model,
        messages: [
          a.systemPrompt
            ? {
                role: 'system',
                content: a.systemPrompt,
              }
            : undefined,
          ...a.messages,
        ].filter(Boolean),

        // TODO: decide max token size...
        max_tokens: a.maxTokens ?? 1000,
        temperature: a.temperature ?? 0.0,
        stream: true,
      },
      okResponseParser: res => openAIEventSourceFetchReader(res, a.onTextChunk),
    },
    {
      headers: {
        Authorization: `Bearer ${appEnv.openAI.token}`,
      },
    }
  )
