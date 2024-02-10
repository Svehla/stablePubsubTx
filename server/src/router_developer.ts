import { Express } from 'express'
import { T, apiDoc, initApiDocs } from 'swagger-typed-express-docs'
import { appEnv } from './beConfig'
import swaggerUi from 'swagger-ui-express'

let lazyOpenAPI3_0_0JSON = {} as any

// --------------------------------------------
// ----------------- api docs -----------------
export const setupOpenAPI3_0_0Docs = (app: Express) => {
  app.use('/developer/swagger-ui/index.html', swaggerUi.serve)
  app.get(
    '/developer/swagger-ui/index.html',
    // there needs to be lazy handler to wait till lazyOpenAPI3_0_0JSON is set
    apiDoc({ returns: T.string })((...args) =>
      swaggerUi.setup(lazyOpenAPI3_0_0JSON)(
        // @ts-expect-error
        ...args
      )
    )
  )

  app.get(
    '/developer/api-docs',
    apiDoc({ returns: T.any })((_req, res) => res.send(lazyOpenAPI3_0_0JSON))
  )

  lazyOpenAPI3_0_0JSON = initApiDocs(app, {
    info: {
      title: 'GPT proxy',
      version: '1.0.0',
    },
    servers: [{ url: `http://localhost:${appEnv.port}` }],
  })
}
