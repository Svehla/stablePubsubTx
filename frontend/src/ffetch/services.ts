import { createTypedService, createTypedServiceJsonStream } from './createTypedService'

export const services = {
  chat: {
    list: createTypedService('/chat', 'get'),
    create: createTypedService('/chat', 'post'),
    delete: createTypedService('/chat/{chatId}', 'delete'),

    get: createTypedServiceJsonStream('/chat/{chatId}', 'get'),
    sendMessage: createTypedServiceJsonStream('/chat/{chatId}/send-message', 'post'),
  },
}
