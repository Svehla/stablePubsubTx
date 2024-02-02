export const urlTemplate = {
  root: '/',
  chatDetail: '/chat/:chatId',
} as const

export const urls = {
  getRoot: () => '/',
  getNewChat: () => '/chat/NEW',
  getChat: (a: { id: string }) => `/chat/${a.id}`,
}
