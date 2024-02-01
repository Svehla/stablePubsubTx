// TODO: add unit tests

// if some of the item is rejected, queue is killed
export const initSyncQueue = () => {
  let mut_index = -1;

  const pendingSendEventPromises = [] as Promise<void>[];

  const current = { errors: [] as any[] };

  return {
    pushAsyncCb(cb: () => Promise<void> | void) {
      mut_index++;
      const currentCallIndex = mut_index;

      const storePromise = new Promise<void>(async (res, rej) => {
        try {
          await pendingSendEventPromises[currentCallIndex - 1];
          await cb();
          res();
        } catch (err) {
          // we do not want to reject this promise, because we want to handle error after calling waitTillEmptyOrReject
          // rej(err)
          current.errors.push(err);
          res();
        }
      });

      pendingSendEventPromises.push(storePromise);
      return storePromise;
    },

    // if some of the promise fail, it should reject this as well
    async waitTillEmptyOrReject() {
      await Promise.all(pendingSendEventPromises);

      if (current.errors.length > 0) {
        // throw new Error(current.errors[0])
        // rest of errors is hidden, should I merge them somehow?
        throw new Error(
          current.errors
            .map((i) => i?.message ?? i?.toString())
            .join(" + error: ")
        );
      }
    },
  };
};
