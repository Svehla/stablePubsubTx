import 'katex/dist/katex.min.css'
import { Input } from './components/Input'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { aggregateBotChunksIntoMessage } from './utils/aggregators'
import { coldarkDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { delay } from './utils/time'
import { filterEventsByEventTypes } from './utils/array'
import { services } from './ffetch/services'
import { syncErrorAlert } from './components/syncErrorAlert'
import { urls } from './urls'
import {
  useComponentDidMount,
  // useLocalStorage,
  useNotifyOtherTabs,
  useWindowDimensions,
} from './utils/hooks'
import { useEffect, useRef, useState } from 'react'
import { useFFetch } from './ffetch/useFFetch'
import { useNavigate, useParams } from 'react-router-dom'
import Markdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'

type Messages = NonNullable<Awaited<ReturnType<typeof services['chat']['get']>>[0]>

export const Root = () => {
  const [messages, setMessages] = useState([] as Messages)
  const ref = useRef<HTMLDivElement | null>(null)
  const [showDebug, setShowDebug] = useState(true)
  // TODO: refactor into USER_ID => each user may have N Chats
  // org > user > chat
  // const [userId, setUserId] = useLocalStorage('USER_ID', 'john')

  const navigate = useNavigate()
  const params = useParams<{ chatId: string }>()
  // const [chatId, setChatId, getChatId] = useLocalStorage('CHAT_ID', null as string | null)
  // const [chatId, setChatId] = useAsyncState(null as null | string)
  const chatId = params.chatId
  // TODO: make synchronization over local storage
  const [input, setInput] = useState('')
  const [automaticallyScrollDown, setAutomaticallyScrollDown] = useState(true)

  const inputRef = useRef<HTMLInputElement | null>(null)

  const list = useFFetch(services.chat.list)
  const chatGet = useFFetch(services.chat.get)
  const chatCreate = useFFetch(services.chat.create)
  const chatSendMessage = useFFetch(services.chat.sendMessage, { rejectPrevReq: false })
  const deleteChat = useFFetch(services.chat.delete)

  const loading = chatCreate.loading || chatSendMessage.loading || chatGet.loading

  const windowDim = useWindowDimensions()
  // ??
  const isMobile = windowDim.width <= 500

  useComponentDidMount(async () => {
    // const main = async () => {
    if (params.chatId === 'NEW') {
      const [createdChat] = await chatCreate.fetch({})
      notifyOtherTabs({ type: 'SYNC_CHAT_LIST' })
      // setChatId(createdChat.id)
      navigate(`/chat/${createdChat.id}`)
      return
    }

    await Promise.all([
      list.fetch(
        {}
        // { controller: controller1 }
      ),
      (async () => {
        setMessages([])

        const id = chatId
        await chatGet.fetch(
          {
            path: { chatId: id! },
            // controller: controller1
          },
          async message => {
            if (message.type === 'UNHANDLED_ERROR') {
              await syncErrorAlert(message)
              return
            }

            setMessages(p => [...p, message])
          }
        )
      })(),
    ])
  })

  useEffect(() => {
    const onScroll = () => {
      let scrollHeight = ref.current!.scrollHeight
      let scrollTop = ref.current!.scrollTop
      let clientHeight = ref.current!.clientHeight
      let offsetPxToDoNotScroll = 30
      let isScrolledToBottom =
        Math.ceil(scrollTop + clientHeight) >= scrollHeight - offsetPxToDoNotScroll
      setAutomaticallyScrollDown(isScrolledToBottom)
    }

    ref.current?.addEventListener('scroll', onScroll)
    return () => ref.current?.removeEventListener('scroll', onScroll)
  }, [])

  const scrollChatToBottom = () => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight ?? 0
    }
  }

  useEffect(() => {
    if (automaticallyScrollDown) {
      scrollChatToBottom()
    }
  }, [automaticallyScrollDown, JSON.stringify(messages)])

  const notifyOtherTabs = useNotifyOtherTabs<
    { type: 'SYNC_CHAT'; chatId: string } | { type: 'SYNC_CHAT_LIST' } | null
  >(
    async message => {
      switch (message?.type) {
        case 'SYNC_CHAT':
          if (message.chatId === params.chatId) {
            const id = params.chatId
            const lastMessageChatFromIso = messages[messages.length - 1]?.createdAtISO

            await chatGet.fetch(
              { path: { chatId: id! }, query: { chatFromISO: lastMessageChatFromIso } },
              async message => {
                if (message.type === 'UNHANDLED_ERROR') return await syncErrorAlert(message)

                setMessages(p => [...p, message])
              }
            )
          }
          break

        case 'SYNC_CHAT_LIST':
          await list.fetch({})
          break

        default:
          break
      }
    },
    [messages]
  )

  const aggregatedMessages = aggregateBotChunksIntoMessage(messages)

  const availableChats = list.data

  const onSubmit = async () => {
    try {
      let isFirstSuccessMessage = true
      await chatSendMessage.fetch(
        { path: { chatId: chatId! }, body: { message: input } },
        async message => {
          if (message.type === 'UNHANDLED_ERROR') {
            await syncErrorAlert(message)
            return
          }
          // clear input only when its success
          if (isFirstSuccessMessage === true) {
            // TODO: read acknowledge response from BE to make it as fast as possible?
            // TODO: remove delay 100!!! for ACT response => redis tx already exist!
            notifyOtherTabs({ type: 'SYNC_CHAT', chatId: params.chatId! })
            setInput('')
            isFirstSuccessMessage = false
          }

          setMessages(p => [...p, message])
        }
      )
    } catch (error) {
      await syncErrorAlert(error)
    }
  }

  const isSubmitDisabled = input.length === 0 // || loading

  return (
    <div>
      <div style={{ display: 'flex' }}>
        {
          <div
            style={{
              width: '100px',
              background: '#222',
              color: 'white',
              overflow: 'auto',
              height: '100vh',
            }}
          >
            <button
              style={{ width: '100%', border: 'none', height: '47px', fontSize: '2rem' }}
              onClick={() => {
                navigate(urls.getNewChat())
              }}
            >
              +
            </button>

            {availableChats?.map((i, index) => (
              <div
                style={{
                  height: '50px',
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '1px solid #555 ',
                  cursor: 'pointer',
                  background: i.chatId === params.chatId ? '#0a7cff' : 'none',
                }}
                onClick={() => {
                  navigate(urls.getChat({ id: i.chatId }))
                }}
                key={index}
              >
                <span
                  style={{
                    margin: 'auto',
                    fontSize: '1.7rem',
                  }}
                >
                  {i.slug}
                </span>
              </div>
            ))}
          </div>
        }

        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
          }}
        >
          <div
            style={{
              padding: '0.5rem',
              borderBottom: '1px solid #DDD',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div
              style={{
                fontSize: '2rem',
                padding: '0 1rem ',
              }}
            >
              {list.data?.find(i => i.chatId === params.chatId)?.slug}
            </div>
            <div>{new Date().toLocaleString()}</div>
          </div>

          <div
            style={{
              height: '100%',
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'start',
              paddingRight: '1rem',
              paddingLeft: '0.5rem',
              paddingTop: '1rem',
            }}
            ref={ref}
          >
            {aggregatedMessages.length === 0 && list.loading === false && (
              <div style={{ display: 'flex', height: '100%' }}>
                <div style={{ margin: 'auto', color: '#888', fontSize: '20px' }}>Chat is empty</div>
              </div>
            )}

            {filterEventsByEventTypes(aggregatedMessages, ['message'] as const).map((i, index) => {
              const isLastRenderedMesage = aggregatedMessages.length === index + 1
              if (!showDebug && i.data.type === 'debug') return
              return (
                <div
                  key={index}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: i.data.type === 'bot' ? 'start' : 'end',
                    marginBottom: '10px',
                  }}
                >
                  <div
                    style={{
                      ...(i.data.type === 'bot'
                        ? { background: '#f0f0f0' }
                        : {
                            background: '#0a7cff',
                            color: 'white',
                          }),
                      lineHeight: '15px',
                      maxWidth: '90%',
                      borderRadius: '10px',
                      padding: '10px',
                    }}
                  >
                    {isLastRenderedMesage &&
                    i.data.type === 'bot' &&
                    i.data.message === '' &&
                    loading ? (
                      <div style={{ fontSize: '1rem', color: '#aaa' }}>loading ...</div>
                    ) : (
                      <div
                        style={{
                          paddingLeft: '0.5rem',
                        }}
                      >
                        <Markdown
                          remarkPlugins={[remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                          components={{
                            li: props => {
                              return <li style={{ marginLeft: '2rem' }}>{props.children}</li>
                            },
                            code(props) {
                              const { children, className, node, ...rest } = props
                              const match = /language-(\w+)/.exec(className || '')
                              return match ? (
                                // @ts-expect-error
                                <SyntaxHighlighter
                                  {...rest}
                                  PreTag='div'
                                  // eslint-disable-next-line react/no-children-prop
                                  children={String(children).replace(/\n$/, '')}
                                  language={match[1]}
                                  style={coldarkDark}
                                />
                              ) : (
                                <code {...rest} className={className}>
                                  {children}
                                </code>
                              )
                            },
                          }}
                        >
                          {i.data.message}
                        </Markdown>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <form
            onSubmit={e => {
              e.preventDefault()
              onSubmit()
            }}
          >
            <div
              style={{
                display: 'flex',
                width: '100%',
                justifyContent: 'space-between',
                // alignItems: 'flex-end',
                // height: '100%',
                // alignItems: 'flex-end',
              }}
            >
              <button
                type='button'
                onClick={async () => {
                  try {
                    await deleteChat.fetch({ path: { chatId: params.chatId! } })
                    const redirectToId = list.data?.filter(i => i.chatId !== params.chatId!)[0]
                    if (redirectToId) {
                      navigate(urls.getChat({ id: redirectToId.chatId }))
                    }
                  } catch (err) {
                    await syncErrorAlert(err)
                  }
                }}
                style={{
                  border: 'none',
                  padding: '0px 5px',
                  width: '80px',
                  background: 'white',
                  fontSize: '1.5rem',
                }}
                disabled={loading || list.data?.length === 1}

                // this is not applied on multiple tabs => TODO: do multiple tabs synchronization somehow over localstorage
              >
                🧹
              </button>

              <button
                type='button'
                onClick={() => {
                  setShowDebug(p => !p)
                }}
                style={{
                  border: 'none',
                  padding: '0px 5px',
                  width: '60px',
                  fontSize: '1.5rem',
                  background: showDebug ? '#ff0a7c' : 'white',
                }}
              >
                🐞
              </button>

              <Input
                setRef={r => {
                  inputRef.current = r
                }}
                onSubmit={() => {
                  onSubmit()
                }}
                disabled={isSubmitDisabled}
                // type='text'
                value={input}
                onChange={text => setInput(text)}
              />

              <button
                type='submit'
                disabled={isSubmitDisabled}
                style={{
                  border: 'none',
                  width: '100px',
                  background: 'white',
                  fontSize: '1.5rem',
                }}
              >
                💘
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
