# stablePubsubTx

## Integration

1. setup redis connections

```ts
await redisCore.openConnection()
redisTxAdapter.setup(redisClients)
```

2. setup redis on kill nodejs

```ts
const gracefulShutdown = async () => {
  await stablePubsubTx.closeAllOpenTransactions()
  await redisCore.closeConnection()
  process.exit()
}

process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)
process.on('SIGUSR2', gracefulShutdown)
```

3. use 2 function

3.1. `executeNewTransactionJob`

3.2. `joinIntoTransaction`

## TODO:

- add unit tests
- add JS adapter
- add examples of usage on chat
