import {
  // getBoolFromEnvParser,
  getStringEnumFromEnvParser,
  getStringFromEnvParser,
  validateConfig,
} from 'typed-env-parser'

window.process = window.process || {}
// @ts-expect-error
window.process.env = import.meta.env

export const appEnv = validateConfig({
  // vite envs
  MODE: getStringEnumFromEnvParser('MODE', ['development'] as const),
  // getBoolFromEnvParser is not working if value is not string, but if its already pre-validate
  // DEV: getBoolFromEnvParser('DEV'),

  // app related
  beUrl: getStringFromEnvParser('VITE_BE_URL', { pattern: '(http|https)://*.' }),
})
