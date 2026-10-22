/**
 * 客户端半端（client.js）自测：在最小化的 __ModuleLoader__ / React / slots 假环境里
 * 真跑一遍 factory + apply，确认真能注册出「侧栏入口 + 主面板」两个席位。
 *   node test/client-smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const registrations = []
const injections = []
const effects = []
let loaded = null

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  Fragment: 'Fragment',
}

const slots = {
  inject: (name, fn) => { injections.push(name); fn() },
  register: (spec, component) => { registrations.push({ spec, component }); return () => {} },
}

const sandbox = {
  window: {
    __ModuleLoader__: {
      load: (mod) => { loaded = mod },
    },
  },
  document: {
    head: { appendChild: () => {} },
    createElement: () => ({ setAttribute() {}, remove() {}, style: {} }),
    getElementById: () => null,
  },
  fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  console,
}

runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), sandbox)

assert.ok(loaded, 'client.js 应当注册到 __ModuleLoader__')
assert.equal(loaded.id, 'dsh-netease-music')

const mod = loaded.factory((name) => {
  assert.equal(name, 'react', '只应 require react')
  return fakeReact
})
assert.deepEqual([...mod.inject], ['slots'])

mod.apply({
  get: () => slots,
  effect: (fn) => { effects.push(fn()); return () => {} },
})

const byName = (name) => registrations.find((r) => r.spec.name === name)
const panel = byName('sidebar.panellist')
const main = byName('main')
assert.ok(panel, '应当注册 sidebar.panellist')
assert.equal(panel.spec.id, 'netease-music')
assert.equal(panel.spec.label, '网易云')
assert.ok(main, '应当注册 main 面板')
assert.equal(main.spec.key, 'netease-music', 'main 的 key 必须和侧栏 id 对上')
assert.ok(injections.includes('sidebar.panellist') && injections.includes('main'), '两个席位都应经 slots.inject 注册')

// 图标与主面板都得是能渲染的组件（函数式）
assert.equal(typeof panel.component, 'function')
assert.equal(typeof main.component, 'function')
const iconEl = panel.component({})
assert.ok(iconEl && iconEl.type, '图标组件应返回元素')

// 把整棵树「渲染」一遍：空态先跑一次（查 undefined 引用），再塞真实形状的数据跑一次。
const SNAP = {
  playing: true, stateLabel: '播放中', mode: 'playRandom', modeLabel: '随机播放', volume: 0.75,
  track: { id: '346013', name: '海阔天空(Live)', artists: '黄贯中 / 叶世荣', album: '别了家驹十五载', durationMs: 366973, cover: 'http://example.com/c.jpg' },
  queueIndex: 2, queueTotal: 3,
  queue: { total: 3, index: 2, items: [
    { index: 0, id: '1357375695', name: '第一首', artists: '甲' },
    { index: 1, id: '3362542402', name: '第二首', artists: '乙' },
    { index: 2, id: '346013', name: '海阔天空(Live)', artists: '黄贯中' },
  ] },
}
const PLAYLISTS = [{ id: '17813867675', name: '随听', trackCount: 464, owned: true }]
const DEFAULTS = {
  status: SNAP, playlists: PLAYLISTS, busy: '', run: async () => null, notify: () => {},
  reloadPlaylists: async () => {}, onControl: () => {},
  pos: { position: 60, duration: 200, at: Date.now() },
  call: async () => ({ ok: true, lines: [{ time: 0, text: '第一句歌词', tr: 'first line' }], hasTranslation: true }),
  onSeek: () => {},
  results: [], tracks: [],
}

const texts = []
let nodes = 0
let invoked = 0
const walk = (el, depth) => {
  if (el === null || el === undefined || depth > 40) return
  if (typeof el === 'string' || typeof el === 'number') { texts.push(String(el)); return }
  if (Array.isArray(el)) { el.forEach((x) => walk(x, depth + 1)); return }
  if (typeof el !== 'object') return
  nodes++
  if (typeof el.type === 'function') {
    invoked++
    const props = Object.assign({}, DEFAULTS, el.props)
    for (const key of Object.keys(DEFAULTS)) {
      const value = props[key]
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) props[key] = DEFAULTS[key]
    }
    if (el.children && el.children.length) props.children = el.children
    let out
    try { out = el.type(props) } catch (e) { throw new Error('组件抛错：' + (e && e.message)) }
    if (out === undefined) throw new Error('组件返回 undefined')
    walk(out, depth + 1)
    return
  }
  if (el.children) walk(el.children, depth + 1)
}
walk(main.component({}), 0)
assert.ok(nodes > 40, '主面板应当渲染出足够多的节点，实际 ' + nodes)
const all = texts.join(' ')
assert.ok(all.includes('海阔天空(Live)'), '面板应当显示当前歌曲名；实际文本片段：' + all.slice(0, 240))
assert.ok(all.includes('黄贯中'), '面板应当显示歌手')
assert.ok(all.includes('第二首'), '队列里的歌应当出现在面板上')
assert.ok(all.includes('随听'), '我的歌单应当出现在面板上')
assert.ok(all.includes('播放队列'), '应当有播放队列区块')
assert.ok(all.includes('新建'), '应当有新建歌单入口')
assert.ok(all.includes('歌词'), '应当有歌词区块')
assert.ok(all.includes('1:00'), '进度条应当显示当前进度 1:00，实际：' + all.slice(0, 300))
assert.ok(all.includes('3:20'), '进度条应当显示总长 3:20')

console.log('PASS: client 注册了侧栏入口与主面板（key 对齐）')
console.log('PASS: 面板渲染出 ' + nodes + ' 个节点，当前歌曲/队列/歌单都显示出来了')
console.log('PASS: 注入的席位 =', injections.join(', '))
