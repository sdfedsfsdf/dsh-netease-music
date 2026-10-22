# AGENTS.md —— 给改这个插件的人（或模型）

## 两面结构

| 文件 | 跑在哪 | 说明 |
| --- | --- | --- |
| `index.js` + `lib/*` | DSH 主进程 | 14 个工具 + `/api/netease-music` 面板路由 |
| `client.js` | 浏览器 | 自注册脚本，注册 `sidebar.panellist` 和 `main` 两个席位 |

两面共享一套执行器：`client.js` 只发 `{tool,args}`，不要在前端重写业务逻辑。

## 硬约束（踩过的坑）

1. **工具参数要转标准 JSON Schema**。`ctx.tools.register` 收的是 JSON Schema，不是 defineTool 的简写；
   简写会让宿主报 `schema.type must be "object"`，整个插件不激活。统一走 `lib/tool-schema.mjs`。
2. **client bundle 必须是普通脚本**（`window.__ModuleLoader__.load`），不能是 ESM；
   `loaded.id` 必须等于包名，`package.json` 必须有 `dsh.client`（platform=web）和 `exports["./client"]`。
3. **面板块的 key 要和侧栏 id 一致**（`netease-music`），否则点了入口打不开。
4. **不要在桌面 profile 里裸 import 宿主包**：桌面版 `autoInstallPeers: false`，optional peer 永远装不上，
   裸 import 会让整条插件不激活。需要宿主能力时用 `ctx.get('服务名')`。
5. **播放位置从 DOM 读**。`AudioPlayer.getPlayedTime()` 的 Promise 永不 settle，别用；
   底部播放条 `01:50 / 02:20` 的文本是实时的，`readPosition()` 缓存节点后只读 `textContent`。
6. **`playing/play` 之后要 `playingList/refreshCurPlaying`**，否则当前曲目名字是空的。
7. **`getStore()` 每次要重新取**，它是快照不是 Redux store。
8. **模板字符串里的正则要写两遍反斜杠**。`BOOTSTRAP` 是模板字符串：`\/` 注入后会提前闭合正则，
   页面报 `missing ) after argument list`（踩过，排查了半天）。
9. **队列和歌单都要整份**。`snapshot()` 不再 `slice(0,40)`；歌单超过 1000 首按 id 每 500 首补，
   别再加回小上限。

## 验证顺序

改完至少跑：

```powershell
& $node test\client-smoke.mjs        # 面板注册 + 渲染
& $node test\web-api.mjs             # HTTP 桥（会真的读一次歌单，只读）
$env:ELECTRON_RUN_AS_NODE='1'
& 'D:\dsh\DeepSeek Harness.exe' test\host-mount.mjs
& 'D:\dsh\DeepSeek Harness.exe' test\client-contract.mjs
```

容器外的真实效果：重启 DSH → 看左侧栏「网易云」→ 面板顶部状态和歌单是否出来。

## 家目录

`$DSH_HOME/netease-music/`：`config.json`、`cookie.json`（0600）、`netease.log`。
**不要**把 cookie、日志、`_tmp/` 里的探测脚本打进发布包（`package.json` 的 `files` 已经排除了它们）。
