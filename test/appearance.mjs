import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
let bundle
const saved = new Map()
let state = [], cursor = 0
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (init) => { const i = cursor++; if (!(i in state)) state[i] = typeof init === 'function' ? init() : init; return [state[i], (v) => { state[i] = typeof v === 'function' ? v(state[i]) : v }] },
  useRef: (init) => { const i = cursor++; if (!(i in state)) state[i] = { current: init }; return state[i] },
  useCallback: (fn) => fn, useEffect() {},
}
class Reader { readAsDataURL(file) { this.result = 'data:image/png;base64,AAAA'; this.onload() } }
class Picture { naturalWidth = 1920; naturalHeight = 1080; set src(value) { this._src = value; this.onload() } get src() { return this._src } }
const window = { localStorage: { getItem: (k) => saved.get(k), setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) }, __ModuleLoader__: { load: (b) => { bundle = b } } }
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8').replace('    const Icon =', '    window.__appearance = { Panel, LyricCard, BackgroundCrop, CSS };\n    const Icon =')
runInNewContext(source, { window, FileReader: Reader, Image: Picture })
bundle.factory(() => React)
const { Panel, LyricCard, BackgroundCrop, CSS } = window.__appearance
const flat = (x) => x == null ? [] : Array.isArray(x) ? x.flatMap(flat) : typeof x === 'object' ? [x, ...flat(x.children)] : [x]
const render = () => { cursor = 0; return Panel() }
const find = (root, text) => flat(root).find((n) => n?.type === 'button' && flat(n.children).includes(text))
let root = render()
assert.equal(root.props['data-theme'], 'dark')
assert.match(root.props.className, /nm-font-size-small/)
find(root, '浅色').props.onClick()
root = render()
assert.equal(root.props['data-theme'], 'light')
assert.equal(saved.get('dsh-nm-theme'), 'light')
const lyric = flat(root).find((n) => n?.type === LyricCard)
lyric.props.onLyricSize('large')
root = render()
assert.match(root.props.className, /nm-font-size-large/)
assert.equal(saved.get('dsh-nm-lyric-size'), 'large')
const input = flat(root).find((n) => n?.props?.type === 'file')
input.props.onChange({ target: { files: [{ type: 'text/plain', size: 1 }] } })
assert.ok(flat(render()).includes('请选择图片文件'))
input.props.onChange({ target: { files: [{ type: 'image/png', size: 9 * 1024 * 1024 }] } })
assert.ok(flat(render()).includes('背景图不能超过 8 MB'))
input.props.onChange({ target: { files: [{ type: 'image/png', size: 100 }] } })
root = render()
assert.ok(!root.props.className.includes('has-bg'), '确认裁剪前不能改背景')
let crop = flat(root).find((n) => n?.type === BackgroundCrop)
assert.ok(crop, '导入成功后打开裁剪预览')
crop.props.onCancel()
assert.ok(!flat(render()).some((n) => n?.type === BackgroundCrop))
input.props.onChange({ target: { files: [{ type: 'image/png', size: 100 }] } })
root = render()
crop = flat(root).find((n) => n?.type === BackgroundCrop)
crop.props.onApply('data:image/png;base64,AAAA')
root = render()
assert.match(root.props.className, /has-bg/)
const bgLayer = flat(root).find((n) => n?.props?.className === 'nm-bg')
assert.ok(bgLayer, '背景应由独立图层渲染')
assert.equal(flat(bgLayer).filter((n) => n?.type === 'img').length, 2, '模糊填充 + 主图两层')
assert.equal(flat(bgLayer).find((n) => n?.props?.className === 'nm-bg-main').props.src, 'data:image/png;base64,AAAA')
assert.ok(flat(root).find((n) => n?.props?.className === 'nm-scroll'), '内容需要独立的滚动容器')
assert.ok(saved.get('dsh-nm-bg'))
state = []
root = render()
assert.equal(root.props['data-theme'], 'light')
assert.match(root.props.className, /has-bg.*nm-font-size-large/)
find(root, '半透明').props.onClick()
root = render()
assert.equal(root.props['data-theme'], 'transparent')
assert.equal(saved.get('dsh-nm-theme'), 'transparent')
assert.ok(CSS.includes('.nm-root[data-theme="transparent"] .nm-bg::after'))
assert.ok(CSS.includes('background:#10172466'))
state = []
root = render()
assert.equal(root.props['data-theme'], 'transparent', '重新打开仍保留半透明主题')
assert.match(root.props.className, /has-bg/)
find(root, '清除背景').props.onClick()
root = render()
assert.ok(!root.props.className.includes('has-bg'))
assert.equal(saved.get('dsh-nm-bg'), '')
for (const size of ['small', 'medium', 'large']) assert.ok(CSS.includes('nm-font-size-' + size))
assert.ok(CSS.includes('font-size:12.5px') && CSS.includes('font-size:16px') && CSS.includes('font-size:20px'))
console.log('PASS: 深浅主题、字号切换、背景导入/清除/格式与大小校验、本地持久化')
