/**
 * lib/api.mjs —— 网易云那些"账号侧"的事：登录态、搜歌、歌单增删改
 * ============================================================================
 * 登录态从哪儿来：客户端已经登录好了，我们用 CDP 的 `Network.getCookies` 把
 * `MUSIC_U` 摘出来（CDP 会自己解密，不用碰 DPAPI），存一份到插件家目录，
 * 之后就算客户端没开调试端口也能继续用（MUSIC_U 一般能用很久）。
 * ============================================================================
 */
import { getCookies } from './cdp.mjs'
import { request } from './weapi.mjs'
import { cookieHeader, log, readCookie, writeCookie } from './state.mjs'

export class LoginError extends Error {
  constructor(message, hint) {
    super(message)
    this.code = 'NOT_LOGGED_IN'
    this.hint = hint
  }
}

let cached = { jar: null, profile: null, at: 0 }

function csrfOf(jar) {
  return jar?.__csrf || ''
}

export async function account(jar) {
  const r = await request('/weapi/w/nuser/account/get', { csrf_token: csrfOf(jar) }, cookieHeader(jar))
  return r
}

/**
 * 拿到一个可用的登录态：
 *   ① 内存缓存 → ② 磁盘缓存（校验一次） → ③ 现场从客户端 CDP 抓 → 校验
 * 失败时抛 LoginError，带一句能照着做的话。
 */
export async function ensureLogin({ port, forceRefresh = false } = {}) {
  if (!forceRefresh && cached.jar && Date.now() - cached.at < 10 * 60 * 1000) {
    return { jar: cached.jar, profile: cached.profile, source: 'memory' }
  }
  const stored = readCookie()
  if (!forceRefresh && stored?.MUSIC_U) {
    const r = await account(stored)
    if (r?.code === 200 && r.profile) {
      cached = { jar: stored, profile: r.profile, at: Date.now() }
      return { jar: stored, profile: r.profile, source: 'cache' }
    }
  }
  if (forceRefresh || !stored?.MUSIC_U) {
    let jar = null
    try {
      jar = await getCookies(port)
    } catch (e) {
      throw new LoginError(
        `还没有可用的登录态，而且连不上客户端拿 cookie（${e.message}）`,
        '先点/调用 netease_launch 让客户端带着调试端口启动，或者先在网易云客户端里登录一下',
      )
    }
    if (!jar?.MUSIC_U) {
      throw new LoginError(
        '客户端里没读到 MUSIC_U —— 说明网易云客户端还没登录',
        '打开网易云客户端扫码/手机号登录一次，再试',
      )
    }
    writeCookie(jar)
    const r = await account(jar)
    if (r?.code !== 200 || !r.profile) {
      throw new LoginError('cookie 读到了，但账号接口没认（可能已过期）', '在客户端里重新登录一次，然后重试')
    }
    cached = { jar, profile: r.profile, at: Date.now() }
    log(`登录态已刷新：${r.profile.nickname}（uid=${r.profile.userId}）`)
    return { jar, profile: r.profile, source: 'client' }
  }
  throw new LoginError('登录态失效了', '在客户端里重新登录一次，或者调用 netease_login 刷新')
}

const pickTrack = (t) => ({
  id: String(t.id),
  name: t.name || '',
  artists: (t.ar || t.artists || []).map((a) => a.name).join(' / '),
  album: t.al?.name || t.album?.name || '',
  durationMs: t.dt || t.duration || 0,
  fee: t.fee,
})

/** 搜歌 / 搜歌单 / 搜歌手 */
export async function search(keyword, { type = 'song', limit = 10 } = {}) {
  const { jar } = await ensureLogin()
  const typeCode = { song: 1, album: 10, artist: 100, playlist: 1000 }[type] ?? 1
  const r = await request(
    '/weapi/cloudsearch/pc',
    { s: keyword, type: typeCode, limit, offset: 0, total: true, csrf_token: csrfOf(jar) },
    cookieHeader(jar),
  )
  if (r.code !== 200) throw new Error(`搜索失败：${r.message || r.code}`)
  const result = r.result || {}
  if (type === 'playlist') {
    return {
      type,
      total: result.playlistCount,
      items: (result.playlists || []).map((p) => ({
        id: String(p.id),
        name: p.name,
        tracks: p.trackCount,
        creator: p.creator?.nickname || '',
        plays: p.playCount,
      })),
    }
  }
  if (type === 'artist') {
    return {
      type,
      total: result.artistCount,
      items: (result.artists || []).map((a) => ({ id: String(a.id), name: a.name, albums: a.albumSize, fans: a.fansCount })),
    }
  }
  return {
    type,
    total: result.songCount,
    items: (result.songs || []).map(pickTrack),
  }
}

/** 我的歌单（创建的在前，收藏的在后） */
export async function myPlaylists({ limit = 100 } = {}) {
  const { jar, profile } = await ensureLogin()
  const r = await request('/weapi/user/playlist', { uid: profile.userId, offset: 0, limit, includeVideo: true }, cookieHeader(jar))
  if (r.code !== 200) throw new Error(`取歌单失败：${r.message || r.code}`)
  return {
    uid: profile.userId,
    nickname: profile.nickname,
    items: (r.playlist || []).map((p) => ({
      id: String(p.id),
      name: p.name,
      tracks: p.trackCount,
      creator: p.creator?.nickname || '',
      mine: String(p.userId) === String(profile.userId),
      subscribed: Boolean(p.subscribed),
      cover: p.coverImgUrl || '',
    })),
  }
}

/** 歌单里的歌。默认把所有歌都取回来（大歌单分批补） */
export async function playlistTracks(playlistId, { limit = 5000 } = {}) {
  const { jar } = await ensureLogin()
  const r = await request('/weapi/v6/playlist/detail', { id: Number(playlistId), n: 1000, s: 8 }, cookieHeader(jar))
  if (r.code !== 200 || !r.playlist) throw new Error(`取歌单详情失败：${r.message || r.code}`)
  const pl = r.playlist
  const ids = (pl.trackIds || []).map((x) => x.id)
  let tracks = (pl.tracks || []).map(pickTrack)
  // 大歌单：接口只给前 1000 首，剩下的按 id 批量补
  if (ids.length > tracks.length) {
    const known = new Set(tracks.map((t) => t.id))
    const missing = ids.filter((id) => !known.has(String(id)))
    for (let i = 0; i < missing.length && tracks.length < limit; i += 500) {
      const chunk = missing.slice(i, i + 500)
      const c = JSON.stringify(chunk.map((id) => ({ id })))
      const d = await request('/weapi/v3/song/detail', { c, csrf_token: csrfOf(jar) }, cookieHeader(jar))
      for (const s of d.songs || []) known.add(String(s.id)), tracks.push(pickTrack(s))
    }
  }
  return {
    id: String(pl.id),
    name: pl.name,
    creator: pl.creator?.nickname || '',
    tracks: tracks.slice(0, limit),
    total: ids.length || tracks.length,
  }
}

/** 往歌单里加歌（自己建的才加得进去） */
export async function playlistAdd(playlistId, trackIds) {
  const { jar } = await ensureLogin()
  const r = await request(
    '/weapi/playlist/manipulate/tracks',
    {
      op: 'add',
      pid: String(playlistId),
      trackIds: JSON.stringify(trackIds.map(String)),
      imme: 'true',
      csrf_token: csrfOf(jar),
    },
    cookieHeader(jar),
  )
  if (r.code !== 200) throw new Error(`加歌失败：${r.message || r.code}${r.code === 502 ? '（可能没有权限：收藏的歌单不能加）' : ''}`)
  return { ok: true, code: r.code, playlistId: String(playlistId), added: trackIds.length, trackCount: r.playlist?.trackCount }
}

export async function playlistRemove(playlistId, trackIds) {
  const { jar } = await ensureLogin()
  const r = await request(
    '/weapi/playlist/manipulate/tracks',
    {
      op: 'del',
      pid: String(playlistId),
      trackIds: JSON.stringify(trackIds.map(String)),
      csrf_token: csrfOf(jar),
    },
    cookieHeader(jar),
  )
  if (r.code !== 200) throw new Error(`删歌失败：${r.message || r.code}`)
  return { ok: true, code: r.code, playlistId: String(playlistId), removed: trackIds.length, trackCount: r.playlist?.trackCount }
}

export async function playlistCreate(name) {
  const { jar } = await ensureLogin()
  const r = await request('/weapi/playlist/create', { name, privacy: '0', csrf_token: csrfOf(jar) }, cookieHeader(jar))
  if (r.code !== 200 || !r.id) throw new Error(`建歌单失败：${r.message || r.code}`)
  return { ok: true, id: String(r.id), name }
}

/** 喜欢/取消喜欢一首歌 */
export async function likeTrack(trackId, like = true) {
  const { jar } = await ensureLogin()
  const r = await request(
    '/weapi/radio/like',
    { alg: 'itembased', trackId: String(trackId), like: String(like), time: '3', csrf_token: csrfOf(jar) },
    cookieHeader(jar),
  )
  if (r.code !== 200) throw new Error(`喜欢失败：${r.message || r.code}`)
  return { ok: true, like, code: r.code }
}

/** 删歌单（内部用：自测清场；工具里没暴露，避免误删） */
export async function playlistDelete(playlistIds) {
  const { jar } = await ensureLogin()
  const ids = (Array.isArray(playlistIds) ? playlistIds : [playlistIds]).map(String)
  const r = await request('/weapi/playlist/remove', { ids: JSON.stringify(ids), csrf_token: csrfOf(jar) }, cookieHeader(jar))
  if (r.code !== 200) throw new Error(`删歌单失败：${r.message || r.code}`)
  return { ok: true, code: r.code, deleted: ids }
}

/** 拿原始 song 对象（客户端播放用的就是这种结构，字段别裁） */
export async function rawSongs(ids) {  const { jar } = await ensureLogin()
  const c = JSON.stringify(ids.map((id) => ({ id: String(id) })))
  const r = await request('/weapi/v3/song/detail', { c, csrf_token: csrfOf(jar) }, cookieHeader(jar))
  if (r.code !== 200) throw new Error(`取歌曲详情失败：${r.message || r.code}`)
  return r.songs || []
}

/** 歌单里原始的歌（给"播放这个歌单"用） */
export async function playlistRawTracks(playlistId, { limit = 5000 } = {}) {
  const { jar } = await ensureLogin()
  const r = await request('/weapi/v6/playlist/detail', { id: Number(playlistId), n: 1000, s: 8 }, cookieHeader(jar))
  if (r.code !== 200 || !r.playlist) throw new Error(`取歌单详情失败：${r.message || r.code}`)
  const pl = r.playlist
  let songs = (pl.tracks || []).slice(0, limit)
  const ids = (pl.trackIds || []).map((x) => x.id)
  if (!songs.length && ids.length) songs = await rawSongs(ids.slice(0, limit))
  if (songs.length < Math.min(limit, ids.length)) {
    const have = new Set(songs.map((s) => String(s.id)))
    const missing = ids.filter((id) => !have.has(String(id))).slice(0, limit - songs.length)
    if (missing.length) songs = [...songs, ...(await rawSongs(missing))]
  }
  return { id: String(pl.id), name: pl.name, total: ids.length || songs.length, tracks: songs.slice(0, limit) }
}

/* ───────────────────────────── 歌词 ───────────────────────────── */

/** LRC → [{ time(ms), text }]；`[mm:ss.xx]` 与 `[mm:ss:xx]` 两种写法都认 */
export function parseLrc(text) {
  const source = String(text || '').replace(/^\uFEFF/, '')
  const offset = Number(/\[offset:\s*([+-]?\d+)\]/i.exec(source)?.[1] || 0)
  const out = []
  for (const raw of source.split(/\r?\n|\r/)) {
    const tags = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!tags.length) continue
    const text2 = raw.replace(/\[[^\]]*\]/g, '').trim()
    if (!text2) continue
    for (const m of tags) {
      const frac = m[3] ? Number((m[3] + '00').slice(0, 3)) : 0
      out.push({ time: Math.max(0, (+m[1]) * 60000 + (+m[2]) * 1000 + frac + offset), text: text2 })
    }
  }
  out.sort((a, b) => a.time - b.time)
  return out
}

/**
 * 一首歌的歌词（原文 + 可选翻译）。
 * 走的是网页版 `/weapi/song/lyric`，用的是从客户端抓来的登录态，不需要额外授权。
 */
export async function lyric(songId) {
  const { jar } = await ensureLogin()
  const r = await request(
    '/weapi/song/lyric',
    { id: Number(songId), lv: -1, kv: -1, tv: -1, csrf_token: csrfOf(jar) },
    cookieHeader(jar),
  )
  if (r.code !== 200) throw new Error(`取歌词失败：${r.message || r.code}`)
  const lines = parseLrc(r.lrc?.lyric)
  const translated = new Map(parseLrc(r.tlyric?.lyric).map((x) => [x.time, x.text]))
  return {
    id: String(songId),
    lines: lines.map((x) => ({ ...x, tr: translated.get(x.time) || '' })),
    hasTranslation: translated.size > 0,
    // 纯音乐/还没上架歌词时会返回空数组
    empty: lines.length === 0,
  }
}
