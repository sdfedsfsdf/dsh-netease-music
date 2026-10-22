import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
const src=fs.readFileSync(new URL('../client.js',import.meta.url),'utf8')
const start=src.indexOf('const mergeSnapshot = ')
const end=src.indexOf('\n\n',start)
const merge=vm.runInNewContext('('+src.slice(start+'const mergeSnapshot = '.length,end).trim()+')')
const previous={track:{id:'1'},queue:{items:[{id:'1',index:0},{id:'2',index:1}]},queueTotal:2}
const next=merge(previous,{track:{id:'2'},queueIndex:1,playing:true})
assert.equal(next.queue,previous.queue,'动作摘要不得丢掉队列，防止 DOM 列表卸载')
assert.equal(next.track.id,'2')
const poll=merge(next,JSON.parse(JSON.stringify(next)))
assert.equal(poll.queue.items,previous.queue.items,'未变化列表复用引用')
const changed=merge(poll,{queue:{items:[{id:'3',index:0}]}})
assert.equal(changed.queue.items[0].id,'3','真实队列变化仍更新')
assert.ok(src.includes("if (tool === 'netease_play') await reloadSnap()"))
console.log('PASS: 切歌摘要保留列表、轮询复用队列、真实队列变化正常同步')
