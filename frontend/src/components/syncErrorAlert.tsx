import { isObject } from '../utils/object'
import { makeSyncUI } from 'react-sync-ui'
import { urls } from '../urls'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export const syncErrorAlert = makeSyncUI<any>(props => {
  // TODO: do proper JSON to string parser with proper UI
  const error = props.data
  let text = error?.toString()
  const navigate = useNavigate()

  const isAbortEarlyError = error?.name === 'AbortError'
  const isMoreThan3TxError =
    isObject(error) &&
    error.type === 'FFetchNotOKError' &&
    error.reason.data.includes('cannot open more than 3 transactions')
  useEffect(() => {
    // ignore abort early errors
    if (isAbortEarlyError || isMoreThan3TxError) {
      props.resolve()
      return
    }

    if (isObject(error) && error.data === 'missing chat id') {
      navigate(urls.getRoot())
      props.resolve()
    }

    console.error(error)
  })

  if (isObject(error)) {
    text = JSON.stringify(error, null, 2)
  }

  if (isAbortEarlyError || isMoreThan3TxError) return <div />

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={() => props.resolve()}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          // width: '20',
          width: '80%',
          margin: '2rem',
          padding: '2rem',
          textOverflow: 'none',
          background: '#EEE',
          // background: 'black',
        }}
      >
        <h3>ERROR</h3>

        <pre style={{ maxWidth: '100%', overflow: 'auto', color: 'red' }}>{text}</pre>

        <div style={{ display: 'flex', width: '100%', justifyContent: 'right' }}>
          <button onClick={() => props.resolve()} style={{ padding: '1rem', border: 'none' }}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
})
