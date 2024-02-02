import { FFetchResponse } from './ffetch'
import { useEffect, useRef, useState } from 'react'

export const useFFetch = <Args extends any[], Res extends [any, FFetchResponse<any>]>(
  fetchDataService: (...args: Args) => Promise<Res>,
  { rejectPrevReq = true } = {}
) => {
  const [l, setLoading] = useState(false)
  const loading = {
    loading: l,
    setLoading,
  }
  const [data, setData] = useState(undefined as Res[0] | undefined)
  const [response, setResponse] = useState(undefined as Res[1] | undefined)
  const [error, setError] = useState(undefined as undefined | string)

  // const [fetchCount, setFetch]
  const abortController = useRef(null as null | AbortController)

  useEffect(() => {
    abortController.current = new AbortController()
    return () => abortController.current?.abort()
  }, [])

  return {
    data,
    response,

    loading: loading.loading,
    error,

    fetch: async (...args: Args) => {
      if (rejectPrevReq === true) {
        // TODO: abort previous request to have only 1 req
        abortController.current?.abort()
        abortController.current = new AbortController()
      }

      setError(undefined)
      loading.setLoading(true)
      try {
        const [firstArg, ...restArgs] = args
        const response = await fetchDataService(
          // @ts-expect-error
          { controller: abortController.current, ...firstArg },
          ...restArgs
        )
        setData(response?.[0])
        setResponse(response?.[1])
        return response
      } catch (err: any) {
        setError(err?.toString())
        throw err
      } finally {
        loading.setLoading(false)
      }
    },
    setResponse,
  }
}
