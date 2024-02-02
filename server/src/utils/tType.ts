import { T, TSchema } from 'swagger-typed-express-docs'

// TODO: implement wrapper
// export const tUnionMessage = <T extends string, U>(type: T, attrs: U) =>
//   T.object({
//     id: T.string,
//     type: T.enum([type] as [T]),
//     dateISO: T.string,
//     ...attrs,
//   })

export const tUnionObject = <T extends string, U>(type: T, attrs: U) =>
  T.object({
    type: T.enum([type] as [T]),
    ...attrs,
  })
