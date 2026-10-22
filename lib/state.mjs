/**
 * lib/state.mjs —— 插件自己的"家"：配置、cookie 缓存、日志
 * ============================================================================
 * 全部放 `$DSH_HOME/netease-music/`（默认 `~/.dsh/netease-music/`），
 * **不写进插件包目录**，这样升级/重装插件不会把登录态冲掉。
 * ============================================================================
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_CONFIG = {
  /** 客户端调试端口（用 netease_launch 启动时会被带上） */
  cdpPort: 9223,
  /** 客户端可执行文件；留空自动找常见安装位置 */
  clientPath: '',
  /** 工具发现客户端没开调试端口时，是否自动带端口重启一次 */
  autoLaunch: false,
}

export function home() {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  const dir = join(dshHome, 'netease-music')
  mkdirSync(dir, { recursive: true })
  return dir
}

export const paths = () => {
  const dir = home()
  return {
    dir,
    config: join(dir, 'config.json'),
    cookie: join(dir, 'cookie.json'),
    log: join(dir, 'netease.log'),
  }
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeJson(file, value) {
  writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
}

export function loadConfig() {
  const saved = readJson(paths().config, {})
  const out = { ...DEFAULT_CONFIG }
  for (const k of Object.keys(DEFAULT_CONFIG)) {
    if (saved[k] !== undefined && typeof saved[k] === typeof DEFAULT_CONFIG[k]) out[k] = saved[k]
  }
  return out
}

export function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch }
  writeJson(paths().config, next)
  return next
}

export function log(msg) {
  const line = `${new Date().toISOString()}  ${msg}`
  try { appendFileSync(paths().log, `${line}\n`, 'utf8') } catch { /* 日志写不进去不致命 */ }
  return line
}

/** 登录 cookie（只留必要的那几个；权限尽量收紧） */
export function readCookie() {
  const jar = readJson(paths().cookie, null)
  return jar && typeof jar === 'object' ? jar : null
}

export function writeCookie(jar) {
  const keep = ['MUSIC_U', '__csrf', 'MUSIC_A_T', 'MUSIC_R_T', 'MUSIC_R_U', 'NMTID']
  const slim = {}
  for (const k of keep) if (jar[k]) slim[k] = jar[k]
  const file = paths().cookie
  writeFileSync(file, JSON.stringify(slim, null, 2), { encoding: 'utf8', mode: 0o600 })
  return slim
}

export const cookieHeader = (jar) =>
  Object.entries(jar || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')

export function fileExists(p) {
  try { return existsSync(p) } catch { return false }
}
