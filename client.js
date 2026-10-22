/**
 * dsh-netease-music —— 浏览器半端（独立「网易云」面板）
 * ============================================================================
 * 自注册约定（与 dsh-bili-scroll / 官方插件一致）：
 *   window.__ModuleLoader__.load({ id: '<包名>', factory: (require) => ({ inject, apply }) })
 *
 * 面板席位：
 *   · sidebar.panellist  —— 左侧栏那一行入口（id 要和 main 的 key 对上）
 *   · main (keyed)       —— 点开之后占满主区域的那一页
 *
 * 数据面：GET /api/netease-music/bootstrap、POST /api/netease-music/action
 * （后端把这两个路由桥到同一套工具执行器上；面板不接触 cookie）
 * ============================================================================
 */
window.__ModuleLoader__.load({
  id: 'dsh-netease-music',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const API = '/api/netease-music'
    const MODES = [
      ['playOrder', '顺序播放'],
      ['playCycle', '列表循环'],
      ['playRandom', '随机播放'],
      ['playOneCycle', '单曲循环'],
      ['playAi', '智能播放'],
    ]

    const CSS = `
.nm-root{--nm-bg:#0b0d12;--nm-panel:#141821;--nm-panel2:#1b202b;--nm-line:#262c39;--nm-text:#eef1f7;--nm-muted-panel:#ffffff08;
  --nm-dim:#98a1b3;--nm-accent:#f43f5e;--nm-accent2:#8b5cf6;
  height:100%;min-height:100%;position:relative;overflow:hidden;box-sizing:border-box;color:var(--nm-text);
  background:radial-gradient(1100px 600px at 12% -10%,#2a1030 0%,transparent 55%),
             radial-gradient(900px 500px at 100% 0%,#101a3a 0%,transparent 50%),var(--nm-bg);
  font:14px/1.45 "Segoe UI",system-ui,-apple-system,sans-serif;}
.nm-root *{box-sizing:border-box}
.nm-scroll{position:absolute;inset:0;z-index:1;overflow:auto;overscroll-behavior:contain}
.nm-wrap{width:100%;max-width:1680px;margin:0 auto;padding:26px 26px 40px}
.nm-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:20px}
.nm-logo{width:44px;height:44px;border-radius:14px;flex:none;position:relative;
  background:conic-gradient(from 210deg,var(--nm-accent),#fb7185,var(--nm-accent2),var(--nm-accent));
  box-shadow:0 10px 30px #f43f5e40}
.nm-logo::after{content:"";position:absolute;inset:14px;border-radius:50%;background:#12101a;border:3px solid #fda4af}
.nm-h1{font-size:19px;font-weight:800;letter-spacing:-.02em;margin:0}
.nm-sub{font-size:11.5px;color:var(--nm-dim)}
.nm-grow{flex:1;min-width:0}
.nm-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:11px;
  border:1px solid var(--nm-line);background:#ffffff08;color:var(--nm-dim)}
.nm-dot{width:6px;height:6px;border-radius:50%;background:#64748b}
.nm-dot.on{background:#34d399;box-shadow:0 0 8px #34d399}
.nm-dot.warn{background:#fbbf24}
.nm-btn{border:1px solid var(--nm-line);background:#ffffff0a;color:var(--nm-text);border-radius:10px;
  padding:8px 12px;font:inherit;font-size:12px;cursor:pointer;transition:.15s}
.nm-btn:hover:not(:disabled){background:#ffffff18;border-color:#3b4457}
.nm-btn:disabled{opacity:.45;cursor:not-allowed}
.nm-btn.primary{background:linear-gradient(135deg,var(--nm-accent),#e11d48);border-color:#fb7185;color:#fff}
.nm-btn.ghost{background:transparent}
.nm-btn.danger{color:#fda4af;border-color:#4c1d24}
.nm-btn.tiny{padding:5px 9px;font-size:11px;border-radius:8px}
.nm-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr);gap:16px;align-items:start}
.nm-col{display:flex;flex-direction:column;gap:16px;min-width:0}
.nm-card{background:linear-gradient(180deg,#161a24f2,#12151df2);border:1px solid var(--nm-line);
  border-radius:18px;padding:18px;box-shadow:0 18px 50px #00000055}
.nm-card-h{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.nm-card-h h2{font-size:13px;font-weight:700;margin:0;letter-spacing:.02em}
.nm-now{display:grid;grid-template-columns:148px minmax(0,1fr);gap:18px}
.nm-cover{width:148px;height:148px;border-radius:14px;object-fit:cover;background:#1f2532;
  box-shadow:0 14px 34px #00000070;display:block}
.nm-cover.ph{display:grid;place-items:center;font-size:44px;color:#4a5568}
.nm-kicker{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#fb7185;font-weight:800}
.nm-song{font-size:22px;font-weight:800;letter-spacing:-.02em;margin:6px 0 4px;overflow-wrap:anywhere}
.nm-artist{font-size:13px;color:#c3b9d4;overflow-wrap:anywhere}
.nm-meta{font-size:11.5px;color:var(--nm-dim);margin-top:8px}
.nm-ctl{display:flex;align-items:center;gap:8px;margin-top:16px;flex-wrap:wrap}
.nm-round{width:36px;height:36px;padding:0;border-radius:50%;font-size:14px;display:grid;place-items:center}
.nm-play{width:48px;height:48px;padding:0;border-radius:50%;font-size:18px;display:grid;place-items:center;
  background:linear-gradient(135deg,#fb7185,var(--nm-accent));border:0;color:#fff;cursor:pointer;
  box-shadow:0 10px 26px #f43f5e55}
.nm-play:disabled{opacity:.5;cursor:not-allowed}
.nm-field{margin-top:14px}
.nm-label{display:block;font-size:11px;color:var(--nm-dim);margin-bottom:6px}
.nm-row{display:flex;align-items:center;gap:8px}
.nm-range{flex:1;accent-color:var(--nm-accent);min-width:60px}
/* ── 滑杆（进度 / 音量 / 裁剪）：自绘轨道 + 发光圆点，不依赖第三方资源 ── */
.nm-slider{-webkit-appearance:none;appearance:none;width:100%;height:20px;margin:0;background:transparent;
  cursor:pointer;outline:none;flex:1;min-width:60px;--nm-track:#242a38}
.nm-slider::-webkit-slider-runnable-track{height:6px;border-radius:999px;
  background:linear-gradient(90deg,var(--nm-accent) 0 var(--fill,0%),var(--nm-track) var(--fill,0%) 100%);
  box-shadow:inset 0 1px 2px #00000066}
.nm-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;margin-top:-4px;
  border-radius:50%;background:#fff;border:2px solid var(--nm-accent);
  box-shadow:0 0 0 3px #f43f5e2b,0 2px 6px #00000066;
  transition:transform .12s ease,box-shadow .12s ease}
.nm-slider:hover::-webkit-slider-thumb{transform:scale(1.16);box-shadow:0 0 0 5px #f43f5e36,0 2px 8px #00000077}
.nm-slider:hover::-webkit-slider-runnable-track{filter:brightness(1.12)}
.nm-slider:active::-webkit-slider-thumb{transform:scale(1.06);box-shadow:0 0 0 7px #f43f5e42,0 2px 8px #00000077}
.nm-slider:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 6px #f43f5e55,0 2px 8px #00000077}
.nm-slider:disabled{opacity:.5;cursor:not-allowed}
.nm-slider::-moz-range-track{height:6px;border-radius:999px;background:var(--nm-track)}
.nm-slider::-moz-range-progress{height:6px;border-radius:999px;background:var(--nm-accent)}
.nm-slider::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid var(--nm-accent);box-shadow:0 0 0 3px #f43f5e2b}
.nm-slider::-moz-focus-outer{border:0}
.nm-seek{height:24px}
.nm-seek::-webkit-slider-runnable-track{height:8px;
  background:linear-gradient(90deg,var(--nm-accent) 0 var(--fill,0%),#ffffff26 var(--fill,0%) 100%)}
.nm-seek::-webkit-slider-thumb{width:16px;height:16px;margin-top:-4px}
.nm-seek::-moz-range-track{height:8px;background:#ffffff26}
.nm-seek::-moz-range-progress{height:8px}
.nm-seek-wrap{position:relative}
.nm-seek-tip{position:absolute;bottom:26px;transform:translateX(-50%);pointer-events:none;white-space:nowrap;
  background:#0f1420f2;color:#fff;border:1px solid #ffffff2b;border-radius:8px;padding:2px 8px;
  font-size:11px;font-variant-numeric:tabular-nums;box-shadow:0 6px 18px #00000066}
.nm-seek-tip::after{content:"";position:absolute;left:50%;bottom:-4px;width:8px;height:8px;transform:translateX(-50%) rotate(45deg);
  background:#0f1420f2;border-right:1px solid #ffffff2b;border-bottom:1px solid #ffffff2b}
.nm-progress{margin-top:14px}
.nm-progress .nm-seek{width:100%;display:block}
.nm-time{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--nm-dim);margin-top:2px;
  font-variant-numeric:tabular-nums}
.nm-time .nm-sub{font-size:10.5px}
.nm-time b{font-weight:600;color:var(--nm-text)}
.nm-lyric{position:relative;display:flex;flex-direction:column;gap:2px;height:clamp(240px,34vh,440px);overflow:auto;padding:4px 2px;scroll-behavior:smooth;overflow-anchor:none;overscroll-behavior:contain}
.nm-lyric-line{padding:5px 8px;border-radius:8px;font-size:12.5px;color:#8f97a8;cursor:pointer;line-height:1.4}
.nm-lyric-line:hover{background:#ffffff0a;color:#cbd3e1}
.nm-lyric-line.on{color:#fff;background:#f43f5e1c;font-weight:600}
.nm-lyric-line small{display:block;font-size:10.5px;color:#98a1b3;font-weight:400;margin-top:1px}
.nm-lyric-line.on small{color:#e7c9d6}
.nm-vol{width:104px;accent-color:var(--nm-accent2)}
.nm-input,.nm-select{background:#0c1017;border:1px solid var(--nm-line);border-radius:10px;
  padding:8px 10px;color:var(--nm-text);font:inherit;font-size:12px;outline:none;min-width:0}
.nm-input:focus,.nm-select:focus{border-color:#fb7185}
.nm-num{width:74px;text-align:center}
.nm-list{display:flex;flex-direction:column;gap:5px;max-height:clamp(260px,46vh,620px);overflow:auto;padding-right:2px}
.nm-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;
  background:#ffffff05;border:1px solid transparent;min-width:0;content-visibility:auto;contain-intrinsic-size:38px}
.nm-item:hover{background:#ffffff0f}
.nm-item.on{background:#f43f5e1c;border-color:#fb718540}
.nm-idx{width:22px;flex:none;text-align:center;font-size:11px;color:#6b7488}
.nm-main{min-width:0;flex:1}
.nm-name{font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nm-by{font-size:10.5px;color:var(--nm-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.nm-hint{padding:18px 10px;text-align:center;font-size:12px;color:var(--nm-dim)}
.nm-tabs{display:flex;gap:6px;background:#0c1017;border:1px solid var(--nm-line);padding:4px;border-radius:11px}
.nm-tab{border:0;background:transparent;color:var(--nm-dim);font:inherit;font-size:12px;padding:6px 11px;
  border-radius:8px;cursor:pointer}
.nm-tab.on{background:#ffffff14;color:#fff}
.nm-err{margin:0 0 14px;padding:10px 12px;border-radius:11px;background:#45131c;border:1px solid #7f1d33;
  color:#fecdd3;font-size:12px}
.nm-note{margin-top:10px;font-size:11px;color:var(--nm-dim)}
.nm-toast{position:fixed;right:22px;bottom:22px;z-index:9;background:#1a1423;border:1px solid #3a2d4d;
  padding:10px 14px;border-radius:12px;font-size:12px;box-shadow:0 14px 34px #000000aa;max-width:320px}
.nm-pills{display:flex;gap:6px;overflow:auto;padding-bottom:4px;margin-bottom:10px}
.nm-pill{white-space:nowrap;border:1px solid var(--nm-line);background:#ffffff08;color:#c9d1e0;
  border-radius:999px;padding:6px 10px;font-size:11px;cursor:pointer}
.nm-pill.on{background:#8b5cf633;border-color:#8b5cf6aa;color:#fff}
@media (max-width:900px){.nm-grid{grid-template-columns:1fr}.nm-now{grid-template-columns:112px minmax(0,1fr)}
  .nm-cover{width:112px;height:112px}.nm-song{font-size:18px}}
@media (max-width:520px){.nm-wrap{padding:16px 14px 28px}.nm-now{grid-template-columns:1fr}
  .nm-cover{width:100%;height:190px}.nm-top{align-items:flex-start}}
.nm-root[data-theme="light"]{--nm-bg:#eef2f7;--nm-panel:#fff;--nm-panel2:#f6f8fb;--nm-line:#d7dee9;--nm-text:#182235;--nm-dim:#5d6b80;background:linear-gradient(135deg,#f8fafc,#e8edf5)}
 .nm-root[data-theme="light"] .nm-slider{--nm-track:#dde5f0}
 .nm-root[data-theme="light"] .nm-seek::-webkit-slider-runnable-track{background:linear-gradient(90deg,var(--nm-accent) 0 var(--fill,0%),#dde5f0 var(--fill,0%) 100%)}
 .nm-root[data-theme="light"] .nm-seek::-moz-range-track{background:#dde5f0}
 .nm-root[data-theme="transparent"] .nm-slider{--nm-track:#ffffff33}
 .nm-root[data-theme="transparent"] .nm-seek::-webkit-slider-runnable-track{background:linear-gradient(90deg,var(--nm-accent) 0 var(--fill,0%),#ffffff33 var(--fill,0%) 100%)}
 .nm-root[data-theme="light"] .nm-card{background:linear-gradient(180deg,#ffffffee,#f8fafcee);box-shadow:0 12px 35px #64748b22}
 .nm-root[data-theme="light"] .nm-btn,.nm-root[data-theme="light"] .nm-chip,.nm-root[data-theme="light"] .nm-pill{background:#ffffffaa;color:var(--nm-text)}
 .nm-root[data-theme="light"] .nm-input,.nm-root[data-theme="light"] .nm-select,.nm-root[data-theme="light"] .nm-tabs{background:#f8fafc;color:var(--nm-text)}
 .nm-root[data-theme="light"] .nm-item{background:#0f172a08}.nm-root[data-theme="light"] .nm-item:hover{background:#0f172a12}
 .nm-root[data-theme="light"] .nm-lyric-line{color:#64748b}.nm-root[data-theme="light"] .nm-lyric-line.on{color:#182235;background:#f43f5e18}
 .nm-root[data-theme="light"] .nm-lyric-line:hover{background:#0f172a0d;color:#182235}.nm-root[data-theme="light"] .nm-lyric-line small{color:#64748b}.nm-root[data-theme="light"] .nm-lyric-line.on small{color:#9f1239}
 .nm-root[data-theme="light"] .nm-artist{color:#665578}.nm-root[data-theme="light"] .nm-kicker{color:#be123c}
 .nm-root[data-theme="light"] .nm-btn.primary{background:linear-gradient(135deg,#e11d48,#be123c);color:#fff}
 .nm-root[data-theme="light"] .nm-tab.on,.nm-root[data-theme="light"] .nm-pill.on{background:#8b5cf622;color:#5b21b6}
 .nm-root[data-theme="light"] .nm-btn:hover:not(:disabled){background:#e2e8f0;border-color:#94a3b8}
 .nm-root[data-theme="light"] .nm-btn.primary:hover:not(:disabled){background:#be123c;color:#fff}
 .nm-root[data-theme="light"] .nm-item.on{background:#f43f5e18;border-color:#fb718566}
 .nm-root[data-theme="light"] .nm-err{background:#fff1f2;border-color:#fda4af;color:#9f1239}
 .nm-root[data-theme="light"] .nm-toast{background:#fff;border-color:#d7dee9;color:#182235}
 .nm-card-h{flex-wrap:wrap}
 .nm-bg{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:var(--nm-bg)}
 .nm-bg-blur{position:absolute;inset:-8%;width:116%;height:116%;object-fit:cover;object-position:center;
   filter:blur(26px) saturate(1.05) brightness(.72);transform:scale(1.02)}
 .nm-bg-main{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center}
 .nm-root[data-theme="light"] .nm-bg-blur{filter:blur(26px) saturate(.95) brightness(1.12);opacity:.75}
 .nm-root[data-theme="transparent"] .nm-bg-blur{filter:blur(22px) brightness(.72);opacity:.85}
 .nm-root.has-bg .nm-card{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
 .nm-toolbar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 16px}
 .nm-toolbar .nm-note{margin:0;max-width:640px;text-align:right;line-height:1.5;
   display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
 @media (max-width:1200px){.nm-toolbar .nm-note{display:none}}
 .nm-root[data-theme="transparent"]{--nm-line:#ffffff38;--nm-text:#fff;--nm-dim:#d3dbe8}
 .nm-root[data-theme="transparent"] .nm-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(#0b0d1218,#0b0d1230)}
 .nm-root[data-theme="light"] .nm-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(#ffffff10,#ffffff30)}
 .nm-root[data-theme="transparent"] .nm-card{background:#10172466;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);box-shadow:0 12px 32px #00000033}
 .nm-root[data-theme="transparent"] .nm-input,.nm-root[data-theme="transparent"] .nm-select,.nm-root[data-theme="transparent"] .nm-tabs{background:#0b101966}
 .nm-root[data-theme="transparent"] .nm-select option{background:#141821;color:#fff}
 .nm-root[data-theme="transparent"] .nm-artist,.nm-root[data-theme="transparent"] .nm-lyric-line{color:#d3dbe8}
 .nm-root[data-theme="transparent"] .nm-lyric-line small{color:#bdc9dc}
 .nm-root[data-theme="transparent"] .nm-lyric-line.on{color:#fff;background:#f43f5e40}
 .nm-root[data-theme="transparent"] .nm-lyric-line.on small{color:#ffe4ec}
 .nm-crop-overlay{position:fixed;inset:0;z-index:10000;background:#000b;display:flex;align-items:center;justify-content:center;padding:18px;overscroll-behavior:contain}
 .nm-crop-dialog{background:var(--nm-panel);color:var(--nm-text);border:1px solid var(--nm-line);border-radius:16px;padding:20px;width:min(680px,100%);max-height:90vh;overflow:auto;box-shadow:0 20px 80px #0008}
 .nm-crop-dialog h2{font-size:18px;margin:0 0 8px}.nm-crop-dialog>.nm-row{margin-top:14px;flex-wrap:wrap}
 .nm-crop-preview{position:relative;overflow:hidden;width:min(100%,520px);max-height:46vh;margin:12px auto;background:#111;touch-action:none;cursor:grab;outline:1px solid #fff6;user-select:none}
 .nm-crop-preview:active{cursor:grabbing}.nm-crop-preview img{position:absolute;max-width:none;pointer-events:none;object-fit:fill}
 .nm-crop-grid{position:absolute;inset:0;pointer-events:none;background:linear-gradient(to right,transparent 33.1%,#ffffff55 33.3%,transparent 33.5%,transparent 66.4%,#ffffff55 66.6%,transparent 66.8%),linear-gradient(to bottom,transparent 33.1%,#ffffff55 33.3%,transparent 33.5%,transparent 66.4%,#ffffff55 66.6%,transparent 66.8%)}
 .nm-track-search{flex:1 1 160px;min-width:130px;max-width:260px}
 .nm-playlist-bar{flex-wrap:wrap;row-gap:8px}
 .nm-playlist-bar .nm-main{flex:1 1 200px}
 .nm-playlist-actions{display:flex;align-items:center;gap:8px;flex:1 1 280px;min-width:0}
 .nm-theme-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.nm-theme-label{font-size:11px;color:var(--nm-dim);margin-right:2px}.nm-file{display:none}
 .nm-font-size-small .nm-lyric-line{font-size:12.5px}.nm-font-size-medium .nm-lyric-line{font-size:16px;line-height:1.55;padding:7px 8px}.nm-font-size-large .nm-lyric-line{font-size:20px;line-height:1.65;padding:9px 8px}
 .nm-font-size-small .nm-lyric-line small{font-size:10.5px}.nm-font-size-medium .nm-lyric-line small{font-size:13px}.nm-font-size-large .nm-lyric-line small{font-size:16px}
 @media (min-width:1500px){.nm-wrap{max-width:1760px;padding:30px 40px 48px}.nm-grid{gap:20px;grid-template-columns:minmax(0,1.08fr) minmax(420px,.92fr)}
   .nm-col{gap:20px}.nm-card{padding:20px}.nm-now{grid-template-columns:168px minmax(0,1fr)}.nm-cover{width:168px;height:168px}
   .nm-song{font-size:25px}.nm-h1{font-size:21px}}
 @media (min-width:1900px){.nm-wrap{max-width:1840px}.nm-grid{grid-template-columns:minmax(0,1.12fr) minmax(480px,.88fr)}}
 @media (max-height:760px){.nm-lyric{height:clamp(190px,28vh,300px)}.nm-list{max-height:clamp(220px,38vh,380px)}}
`

    /** fetch 包一层：HTTP 错和 {ok:false} 都变成异常，避免「失败被当成成功」。 */
    const request = async (path, init) => {
      const res = await fetch(API + path, Object.assign({ credentials: 'same-origin' }, init || {}))
      let body = null
      try { body = await res.json() } catch { /* 非 JSON 也按失败处理 */ }
      if (!res.ok || !body || body.ok === false) {
        throw new Error((body && body.error) || ('HTTP ' + res.status))
      }
      return body
    }

    const fmtTime = (ms) => {
      const total = Math.max(0, Math.round((Number(ms) || 0) / 1000))
      return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0')
    }
    const listOf = (value) => (Array.isArray(value) ? value : [])
    /** 滑杆填充比例（0–100 的百分比字符串） */
    const percentOf = (value, total) => {
      if (!(Number(total) > 0)) return '0%'
      return Math.max(0, Math.min(100, (Number(value) || 0) / Number(total) * 100)).toFixed(2) + '%'
    }
    const setting = (key, fallback) => {
      try { return window.localStorage.getItem(key) || fallback } catch { return fallback }
    }
    const saveSetting = (key, value) => {
      try { window.localStorage.setItem(key, value); return true } catch { return false }
    }

    /** 把「上次读到的秒数 + 已经过去多久」插值成本地时钟，进度条/歌词才不会一格一格跳 */
    const usePlayhead = (status, pos) => {
      const [tick, setTick] = React.useState(0)
      React.useEffect(() => {
        const timer = setInterval(() => setTick((n) => n + 1), 250)
        return () => clearInterval(timer)
      }, [])
      const matches = !pos || !pos.songId || pos.songId === String(status && status.track && status.track.id || '')
      const playing = matches && pos && typeof pos.playing === 'boolean' ? pos.playing : Boolean(status && status.playing)
      const fresh = pos && matches && Date.now() - pos.at < 8000
      const base = fresh && Number.isFinite(pos.position) ? pos.position : null
      const at = pos && pos.at ? pos.at : 0
      const total = (matches && pos && pos.duration) || Math.round((Number(status && status.track && status.track.durationMs) || 0) / 1000)
      if (base === null) return { current: null, total, playing, tick }
      // 客户端播放条只显示到秒（向下取整），补 0.35 秒，歌词高亮才不会总慢半拍
      const elapsed = playing && at ? Math.min(5, Math.max(0, (Date.now() - at) / 1000)) : 0
      const current = base + elapsed + (playing && base !== null ? 0.35 : 0)
      return { current: Math.min(total || Infinity, current), total, playing, tick }
    }

    const NowCard = (props) => {
      const { status, pos, busy, onControl } = props
      const track = (status && status.track) || {}
      const playing = Boolean(status && status.playing)
      const cover = track.cover || ''
      const head = usePlayhead(status, pos)
      // 拖动时先用本地值，松手才发请求 —— 否则滑一下会打出几十个 setVolume / seek
      const [draggingVol, setDraggingVol] = React.useState(null)
      const [draggingPos, setDraggingPos] = React.useState(null)
      const actualVol = Math.round((status && status.volume ? status.volume : 0) * 100)
      const volume = draggingVol === null ? actualVol : draggingVol
      const durationSec = Math.max(1, head.total || Math.round((Number(track.durationMs) || 0) / 1000))
      const shown = draggingPos === null ? head.current : draggingPos
      const commitVolume = () => {
        if (draggingVol === null) return
        onControl('volume', draggingVol)
        setDraggingVol(null)
      }
      const commitSeek = () => {
        if (draggingPos === null) return
        onControl('seek', Math.round(draggingPos))
        setDraggingPos(null)
      }
      return h('div', { className: 'nm-card' },
        h('div', { className: 'nm-now' },
          cover
            ? h('img', { className: 'nm-cover', src: cover, alt: track.name ? track.name + ' 封面' : '封面' })
            : h('div', { className: 'nm-cover ph' }, '♫'),
          h('div', { className: 'nm-grow' },
            h('div', { className: 'nm-kicker' }, playing ? '正在播放' : '已暂停 / 未开始'),
            h('div', { className: 'nm-song' }, track.name || '还没读到歌曲'),
            h('div', { className: 'nm-artist' }, track.artists || '先在客户端里放一首，或点下面的「启动客户端」'),
            h('div', { className: 'nm-meta' },
              [track.album, track.durationMs ? fmtTime(track.durationMs) : '',
                status ? '队列 ' + (status.queueIndex + 1) + ' / ' + status.queueTotal : '',
                status && status.modeLabel].filter(Boolean).join(' · ')),
            h('div', { className: 'nm-progress' },
              h('div', { className: 'nm-seek-wrap' },
                h('input', {
                  className: 'nm-slider nm-seek', type: 'range', min: 0, max: durationSec,
                  step: 0.1,
                  value: shown === null ? 0 : Number(shown.toFixed(1)),
                  style: { '--fill': percentOf(shown, durationSec) },
                  disabled: Boolean(busy),
                  onChange: (e) => setDraggingPos(Number(e.target.value)),
                  onMouseUp: commitSeek,
                  onTouchEnd: commitSeek,
                  onKeyUp: commitSeek,
                  'aria-label': '播放进度',
                }),
                draggingPos === null ? null : h('span', {
                  className: 'nm-seek-tip',
                  style: { left: percentOf(draggingPos, durationSec) },
                }, fmtTime(draggingPos * 1000))
              ),
              h('div', { className: 'nm-time' },
                h('b', null, shown === null ? '--:--' : fmtTime(shown * 1000)),
                h('span', { className: 'nm-sub' },
                  head.current === null
                    ? '客户端没给出进度（拖动仍可跳转）'
                    : fmtTime(durationSec * 1000)))
            ),
            h('div', { className: 'nm-ctl' },
              h('button', { className: 'nm-btn nm-round', title: '上一首', disabled: Boolean(busy), onClick: () => onControl('prev') }, '⏮'),
              h('button', { className: 'nm-play', title: playing ? '暂停' : '播放', disabled: Boolean(busy), onClick: () => onControl('toggle') }, playing ? '⏸' : '▶'),
              h('button', { className: 'nm-btn nm-round', title: '下一首', disabled: Boolean(busy), onClick: () => onControl('next') }, '⏭'),
              h('button', { className: 'nm-btn nm-round', title: '喜欢这首歌', disabled: Boolean(busy), onClick: () => onControl('like') }, '♡')
            ),
            h('div', { className: 'nm-field' },
              h('label', { className: 'nm-label' }, '音量 ' + volume + '%'),
              h('div', { className: 'nm-row' },
                h('input', {
                  className: 'nm-slider nm-vol-slider', type: 'range', min: 0, max: 100,
                  value: volume,
                  style: { '--fill': percentOf(volume, 100) },
                  disabled: Boolean(busy),
                  'aria-label': '音量',
                  onChange: (e) => setDraggingVol(Number(e.target.value)),
                  onMouseUp: commitVolume,
                  onTouchEnd: commitVolume,
                  onKeyUp: commitVolume,
                }),
                h('select', {
                  className: 'nm-select', value: (status && status.mode) || 'playRandom',
                  disabled: Boolean(busy),
                  onChange: (e) => onControl('mode', e.target.value),
                }, MODES.map(([value, label]) => h('option', { key: value, value }, label)))
              )
            )
          )
        )
      )
    }

    const QueueCard = (props) => {
      const { status, busy, onControl } = props
      const items = listOf(status && status.queue && status.queue.items)
      const current = status && status.track ? String(status.track.id) : ''
      const [query, setQuery] = React.useState('')
      const keyword = query.trim().toLowerCase()
      const matches = keyword ? items.filter((it) => ((it.name || '') + ' ' + (it.artists || '')).toLowerCase().includes(keyword)) : []
      const renderItem = (it) => h('div', {
        key: String(it.id) + '-' + it.index,
        className: 'nm-item' + (String(it.id) === current ? ' on' : ''),
      },
        h('span', { className: 'nm-idx' }, it.index + 1),
        h('div', { className: 'nm-main', role: 'button', tabIndex: 0,
          style: { cursor: 'pointer' }, title: '播这一首（原队列第 ' + (it.index + 1) + ' 首）',
          onClick: () => onControl('jump', it.index),
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onControl('jump', it.index) } },
        },
          h('div', { className: 'nm-name' }, it.name || '（未知歌曲）'),
          h('div', { className: 'nm-by' }, it.artists || '—')),
        h('button', { className: 'nm-btn tiny', disabled: Boolean(busy), onClick: () => onControl('jump', it.index) }, '播放')
      )
      return h('div', { className: 'nm-card' },
        h('div', { className: 'nm-card-h' },
          h('h2', null, '播放队列'),
          h('span', { className: 'nm-sub' },
            '共 ' + ((status && status.queueTotal) || 0) + ' 首' + (items.length < (status && status.queueTotal ? status.queueTotal : 0) ? ' · 只列前 ' + items.length + ' 首' : '')),
          h('div', { className: 'nm-grow' })
        ),
        h('div', { className: 'nm-row', style: { marginBottom: 12 } },
          h('input', {
            className: 'nm-input nm-grow', type: 'search', placeholder: '搜索播放队列中的歌名 / 歌手',
            'aria-label': '搜索播放队列', value: query,
            onChange: (e) => setQuery(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Escape') setQuery('') },
          }),
          query ? h('button', { className: 'nm-btn tiny', onClick: () => setQuery('') }, '清空') : null
        ),
        keyword ? h('section', { 'aria-label': '播放队列搜索结果', style: { marginBottom: 16 } },
          h('div', { className: 'nm-sub', style: { marginBottom: 8 } }, '搜索结果 · ' + matches.length + ' 首（下方原队列保持不变）'),
          matches.length
            ? h('div', { className: 'nm-list', style: { maxHeight: 260 } }, matches.map(renderItem))
            : h('div', { className: 'nm-hint' }, '没有匹配的歌曲')
        ) : null,
        items.length
          ? h('div', { className: 'nm-list', 'aria-label': '完整播放队列', key: 'original-queue' }, items.map(renderItem))
          : h('div', { className: 'nm-hint' }, '队列是空的 —— 放一首歌就有了')
      )
    }

    const SearchCard = (props) => {
      const { busy, playlists, run, notify } = props
      const [kind, setKind] = React.useState('song')
      const [keyword, setKeyword] = React.useState('')
      const [results, setResults] = React.useState([])
      const [target, setTarget] = React.useState('')
      const [searched, setSearched] = React.useState(false)
      const owned = listOf(playlists).filter((p) => p.owned)

      const doSearch = async () => {
        const value = String(keyword || '').trim()
        if (!value) return
        const out = await run('netease_search', { keyword: value, type: kind, limit: 30 })
        if (out) { setResults(listOf(out.items)); setSearched(true) }
      }

      const playOne = async (item) => {
        if (kind === 'song') await run('netease_play', { songId: String(item.id) })
        else await run('netease_play', { playlistId: String(item.id) })
      }

      const addOne = async (item) => {
        if (!target) return notify('先在上面选一个自己的歌单', 'warn')
        const out = await run('netease_playlist_add', { playlistId: String(target), songIds: [String(item.id)] })
        if (out) notify('已加进歌单', 'ok')
      }

      return h('div', { className: 'nm-card' },
        h('div', { className: 'nm-card-h' },
          h('h2', null, '搜索'),
          h('div', { className: 'nm-grow' }),
          h('div', { className: 'nm-tabs' },
            h('button', { className: 'nm-tab' + (kind === 'song' ? ' on' : ''), onClick: () => setKind('song') }, '歌曲'),
            h('button', { className: 'nm-tab' + (kind === 'playlist' ? ' on' : ''), onClick: () => setKind('playlist') }, '歌单'),
            h('button', { className: 'nm-tab' + (kind === 'artist' ? ' on' : ''), onClick: () => setKind('artist') }, '歌手')
          )
        ),
        h('div', { className: 'nm-row' },
          h('input', {
            className: 'nm-input nm-grow', placeholder: '歌名 / 歌手 / 歌单名，回车搜索',
            value: keyword, onChange: (e) => setKeyword(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') doSearch() },
          }),
          h('button', { className: 'nm-btn primary', disabled: Boolean(busy), onClick: doSearch }, '搜索')
        ),
        kind === 'song' && owned.length
          ? h('div', { className: 'nm-field' },
            h('label', { className: 'nm-label' }, '搜索结果里的「加入」写到哪个歌单'),
            h('select', { className: 'nm-select', value: target, onChange: (e) => setTarget(e.target.value) },
              h('option', { value: '' }, '（先选一个自己的歌单）'),
              owned.map((p) => h('option', { key: p.id, value: String(p.id) }, p.name))))
          : null,
        results.length
          ? h('div', { className: 'nm-list', style: { marginTop: 12 } }, results.map((it) => h('div', { className: 'nm-item', key: String(it.id) },
            h('div', { className: 'nm-main' },
              h('div', { className: 'nm-name' }, it.name || '（无名）'),
              h('div', { className: 'nm-by' },
                [it.artists, it.album, it.trackCount ? it.trackCount + ' 首' : '',
                  it.creator || it.owner || ''].filter(Boolean).join(' · '))),
            h('button', { className: 'nm-btn tiny', disabled: Boolean(busy), onClick: () => playOne(it) }, '播放'),
            kind === 'song'
              ? h('button', { className: 'nm-btn tiny', disabled: Boolean(busy), onClick: () => addOne(it) }, '加入')
              : null
          )))
          : h('div', { className: 'nm-hint' }, searched ? '没搜到东西' : '搜点什么试试：歌名、歌手、歌单都行')
      )
    }

    const PlaylistCard = (props) => {
      const { busy, playlists, run, notify, reloadPlaylists } = props
      const [selected, setSelected] = React.useState(null)
      const [tracks, setTracks] = React.useState([])
      const [name, setName] = React.useState('')
      const [filter, setFilter] = React.useState('')

      const open = async (pl) => {
        setSelected(pl)
        setTracks([])
        setFilter('')
        const out = await run('netease_playlist_tracks', { playlistId: String(pl.id), limit: 5000 })
        setTracks(out ? listOf(out.tracks) : [])
      }

      const create = async () => {
        const value = String(name || '').trim()
        if (!value) return
        const out = await run('netease_playlist_create', { name: value })
        if (out) { setName(''); await reloadPlaylists(); notify('歌单建好了', 'ok') }
      }

      const remove = async (track) => {
        if (!selected) return
        if (!window.confirm('从歌单「' + selected.name + '」里删掉《' + (track.name || track.id) + '》？')) return
        const out = await run('netease_playlist_remove', { playlistId: String(selected.id), songIds: [String(track.id)] })
        if (out) {
          setTracks((prev) => prev.filter((x) => String(x.id) !== String(track.id)))
          await reloadPlaylists()
          notify('已删除', 'ok')
        }
      }

      // 歌单内搜索：本地过滤已经载入的整张歌单，不发请求，输入即时生效
      const keyword = String(filter || '').trim().toLowerCase()
      const matched = keyword
        ? tracks.filter((t) => ((t.name || '') + ' ' + (t.artists || '')).toLowerCase().includes(keyword))
        : tracks
      const rows = matched.map((t, i) => h('div', { className: 'nm-item', key: String(t.id) + '-' + i },
        h('span', { className: 'nm-idx' }, keyword ? '·' : i + 1),
        h('div', { className: 'nm-main' },
          h('div', { className: 'nm-name' }, t.name || '（未知歌曲）'),
          h('div', { className: 'nm-by' }, t.artists || '—')),
        h('button', { className: 'nm-btn tiny', disabled: Boolean(busy), onClick: () => run('netease_play', { songId: String(t.id) }) }, '播放'),
        selected && selected.owned
          ? h('button', { className: 'nm-btn tiny danger', disabled: Boolean(busy), onClick: () => remove(t) }, '删除')
          : null
      ))

      let body = h('div', { className: 'nm-hint' }, '点上面的歌单，展开里面的歌')
      if (selected) {
        const loaded = ' · 载入 ' + tracks.length + ' 首'
          + (selected.trackCount && tracks.length < selected.trackCount ? ' / 共 ' + selected.trackCount + ' 首' : '')
        body = h('div', null,
          h('div', { className: 'nm-row nm-playlist-bar', style: { margin: '10px 0' } },
            h('div', { className: 'nm-main' },
              h('div', { className: 'nm-name' }, selected.name),
              h('div', { className: 'nm-by' },
                (selected.owned ? '自己的歌单' : '收藏的歌单（只能播，不能改）') + loaded
                + (keyword ? ' · 匹配 ' + matched.length + ' 首' : ''))),
            h('div', { className: 'nm-playlist-actions' },
              h('input', {
                className: 'nm-input nm-track-search', type: 'search',
                placeholder: '搜歌单里的歌名 / 歌手', value: filter,
                'aria-label': '在歌单里搜索',
                onChange: (e) => setFilter(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Escape') setFilter('') },
              }),
              h('button', {
                className: 'nm-btn primary',
                disabled: Boolean(busy),
                onClick: () => run('netease_play', { playlistId: String(selected.id) }),
              }, '播放这个歌单')
            )
          ),
          tracks.length
            ? (matched.length
              ? h('div', { className: 'nm-list' }, rows)
              : h('div', { className: 'nm-hint' }, '这个歌单里没有匹配「' + String(filter).trim() + '」的歌'))
            : h('div', { className: 'nm-hint' }, '这个歌单里没有歌')
        )
      }

      return h('div', { className: 'nm-card' },
        h('div', { className: 'nm-card-h' },
          h('h2', null, '我的歌单'),
          h('span', { className: 'nm-sub' }, listOf(playlists).length + ' 个'),
          h('div', { className: 'nm-grow' })
        ),
        h('div', { className: 'nm-row' },
          h('input', {
            className: 'nm-input nm-grow', placeholder: '新歌单名字',
            value: name, onChange: (e) => setName(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') create() },
          }),
          h('button', { className: 'nm-btn', disabled: Boolean(busy) || !name.trim(), onClick: create }, '新建')
        ),
        h('div', { className: 'nm-pills', style: { marginTop: 12 } },
          listOf(playlists).map((p) => h('button', {
            key: p.id,
            className: 'nm-pill' + (selected && String(selected.id) === String(p.id) ? ' on' : ''),
            title: (p.owned ? '自己的歌单' : '收藏的歌单') + ' · ' + (p.trackCount || 0) + ' 首',
            onClick: () => open(p),
          }, p.name))
        ),
        body
      )
    }

    const LyricCard = (props) => {
      const { status, pos, call, lyricSize, onLyricSize } = props
      const trackId = status && status.track ? String(status.track.id) : ''
      const [data, setData] = React.useState(null)
      const [note, setNote] = React.useState('')
      const [showTr, setShowTr] = React.useState(true)
      const boxRef = React.useRef(null)
      const manualUntil = React.useRef(0)
      const [retry, setRetry] = React.useState(0)

      React.useEffect(() => {
        if (!trackId) { setData(null); setNote(''); return undefined }
        let alive = true
        setData(null); setNote('')
        call('netease_lyric', { songId: trackId })
          .then((out) => { if (alive) setData(out) })
          .catch((e) => { if (alive) setNote('歌词没取到：' + String((e && e.message) || e)) })
        return () => { alive = false }
      }, [trackId, call, retry])

      const head = usePlayhead(status, pos)
      // 切歌的那次 render 不显示上一首歌词；API 的“暂无歌词”占位不算正式歌词。
      const currentData = data && String(data.songId || data.id) === trackId ? data : null
      const lines = listOf(currentData && currentData.lines).filter((x) => !/^(暂无歌词|纯音乐[，,]?请欣赏|纯音乐|No lyrics)$/i.test(String(x.text).trim()))
      let active = -1
      if (head.current !== null) {
        for (let i = 0; i < lines.length; i += 1) {
          if (lines[i].time <= head.current * 1000) active = i
          else break
        }
      }

      React.useEffect(() => {
        const box = boxRef.current
        if (!box || active < 0 || Date.now() < manualUntil.current) return
        const el = box.querySelector('[data-on="1"]')
        if (el) {
          const lineRect = el.getBoundingClientRect()
          const boxRect = box.getBoundingClientRect()
          box.scrollTop = Math.max(0, box.scrollTop + lineRect.top - boxRect.top - box.clientHeight / 2 + lineRect.height / 2)
        }
      }, [trackId, active, lines.length, showTr, lyricSize])

      const hasTr = Boolean(currentData && currentData.hasTranslation)
      return h('div', { className: 'nm-card' },
        h('div', { className: 'nm-card-h' },
          h('h2', null, '歌词'),
          h('span', { className: 'nm-sub' }, note ? '载入失败' : currentData ? (lines.length ? lines.length + ' 行' : '纯音乐 / 暂无歌词') : (trackId ? '载入中…' : '')),
          trackId ? h('button', { className: 'nm-btn tiny', onClick: () => setRetry((n) => n + 1) }, '重试') : null,
          h('span', { className: 'nm-theme-label' }, '字号'),
          h('select', { className: 'nm-select', value: lyricSize, onChange: (e) => onLyricSize(e.target.value) },
            h('option', { value: 'small' }, '小'), h('option', { value: 'medium' }, '中'), h('option', { value: 'large' }, '大')),
          h('div', { className: 'nm-grow' }),
          hasTr ? h('button', {
            className: 'nm-btn tiny' + (showTr ? ' primary' : ''),
            onClick: () => setShowTr((v) => !v),
          }, showTr ? '隐藏翻译' : '显示翻译') : null
        ),
        note ? h('div', { className: 'nm-hint' }, note) : null,
        lines.length
          ? h('div', { className: 'nm-lyric', ref: boxRef,
            onWheel: () => { manualUntil.current = Date.now() + 5000 },
            onTouchStart: () => { manualUntil.current = Date.now() + 5000 },
          },
            lines.map((line, i) => h('div', {
              key: line.time + '-' + i,
              className: 'nm-lyric-line' + (i === active ? ' on' : ''),
              'data-on': i === active ? '1' : '0',
              title: '跳到这一句',
              onClick: () => props.onSeek(Math.floor(line.time / 1000)),
            },
            line.text,
            showTr && line.tr ? h('small', null, line.tr) : null)))
          : h('div', { className: 'nm-hint' },
            note ? '可以点击「重试」重新载入' : trackId ? (currentData ? '这首歌暂未提供歌词' : '正在取歌词…') : '放一首歌，歌词会出现在这里')
      )
    }

    // 坐标在原图中计算；缩放和平移始终限制在有效图像范围内，避免导出黑边。
    const cropRegion = (width, height, ratio, zoom, x, y) => {
      const w = Math.min(width, height * ratio) / zoom
      const h = w / ratio
      return { x: Math.max(0, Math.min(width - w, (width - w) * x)), y: Math.max(0, Math.min(height - h, (height - h) * y)), w, h }
    }

    /** 窗口比例和图片比例差得多就用 contain（完整显示 + 模糊填充），否则铺满 */
    const backgroundFit = (viewRatio, bgRatio) => {
      if (!(bgRatio > 0) || !(viewRatio > 0)) return 'cover'
      return Math.abs(Math.log(viewRatio / bgRatio)) > 0.22 ? 'contain' : 'cover'
    }

    const BackgroundCrop = ({ image, onApply, onCancel }) => {
      const [zoom, setZoom] = React.useState(1)
      const [ratio, setRatio] = React.useState(16 / 9)
      const [position, setPosition] = React.useState({ x: 0.5, y: 0.5 })
      const [error, setError] = React.useState('')
      const drag = React.useRef(null)
      const w = image.naturalWidth, hgt = image.naturalHeight
      const region = cropRegion(w, hgt, ratio, zoom, position.x, position.y)
      const reset = () => { setZoom(1); setPosition({ x: 0.5, y: 0.5 }) }
      const apply = () => {
        try {
          const canvas = document.createElement('canvas')
          const scale = Math.min(1, 2560 / region.w, 2560 / region.h)
          canvas.width = Math.max(1, Math.round(region.w * scale))
          canvas.height = Math.max(1, Math.round(region.h * scale))
          const context = canvas.getContext('2d')
          if (!context) throw new Error('浏览器无法创建图片画布')
          context.drawImage(image, region.x, region.y, region.w, region.h, 0, 0, canvas.width, canvas.height)
          onApply(canvas.toDataURL('image/jpeg', 0.9), ratio)
        } catch (e) { setError('裁剪失败：' + String(e.message || e)) }
      }
      return h('div', { className: 'nm-crop-overlay', onKeyDown: (e) => { if (e.key === 'Escape') onCancel() } },
        h('section', { className: 'nm-crop-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': '背景图片裁剪' },
          h('h2', null, '调整背景图'),
          h('p', { className: 'nm-sub' }, '拖动图片选择区域，使用滑杆缩放。框内区域将被保存；窗口比例不同时背景仍会居中铺满。'),
          h('div', { className: 'nm-crop-preview', style: { aspectRatio: String(ratio), width: 'min(100%, 520px, ' + (46 * ratio) + 'vh)' },
            onPointerDown: (e) => {
              if (e.button !== undefined && e.button !== 0) return
              e.preventDefault()
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, pos: position, rect: e.currentTarget.getBoundingClientRect() }
            },
            onPointerMove: (e) => {
              const d = drag.current
              if (!d || d.id !== e.pointerId) return
              const dx = (e.clientX - d.x) * region.w / d.rect.width
              const dy = (e.clientY - d.y) * region.h / d.rect.height
              setPosition({ x: w > region.w ? Math.max(0, Math.min(1, d.pos.x - dx / (w - region.w))) : 0.5,
                y: hgt > region.h ? Math.max(0, Math.min(1, d.pos.y - dy / (hgt - region.h))) : 0.5 })
            },
            onPointerUp: () => { drag.current = null }, onPointerCancel: () => { drag.current = null },
            onLostPointerCapture: () => { drag.current = null },
          }, h('img', { src: image.src, alt: '背景裁剪预览', draggable: false,
            style: { width: (w / region.w * 100) + '%', height: (hgt / region.h * 100) + '%', left: (-region.x / region.w * 100) + '%', top: (-region.y / region.h * 100) + '%' } }),
          h('div', { className: 'nm-crop-grid', 'aria-hidden': true })),
          h('label', { className: 'nm-row' }, '缩放 ' + zoom.toFixed(2) + '×',
            h('input', { type: 'range', className: 'nm-slider', 'aria-label': '背景缩放', min: 1, max: 5, step: 0.01, value: zoom, style: { '--fill': percentOf(zoom - 1, 4) }, onChange: (e) => setZoom(Number(e.target.value)) })),
          h('label', { className: 'nm-row' }, '裁剪比例',
            h('select', { className: 'nm-select', value: ratio, onChange: (e) => { setRatio(Number(e.target.value)); reset() } },
              [[16 / 9, '横屏 16:9'], [4 / 3, '横屏 4:3'], [1, '方形 1:1'], [9 / 16, '竖屏 9:16'], [w / hgt, '原图比例']].map(([value, label], i) => h('option', { value, key: i }, label)))),
          h('label', { className: 'nm-row' }, '水平位置', h('input', { type: 'range', className: 'nm-slider', 'aria-label': '裁剪水平位置', min: 0, max: 1, step: 0.001, value: position.x, style: { '--fill': percentOf(position.x, 1) }, onChange: (e) => setPosition({ ...position, x: Number(e.target.value) }) })),
          h('label', { className: 'nm-row' }, '垂直位置', h('input', { type: 'range', className: 'nm-slider', 'aria-label': '裁剪垂直位置', min: 0, max: 1, step: 0.001, value: position.y, style: { '--fill': percentOf(position.y, 1) }, onChange: (e) => setPosition({ ...position, y: Number(e.target.value) }) })),
          error ? h('p', { role: 'alert' }, error) : null,
          h('div', { className: 'nm-row' },
            h('button', { className: 'nm-btn', onClick: reset }, '重置'),
            h('div', { className: 'nm-grow' }),
            h('button', { className: 'nm-btn', autoFocus: true, onClick: onCancel }, '取消'),
            h('button', { className: 'nm-btn primary', onClick: apply }, '确认裁剪并应用'))))
    }

    const Panel = () => {
      const [csrf, setCsrf] = React.useState('')
      const [status, setStatus] = React.useState(null)
      const [snap, setSnap] = React.useState(null)
      const [pos, setPos] = React.useState(null)
      const snapRef = React.useRef(null)
      snapRef.current = snap
      const [playlists, setPlaylists] = React.useState([])
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [toast, setToast] = React.useState(null)
      const [theme, setTheme] = React.useState(() => ['dark', 'light', 'transparent'].includes(setting('dsh-nm-theme', 'dark')) ? setting('dsh-nm-theme', 'dark') : 'dark')
      const [bgImage, setBgImage] = React.useState(() => setting('dsh-nm-bg', ''))
      const [bgRatio, setBgRatio] = React.useState(() => Number(setting('dsh-nm-bg-ratio', '0')) || 0)
      const [viewport, setViewport] = React.useState({ w: 1, h: 1 })
      const rootRef = React.useRef(null)
      React.useEffect(() => {
        const el = rootRef.current
        if (!el) return undefined
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver((entries) => {
            const box = entries[0] && entries[0].contentRect
            if (box && box.width > 1 && box.height > 1) setViewport({ w: box.width, h: box.height })
          })
          observer.observe(el)
          return () => observer.disconnect()
        }
        if (!window.addEventListener) return undefined
        const onResize = () => setViewport({ w: window.innerWidth || 1, h: window.innerHeight || 1 })
        onResize()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [])
      const [lyricSize, setLyricSize] = React.useState(() => ['small', 'medium', 'large'].includes(setting('dsh-nm-lyric-size', 'small')) ? setting('dsh-nm-lyric-size', 'small') : 'small')

      const [cropImage, setCropImage] = React.useState(null)
      const importSequence = React.useRef(0)
      React.useEffect(() => () => { importSequence.current += 1 }, [])
      const applyBackground = (value, ratio) => {
        setBgImage(value)
        if (Number.isFinite(ratio) && ratio > 0) { setBgRatio(ratio); saveSetting('dsh-nm-bg-ratio', String(ratio)) }
        const saved = saveSetting('dsh-nm-bg', value)
        if (!saved) { try { window.localStorage.removeItem('dsh-nm-bg') } catch { /* 不可用 */ } }
        setError(saved ? '' : '背景已应用，但浏览器存储空间不足，刷新后需重新导入。建议使用较小图片。')
        setCropImage(null)
      }
      const changeTheme = (value) => { setTheme(value); saveSetting('dsh-nm-theme', value) }
      const changeLyricSize = (value) => { setLyricSize(value); saveSetting('dsh-nm-lyric-size', value) }
      const importBackground = (event) => {
        const file = event.target.files && event.target.files[0]
        if (!file) return
        if (!String(file.type || '').startsWith('image/')) { setError('请选择图片文件'); return }
        if (file.size > 8 * 1024 * 1024) { setError('背景图不能超过 8 MB'); return }
        const sequence = ++importSequence.current
        const reader = new FileReader()
        reader.onload = () => {
          if (sequence !== importSequence.current) return
          const value = String(reader.result || '')
          const image = new Image()
          image.onload = () => {
            if (sequence !== importSequence.current) return
            if (!image.naturalWidth || !image.naturalHeight) { setError('图片尺寸无效'); return }
            setCropImage(image)
            setError('')
          }
          image.onerror = () => setError('无法解码该图片，请选择 PNG、JPEG 或 WebP 图片')
          image.src = value
        }
        reader.onerror = () => setError('背景图读取失败')
        reader.readAsDataURL(file)
        event.target.value = ''
      }
      const clearBackground = () => { setBgImage(''); setBgRatio(0); saveSetting('dsh-nm-bg', ''); saveSetting('dsh-nm-bg-ratio', '') }

      const notify = React.useCallback((text, tone) => {
        setToast({ text, tone: tone || 'ok' })
      }, [])

      React.useEffect(() => {
        if (!toast) return undefined
        const timer = setTimeout(() => setToast(null), 2600)
        return () => clearTimeout(timer)
      }, [toast])

      /** 底层请求：不碰 busy —— 轮询用它，否则按钮每 2 秒闪一下灰 */
      const post = React.useCallback(async (tool, args) => {
        if (!csrf) throw new Error('面板还没连上，点右上角「刷新」重试')
        return await request('/action', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-netease-csrf': csrf },
          body: JSON.stringify({ tool, args: args || {} }),
        })
      }, [csrf])

      const call = React.useCallback(async (tool, args) => {
        setBusy(tool)
        try {
          return await post(tool, args)
        } finally {
          setBusy('')
        }
      }, [post])

      /** netease_status 把播放快照放在 .playing 里；netease_now_playing 直接就是快照；
       *  netease_playback 把动作后的快照放在 .after 里。 */
      const snapshotOf = (value) => {
        if (!value) return null
        if (value.track) return value
        if (value.after) return value.after
        return value.playing || null
      }

      // 动作返回的是摘要，没有 queue；不能直接替换，否则列表会先卸载再重建、滚回顶部。
      const mergeSnapshot = (previous, next) => {
        if (!next) return previous
        const merged = Object.assign({}, previous || {}, next)
        if (previous && previous.queue && next.queue &&
            JSON.stringify(previous.queue.items) === JSON.stringify(next.queue.items)) {
          merged.queue = Object.assign({}, next.queue, { items: previous.queue.items })
        }
        return merged
      }

      /** 只刷播放快照（带整份队列），不清空已有列表。 */
      const reloadSnap = React.useCallback(async () => {
        try {
          const out = await post('netease_now_playing', {})
          setSnap((prev) => mergeSnapshot(prev, snapshotOf(out)))
          if (out && Number.isFinite(out.position)) {
            setPos((prev) => prev && prev.at > out.positionAt ? prev : { position: out.position, duration: out.durationSec, at: out.positionAt, playing: out.playing, songId: String(out.track && out.track.id || '') })
          }
        } catch { /* 客户端没开时保持旧画面，不弹错 */ }
      }, [post])

      /** 只读进度（轻量，2 秒一次），进度条靠它 + 本地插值 */
      const reloadPos = React.useCallback(async () => {
        try {
          const out = await post('netease_position')
          if (out && out.position !== null && out.position !== undefined) {
            setPos((prev) => prev && prev.at > out.at ? prev : out)
            if (out.songId && out.songId !== String(snapRef.current && snapRef.current.track && snapRef.current.track.id || '')) {
              // 轻量接口发现切歌，立即刷新曲目与歌词。
              await reloadSnap()
            } else if (typeof out.playing === 'boolean') {
              setSnap((prev) => prev ? Object.assign({}, prev, { playing: out.playing }) : prev)
            }
          } else {
            setPos((prev) => (prev && prev.missing ? prev : { position: null, duration: null, at: Date.now(), missing: true }))
          }
        } catch { /* 旧样本会在 8 秒后自动失效，不无限向前走。 */ }
      }, [post, reloadSnap])

      /** 面板里所有动作都走这里：失败统一显示成红色条，不静默吞掉 */
      const run = React.useCallback(async (tool, args) => {
        setError('')
        try {
          const out = await call(tool, args)
          if (tool === 'netease_playlist_add' || tool === 'netease_playlist_remove' || tool === 'netease_playlist_create') {
            // 歌单改动由调用方自己刷新，这里不动播放画面
            return out
          }
          if (['netease_playback', 'netease_play'].includes(tool)) {
            setSnap((prev) => mergeSnapshot(prev, snapshotOf(out)))
            // 队列内切歌只合并摘要，保留原列表和滚动位置；新点播才需要取新队列。
            if (tool === 'netease_play') await reloadSnap()
          } else if (['netease_launch', 'netease_login'].includes(tool)) {
            const fresh = await call('netease_status')
            setStatus(fresh)
            setSnap(snapshotOf(fresh))
            await reloadSnap()
          }
          return out
        } catch (e) {
          setError(String((e && e.message) || e))
          return null
        }
      }, [call, reloadSnap])

      const reloadPlaylists = React.useCallback(async () => {
        try {
          const out = await call('netease_playlists', { limit: 100 })
          setPlaylists(listOf(out.items))
        } catch (e) {
          setError(String((e && e.message) || e))
        }
      }, [call])

      const bootstrap = React.useCallback(async () => {
        setError('')
        try {
          const out = await request('/bootstrap')
          const token = out.csrfToken || ''
          setCsrf(token)
          setStatus(out.status || null)
          setSnap(snapshotOf(out.status))
          const fresh = await request('/action', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-netease-csrf': token },
            body: JSON.stringify({ tool: 'netease_playlists', args: { limit: 100 } }),
          })
          setPlaylists(listOf(fresh.items))
          try {
            const playing = await request('/action', {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-netease-csrf': token },
              body: JSON.stringify({ tool: 'netease_now_playing', args: {} }),
            })
            setSnap(snapshotOf(playing))
            if (playing && Number.isFinite(playing.position)) {
              setPos({ position: playing.position, duration: playing.durationSec, at: playing.positionAt, playing: playing.playing, songId: String(playing.track && playing.track.id || '') })
            }
          } catch { /* 客户端没开：保留 status 里的快照（可能为 null） */ }
          try {
            const p = await request('/action', {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-netease-csrf': token },
              body: JSON.stringify({ tool: 'netease_position', args: {} }),
            })
            if (p && p.position !== null) setPos(p)
          } catch { /* 同上 */ }
        } catch (e) {
          setError(String((e && e.message) || e))
        }
      }, [])

      React.useEffect(() => { bootstrap() }, [bootstrap])

      /* 两条轮询：
       *   · 队列/歌曲 10 秒一次（整份队列有点大，别太勤）
       *   · 播放进度 1 秒一次（只是读一次 DOM 文本，很轻），中间前端插值成 0.25 秒一跳 */
      React.useEffect(() => {
        if (!csrf) return undefined
        const snapTimer = setInterval(() => { reloadSnap() }, 10000)
        const posTimer = setInterval(() => { reloadPos() }, 1000)
        return () => { clearInterval(snapTimer); clearInterval(posTimer) }
      }, [csrf, reloadSnap, reloadPos])

      const onControl = React.useCallback((action, value) => {
        const args = action === 'mode' ? { action, mode: String(value) } : { action }
        if (value !== undefined && action !== 'mode') args.value = value
        run('netease_playback', args)
      }, [run])

      const login = (status && status.login) || {}
      const client = (status && status.client) || {}
      const cdpReady = Boolean(client.cdp && client.cdp.ready)
      const loginName = login.nickname || (login.uid ? String(login.uid) : '')
      const loggedIn = Boolean(login.loggedIn || loginName)

      const rootClass = 'nm-root ' + (bgImage ? 'has-bg ' : '') + 'nm-font-size-' + lyricSize
      /* 背景铺法随窗口比例自适应：比例接近就铺满，差得多就完整显示 + 模糊填充，
         这样窗口化缩小/拉宽时不会只看到图片中间一条。 */
      const viewRatio = viewport.h > 1 ? viewport.w / viewport.h : 0
      const bgFit = backgroundFit(viewRatio, bgRatio)
      return h('div', { className: rootClass, 'data-theme': theme, ref: rootRef },
        bgImage ? h('div', { className: 'nm-bg', 'aria-hidden': 'true' },
          h('img', { className: 'nm-bg-blur', src: bgImage, alt: '' }),
          h('img', { className: 'nm-bg-main', src: bgImage, alt: '背景图', style: { objectFit: bgFit } })
        ) : null,
        h('div', { className: 'nm-scroll' },
        h('div', { className: 'nm-wrap' },
          h('div', { className: 'nm-top' },
            h('div', { className: 'nm-logo' }),
            h('div', null,
              h('h1', { className: 'nm-h1' }, '网易云音乐'),
              h('div', { className: 'nm-sub' }, '播放控制 · 点播 · 歌单管理')),
            h('div', { className: 'nm-grow' }),
            h('span', { className: 'nm-chip' },
              h('span', { className: 'nm-dot' + (cdpReady ? ' on' : ' warn') }),
              cdpReady ? '客户端已连接' : '未连接客户端'),
            h('span', { className: 'nm-chip' },
              h('span', { className: 'nm-dot' + (loggedIn ? ' on' : '') }),
              loggedIn ? '已登录 · ' + loginName : '未登录'),
            h('button', { className: 'nm-btn', title: '会关掉现在开着的网易云，带调试端口重开（播放会停一下）', disabled: Boolean(busy), onClick: () => run('netease_launch') }, '启动客户端'),
            h('button', { className: 'nm-btn', disabled: Boolean(busy), onClick: () => run('netease_login', { refresh: true }) }, '刷新登录'),
            h('button', { className: 'nm-btn', disabled: Boolean(busy), onClick: bootstrap }, '刷新')
          ),
          h('div', { className: 'nm-toolbar' },
            h('div', { className: 'nm-theme-row' },
              h('span', { className: 'nm-theme-label' }, '主题'),
              h('button', { className: 'nm-btn tiny' + (theme === 'dark' ? ' primary' : ''), onClick: () => changeTheme('dark') }, '深色'),
              h('button', { className: 'nm-btn tiny' + (theme === 'light' ? ' primary' : ''), onClick: () => changeTheme('light') }, '浅色'),
              h('button', { className: 'nm-btn tiny' + (theme === 'transparent' ? ' primary' : ''), onClick: () => changeTheme('transparent') }, '半透明'),
              h('label', { className: 'nm-btn tiny', title: '导入背景图片' },
                '背景图',
                h('input', { className: 'nm-file', type: 'file', accept: 'image/*', onChange: importBackground })
              ),
              bgImage ? h('button', { className: 'nm-btn tiny', onClick: clearBackground }, '清除背景') : null
            ),
            h('div', { className: 'nm-grow' }),
            h('div', { className: 'nm-note' },
              '「启动客户端」会把现在开着的网易云关掉、带调试端口重开（播放会停一下）；登录请在客户端里扫码，完了回来点「刷新登录」。')
          ),
          error ? h('div', { className: 'nm-err' }, error) : null,
          h('div', { className: 'nm-grid' },
            h('div', { className: 'nm-col' },
              h(NowCard, { status: snap, pos, busy, onControl }),
              h(LyricCard, { status: snap, pos, call: post, onSeek: (sec) => onControl('seek', sec), lyricSize, onLyricSize: changeLyricSize }),
              h(SearchCard, { busy, playlists, run, notify })
            ),
            h('div', { className: 'nm-col' },
              h(QueueCard, { status: snap, busy, onControl }),
              h(PlaylistCard, { busy, playlists, run, notify, reloadPlaylists })
            )
          )
        )
        ),
        cropImage ? h(BackgroundCrop, { image: cropImage, onApply: applyBackground, onCancel: () => setCropImage(null) }) : null,
        toast ? h('div', { className: 'nm-toast' }, toast.text) : null
      )
    }

    const Icon = () => h('span', { style: { fontSize: 16, lineHeight: 1 } }, '♫')

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-netease-music')
        style.textContent = CSS
        document.head.appendChild(style)
        if (typeof ctx.effect === 'function') ctx.effect(() => () => style.remove(), 'dsh-netease-music: 面板样式')

        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        slots.inject('sidebar.panellist', () => slots.register({
          name: 'sidebar.panellist',
          id: 'netease-music',
          order: 18,
          label: '网易云',
        }, Icon))
        slots.inject('main', () => slots.register({
          name: 'main',
          key: 'netease-music',
        }, Panel))
      },
    }
  },
})
