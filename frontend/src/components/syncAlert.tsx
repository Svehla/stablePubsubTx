import { makeSyncUI } from 'react-sync-ui'

export const syncAlert = makeSyncUI<{ title: string; description?: string }, void>(props => (
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
        background: 'white',
        margin: '2rem',
        padding: '2rem',
        textOverflow: 'none',
      }}
    >
      <h3>{props.data.title}</h3>

      {props.data.description && (
        <div style={{ maxWidth: '100%', overflow: 'auto' }}>{props.data.description}</div>
      )}

      <div style={{ display: 'flex', width: '100%', justifyContent: 'right' }}>
        <button onClick={() => props.resolve()} style={{ padding: '1rem', border: 'none' }}>
          OK
        </button>
      </div>
    </div>
  </div>
))
