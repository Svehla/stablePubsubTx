import { ValidationError } from 'yup'
import { normalizeAbortEarlyYupErr } from 'swagger-typed-express-docs/dist/runtimeSchemaValidation'

export const serializeNetworkFetchError = (error: TypeError) => ({
  message: error.message,
  cause: {
    // @ts-expect-error
    message: error.cause.message,
    // @ts-expect-error
    errno: error.cause.errno,
    // @ts-expect-error
    code: error.cause.code,
    // @ts-expect-error
    syscall: error.cause.syscall,
    // @ts-expect-error
    hostname: error.cause.hostname,
  },
})

export const serializeErrorToJSON = (error: any) => {
  let errorDetails: {
    type: string
    reason: any
    stack: string | undefined
  } & Record<string, any>

  if (error instanceof TypeError && error.cause) {
    // Handling specific properties for network-related errors from global.fetch
    errorDetails = {
      type: error.name,
      reason: serializeNetworkFetchError(error),
      stack: error.stack,
    }
  } else if (error instanceof ValidationError) {
    errorDetails = {
      type: 'JSSchemaValidationError',
      reason: normalizeAbortEarlyYupErr(error),
      stack: error.stack,
    }
  } else if (error instanceof Error) {
    // General error handling
    errorDetails = {
      type: 'Error',
      reason: error.message,
      stack: error.stack,
    }
  } else {
    errorDetails = {
      type: 'value',
      reason: error,
      stack: error.stack,
    }
  }

  // TODO: for prod purposes
  // delete errorDetails.stack;
  return errorDetails
}
