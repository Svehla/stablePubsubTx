import { Response } from 'express'

export const setup_with_jsonStreamOverHTTP =
  (serializeError: (err: any) => any) =>
  async (
    // req: Request,
    res: Omit<Response, 'send'> & { send: any },
    cb: (
      sendJson: (json: any) => void,
      registerOnDisconnectHttpConnection: (onDisconnectHttpConnection: () => void) => void
    ) => Promise<any>
  ) => {
    let wasSomeJSONSent = false
    let isCommEnd = false
    let isClientHttpConnAlive = true

    let onDisconnectHttpConnection = undefined as undefined | (() => void)

    const sendEvent = (json: any) => {
      if (res.destroyed === true) {
        if (isClientHttpConnAlive === true) {
          isClientHttpConnAlive = false
          onDisconnectHttpConnection?.()
        }
        return
      }

      if (isCommEnd) return
      if (wasSomeJSONSent === false) {
        wasSomeJSONSent = true
      } else {
        res.write(',\n')
      }
      res.write('  ' + JSON.stringify(json))
    }

    try {
      res.set({ 'Content-Type': 'application/json' })
      res.write('[\n')
      await cb(sendEvent, cbHttpClose => {
        onDisconnectHttpConnection = cbHttpClose
      })
    } catch (err) {
      console.error(err?.toString())
      // TODO: add some abstraction?
      sendEvent(serializeError(err))
    } finally {
      isCommEnd = true
      res.write('\n]')
      res.end()
    }
  }
