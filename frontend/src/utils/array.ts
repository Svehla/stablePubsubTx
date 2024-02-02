export type MakeFieldOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type ExtractChatEventsSubset<EventsUnion, EventTypesUnion> = EventsUnion extends {
  type: infer T
}
  ? T extends EventTypesUnion
    ? EventsUnion
    : never
  : never

export const notNullable = <T>(x: T | null | undefined | false): x is T =>
  x !== undefined && x !== null && x !== false

export const filterEventsByEventTypes = <
  CustomEvent extends { type: string },
  EventType extends readonly any[] | any[]
>(
  eventLog: CustomEvent[],
  eventIds: EventType
) => {
  const items = eventLog.filter(event => eventIds.includes(event.type)) as ExtractChatEventsSubset<
    CustomEvent,
    EventType[number]
  >[]
  return items
}
