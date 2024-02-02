export const toQueryParams = (params: Record<string, any>) => {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([k, v]) => {
    search.append(k, v)
  })

  return search.toString()
}
