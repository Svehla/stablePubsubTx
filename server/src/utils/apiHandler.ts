import { apiDoc } from "swagger-typed-express-docs";
import { serializeErrorToJSON } from "./errors";

// this is global wrapper for api doc for custom HTTP implementation of generic stuffs
export const apiHandler: typeof apiDoc =
  (apiDocConf: any) => (handler: any) => {
    return apiDoc(apiDocConf)(
      // @ts-ignore
      async (req, res, next) => {
        try {
          await handler(req, res, next);
        } catch (err) {
          let errJSON = serializeErrorToJSON(err);
          res.status(500).send({ error: errJSON });
        }
      }
    );
  };
