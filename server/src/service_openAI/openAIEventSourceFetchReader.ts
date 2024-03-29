import { createParser } from 'eventsource-parser'

// TODO: implement this parser on top of ffetch
export const openAIEventSourceFetchReader = async <T>(
  fetchResponse: Response,
  onTextChunk?: (text: string) => Promise<void> | void
) => {
  const res = fetchResponse
  const decoder = new TextDecoder()

  let output = { type: 'text_stream', text: '' }

  const parser = createParser(event => {
    if (event.type !== 'event') return

    if (event.data === '[DONE]') return

    const data = JSON.parse(event.data)

    // invalid openapi response
    if (!data.choices?.[0]) return

    // stop is end of basic text streaming
    if (data.choices[0].finish_reason === 'stop') return

    lastDecodedValues.push(data.choices[0].delta.content)
    output.text += lastDecodedValues
  })

  let lastDecodedValues = [] as string[]

  const finalOut = [] as any[]

  let errors = [] as any[]
  // @ts-expect-error invalid res.body data type
  for await (const chunk of res.body) {
    // for await do not throw error outside, so the error is hidden...
    try {
      parser.feed(decoder.decode(chunk))

      for (let message of lastDecodedValues) {
        finalOut.push(message)
        await onTextChunk?.(message)
      }

      lastDecodedValues = []
    } catch (err) {
      errors.push(err)
    }
  }
  if (errors.length > 0) throw errors[0] // throw only first error! similar as sync queue...

  parser.reset()

  return finalOut.join('')
}
