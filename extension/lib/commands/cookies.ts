export async function cookieGet(params: { url: string; name?: string }): Promise<unknown> {
  const cookies = await chrome.cookies.getAll({ url: params.url })
  if (params.name) {
    const found = cookies.find(c => c.name === params.name)
    return found ?? { error: `Cookie not found: ${params.name}` }
  }
  return cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    httpOnly: c.httpOnly,
    secure: c.secure,
  }))
}

export async function cookieSet(params: { cookie: chrome.cookies.SetDetails }): Promise<unknown> {
  const result = await chrome.cookies.set(params.cookie)
  return result ? { success: true } : { success: false }
}
