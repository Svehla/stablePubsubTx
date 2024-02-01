import { Response } from "express";
import { serializeErrorToJSON } from "./utils/errors";

export const with_jsonStreamOverHTTP = async (
  // req: Request,
  res: Omit<Response, "send"> & { send: any },
  cb: (
    sendJSON: (json: any) => void,
    registerOnUserClosedHttpConnection: (
      onUserClosedHttpConnection: () => void
    ) => void
  ) => Promise<any>
) => {
  let wasSomeJSONSent = false;
  let isCommEnd = false;
  let isClientHttpConnAlive = true;

  let onUserClosedHttpConnection = undefined as undefined | (() => void);

  const sendEvent = (json: any) => {
    if (res.destroyed === true) {
      if (isClientHttpConnAlive === true) {
        isClientHttpConnAlive = false;
        onUserClosedHttpConnection?.();
      }
      return;
    }

    if (isCommEnd) return;
    if (wasSomeJSONSent === false) {
      wasSomeJSONSent = true;
    } else {
      res.write(",\n");
    }
    res.write("  " + JSON.stringify(json));
  };

  try {
    res.set({ "Content-Type": "application/json" });
    res.write("[\n");
    await cb(sendEvent, (cbHttpClose) => {
      onUserClosedHttpConnection = cbHttpClose;
    });
  } catch (err) {
    console.error(err?.toString());
    // TODO: add some abstraction?
    sendEvent(serializeErrorToJSON(err));
  } finally {
    isCommEnd = true;
    res.write("\n]");
    res.end();
  }
};
