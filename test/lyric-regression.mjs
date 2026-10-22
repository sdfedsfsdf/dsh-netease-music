import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parseLrc } from '../lib/api.mjs'

assert.deepEqual(parseLrc('[offset:100]\r\n[00:01.20][00:03:004] 同一句\r[00:05]下一句'), [
  { time: 1300, text: '同一句' }, { time: 3104, text: '同一句' }, { time: 5100, text: '下一句' },
])
assert.deepEqual(parseLrc('[offset:-2000]\n[00:01]开头'), [{ time: 0, text: '开头' }])
let api
let state = []
let cursor = 0
let effects = []
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (initial) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (v) => { state[i] = typeof v === 'function' ? v(state[i]) : v }] },
  useRef: (initial) => { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i] },
  useEffect: (fn) => { effects.push(fn) },
}
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8').replace('    const Icon =', '    window.__test = { LyricCard, usePlayhead };\n    const Icon =')
const window = { __ModuleLoader__: { load: (m) => { api = m } } }
runInNewContext(source, { window, console, Date, setInterval: () => 1, clearInterval() {} })
api.factory(() => React)
const { LyricCard, usePlayhead } = window.__test
const flatten = (tree) => tree == null ? [] : Array.isArray(tree) ? tree.flatMap(flatten) : typeof tree === 'object' ? [tree, ...flatten(tree.children)] : [tree]
const render = (props) => { cursor = 0; effects = []; return LyricCard(props) }
const props = { status: { track: { id: '1' }, playing: false }, pos: { position: 2, duration: 20, at: Date.now(), songId: '1', playing: false }, call: async () => ({}), onSeek() {} }
state = [{ id: '1', lines: [{ time: 0, text: '前句' }, { time: 2000, text: '当前句' }], hasTranslation: false }, '', true]
let tree = render(props)
let box = flatten(tree).find((n) => n?.props?.className === 'nm-lyric')
assert.ok(box)
const scroller = { scrollTop: 100, clientHeight: 300, getBoundingClientRect: () => ({ top: 600 }), querySelector: () => ({ getBoundingClientRect: () => ({ top: 760, height: 40 }) }) }
box.props.ref.current = scroller
effects.at(-1)()
assert.equal(scroller.scrollTop, 130, '使用容器相对坐标，不能把页面 offsetTop 当滚动距离')
box.props.onWheel()
scroller.scrollTop = 50
effects.at(-1)()
assert.equal(scroller.scrollTop, 50, '手动滚动时不抢滚动位置')
assert.ok(!flatten(render({ ...props, status: { track: { id: '2' } } })).includes('当前句'), '切歌立即隐藏旧歌词')
state = [{ id: '1', lines: [{ time: 0, text: '暂无歌词' }] }, '', true]
assert.ok(!flatten(render(props)).some((n) => n?.props?.className === 'nm-lyric'), '暂无歌词不当成一句正式歌词')
state = [null, '网络错误', true]
const errorText = flatten(render(props)).filter((n) => typeof n === 'string').join(' ')
assert.ok(errorText.includes('重试') && !errorText.includes('正在取歌词'), '出错不能同时显示载入中')
state = []; cursor = 0
assert.equal(usePlayhead(props.status, { ...props.pos, songId: '2' }).current, null, '拒绝另一首歌的进度')
state = []; cursor = 0
assert.equal(usePlayhead(props.status, { ...props.pos, at: Date.now() - 10000 }).current, null, '失效进度不能无限插值')
state = []; cursor = 0
const live = usePlayhead({ track: { id: '1' }, playing: true }, { position: 10, duration: 200, at: Date.now(), playing: true, songId: '1' })
assert.ok(live.current >= 10.3 && live.current < 10.9, '播放中要补上「只显示到秒」造成的滞后，实际 ' + live.current)
state = []; cursor = 0
const paused = usePlayhead({ track: { id: '1' }, playing: false }, { position: 10, duration: 200, at: Date.now(), playing: false, songId: '1' })
assert.equal(paused.current, 10, '暂停时不要额外加时间')
state = []; cursor = 0
const ticked = usePlayhead({ track: { id: '1' }, playing: true }, { position: 10, duration: 200, at: Date.now() - 2000, playing: true, songId: '1' })
assert.ok(ticked.current >= 12.3 && ticked.current < 12.9, '两秒前的样本要继续往前走，实际 ' + ticked.current)
console.log('PASS: LRC 多时间戳/offset，歌词滚动/手动浏览/切歌/空歌词/失败重试，进度归属、滞后补偿与失效')
