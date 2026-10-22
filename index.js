/**
 * dsh-netease-music —— host 半端（DSH 插件本体）
 * ============================================================================
 * 它能干什么：
 *   · 看「正在播放」：歌名 / 歌手 / 专辑 / 封面 / 队列 / 播放模式 / 音量
 *   · 控「正在播放」：播放暂停、上一首下一首、拖进度、音量、播放模式、喜欢
 *   · 管「歌单」：列我的歌单、看歌单里的歌、加歌、删歌、新建歌单
 *   · 点歌：按歌名搜 / 按 songId / 直接放某个歌单
 *
 * 三条通道（都不需要账号密码）：
 *   ① 客户端自己的页面（CEF + CDP）—— 读播放状态、派发它自己的 action 控播放
 *   ② 客户端已登录的 cookie（CDP 的 Network.getCookies）—— 调网页版接口管歌单
 *   ③ 没有调试端口时，用 `cloudmusic.exe --webcmd` 也能做传输控制（兜底）
 *
 * 家里（`$DSH_HOME/netease-music/`）：config.json（端口/路径）、cookie.json（登录态）、
 * netease.log（排查用）。**不写进插件包目录**。
 * ============================================================================
 */
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as api from './lib/api.mjs'
import { ensureClient, findClient, isRunning } from './lib/client.mjs'
import { cdpReady } from './lib/cdp.mjs'
import * as player from './lib/player.mjs'
import { loadConfig, log, paths } from './lib/state.mjs'
import { parameterSchema } from './lib/tool-schema.mjs'

export const name = 'netease-music'
export const inject = ['tools', 'webServer']

/** 插件自己位置（排查时打日志用） */
const here = dirname(fileURLToPath(import.meta.url))

export function apply(ctx) {
  const cfg = () => loadConfig()
  const cdpPort = () => Number(cfg().cdpPort) || 9223

  // host 只吃「无损 JSON」：任何类实例/函数/循环引用都要先洗一遍
  const safe = (v) => {
    if (v === undefined || v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
    try { return JSON.parse(JSON.stringify(v)) } catch { return String(v) }
  }

  const textOutput = {
    schema: { type: 'object', properties: {}, additionalProperties: true },
    render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  }

  /** 统一包一层：工具和独立面板共用同一套执行入口。 */
  const toolDefs = new Map()
  const tool = (spec) => {
    const definition = {
      ...spec,
      parameters: parameterSchema(spec.parameters),
      output: textOutput,
      async execute(args) {
        try {
          return safe(await spec.execute(args || {}))
        } catch (e) {
          log(`工具 ${spec.name} 失败：${e?.message || e}`)
          return safe({ ok: false, error: String(e?.message || e), ...(e?.hint ? { hint: String(e.hint) } : {}) })
        }
      },
    }
    toolDefs.set(spec.name, definition)
    return ctx.tools.register(definition)
  }

  /** 要控制播放/读状态的工具都得先有调试端口 */
  const needPort = async () => {
    const p = cdpPort()
    if (await cdpReady(p)) return p
    throw Object.assign(new Error(`网易云客户端没开调试端口（127.0.0.1:${p} 连不上）`), {
      hint: '调用 netease_launch：会带调试端口重启一次客户端（会打断当前播放，几秒就好）',
    })
  }

  const summarize = (s) => ({
    playing: s.state === player.STATE.PLAYING,
    state: s.state,
    stateLabel: s.state === player.STATE.PLAYING ? '播放中' : s.state === player.STATE.PAUSE ? '已暂停' : '已停止',
    mode: s.mode,
    modeLabel: player.MODE_LABEL[s.mode] || s.mode,
    volume: Math.round((s.volume || 0) * 100) / 100,
    track: s.track,
    queueIndex: s.queue?.index ?? -1,
    queueTotal: s.queue?.total ?? 0,
  })

  /* ── 歌名兜底 ────────────────────────────────────────────────────────────
   * 为什么会缺歌名：用 playing/play 塞进去的歌，客户端队列里一开始只有 id，
   * 详情要它自己异步拉。实测「当前这首」可以被 refreshCurPlaying 补回来，
   * 但队列里没放过的那些还是空的 —— 这时候用网页接口按 id 补一下（带缓存）。
   */
  const metaCache = new Map()
  const rememberTracks = (tracks) => {
    for (const t of tracks || []) {
      metaCache.set(String(t.id), {
        name: t.name || '',
        artists: (t.ar || t.artists || []).map((a) => a.name).filter(Boolean).join(' / '),
        album: t.al?.name || t.album?.name || '',
        cover: t.al?.picUrl || t.album?.picUrl || '',
        durationMs: t.dt || t.duration || 0,
      })
    }
  }
  const enrich = async (s) => {
    if (!s) return s
    const need = []
    if (s.track?.id && !s.track.name) need.push(String(s.track.id))
    for (const it of s.queue?.items || []) if (it.id && !it.name) need.push(String(it.id))
    const missing = [...new Set(need)].filter((id) => !metaCache.has(id)).slice(0, 50)
    if (missing.length) {
      try {
        rememberTracks(await api.rawSongs(missing))
      } catch (e) {
        log(`补歌名失败（不影响播放）：${e?.message || e}`)
      }
    }
    if (s.track?.id && !s.track.name) {
      const m = metaCache.get(String(s.track.id))
      if (m) Object.assign(s.track, m)
    }
    for (const it of s.queue?.items || []) {
      const m = metaCache.get(String(it.id))
      if (m) { it.name = it.name || m.name; it.artists = it.artists || m.artists }
    }
    return s
  }

  const loginBrief = async (forceRefresh = false) => {
    try {
      const { profile, source } = await api.ensureLogin({ port: cdpPort(), forceRefresh })
      return {
        loggedIn: true,
        nickname: profile.nickname,
        uid: profile.userId,
        vipType: profile.vipType,
        source,
      }
    } catch (e) {
      return { loggedIn: false, error: String(e?.message || e), hint: e?.hint }
    }
  }

  /* ───────────────────────────── 状态 · 正在播放 ───────────────────────────── */

  tool({
    name: 'netease_status',
    description: '一眼看清网易云这边的情况：客户端装没装/开没开、能不能控制、登录的是谁、现在在放什么。'
      + '第一次用、或者工具报"没开调试端口"时先看它。',
    parameters: {},
    async execute() {
      const p = cdpPort()
      const ready = await cdpReady(p)
      let playing = null
      let playErr = null
      if (ready) {
        try { playing = summarize(await enrich(await player.snapshot(p))) } catch (e) { playErr = String(e?.message || e) }
      }
      return {
        ok: true,
        client: { path: findClient(), installed: Boolean(findClient()), running: isRunning(), cdp: { ready, port: p } },
        login: await loginBrief(),
        playing,
        playErr,
        home: paths().dir,
        plugin: here,
      }
    },
  })

  tool({
    name: 'netease_now_playing',
    description: '现在在放什么：歌名 / 歌手 / 专辑 / 封面 / 时长 / 播放模式 / 音量 / 播放到第几秒，'
      + '外加整份播放队列。默认返回全部队列；只想要前几首就传 queueLimit。',
    parameters: {
      queueLimit: { type: 'number', description: '队列只返回前几首（不传 = 全部，最多 5000）' },
    },
    async execute(args) {
      const p = await needPort()
      const s = await enrich(await player.snapshot(p))
      const want = Number(args.queueLimit)
      const limit = Number.isFinite(want) && want > 0 ? Math.min(5000, Math.floor(want)) : 5000
      return {
        ok: true,
        ...summarize(s),
        position: s.position,
        positionAt: s.positionAt,
        durationSec: s.positionDuration || Math.round((s.track?.durationMs || 0) / 1000),
        queue: { total: s.queue.total, index: s.queue.index, items: s.queue.items.slice(0, limit) },
      }
    },
  })

  tool({
    name: 'netease_position',
    description: '只读播放进度（秒）—— 轻量版，面板的进度条用它。客户端没开或读不到时 position=null。',
    parameters: {},
    async execute() {
      const p = await needPort()
      const pos = await player.position(p)
      return {
        ok: true,
        position: pos?.position ?? null,
        duration: pos?.duration ?? null,
        at: pos?.at ?? Date.now(),
        playing: pos ? pos.state === player.STATE.PLAYING : null,
        songId: pos?.songId || '',
      }
    },
  })

  tool({
    name: 'netease_lyric',
    description: '取一首歌的歌词（原文 + 翻译，LRC 已解析成 [{time,text,tr}]）。'
      + '不传 songId 就取当前正在播放那首。',
    parameters: {
      songId: { type: 'string', description: '歌曲 id；不传 = 当前播放这首' },
    },
    async execute(args) {
      let id = String(args.songId || '').trim()
      let name = ''
      if (!id) {
        const p = await needPort()
        const s = await enrich(await player.snapshot(p))
        id = String(s.track?.id || '')
        name = s.track?.name || ''
        if (!id) throw new Error('现在没有在放的歌，请传 songId')
      }
      const r = await api.lyric(id)
      return { ok: true, songId: id, name, ...r }
    },
  })

  tool({
    name: 'netease_playback',
    description: '控制正在播放的音乐。action：\n'
      + '· toggle 播放/暂停切换 · play 继续 · pause 暂停\n'
      + '· next 下一首 · prev 上一首\n'
      + '· seek 拖到第几秒（value=秒）\n'
      + '· volume 音量（value=0-100 或 0-1）\n'
      + `· mode 播放模式（value=${Object.keys(player.MODE_LABEL).join(' / ')}）\n`
      + '· like 喜欢当前这首歌\n'
      + '· jump 跳到当前队列第 N 首（value=序号，从 0 开始）\n'
      + '会返回动作前后的状态，看得出真的变了没有。',
    parameters: {
      action: { type: 'string', required: true, description: 'toggle/play/pause/next/prev/seek/volume/mode/like/jump' },
      value: { type: 'number', description: 'seek 的秒数、volume 的音量、jump 的序号；mode 用字符串时请看描述' },
      mode: { type: 'string', description: 'action=mode 时用：playOrder/playCycle/playRandom/playOneCycle/playAi' },
    },
    async execute(args) {
      const p = await needPort()
      const action = String(args.action || '')
      if (action === 'jump') {
        const r = await player.jumpToIndex(p, Number(args.value) || 0)
        await enrich(r.after)
        return { ok: true, action, jumpedTo: r.track, ...summarize(r.after) }
      }
      const value = action === 'mode' ? String(args.mode || args.value || '') : args.value
      const r = await player.control(p, action, value)
      await enrich(r.after)
      return {
        ok: true,
        action,
        value: value ?? null,
        before: summarize(r.before),
        after: summarize(r.after),
      }
    },
  })

  /* ───────────────────────────── 搜歌 · 歌单 ───────────────────────────── */

  tool({
    name: 'netease_search',
    description: '搜网易云：type=song（默认）/ playlist / artist。返回 id、歌名、歌手、专辑、时长。'
      + '拿到 id 就能喂给 netease_play（songId）或 netease_playlist_add（songIds）。',
    parameters: {
      keyword: { type: 'string', required: true, description: '关键词（歌名 / 歌手 / 歌单名）' },
      type: { type: 'string', description: 'song / playlist / artist，默认 song' },
      limit: { type: 'number', description: '几条，默认 10（最多 50）' },
    },
    async execute(args) {
      const keyword = String(args.keyword || '').trim()
      if (!keyword) throw new Error('keyword 不能为空')
      const limit = Math.max(1, Math.min(50, Number(args.limit) || 10))
      return { ok: true, ...(await api.search(keyword, { type: String(args.type || 'song'), limit })) }
    },
  })

  tool({
    name: 'netease_playlists',
    description: '列我的歌单（自己建的 + 收藏的），带 id、名字、歌曲数、是不是自己的。',
    parameters: {
      limit: { type: 'number', description: '最多几个，默认 100' },
    },
    async execute(args) {
      const limit = Math.max(1, Math.min(500, Number(args.limit) || 100))
      return { ok: true, ...(await api.myPlaylists({ limit })) }
    },
  })

  tool({
    name: 'netease_playlist_tracks',
    description: '看某个歌单里有哪些歌（id、歌名、歌手、专辑、时长）。默认把整张歌单都取回来。',
    parameters: {
      playlistId: { type: 'string', required: true, description: '歌单 id（netease_playlists 里那个）' },
      limit: { type: 'number', description: '最多几首，默认全部（上限 5000）' },
    },
    async execute(args) {
      const id = String(args.playlistId || '').trim()
      if (!/^\d+$/.test(id)) throw new Error('playlistId 应该是纯数字')
      const limit = Math.max(1, Math.min(5000, Number(args.limit) || 5000))
      return { ok: true, ...(await api.playlistTracks(id, { limit })) }
    },
  })

  tool({
    name: 'netease_playlist_add',
    description: '往歌单里加歌。两种给法：songIds=[...] 直接指定；或者 query="关键词" 让我先搜再取前 count 首加进去。'
      + '⚠️ 只能加进**自己建的**歌单（收藏来的歌单加不了）。',
    parameters: {
      playlistId: { type: 'string', required: true, description: '目标歌单 id' },
      songIds: { type: 'array', description: '要加的歌 id 列表', items: { type: 'string' } },
      query: { type: 'string', description: '没给 songIds 时：按关键词搜，取前 count 首' },
      count: { type: 'number', description: 'query 模式下取几首，默认 1' },
    },
    async execute(args) {
      const pid = String(args.playlistId || '').trim()
      if (!/^\d+$/.test(pid)) throw new Error('playlistId 应该是纯数字')
      let ids = Array.isArray(args.songIds) ? args.songIds.map(String).filter((x) => /^\d+$/.test(x)) : []
      if (!ids.length && args.query) {
        const count = Math.max(1, Math.min(20, Number(args.count) || 1))
        const found = await api.search(String(args.query), { type: 'song', limit: count })
        ids = found.items.map((t) => t.id)
      }
      if (!ids.length) throw new Error('没给 songIds，也没搜到歌')
      const r = await api.playlistAdd(pid, ids)
      return { ...r, songIds: ids }
    },
  })

  tool({
    name: 'netease_playlist_remove',
    description: '从歌单里删歌（只对自己建的歌单有效）。',
    parameters: {
      playlistId: { type: 'string', required: true, description: '歌单 id' },
      songIds: { type: 'array', required: true, description: '要删的歌 id 列表', items: { type: 'string' } },
    },
    async execute(args) {
      const pid = String(args.playlistId || '').trim()
      const ids = Array.isArray(args.songIds) ? args.songIds.map(String).filter((x) => /^\d+$/.test(x)) : []
      if (!/^\d+$/.test(pid)) throw new Error('playlistId 应该是纯数字')
      if (!ids.length) throw new Error('songIds 不能为空')
      return api.playlistRemove(pid, ids)
    },
  })

  tool({
    name: 'netease_playlist_create',
    description: '新建一个歌单。',
    parameters: {
      name: { type: 'string', required: true, description: '歌单名' },
    },
    async execute(args) {
      const name = String(args.name || '').trim()
      if (!name) throw new Error('歌单名不能为空')
      return api.playlistCreate(name)
    },
  })

  /* ───────────────────────────── 点播 · 启动 ───────────────────────────── */

  tool({
    name: 'netease_play',
    description: '让客户端开始放：\n'
      + '· playlistId → 放这个歌单（默认整张，最多 5000 首；传 count 只放前几首）\n'
      + '· songId → 放这一首\n'
      + '· query=歌名 → 搜第一首来放（count>1 就放前几首）\n'
      + '三种给一种就行。',
    parameters: {
      playlistId: { type: 'string', description: '歌单 id' },
      songId: { type: 'string', description: '歌曲 id' },
      query: { type: 'string', description: '按歌名/歌手搜来放' },
      count: { type: 'number', description: '放几首（playlistId 时不传 = 整张；query 时默认 30）' },
    },
    async execute(args) {
      const p = await needPort()
      const asked = Number(args.count)
      const count = Math.max(1, Math.min(5000, Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : (args.playlistId ? 5000 : 30)))
      let tracks = []
      let from = { scene: 'search', text: 'DSH 点播', href: '' }
      let label = ''

      if (args.playlistId) {
        const pl = await api.playlistRawTracks(String(args.playlistId), { limit: count })
        tracks = pl.tracks
        label = `歌单「${pl.name}」`
        from = { scene: 'playlist', text: pl.name, href: `/playlist/${pl.id}` }
      } else if (args.songId) {
        tracks = await api.rawSongs([String(args.songId)])
        label = `歌曲 ${args.songId}`
        from = { scene: 'song', text: 'DSH 点播', href: `/song/${args.songId}` }
      } else if (args.query) {
        const found = await api.search(String(args.query), { type: 'song', limit: count })
        if (!found.items.length) throw new Error(`没搜到「${args.query}」`)
        tracks = await api.rawSongs(found.items.map((t) => t.id))
        label = `搜「${args.query}」的前 ${tracks.length} 首`
        from = { scene: 'search', text: String(args.query), href: '' }
      } else {
        throw new Error('playlistId / songId / query 至少给一个')
      }

      if (!tracks.length) throw new Error('没拿到可播的歌（歌单可能全是无版权/本地歌）')
      rememberTracks(tracks)
      const n = await player.playTracks(p, tracks, from)
      const after = await enrich(await player.snapshot(p))
      return {
        ok: true,
        requested: label,
        queued: n,
        ...summarize(after),
        note: String(after.track.id) === String(tracks[0].id) ? '已经在放第一首了' : '指令已发出，但当前曲目还对上（可能还在加载/无版权）',
      }
    },
  })

  tool({
    name: 'netease_launch',
    description: '带调试端口启动/重启网易云客户端——插件要靠它读播放状态、控播放。'
      + '⚠️ 会先关掉现在开着的客户端（播放会停），然后重新拉起来；几秒就好。',
    parameters: {},
    async execute() {
      const p = cdpPort()
      const r = await ensureClient(p)
      log(r.message)
      return { ok: true, ...r, login: await loginBrief() }
    },
  })

  tool({
    name: 'netease_login',
    description: '看/刷新登录态。登录本来就在客户端里做（扫码/手机号），插件只是把客户端的 cookie 拿过来用。'
      + 'refresh=true 会强制重新从客户端读一次。',
    parameters: {
      refresh: { type: 'boolean', description: '强制刷新（cookie 过期时用）' },
    },
    async execute(args) {
      return { ok: true, ...(await loginBrief(Boolean(args.refresh))) }
    },
  })

  // 独立前端面板使用同一套工具执行器，路由只做 HTTP/JSON 桥接，不暴露 cookie。
  const webServer = typeof ctx.get === 'function' ? ctx.get('webServer') : ctx.webServer
  if (webServer?.register) {
    const readBody = async (req) => {
      let text = ''
      for await (const chunk of req) text += chunk
      if (text.length > 512 * 1024) throw new Error('请求体过大')
      try { return text ? JSON.parse(text) : {} } catch { throw new Error('请求不是有效 JSON') }
    }
    const sendJson = (res, status, value) => {
      const body = JSON.stringify(safe(value))
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(body)
    }
    const csrf = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    const route = async (req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
      if (req.method === 'GET' && url.pathname === '/api/netease-music/bootstrap') {
        try {
          const status = await toolDefs.get('netease_status').execute({})
          return sendJson(res, 200, { ok: true, status, csrfToken: csrf })
        } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
      }
      if (req.method === 'POST' && url.pathname === '/api/netease-music/action') {
        if (req.headers?.['x-netease-csrf'] !== csrf) return sendJson(res, 403, { ok: false, error: '面板请求校验失败，请刷新页面' })
        try {
          const body = await readBody(req)
          const name = String(body.tool || '')
          const def = toolDefs.get(name)
          if (!def) return sendJson(res, 400, { ok: false, error: `未知工具：${name}` })
          return sendJson(res, 200, await def.execute(body.args && typeof body.args === 'object' ? body.args : {}))
        } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
      }
      res.statusCode = 404; res.end('Not Found')
    }
    try {
      ctx.effect(() => webServer.register({ kind: 'prefix', path: '/api/netease-music', handler: route }), 'netease-music: web panel API')
    } catch (e) { log(`HTTP 面板路由没挂上：${e?.message || e}`) }
  } else log('webServer 服务不可用，独立面板 API 未挂载')

  log(`netease-music 已加载（${here}，端口 ${cdpPort()}）`)
}
