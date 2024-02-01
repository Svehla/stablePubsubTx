import { Express } from "express";
import {
  T,
  apiDoc,
  initApiDocs,
  jsValueToSchema,
} from "swagger-typed-express-docs";
import { apiHandler } from "./utils/apiHandler";
import swaggerUi from "swagger-ui-express";

let lazyOpenAPI3_0_0JSON = {} as any;

// --------------------------------------------
// ----------------- api docs -----------------
export const setupOpenAPI3_0_0Docs = (app: Express) => {
  app.use("/developer/swagger-ui/index.html", swaggerUi.serve);
  app.get(
    "/developer/swagger-ui/index.html",
    // there needs to be lazy handler to wait till lazyOpenAPI3_0_0JSON is set
    apiDoc({ returns: T.string })((...args) =>
      swaggerUi.setup(lazyOpenAPI3_0_0JSON)(
        // @ts-expect-error
        ...args
      )
    )
  );

  app.get(
    "/developer/api-docs",
    apiDoc({ returns: T.any })((_req, res) => res.send(lazyOpenAPI3_0_0JSON))
  );

  lazyOpenAPI3_0_0JSON = initApiDocs(app, {
    info: {
      title: "CoCoAaS",
      version: "1.0.0",
    },
    servers: [
      { url: "http://localhost:3333" },
      { url: "https://analytics.master.gdev.exponea.com" },
      { url: "https://api-analytics.master.gdev.exponea.com" },
    ],
  });

  // ----------------------------------------------------------
  // ---- Coffee for those who understand what's happening ----

  // eslint-disable-next-line prettier/prettier
  app.get(
    "/MAGIC",
    apiHandler({ returns: jsValueToSchema(lazyOpenAPI3_0_0JSON) })(
      (_req, res) => {
        // @ts-expect-error
        res.send(null);
      }
    )
  );

  lazyOpenAPI3_0_0JSON.paths["/developer/api-docs"] =
    initApiDocs(app).paths["/MAGIC"];
  // ----------------------------------------------------------
};
