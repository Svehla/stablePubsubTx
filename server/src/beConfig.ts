import { getNumberFromEnvParser, getStringFromEnvParser, validateConfig } from 'typed-env-parser'

export const appEnv = validateConfig({
  port: getNumberFromEnvParser('PORT'),

  redisConnectionUrl: getStringFromEnvParser('REDIS_CONNECTION_URL', { pattern: 'redis:\\/\\/.+' }),

  openAI: {
    token: getStringFromEnvParser('OPEN_AI_TOKEN'),
    completionPath: getStringFromEnvParser('OPEN_AI_COMPLETIONS_PATH'),
  },
})
