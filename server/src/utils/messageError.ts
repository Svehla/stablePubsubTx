import { T, TSchema } from 'swagger-typed-express-docs'
import { serializeErrorToJSON } from './errors'
import { tUnionObject } from './tType'
import { v4 } from 'uuid'

export const tWrapWithJsonStreamList = <T extends TSchema>(tSchema: T) => {
  return T.list(
    T.oneOf([
      //
      tUnionObject('UNHANDLED_ERROR', { data: T.any }),
      tSchema,
    ] as const)
  )
}

export const serializeErrorMessage = (err: any) => ({
  type: 'UNHANDLED_ERROR',
  data: serializeErrorToJSON(err),
  id: v4(),
  createdAtISO: new Date().toISOString(),
})
