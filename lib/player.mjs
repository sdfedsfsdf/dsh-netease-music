/**
 * lib/player.mjs —— 读播放状态、控制播放（全部走客户端自己的页面 JS）
 * ============================================================================
 * 原理（2026-10-20 在本机 3.1.41 上实测）：
 *   网易云客户端的界面是个 webpack 打包的 React + dva 应用，播放状态在一个 dva 的
 *   store 里。只要拿到 `__webpack_require__`，就能找到那个模块：
 *       mod.a.getStore()     → 整个 state 树（playing / playingList / ...）
 *       mod.a.getDispatch()  → dispatch（派发它自己的 action 就能控制播放）
 *   拿 require 的办法：往 `webpackJsonp` 里塞一个假 chunk，webpack 会把 require 交给我们。
 *
 * 已实测可用的 action：
 *   playing/switchResumeOrPause  {triggerScene}          播放/暂停切换
 *   playing/pause                {}                      暂停
 *   playing/resume               {triggerScene}          继续
 *   playingList/jump2Track       {flag:±1,type:'call'}   上一首 / 下一首
 *   playing/setPlayingPosition   {duration: 秒}          拖进度
 *   playing/setVolume            {volume: 0..1}          音量
 *   playing/switchPlayingMode    {playingMode: 'playRandom'...} 播放模式
 *   playing/play                 {tracks, from, options} 换成一首/一组歌来播
 *   playing/playOneTrackInPlayingList {item,switchType,flag} 播队列里的某一首
 * ============================================================================
 */
import { evaluate } from './cdp.mjs'

/** 播放状态枚举（客户端自己的定义：Stop=0 / Pause=1 / Playing=2） */
export const STATE = { STOP: 0, PAUSE: 1, PLAYING: 2 }

export const MODE_LABEL = {
  playOrder: '顺序播放',
  playCycle: '列表循环',
  playRandom: '随机播放',
  playOneCycle: '单曲循环',
  playAi: '心动模式',
}

/** 在页面里第一次注入这段，之后就都能直接用了 */
const BOOTSTRAP = `
(() => {
  const g = (window.__dshNM = window.__dshNM || {});
  if (!g.req) {
    if (typeof webpackJsonp === 'undefined') return { ok: false, reason: 'webpack-unavailable' };
    const id = 'dshnm-' + Date.now();
    try {
      webpackJsonp.push([[id], { [id]: function (m, e, r) { g.req = r } }, [[id]]]);
    } catch (e) { return { ok: false, reason: 'push-failed:' + (e && e.message) } }
  }
  if (!g.req) return { ok: false, reason: 'require-missing' };
  if (g.storeId == null) {
    for (let i = 0; i < 900; i++) {
      let mod;
      try { mod = g.req(i) } catch (e) { continue }
      if (mod && mod.a && typeof mod.a.getStore === 'function' && typeof mod.a.getDispatch === 'function') {
        g.storeId = i;
        g.app = mod.a;
        break;
      }
    }
  }
  if (g.storeId == null) return { ok: false, reason: 'store-not-found' };
  g.app = g.req(g.storeId).a;

  /* 播放位置：客户端 store 里没有实时进度（playingLyricLineNumber 也不跟手），
   * 但底部播放条那行 "01:50 / 02:20" 是实时刷新的 DOM 文本 —— 直接读它。
   * 找到一次就缓存节点，之后只读 textContent；节点被换掉时自动重新找。 */
  // ⚠️ 这段是模板字符串：正则里的反斜杠要写两遍，否则 \/ 会在页面里提前闭合正则
  const POS_RE = /^(\\d{1,2}):(\\d{2}) \\/ (\\d{1,2}):(\\d{2})$/;
  g.readPosition = () => {
    const cached = g.posEl;
    if (cached && document.contains(cached) && POS_RE.test((cached.textContent || '').trim())) {
      const m = POS_RE.exec((cached.textContent || '').trim());
      return { position: (+m[1]) * 60 + (+m[2]), duration: (+m[3]) * 60 + (+m[4]) };
    }
    let best = null;
    const nodes = document.querySelectorAll('div,span');
    for (const el of nodes) {
      if (el.children.length > 3) continue;
      const t = (el.textContent || '').trim();
      if (t.length > 24 || !POS_RE.test(t)) continue;
      const top = el.getBoundingClientRect().top;
      if (!best || top > best.top) best = { el, top };
    }
    g.posEl = best ? best.el : null;
    if (!g.posEl) return null;
    const m = POS_RE.exec((g.posEl.textContent || '').trim());
    return { position: (+m[1]) * 60 + (+m[2]), duration: (+m[3]) * 60 + (+m[4]) };
  };

  g.snap = () => {
    const s = g.app.getStore();
    const p = s.playing || {};
    const cur = p.curPlaying || {};
    // 正常播放时 cur.track 就是歌；用 playing/play 塞进去的队列可能多包一层（资源壳）
    const pick = (x) => {
      let t = (x && (x.track || x)) || {};
      if (t && t.track && !t.name) t = t.track;
      return t || {};
    };
    const t = pick(cur);
    const list = (s.playingList && s.playingList.curPlayingList) || [];
    const artists = (t.artists || t.ar || []).map(a => a.name).filter(Boolean).join(' / ');
    const album = (t.album && t.album.name) || (t.al && t.al.name) || '';
    const cover = (t.album && t.album.picUrl) || (t.al && t.al.picUrl) || p.resourceCoverUrl || '';
    const idx = list.findIndex(x => String(x.resourceId) === String(cur.resourceId));
    const pos = g.readPosition();
    return {
      state: p.playingState,
      mode: p.playingMode,
      volume: p.playingVolume,
      // position 是「读的那一刻」的秒数，配合 positionAt 让前端自己插值，进度条才不会一顿一顿
      position: pos ? pos.position : null,
      positionDuration: pos ? pos.duration : null,
      positionAt: Date.now(),
      track: {
        id: String(cur.resourceId || p.resourceTrackId || ''),
        name: t.name || p.resourceName || '',
        artists,
        album,
        cover,
        durationMs: t.duration || t.dt || Math.round((p.resourceDuration || 0) * 1000),
        fee: t.fee,
        mvid: t.mvid || '',
      },
      queue: {
        total: list.length,
        index: idx,
        // 整份队列都带上：面板要能翻到第 464 首，不是只看前 40
        items: list.map((x, i) => {
          const it = pick(x);
          return {
            index: i,
            id: String(x.resourceId || ''),
            name: it.name || '',
            artists: ((it.artists || it.ar) || []).map(a => a.name).filter(Boolean).join(' / '),
          };
        }),
      },
    };
  };
  g.dispatch = (action) => { g.app.getDispatch()(action); return true };
  /** 单独取播放位置（不想每次都传整份队列时用） */
  g.position = () => {
    const p = g.readPosition();
    const st = g.app.getStore().playing || {};
    return { position: p ? p.position : null, duration: p ? p.duration : null, at: Date.now(), state: st.playingState,
      songId: String((st.curPlaying || {}).resourceId || st.resourceTrackId || '') };
  };
  // 客户端内部用的是它自己的歌曲模型（artists / album / duration），
  // 而网页接口给的是 ar / al / dt —— 不转一层，队列里就会变成"只有 id 的空壳"
  g.toClientTrack = (t) => {
    const ar = t.artists || t.ar || [];
    const al = t.album || t.al || {};
    return Object.assign({}, t, {
      artists: ar,
      album: al,
      duration: t.duration || t.dt || 0,
    });
  };
  g.buildItem = (t, i, from) => ({
    id: String(t.id), trackId: String(t.id), resourceId: String(t.id),
    resourceType: 'track', track: g.toClientTrack(t), localTrack: {}, fromInfo: {},
    scene: (from && from.scene) || 'search', href: (from && from.href) || '',
    text: (from && from.text) || '', displayOrder: i, randomOrder: 0,
    isPlayedOnce: false, ai: '', aiRcmd: false, referInfo: {},
  });
  g.playTracks = (tracks, from) => {
    const list = tracks.map((t, i) => g.buildItem(t, i, from));
    g.app.getDispatch()({
      type: 'playing/play',
      payload: {
        tracks: list,
        from: { text: (from && from.text) || '', href: (from && from.href) || '', resourceType: 'track', scene: (from && from.scene) || 'search', fromInfo: {} },
        options: { play: true, clear: true, fromDoubleClick: false, isForceSetPlaying: true },
      },
    });
    return list.length;
  };
  return { ok: true, storeId: g.storeId };
})()
`

/** 确保页面侧已经注入好，返回 storeId */
export async function ensureSession(port) {
  const r = await evaluate(BOOTSTRAP, { port })
  if (!r || !r.ok) {
    throw new Error(`注入客户端运行时失败：${r?.reason || 'unknown'}（网易云版本可能变了）`)
  }
  return r.storeId
}

/** 读一次完整状态 */
export async function snapshot(port) {
  await ensureSession(port)
  return evaluate('window.__dshNM.snap()', { port })
}

/** 只读播放位置（秒）—— 进度条用，比整份 snapshot 便宜 */
export async function position(port) {
  await ensureSession(port)
  return evaluate('window.__dshNM.position()', { port })
}

/** 派发一个客户端 action */
export async function dispatch(port, action) {
  await ensureSession(port)
  return evaluate(`window.__dshNM.dispatch(${JSON.stringify(action)})`, { port })
}

/** 播放一组歌（tracks 用网易云 API 的 song 对象） */
export async function playTracks(port, tracks, from = {}) {
  await ensureSession(port)
  const n = await evaluate(
    `window.__dshNM.playTracks(${JSON.stringify(tracks)}, ${JSON.stringify(from)})`,
    { port },
  )
  await wait(700)
  await refreshCurrent(port)
  await wait(600)
  return n
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 让客户端把"当前这首"的详情补回来。
 * 起因（2026-10-20 实测）：用 playing/play 塞进去的歌，队列项里只有 id，
 * 客户端要等它自己去拉详情才有歌名；派发 `playingList/refreshCurPlaying` 就是让
 * 它立刻拉一次，不然工具回来的会是「正在播放：（空白）」。
 */
export async function refreshCurrent(port) {
  await ensureSession(port)
  await evaluate("window.__dshNM.dispatch({ type: 'playingList/refreshCurPlaying' }); true", { port })
}

/**
 * 传输控制。返回 {ok, action, before, after}
 * 刻意在动作后读一次状态：让调用方/模型能立刻看到「真的变了没有」，
 * 而不是只收到一个"已发送"。
 */
export async function control(port, action, value) {
  const before = await snapshot(port)
  const scene = 'orpheusMessage'
  switch (action) {
    case 'toggle':
      await dispatch(port, { type: 'playing/switchResumeOrPause', payload: { triggerScene: scene } })
      break
    case 'play':
      await dispatch(port, { type: 'playing/resume', payload: { triggerScene: scene } })
      break
    case 'pause':
      await dispatch(port, { type: 'playing/pause', payload: {} })
      break
    case 'next':
      await dispatch(port, { type: 'playingList/jump2Track', payload: { flag: 1, type: 'call', triggerScene: scene } })
      break
    case 'prev':
      await dispatch(port, { type: 'playingList/jump2Track', payload: { flag: -1, type: 'call', triggerScene: scene } })
      break
    case 'seek': {
      const target = Math.max(0, Number(value) || 0)
      await dispatch(port, { type: 'playing/setPlayingPosition', payload: { duration: target } })
      break
    }
    case 'volume': {
      let v = Number(value)
      if (!Number.isFinite(v)) throw new Error('volume 需要一个 0-100 的数字')
      if (v > 1) v = v / 100
      v = Math.min(1, Math.max(0, v))
      await dispatch(port, { type: 'playing/setVolume', payload: { volume: v } })
      break
    }
    case 'mode': {
      const mode = String(value || '')
      if (!MODE_LABEL[mode]) throw new Error(`不认识的播放模式：${mode}（可用：${Object.keys(MODE_LABEL).join(' / ')}）`)
      await dispatch(port, { type: 'playing/switchPlayingMode', payload: { playingMode: mode, triggerScene: scene, HeartBeatFlage: false } })
      break
    }
    case 'like':
      await dispatch(port, { type: 'async:hostResource/setLikeCurPlayingTrack', payload: {} })
      break
    default:
      throw new Error(`不认识的控制动作：${action}`)
  }
  await wait(350)
  if (['toggle', 'play', 'next', 'prev'].includes(action)) {
    await refreshCurrent(port)
    await wait(600)
  }
  const after = await snapshot(port)
  return { ok: true, action, value: value ?? null, before, after }
}

/** 跳到队列里的第 index 首（0 起） */
export async function jumpToIndex(port, index) {
  await ensureSession(port)
  const snap = await snapshot(port)
  if (!Number.isInteger(index) || index < 0 || index >= snap.queue.total) throw new Error(`队列里没有第 ${index + 1} 首（队列共 ${snap.queue.total} 首）`)
  const target = snap.queue.items.find((x) => x.index === index) || { index, id: '', name: '', artists: '' }
  const ok = await evaluate(
    `(() => {
      const g = window.__dshNM;
      const s = g.app.getStore();
      const list = (s.playingList && s.playingList.curPlayingList) || [];
      const item = list[${index}];
      if (!item) return false;
      g.dispatch({ type: 'playing/playOneTrackInPlayingList', payload: { item, switchType: 'call', flag: 0, triggerScene: 'playingList' } });
      return true;
    })()`,
    { port },
  )
  if (!ok) throw new Error('跳转失败：队列里没有这一首')
  await wait(400)
  await refreshCurrent(port)
  await wait(600)
  return { ok: true, index, track: target, after: await snapshot(port) }
}
