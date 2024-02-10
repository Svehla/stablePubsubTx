export const toQueryParams = (params: Record<string, any>) => {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([k, v]) => {
    search.append(k, v)
  })

  return search.toString()
}

type FetchInit = Parameters<typeof fetch>[1] | undefined
type JSFetchArgs = { url: string; init: FetchInit }

export class FFetchNetworkError extends Error {
  type = 'FFetchNetworkError'
  jsFetchArgs: JSFetchArgs
  responseError: TypeError

  constructor(requestJSON: JSFetchArgs, error: Error) {
    super(error.message)
    this.jsFetchArgs = requestJSON
    this.responseError = error

    // after typescript recompilation inheritance stops to work...
    // instanceof was not working in nodejs...
    Object.setPrototypeOf(this, FFetchNetworkError.prototype)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class FFetchNotOKError extends Error {
  type = 'FFetchNotOKError'
  jsFetchArgs: JSFetchArgs
  reason: { status: number; data: any }
  response: Response

  constructor(
    requestJSON: JSFetchArgs,
    responseJSON: { status: number; data: any },
    response: Response
  ) {
    const message = JSON.stringify(responseJSON)
    super(message)
    this.jsFetchArgs = requestJSON
    this.reason = responseJSON
    this.response = response

    // after typescript recompilation inheritance stops to work...
    // instanceof was not working in nodejs...
    Object.setPrototypeOf(this, FFetchNotOKError.prototype)
    Error.captureStackTrace(this, this.constructor)
  }
}

const get4xx5xxErrorReason = async (res: Response) => {
  let reasonData = ''
  try {
    try {
      reasonData = await res.clone().json()
    } catch (err) {
      reasonData = await res.clone().text()
    }
  } catch (err) {
    reasonData = 'unknown reason'
  }

  return { status: res.status, data: reasonData }
}

export const errorThrowerHttpOK = async <T>(requestJSON: JSFetchArgs, res: FFetchResponse<T>) => {
  // ok is equal to `statusCode` in range 200-299`
  if (res.ok) return
  const responseErrorReason = await get4xx5xxErrorReason(res)
  throw new FFetchNotOKError(requestJSON, responseErrorReason, res)
}

export declare class FFetchResponse<T> extends Response {
  json(): Promise<T>
}

export const ffetch = async <M>(
  url: string,
  method: NonNullable<FetchInit>['method'],
  a: {
    okResponseParser?: (_arg: FFetchResponse<M>) => M | Promise<M>
    body?: any
    domain?: string
    path?: Record<string, string>
    query?: Record<string, any>
    isBodyJson?: boolean
    // TODO: change it into signal and put it into init arg
    controller?: AbortController
  } = {},
  init: FetchInit = {
    mode: 'cors',
  }
): Promise<[M, FFetchResponse<M>]> => {
  const { okResponseParser, body, path, query } = a
  const isBodyJson = a.isBodyJson ?? true

  const enhancedInit: FetchInit = {
    headers: {},
    method: method,
    signal: a.controller?.signal,
    ...init,
  }

  let response: FFetchResponse<M>

  if (body) {
    if (isBodyJson !== false) {
      enhancedInit.headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...init?.headers,
      }
      enhancedInit.body = JSON.stringify(body, null, 2)
    } else {
      enhancedInit.body = body
    }
  }

  let modifiedUrl = url

  // modify URL with dynamic URL params
  modifiedUrl = Object.entries(path ?? {}).reduce(
    (curr, [key, value]) => curr.replaceAll(`{${key}}`, value),
    modifiedUrl
  )

  modifiedUrl = [modifiedUrl, query ? `?${toQueryParams(query)}` : ''].join('')

  modifiedUrl = [a.domain, modifiedUrl].join('')

  const jsFetchArgs = {
    url: modifiedUrl,
    init: enhancedInit,
  }

  try {
    response = await fetch(jsFetchArgs.url, jsFetchArgs.init)

    // ok is equal to `statusCode` in range 200-299`
    await errorThrowerHttpOK(jsFetchArgs, response)

    const isResponseJson = response.headers.get('content-type')?.includes('application/json')

    // you can't parse response for two times, before each parsing call the `.clone()` method
    const resToParse = response.clone()
    const data = await (okResponseParser
      ? okResponseParser(resToParse)
      : isResponseJson
      ? resToParse.json()
      : resToParse.text())

    return [data, response] as [typeof data, typeof response]
  } catch (error) {
    // @ts-expect-error
    if (error instanceof TypeError && error.cause) {
      // network related error
      throw new FFetchNetworkError(jsFetchArgs, error)
    }

    throw error
  }
}
