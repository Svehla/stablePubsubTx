import { useEffect, useRef, useState } from 'react'

const DEFAULT_HEIGHT = 40

const MAX_HEIGHT = 150

export const Input = (props: {
  style?: React.CSSProperties
  value: string
  onChange: (e: any) => void
  onSubmit: () => void
  disabled: boolean
  onKeyUp?: (e: any) => void
  onKeyDown?: (e: any) => void
  setRef: (r: any) => void
}) => {
  const [height, setHeight] = useState(DEFAULT_HEIGHT)

  const inputRef = useRef<any>(null)

  const submit = () => {
    if (props.disabled) return
    props.onSubmit()
  }

  useEffect(() => {
    inputRef.current.style.height = `${DEFAULT_HEIGHT}px`
    const newHeight = Math.min(inputRef.current.scrollHeight, MAX_HEIGHT)
    inputRef.current.style.height = `${newHeight}px`
    setHeight(newHeight)
  }, [props.value])

  return (
    <textarea
      placeholder='Ask me anything...'
      style={{
        ...props.style,
        resize: 'none',
        width: '100%',
        height: height,
        lineHeight: '24px',
        minHeight: '1px',
        padding: '0.4rem 1rem',
        margin: '0.5rem',
        borderRadius: '1rem',
        background: '#f2f2f2',
      }}
      ref={r => {
        inputRef.current = r
        props.setRef(inputRef.current)
      }}
      onKeyDown={e => {
        if (!e.shiftKey && e.key === 'Enter') {
          e.preventDefault()
          submit()
        }
      }}
      onKeyUp={props.onKeyUp}
      onChange={e => {
        const newTextValue = (e.target!.value as string) ?? ''
        props.onChange(newTextValue)
      }}
      value={props.value}
    />
  )
}
