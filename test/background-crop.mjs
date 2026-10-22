import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
let bundle, state = [], cursor = 0, drawn, applied, cancelled = false
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (init) => { const i = cursor++; if (!(i in state)) state[i] = init; return [state[i], (v) => { state[i] = typeof v === 'function' ? v(state[i]) : v }] },
  useRef: (init) => { const i = cursor++; if (!(i in state)) state[i] = { current: init }; return state[i] },
}
const window = { __ModuleLoader__: { load: (b) => { bundle = b } } }
const canvas = { getContext: () => ({ drawImage: (...args) => { drawn = args } }), toDataURL: () => 'data:image/jpeg;base64,CROP' }
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8').replace('    const Icon =', '    window.__crop = { BackgroundCrop, cropRegion, backgroundFit };\n    const Icon =')
runInNewContext(source, { window, document: { createElement: () => canvas } })
bundle.factory(() => React)
const { BackgroundCrop, cropRegion, backgroundFit } = window.__crop
assert.equal(backgroundFit(16 / 9, 16 / 9), 'cover', '比例一致时铺满')
assert.equal(backgroundFit(1.6, 16 / 9), 'cover', '16:10 窗口仍铺满')
assert.equal(backgroundFit(4 / 3, 16 / 9), 'contain', '4:3 窗口完整显示')
assert.equal(backgroundFit(21 / 9, 16 / 9), 'contain', '超宽窗口完整显示')
assert.equal(backgroundFit(1.5, 0), 'cover', '没有记录比例时默认铺满')
assert.equal(backgroundFit(0, 16 / 9), 'cover', '尚未测量窗口时默认铺满')
for (const ratio of [16 / 9, 4 / 3, 1, 9 / 16, 3]) for (const zoom of [1, 2, 5]) for (const x of [0, 0.5, 1]) {
  const r = cropRegion(1920, 1080, ratio, zoom, x, x)
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1920.001 && r.y + r.h <= 1080.001)
  assert.ok(Math.abs(r.w / r.h - ratio) < 0.0001)
}
const image = { naturalWidth: 1920, naturalHeight: 1080, src: 'data:image/png;base64,ORIGINAL' }
const props = { image, onApply: (value) => { applied = value }, onCancel: () => { cancelled = true } }
const flat = (x) => x == null ? [] : Array.isArray(x) ? x.flatMap(flat) : typeof x === 'object' ? [x, ...flat(x.children)] : [x]
const render = () => { cursor = 0; return BackgroundCrop(props) }
const button = (tree, text) => flat(tree).find((n) => n?.type === 'button' && n.children.includes(text))
let tree = render()
flat(tree).find((n) => n?.props?.['aria-label'] === '背景缩放').props.onChange({ target: { value: '2' } })
tree = render()
const preview = flat(tree).find((n) => n?.props?.className === 'nm-crop-preview')
preview.props.onPointerDown({ pointerId: 1, button: 0, clientX: 0, clientY: 0, preventDefault() {}, currentTarget: { setPointerCapture() {}, getBoundingClientRect: () => ({ width: 480, height: 270 }) } })
preview.props.onPointerMove({ pointerId: 1, clientX: 10000, clientY: -10000 })
tree = render()
button(tree, '确认裁剪并应用').props.onClick()
assert.equal(applied, 'data:image/jpeg;base64,CROP')
assert.equal(drawn[1], 0)
assert.equal(drawn[2], 540)
assert.equal(drawn[3], 960)
assert.equal(drawn[4], 540)
assert.equal(canvas.width, 960)
assert.equal(canvas.height, 540)
button(tree, '重置').props.onClick()
tree = render()
button(tree, '确认裁剪并应用').props.onClick()
assert.equal(drawn[3], 1920)
button(tree, '取消').props.onClick()
assert.equal(cancelled, true)
console.log('PASS: 裁剪比例、缩放、拖动边界、重置、Canvas 导出与取消')
