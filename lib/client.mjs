/**
 * lib/client.mjs —— 找客户端、带调试端口启动/重启它
 * ============================================================================
 * 网易云默认启动**不带** `--remote-debugging-port`，所以第一次要由插件替它重启一次。
 * 这一步只影响"当前这次运行"（关掉客户端再手动打开就没了），所以工具描述里写清楚了。
 * ============================================================================
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { cdpReady } from './cdp.mjs'
import { loadConfig, log } from './state.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function clientCandidates() {
  const cfg = loadConfig()
  const out = []
  if (cfg.clientPath) out.push(cfg.clientPath)
  const pf = process.env.ProgramFiles || 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const local = process.env.LOCALAPPDATA || ''
  out.push(join(pf, 'Netease', 'CloudMusic', 'cloudmusic.exe'))
  out.push(join(pf86, 'Netease', 'CloudMusic', 'cloudmusic.exe'))
  if (local) out.push(join(local, 'Netease', 'CloudMusic', 'cloudmusic.exe'))
  out.push(join(local, 'Programs', 'Netease', 'CloudMusic', 'cloudmusic.exe'))
  return out
}

export function findClient() {
  return clientCandidates().find((p) => existsSync(p)) || null
}

export function isRunning() {
  if (process.platform !== 'win32') return false
  const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq cloudmusic.exe', '/NH'], { encoding: 'utf8', windowsHide: true })
  return String(r.stdout || '').toLowerCase().includes('cloudmusic.exe')
}

function quitClient() {
  if (process.platform !== 'win32') return
  spawnSync('taskkill', ['/IM', 'cloudmusic.exe', '/F'], { windowsHide: true, timeout: 10000 })
}

/**
 * 保证客户端带着调试端口在跑。
 * @returns {{ok:boolean, port:number, relaunched:boolean, message:string}}
 */
export async function ensureClient(port) {
  if (await cdpReady(port)) {
    return { ok: true, port, relaunched: false, message: `控制通道已就绪（127.0.0.1:${port}）` }
  }
  const exe = findClient()
  if (!exe) {
    throw new Error('没找到网易云客户端（cloudmusic.exe）。装了的话，在插件配置里把 clientPath 指过去')
  }
  const wasRunning = isRunning()
  if (wasRunning) {
    quitClient()
    for (let i = 0; i < 30 && isRunning(); i++) await sleep(200)
  }
  log(`启动客户端：${exe}（CDP ${port}${wasRunning ? '，原来是开着的，已重启' : ''}）`)
  spawn(exe, [`--remote-debugging-port=${port}`, '--remote-allow-origins=*'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }).unref()

  for (let i = 0; i < 80; i++) {
    if (await cdpReady(port)) {
      return {
        ok: true,
        port,
        relaunched: wasRunning,
        message: wasRunning ? `已重启网易云并打开控制通道（127.0.0.1:${port}）` : `已启动网易云（127.0.0.1:${port}）`,
      }
    }
    await sleep(250)
  }
  throw new Error(`客户端起来了但没等到调试端口 ${port}（可能被杀软拦了，或者不是官方客户端）`)
}
