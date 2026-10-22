/**
 * lib/weapi.mjs —— 网易云 Web API 的加密壳（WEAPI）
 * ============================================================================
 * 网易云网页端/客户端调接口都要把参数套两层 AES 再用 RSA 包一个随机 key。
 * 这里就是那套算法的纯 Node 实现（只用 node:crypto，无第三方依赖）：
 *   params   = aes_cbc(aes_cbc(json, presetKey), secretKey)   → base64
 *   encSecKey= rsa_no_padding(reverse(secretKey))            → hex
 * 说明：这是网页端公开的调用方式，我们只用自己的登录 cookie 调自己的账号。
 * ============================================================================
 */
import crypto from 'node:crypto'

const PRESET_KEY = '0CoJUm6Qyw8W8jud'
const IV = '0102030405060708'
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`
const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const aes = (text, key) => {
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(IV))
  return Buffer.concat([cipher.update(Buffer.from(text, 'utf8')), cipher.final()]).toString('base64')
}

export function encrypt(data) {
  const text = JSON.stringify(data)
  const secretKey = crypto.randomBytes(16).map((b) => BASE62[b % BASE62.length]).join('')
  const params = aes(aes(text, PRESET_KEY), secretKey)
  const reversed = Buffer.from(secretKey.split('').reverse().join(''), 'utf8')
  const block = Buffer.concat([Buffer.alloc(128 - reversed.length), reversed])
  const encSecKey = crypto
    .publicEncrypt({ key: PUBLIC_KEY, padding: crypto.constants.RSA_NO_PADDING }, block)
    .toString('hex')
  return { params, encSecKey }
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * 发一个 weapi 请求。
 * @param {string} path 例如 '/weapi/v6/playlist/detail'
 * @param {object} data 参数
 * @param {string} cookie 'MUSIC_U=...; __csrf=...'
 */
export async function request(path, data, cookie) {
  const { params, encSecKey } = encrypt(data)
  const res = await fetch(`https://music.163.com${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      Referer: 'https://music.163.com/',
      Origin: 'https://music.163.com',
      Cookie: cookie,
    },
    body: new URLSearchParams({ params, encSecKey }).toString(),
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  if (res.status !== 200) {
    throw new Error(`网易云接口 ${path} 返回 HTTP ${res.status}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`网易云接口 ${path} 返回了非 JSON：${text.slice(0, 120)}`)
  }
}
