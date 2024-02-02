import { syncAlert } from '../components/syncAlert'
import { syncErrorAlert } from '../components/syncErrorAlert'
import { useCallback, useEffect, useState } from 'react'

export const useComponentDidMount = (fn: () => void | Promise<void>) => {
  useEffect(() => {
    const main = async () => {
      try {
        await fn()
      } catch (err) {
        await syncErrorAlert(err)
      }
    }
    main()
  }, [])
}

// TODO: local storage is not synced across multiple active tabs...
export const useLocalStorage = <T>(key: string, initialValue: T) => {
  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      // Get from local storage by key
      const storageNamespace = window.localStorage.getItem(key)
      // Parse stored json or if none return initialValue
      return JSON.parse(storageNamespace!) ?? initialValue
    } catch (error) {
      // If error also return initialValue
      return initialValue
    }
  })

  const setValue = useCallback(
    (value: T | ((prevV: T) => T)) =>
      new Promise<T>(res =>
        // TODO: prev value queue is not working for cross tab synchronization
        setStoredValue(p => {
          const valueToStore = value instanceof Function ? value(p) : value
          window.localStorage.setItem(key, JSON.stringify(valueToStore))
          res(valueToStore)
          return valueToStore
        })
      ),
    []
  )

  const getValue = useCallback(() => setValue(p => p), [])

  return [storedValue, setValue, getValue] as [typeof storedValue, typeof setValue, typeof getValue]
}

// this file is copied from the internet
// source:
// > https://medium.com/javascript-in-plain-english/useSingletonLocalStorage-react-hook-2532e922d5b1

// const serializeLocalStorageValue = (t: any) => JSON.stringify(t)
// const parseLocalStorageValue = <T>(t: string) => JSON.parse(t)

// TODO: should I do more smaller, less complex hooks?
// TODO: create custom hook to distribute messages over tabs like a queue and not to store them into local storage?
export const useNotifyOtherTabs = <T>(handler: (a: T) => void, deps?: any[]) => {
  const QUEUE_KEY = 'CHAT_QUEUE'

  const sendMessage = (message: T) => {
    window.localStorage.removeItem(QUEUE_KEY)
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(message))
  }

  // on value changed over window tab shared distributed
  useEffect(() => {
    const listener = async (event: any) => {
      if (event.key === QUEUE_KEY) {
        const itemValue = window.localStorage.getItem(QUEUE_KEY)
        window.localStorage.removeItem(QUEUE_KEY)
        if (!itemValue) return
        // clear local storage
        const item = JSON.parse(itemValue ?? 'null')
        handler(item)
      }
    }

    window.addEventListener('storage', listener)
    return () => window.removeEventListener('storage', listener)
  }, [handler, ...(deps ?? [])])

  return sendMessage
}

// interface WindowDimensions {
//   width: number | null;
//   height: number | null;
// }

export const useWindowDimensions = () => {
  // const hasWindow: boolean = typeof window !== 'undefined'

  const getWindowDimensions = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  const [windowDimensions, setWindowDimensions] = useState(getWindowDimensions())

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions(getWindowDimensions())
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return windowDimensions
}

export const useAsyncState = <T>(defaultState: T) => {
  const [state, _setState] = useState(defaultState)

  const setState = useCallback(
    (setStateAction: Parameters<typeof _setState>[0]) =>
      new Promise<T>(res =>
        _setState(prevState => {
          const newState =
            setStateAction instanceof Function ? setStateAction(prevState) : setStateAction
          res(newState)
          return newState
        })
      ),
    []
  )

  // if new state is equal to the old one (aka `p => p`)
  // react shallow compare does not trigger rerender of the component
  const getState = useCallback(() => setState(p => p), [])

  return [state, setState, getState] as const
}
