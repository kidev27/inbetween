async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/${path}`, init)
  } catch {
    throw new Error('No connection. Check your signal and try again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message ?? `Something went wrong (${res.status}).`)
  return data as T
}

export const get = <T>(path: string) => request<T>(path, {})

export const post = <T>(path: string, body?: object) =>
  request<T>(
    path,
    body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : { method: 'POST' },
  )
