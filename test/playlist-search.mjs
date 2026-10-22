import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
let bundle, state = [], cursor = 0
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (init) => { const i = cursor++; if (!(i in state)) state[i] = typeof init === 'function' ? init() : init; return [state[i], (v) => { state[i] = typeof v === 'function' ? v(state[i]) : v }] },
  useRef: (init) => { const i = cursor++; if (!(i in state)) state[i] = { current: init }; return state[i] },
  useCallback: (fn) => fn, useEffect: () => {},
}
const window = { __ModuleLoader__: { load: (b) => { bundle = b } }, confirm: () => true }
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  .replace('    const Icon =', '    window.__pl = { PlaylistCard };\n    const Icon =')
runInNewContext(source, { window, console })
bundle.factory(() => React)
const { PlaylistCard } = window.__pl
const flat = (x) => x == null ? [] : Array.isArray(x) ? x.flatMap(flat) : typeof x === 'object' ? [x, ...flat(x.children)] : [x]
const texts = (tree) => flat(tree).filter((n) => typeof n === 'string')
const byText = (tree, text) => flat(tree).find((n) => n?.type === 'button' && flat(n.children).includes(text))
let root
const render = (props) => { cursor = 0; root = PlaylistCard(props) ; return root }

const tracks = [
  { id: '1', name: '晴天', artists: '周杰伦' },
  { id: '2', name: '海阔天空', artists: 'BEYOND' },
  { id: '3', name: '七里香', artists: '周杰伦' },
]
const run = async (tool) => (tool === 'netease_playlist_tracks' ? { ok: true, tracks } : { ok: true })
const props = { busy: '', playlists: [{ id: '9', name: '随听', trackCount: 3, owned: true }], run, notify: () => {}, reloadPlaylists: async () => {} }

render(props)
assert.ok(texts(root).includes('点上面的歌单，展开里面的歌'), '默认提示展开歌单')

byText(root, '随听').props.onClick()
await new Promise((r) => setTimeout(r, 0))
render(props)
assert.ok(texts(root).includes('晴天') && texts(root).includes('七里香'), '打开歌单后列出全部曲目')

const input = flat(root).find((n) => n?.props?.['aria-label'] === '在歌单里搜索')
assert.ok(input, '播放按钮旁边要有歌单内搜索框')
assert.equal(input.props.type, 'search')
input.props.onChange({ target: { value: '周杰伦' } })
render(props)
assert.ok(texts(root).includes('晴天') && texts(root).includes('七里香') && !texts(root).includes('海阔天空'), '按歌手过滤')
assert.ok(texts(root).some((t) => t.includes('匹配 2 首')), '显示匹配数量')

flat(root).find((n) => n?.props?.['aria-label'] === '在歌单里搜索').props.onChange({ target: { value: '海阔' } })
render(props)
assert.ok(texts(root).includes('海阔天空') && !texts(root).includes('晴天'), '按歌名过滤')

flat(root).find((n) => n?.props?.['aria-label'] === '在歌单里搜索').props.onChange({ target: { value: '不存在的歌' } })
render(props)
assert.ok(texts(root).some((t) => t.includes('没有匹配')), '无结果时给出提示')

flat(root).find((n) => n?.props?.['aria-label'] === '在歌单里搜索').props.onChange({ target: { value: '' } })
render(props)
assert.ok(texts(root).includes('海阔天空') && texts(root).includes('晴天'), '清空搜索恢复全部')

console.log('PASS: 歌单内搜索框——按歌名/歌手本地过滤、匹配数量、空结果提示、清空恢复')
