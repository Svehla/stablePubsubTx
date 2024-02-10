import { appEnv } from '../appEnv'
import { ffetch } from './ffetch'
import { jsonArrayStreamFetchReader } from './jsonArrayStreamFetchReader'
import { paths } from '../__generated-api__/server-api'

export const createTypedService =
  <
    URL extends keyof paths,
    METHOD extends keyof paths[URL],
    // --- attrs ---
    // @ts-expect-error
    Path = paths[URL][METHOD]['parameters']['path'],
    // @ts-expect-error
    Query = paths[URL][METHOD]['parameters']['query'],
    // @ts-expect-error TODO: remove body!
    Body = paths[URL][METHOD]['requestBody']['content']['application/json'],
    // --- nice TS attrs merges ---
    PathObj = Path extends Record<any, any> ? { path: Path } : {},
    QueryObj = Query extends Record<any, any> ? { query: Query } : {},
    BodyObj = Body extends Record<any, any> ? { body: Body } : {}
  >(
    url: URL,
    method: METHOD,
    staticConf?: Parameters<typeof ffetch>[2]
  ) =>
  (
    a: PathObj & QueryObj & BodyObj & { controller?: AbortController },
    callingConf?: Parameters<typeof ffetch>[3]
  ) =>
    // @ts-expect-error
    ffetch<paths[URL][METHOD]['responses'][200]['content']['application/json']>(
      url,
      method as string,
      // @ts-expect-error
      {
        // @ts-expect-error
        path: a?.path,
        // @ts-expect-error
        query: a?.query,
        // @ts-expect-error
        body: a?.body,
        domain: appEnv.beUrl,
        controller: a.controller,
        ...staticConf,
      },
      {
        ...callingConf,
      }
    )

export const createTypedServiceJsonStream =
  <
    URL extends keyof paths,
    METHOD extends keyof paths[URL],
    // --- attrs ---
    // @ts-expect-error
    Path = paths[URL][METHOD]['parameters']['path'],
    // @ts-expect-error
    Query = paths[URL][METHOD]['parameters']['query'],
    // @ts-expect-error TODO: remove body!
    Body = paths[URL][METHOD]['requestBody']['content']['application/json'],
    // --- nice TS attrs merges ---
    PathObj = Path extends Record<any, any> ? { path: Path } : {},
    QueryObj = Query extends Record<any, any> ? { query: Query } : {},
    BodyObj = Body extends Record<any, any> ? { body: Body } : {}
  >(
    url: URL,
    method: METHOD
  ) =>
  async (
    a: PathObj & QueryObj & BodyObj & { controller?: AbortController },
    onMessage: (
      // @ts-expect-error
      message: paths[URL][METHOD]['responses'][200]['content']['application/json'][number]
    ) => void
  ) => {
    // @ts-expect-error
    return await ffetch<paths[URL][METHOD]['responses'][200]['content']['application/json']>(
      url,
      method as string,
      {
        // @ts-expect-error
        path: a?.path,
        // @ts-expect-error
        query: a?.query,
        // @ts-expect-error
        body: a?.body,
        domain: appEnv.beUrl,
        // @ts-expect-error
        okResponseParser: r => jsonArrayStreamFetchReader(r, onMessage),
        controller: a.controller,
      }
    )
  }
