export const jsonArrayStreamFetchReader = async (
  fetchResponse: Response,
  onItemReceivedFromStream: (json: any) => Promise<void> | void
) => {
  const reader = fetchResponse.body!.getReader()
  const decoder = new TextDecoder()

  let done = false

  let wholeJSONStringifiedResText = ''
  let responseArray = [] as any
  let lastExecutedIndex = -1

  while (!done) {
    const readableStreamResult = await reader.read()
    done = readableStreamResult.done
    const chunkValue = decoder.decode(readableStreamResult.value)
    if (!chunkValue) continue

    wholeJSONStringifiedResText += chunkValue

    // try to parse all chunks to wait till it's gonna be valid JSON | not ended array of OBJ json
    try {
      responseArray = JSON.parse(wholeJSONStringifiedResText)
    } catch (err) {
      try {
        responseArray = JSON.parse(wholeJSONStringifiedResText + ']')
      } catch (err) {
        // throw new Error(`invalid response from fetch_jsonArrayPartialStream ${err}`)
        continue
      }
    }

    // 1 chunk may contains multiple executed items
    while (lastExecutedIndex + 1 < responseArray.length) {
      const cmdToExecute = responseArray[lastExecutedIndex + 1]
      lastExecutedIndex++

      if (!cmdToExecute) continue

      // if (typeof cmdToExecute !== "object")
      //   throw new Error("non full fledged JSON");

      // this await ensure that all commands will be in the same order => handler should not call async function to keep it fast
      await onItemReceivedFromStream(cmdToExecute)
    }
  }

  return responseArray
}
