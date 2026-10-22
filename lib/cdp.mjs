/**
 * lib/cdp.mjs —— 跟网易云客户端说话的底层通道（CDP / Chrome DevTools Protocol）
 * ============================================================================
 * 为什么走这条路：网易云 PC 端是 CEF 套壳，客户端自己的界面就是个网页。
 * 只要它带着 `--remote-debugging-port=<port>` 启动，我们就能：
 *   ① 在它的页面里执行 JS（读播放状态、派发它自己的 redux action 来切歌/暂停）
 *   ② 用 `Network.getCookies` 拿到它已经登录好的 MUSIC_U（不用再单独扫码登录）
 * 这两条是**只读客户端自身状态**的路子，不碰账号密码。
 * ============================================================================
 */
import { wsConnect } from './ws.mjs'

const DEFAULT_PORT = 9223

/** 探测一个端口上有没有 CDP */
export async function cdpVersion(port = DEFAULT_PORT) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function cdpReady(port = DEFAULT_PORT) {
  return Boolean(await cdpVersion(port))
}

/** 列出可调试的页面，挑出客户端主界面那个 */
export async function findAppPage(port = DEFAULT_PORT) {
  let list = []
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })
    if (res.ok) list = await res.json()
  } catch {
    return null
  }
  const pages = (Array.isArray(list) ? list : []).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  return (
    pages.find((t) => String(t.url || '').startsWith('orpheus://orpheus/pub/app.html')) ||
    pages.find((t) => String(t.url || '').startsWith('orpheus://')) ||
    pages[0] ||
    null
  )
}

/**
 * 在客户端页面里执行一段 JS 并取回值（支持 Promise）。
 * 注意：这里**绝不让异常静默** —— 客户端没开调试端口是最常见的失败，
 * 报错里直接告诉用户「点一下 netease_launch」。
 */
export async function evaluate(expression, { port = DEFAULT_PORT, timeoutMs = 8000, awaitPromise = true } = {}) {
  const page = await findAppPage(port)
  if (!page?.webSocketDebuggerUrl) {
    const err = new Error(`没连上网易云客户端（127.0.0.1:${port} 没有调试端口）`)
    err.code = 'CDP_UNAVAILABLE'
    throw err
  }
  const ws = await wsConnect(page.webSocketDebuggerUrl, { timeoutMs })
  try {
    let seq = 0
    const waiting = new Map()
    let onClose = null
    ws.onMessage((text) => {
      let msg
      try { msg = JSON.parse(text) } catch { return }
      const waiter = waiting.get(msg.id)
      if (waiter) {
        waiting.delete(msg.id)
        waiter(msg)
      }
    })
    const raw = new Promise((resolve, reject) => {
      onClose = (err) => reject(err || new Error('CDP 连接被关闭'))
    })
    const send = (method, params) => {
      const id = ++seq
      return new Promise((resolve, reject) => {
        waiting.set(id, resolve)
        ws.send({ id, method, params })
        setTimeout(() => {
          if (waiting.has(id)) {
            waiting.delete(id)
            reject(new Error(`CDP ${method} 超时（${timeoutMs}ms）`))
          }
        }, timeoutMs)
      })
    }
    const result = await Promise.race([send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      timeout: timeoutMs,
    }), raw])
    const details = result?.result?.exceptionDetails
    if (details) {
      const desc = details.exception?.description || details.text || '客户端 JS 执行失败'
      throw new Error(String(desc).split('\n')[0])
    }
    const value = result?.result?.result?.value
    if (value === undefined && result?.error) throw new Error(result.error.message || 'CDP 返回错误')
    return value
  } finally {
    try { ws.close() } catch { /* ignore */ }
  }
}

/** 从客户端页面拿 cookie（CDP 会自己解密，不用碰 DPAPI） */
export async function getCookies(port = DEFAULT_PORT) {
  const page = await findAppPage(port)
  if (!page?.webSocketDebuggerUrl) {
    const err = new Error(`没连上网易云客户端（127.0.0.1:${port} 没有调试端口）`)
    err.code = 'CDP_UNAVAILABLE'
    throw err
  }
  const ws = await wsConnect(page.webSocketDebuggerUrl, { timeoutMs: 8000 })
  try {
    let seq = 0
    const waiting = new Map()
    let onClose = null
    ws.onMessage((text) => {
      let msg
      try { msg = JSON.parse(text) } catch { return }
      const waiter = waiting.get(msg.id)
      if (waiter) { waiting.delete(msg.id); waiter(msg) }
    })
    const closed = new Promise((_, reject) => { onClose = (err) => reject(err || new Error('CDP 连接被关闭')) })
    const send = (method, params = {}) => {
      const id = ++seq
      return new Promise((resolve, reject) => {
        waiting.set(id, resolve)
        ws.send({ id, method, params })
        setTimeout(() => {
          if (waiting.has(id)) { waiting.delete(id); reject(new Error(`CDP ${method} 超时`)) }
        }, 8000)
      })
    }
    await Promise.race([send('Network.enable'), closed])
    const res = await Promise.race([
      send('Network.getCookies', { urls: ['https://music.163.com', 'https://music.163.com/'] }),
      closed,
    ])
    const cookies = res?.result?.cookies || []
    const jar = {}
    for (const c of cookies) jar[c.name] = c.value
    return jar
  } finally {
    try { ws.close() } catch { /* ignore */ }
  }
}
