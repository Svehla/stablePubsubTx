import {
  getNumberFromEnvParser,
  getStringFromEnvParser,
  validateConfig,
} from "typed-env-parser";

export const appEnv = validateConfig({
  port: getNumberFromEnvParser("PORT"),

  redisConnectionUrl: getStringFromEnvParser("REDIS_CONNECTION_URL", {
    pattern: "redis:\\/\\/.+",
  }),
});
