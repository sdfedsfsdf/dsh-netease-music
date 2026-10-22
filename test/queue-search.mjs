import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
let bundle, value = ''
const win={__ModuleLoader__:{load(b){bundle=b}}}
const React={createElement(type,props,...children){return {type,props:props||{},children}},useState(){return [value,v=>{value=v}]}}
vm.runInNewContext(fs.readFileSync(new URL('../client.js',import.meta.url),'utf8').replace('    const Icon =','    window.__queue = QueueCard;\n    const Icon ='),{window:win})
bundle.factory(()=>React)
const items=[{id:'1',name:'晴天',artists:'周杰伦',index:0},{id:'2',name:'海阔天空',artists:'BEYOND',index:1},{id:'3',name:'七里香',artists:'周杰伦',index:2}]
const before=JSON.stringify(items),calls=[]
const render=()=>win.__queue({status:{track:{id:'1'},queue:{items},queueTotal:3},onControl:(...args)=>calls.push(args)})
const flat=x=>x==null?[]:Array.isArray(x)?x.flatMap(flat):typeof x==='object'?[x,...flat(x.children)]:[]
const find=(tree,label)=>flat(tree).find(x=>x.props['aria-label']===label)
let root=render()
find(root,'搜索播放队列').props.onChange({target:{value:'周杰伦'}})
root=render()
const original=find(root,'完整播放队列'),result=find(root,'播放队列搜索结果')
assert.equal(original.children[0].length,3)
assert.equal(flat(result).filter(x=>x.props.className?.startsWith('nm-item')).length,2)
const buttons=flat(result).filter(x=>x.type==='button')
buttons[1].props.onClick()
assert.deepEqual(calls,[['jump',2]],'搜索结果按原队列索引跳转')
assert.equal(JSON.stringify(items),before,'搜索不得修改原队列')
value='不存在';root=render()
assert.equal(find(root,'完整播放队列').children[0].length,3)
find(root,'搜索播放队列').props.onKeyDown({key:'Escape'})
assert.equal(find(render(),'播放队列搜索结果'),undefined)
console.log('PASS: 队列搜索结果独立显示、原队列不变、使用原始索引播放、空结果与清空')
