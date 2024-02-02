import { Link, RouterProvider, createBrowserRouter, useNavigate, useParams } from 'react-router-dom'
import { Root } from './Root'
import { SyncUI } from 'react-sync-ui'
import { services } from './ffetch/services'
import { urlTemplate, urls } from './urls'
import { useComponentDidMount } from './utils/hooks'
import { useFFetch } from './ffetch/useFFetch'

const MainPage = () => {
  const navigate = useNavigate()
  const listChats = useFFetch(services.chat.list)

  useComponentDidMount(async () => {
    const [data] = await listChats.fetch({})
    if (data.length > 0) {
      navigate(urls.getChat({ id: data?.[0].chatId }))
    } else {
      navigate(urls.getNewChat())
    }
  })

  return <div>redirecting</div>
}

const ChatDetail = () => {
  const params = useParams<{ chatId: string }>()
  return <Root key={params.chatId} />
}

const router = createBrowserRouter([
  {
    path: urlTemplate.root,
    element: (
      <div>
        <SyncUI />
        <MainPage />
      </div>
    ),
  },
  {
    path: urlTemplate.chatDetail,
    element: (
      <div>
        <SyncUI />
        <ChatDetail />
      </div>
    ),
  },
  {
    path: '*',
    element: (
      <div>
        <div>404</div>
        <Link to={urls.getRoot()}>Root</Link>
        <SyncUI />
      </div>
    ),
  },
])

export const Router = () => {
  return (
    <div>
      <RouterProvider router={router} />
    </div>
  )
}
