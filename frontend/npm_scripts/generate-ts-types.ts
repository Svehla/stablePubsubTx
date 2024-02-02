import fs from 'fs'
// https://github.com/drwpow/openapi-typescript/issues/726
import * as x from 'openapi-typescript'
import path from 'path'

const mocksPath = path.join(__dirname, '../src/__generated-api__')

const generateServiceAPI = async () => {
  // miob: need running server in order to fix client ==> we cannot use docker development for it as it will not build image:D :D :D
  const url = 'http://localhost:8888/developer/api-docs/'
  const uiSwaggerUrl = 'http://localhost:8888/developer/swagger-ui/index.html'

  const res = await fetch(url)

  if (!res.ok) throw new Error(`Network response was not ok: ${res.status}`)

  const data = await res.json()

  const tsTypes = await x.default(data)

  fs.writeFileSync(
    path.join(mocksPath, '/server-api.ts'),
    '/* eslint-disable */\n\n' +
      `/* swagger url: ${uiSwaggerUrl} */\n` +
      `/* source: ${url} */\n\n` +
      `${tsTypes}\n`,
    'utf-8'
  )

  // TODO: add prettying via eslint
  // https://eslint.org/docs/developer-guide/nodejs-api#eslint-class
  console.info('.ts types generated')
}

generateServiceAPI()
