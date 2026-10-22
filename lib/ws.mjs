/**
 * lib/ws.mjs —— 极小的 WebSocket 客户端（只用到文本帧）
 * ============================================================================
 * 为什么要自己写：DSH 桌面版跑在 Electron 里，宿主 Node 版本不保证带全局
 * `WebSocket`（Node 22.4 才稳定）。为了**不依赖任何 npm 包**、也不挑 Node 版本，
 * 这里用 `node:net` + `node:crypto` 手搓一个够用的客户端：
 *   - 握手（RFC 6455，带上 Origin 头，CEF 的调试端口认这个）
 *   - 文本帧收发、分片重组、ping/pong、close
 * 我们只用它跑 CDP 的 JSON 文本帧，二进制帧不处理（收到就跳过）。
 * ============================================================================
 */
import net from 'node:net'
import crypto from 'node:crypto'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** 把要发的文本编码成一帧（客户端必须加掩码） */
function encodeFrame(text, opcode = 0x1) {
  const payload = Buffer.from(text, 'utf8')
  const len = payload.length
  let header
  if (len < 126) {
    header = Buffer.alloc(2)
    header[1] = 0x80 | len
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[1] = 0x80 | 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 0x80 | 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  header[0] = 0x80 | opcode // FIN + opcode
  const mask = crypto.randomBytes(4)
  const masked = Buffer.alloc(len)
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4]
  return Buffer.concat([header, mask, masked])
}

/**
 * 连一个 ws:// 地址。
 * @returns {Promise<{send:(data:any)=>void, close:()=>void, onMessage:(cb:(text:string)=>void)=>void, onClose:(cb:(err?:Error)=>void)=>void}>}
 */
export function wsConnect(url, { timeoutMs = 8000 } = {}) {
  const u = new URL(url)
  const host = u.hostname
  const port = Number(u.port || 80)
  const path = `${u.pathname}${u.search || ''}`
  const key = crypto.randomBytes(16).toString('base64')

  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port })
    let buffer = Buffer.alloc(0)
    let upgraded = false
    let messageCb = null
    let closeCb = null
    let closed = false
    let fragments = []
    let fragmentOpcode = 0

    const timer = setTimeout(() => {
      if (!upgraded) {
        socket.destroy()
        reject(new Error(`WebSocket 握手超时：${url}`))
      }
    }, timeoutMs)

    const finishClose = (err) => {
      if (closed) return
      closed = true
      clearTimeout(timer)
      try { socket.destroy() } catch { /* 已经关了 */ }
      closeCb?.(err)
    }

    socket.on('error', (err) => {
      if (!upgraded) { clearTimeout(timer); reject(err) }
      else finishClose(err)
    })
    socket.on('close', () => finishClose())

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (!upgraded) {
        const idx = buffer.indexOf('\r\n\r\n')
        if (idx < 0) return
        const head = buffer.subarray(0, idx).toString('latin1')
        buffer = buffer.subarray(idx + 4)
        if (!/^HTTP\/1\.1 101/i.test(head)) {
          clearTimeout(timer)
          reject(new Error(`WebSocket 握手被拒：${head.split('\r\n')[0]}`))
          socket.destroy()
          return
        }
        const expected = crypto.createHash('sha1').update(key + GUID).digest('base64')
        const got = /sec-websocket-accept:\s*(\S+)/i.exec(head)?.[1]
        if (got && got !== expected) {
          clearTimeout(timer)
          reject(new Error('WebSocket 握手校验失败'))
          socket.destroy()
          return
        }
        upgraded = true
        clearTimeout(timer)
        resolve({
          send: (data) => {
            if (closed) return
            const text = typeof data === 'string' ? data : JSON.stringify(data)
            socket.write(encodeFrame(text))
          },
          close: () => {
            if (closed) return
            try { socket.write(encodeFrame('', 0x8)) } catch { /* ignore */ }
            finishClose()
          },
          onMessage: (cb) => { messageCb = cb },
          onClose: (cb) => { closeCb = cb },
        })
        // 握手包后面可能已经带着帧了：直接进解析
      }
      // ── 帧解析（服务端发来的帧不加掩码）──
      while (buffer.length >= 2) {
        const b0 = buffer[0]
        const b1 = buffer[1]
        const fin = (b0 & 0x80) !== 0
        const opcode = b0 & 0x0f
        const masked = (b1 & 0x80) !== 0
        let len = b1 & 0x7f
        let offset = 2
        if (len === 126) {
          if (buffer.length < 4) return
          len = buffer.readUInt16BE(2)
          offset = 4
        } else if (len === 127) {
          if (buffer.length < 10) return
          len = Number(buffer.readBigUInt64BE(2))
          offset = 10
        }
        const maskLen = masked ? 4 : 0
        if (buffer.length < offset + maskLen + len) return
        let payload = buffer.subarray(offset + maskLen, offset + maskLen + len)
        if (masked) {
          const mask = buffer.subarray(offset, offset + 4)
          payload = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]))
        }
        buffer = buffer.subarray(offset + maskLen + len)

        if (opcode === 0x8) { // close
          try { socket.write(encodeFrame('', 0x8)) } catch { /* ignore */ }
          finishClose()
          return
        }
        if (opcode === 0x9) { // ping → pong
          try { socket.write(encodeFrame(payload.toString('utf8'), 0xa)) } catch { /* ignore */ }
          continue
        }
        if (opcode === 0xa) continue // pong
        if (opcode === 0x0) {
          fragments.push(payload)
          if (fin) {
            const text = Buffer.concat(fragments).toString('utf8')
            fragments = []
            if (fragmentOpcode === 0x1) messageCb?.(text)
          }
          continue
        }
        if (opcode === 0x1 || opcode === 0x2) {
          if (fin) {
            if (opcode === 0x1) messageCb?.(payload.toString('utf8'))
          } else {
            fragments = [payload]
            fragmentOpcode = opcode
          }
        }
      }
    })

    socket.on('connect', () => {
      socket.write(
        [
          `GET ${path} HTTP/1.1`,
          `Host: ${host}:${port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          `Origin: http://${host}:${port}`,
          '',
          '',
        ].join('\r\n'),
      )
    })
  })
}
