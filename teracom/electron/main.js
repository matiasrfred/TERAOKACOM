import net from 'node:net'
import { ipcMain } from 'electron'

const TCP_PORT = 4001
const VENDORS = ['A', 'B', 'C', 'D']

// ── State ──────────────────────────────────────────────────────────────
// Flat cart: { A: [item, ...], B: [...], C: [...], D: [...] }
// Each item: { lineNo, plu, name, qty, amount, scaleId, vendor, ts }
const cart = { A: [], B: [], C: [], D: [] }

// connectedScales: [{ ip, scaleId }]
const connectedScales = []
const socketByIp = new Map()
const eventBuffer = []

let mainWindow = null
let rendererReady = false

function notifyRenderer(channel, data) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!rendererReady) {
    eventBuffer.push({ channel, data })
    return
  }
  mainWindow.webContents.send(channel, data)
}

function flushBuffer() {
  for (const { channel, data } of eventBuffer) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  }
  eventBuffer.length = 0
}

function formatAmount(n) {
  return String(Math.round(n)).padStart(8, '0')
}

function formatQty(n) {
  return String(n).padStart(5, '0')
}

function sendToSocket(ip, data) {
  const sock = socketByIp.get(ip)
  if (sock && !sock.destroyed) {
    sock.write(data)
  }
}

// ── TCP Server ────────────────────────────────────────────────────────
export function startTcpServer(win) {
  mainWindow = win

  ipcMain.on('renderer:ready', () => {
    rendererReady = true
    flushBuffer()
    console.log('[IPC] Renderer ready')
  })

  const server = net.createServer((socket) => {
    const addr = `${socket.remoteAddress}:${socket.remotePort}`
    const ip = socket.remoteAddress
    console.log(`[TCP] Scale connected: ${addr}`)

    // Register scale immediately on TCP connect (before any frame arrives).
    // Use the last IP octet as the scaleId (e.g. 192.168.1.58 → "58")
    // since the scales all report the same scaleId in their frames.
    const existingOnConnect = connectedScales.find((s) => s.ip === ip)
    if (!existingOnConnect) {
      const autoId = ip.split('.').pop() // last octet
      connectedScales.push({ ip, scaleId: autoId })
      socketByIp.set(ip, socket)
      notifyRenderer('scale:connected', { ip, scaleId: autoId })
      notifyRenderer('scales:updated', [...connectedScales])
    }

    socket.on('error', (err) => {
      console.error(`[TCP] Socket error ${addr}:`, err.message)
      cleanupSocket(socket, addr)
    })

    socket.on('close', () => {
      cleanupSocket(socket, addr)
      console.log(`[TCP] Scale disconnected: ${addr}`)
    })

    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      while (buffer.includes('\r\n\x03')) {
        const endIdx = buffer.indexOf('\r\n\x03')
        const frame = buffer.slice(0, endIdx)
        buffer = buffer.slice(endIdx + 4)
        processFrame(socket, frame, addr)
      }
    })
  })

  server.on('error', (err) => {
    console.error('[TCP] Server error:', err.message)
  })

  server.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(`[TCP] Server listening on port ${TCP_PORT}`)
  })

  // ── IPC Handlers ──────────────────────────────────────────────────
  ipcMain.handle('tcp:send', async (_e, { ip, cmd }) => {
    const sock = socketByIp.get(ip)
    if (sock && !sock.destroyed) {
      sock.write(`!0${cmd}\r\n\x03`)
      return { ok: true }
    }
    return { ok: false, error: 'Scale not connected' }
  })

  ipcMain.handle('cart:get', async () => {
    return {
      A: [...cart.A],
      B: [...cart.B],
      C: [...cart.C],
      D: [...cart.D],
    }
  })

  ipcMain.handle('cart:clearVendor', async (_e, { vendor }) => {
    cart[vendor] = []
    return { ok: true }
  })

  ipcMain.handle('cart:clearAll', async () => {
    cart.A = []; cart.B = []; cart.C = []; cart.D = []
    return { ok: true }
  })

  ipcMain.handle('scales:list', async () => {
    return [...connectedScales]
  })

  ipcMain.handle('print:trigger', async (_e, { vendor }) => {
    // Send print command to ALL connected scales for this vendor
    const results = []
    for (const scale of connectedScales) {
      const sock = socketByIp.get(scale.ip)
      if (sock && !sock.destroyed) {
        const cmd = `BS${scale.scaleId}${vendor}`
        sock.write(`!0${cmd}\r\n\x03`)
        results.push({ ip: scale.ip, ok: true })
      } else {
        results.push({ ip: scale.ip, ok: false })
      }
    }
    return results
  })
}

function cleanupSocket(socket, addr) {
  const ip = socket.remoteAddress
  const idx = connectedScales.findIndex((s) => s.ip === ip)
  if (idx !== -1) {
    const scale = connectedScales[idx]
    connectedScales.splice(idx, 1)
    socketByIp.delete(ip)
    notifyRenderer('scale:disconnected', { ip: scale.ip, scaleId: scale.scaleId })
  }
}

// ── Protocol Frame Processing ───────────────────────────────────────────
function processFrame(socket, raw, addr) {
  console.log(`[TCP] RX: ${raw}`)

  if (!raw.startsWith('!0') || raw.length < 6) return

  const inner = raw.slice(2) // strip !0

  // inner[0] = 'B' (fixed prefix — ignore)
  // inner[1] = subCmd
  // inner[2..3] = scaleId (2 digits)
  // inner[4] = vendor
  // rest = everything after vendor
  const subCmd = inner[1]
  const scaleId = inner.slice(2, 4)
  const vendor = inner[4]
  const rest = inner.slice(5)
  const ip = socket.remoteAddress

  // Track scale on any command. We keep the IP-based scaleId assigned on
  // TCP connect (don't overwrite from frames — all scales report the same
  // scaleId, which would defeat the purpose). The frame's scaleId is still
  // used below for building protocol responses.
  const existing = connectedScales.find((s) => s.ip === ip)
  if (!existing) {
    const autoId = ip.split('.').pop()
    connectedScales.push({ ip, scaleId: autoId })
    socketByIp.set(ip, socket)
    notifyRenderer('scale:connected', { ip, scaleId: autoId })
    notifyRenderer('scales:updated', [...connectedScales])
  }

  switch (subCmd) {
    case 'Q': {
      // Spec: 0bQ + Scale(2) + Vendor(1) + Status(3) + ItemName + Weight(5) + Amount(8)
      // ItemName is variable: scale reads from the right (Amount/Weight/Status are fixed-width).
      const items = cart[vendor] || []
      const totalAmount = items.reduce((s, i) => s + i.amount, 0)
      const totalQty = items.reduce((s, i) => s + i.qty, 0)
      const status = items.length === 0 ? '000' : String(items.length).padStart(3, '0')
      const itemName = items.length > 0 ? items[items.length - 1].name : ''
      const resp = `0bQ${scaleId}${vendor}${status}${itemName}${formatQty(totalQty)}${formatAmount(totalAmount)}`
      socket.write(`${resp}\r\n\x03`)
      console.log(`[TCP] TX: ${resp}`)
      break
    }

    case 'A': {
      // !0BA{scaleId}{vendor}{plu(5)}{name(var)}{qty(5)}{amount(8)}
      if (rest.length < 18) return
      const amount = parseInt(rest.slice(-8), 10) || 0
      const qty = parseInt(rest.slice(-13, -8), 10) || 1
      const name = rest.slice(5, -13).trimEnd()
      const plu = rest.slice(0, 5)
      const ts = Date.now()

      const lineNo = String(cart[vendor].length + 1).padStart(3, '0')
      const item = { lineNo, plu, name, qty, amount, scaleId, vendor, ts }
      cart[vendor].push(item)

      const newTotal = cart[vendor].reduce((s, i) => s + i.amount, 0)
      const resp = `0bA${scaleId}${vendor}${name.padEnd(14).slice(0, 14)}${lineNo}${formatAmount(newTotal)}`
      socket.write(`${resp}\r\n\x03`)
      console.log(`[TCP] TX: ${resp}`)

      notifyRenderer('scale:event', {
        type: 'add',
        scaleId,
        vendor,
        item,
        cart: [...cart[vendor]],
      })
      break
    }

    case 'S': {
      // Merge & Print: send S confirmation, then H + L×N + E print stream.
      // Spec: 0bS{scaleId}{vendor}{ticketNo} then
      //       0bH{ticketNo(5)}{title(32)} then
      //       0bL{lineNo(5)}{plu(5)}{name(var)}{qty(5)}{amount(8)} per item then
      //       0bE{ticketNo(5)}{totalItems(3)}{totalAmount(8)}
      const ticketNo = String(Date.now() % 100000).padStart(5, '0')
      const items = cart[vendor] || []
      const totalAmount = items.reduce((s, i) => s + i.amount, 0)
      const totalItems = items.length

      // Helper: safe write that logs and detects broken sockets
      const writeFrame = (frame) => {
        if (!socket.writable || socket.destroyed) {
          console.error(`[TCP] Cannot send ${frame.slice(0, 4)} — socket closed`)
          return false
        }
        socket.write(`${frame}\r\n\x03`)
        console.log(`[TCP] TX: ${frame}`)
        return true
      }

      // 1) Confirmation
      writeFrame(`0bS${scaleId}${vendor}${ticketNo}`)

      // 2) Header
      const title = `Scale${scaleId} Vendor${vendor}`.padEnd(32)
      writeFrame(`0bH${ticketNo}${title}`)

      // 3) Detail lines (one per item)
      // Spec: 0bL + LineNo(5) + ItemName(var) + Qty(5) + Amount(8)
      // ItemName = PLU(5) + name (variable). The scale reads from the right,
      // so the variable name can be any length.
      for (const item of items) {
        writeFrame(
          `0bL${item.lineNo.padStart(5, '0')}${item.plu}${item.name}${formatQty(item.qty)}${formatAmount(item.amount)}`
        )
      }

      // 4) End / total
      writeFrame(
        `0bE${ticketNo}${String(totalItems).padStart(3, '0')}${formatAmount(totalAmount)}`
      )

      // Clear this vendor's cart after printing
      cart[vendor] = []

      notifyRenderer('scale:print', {
        scaleId,
        vendor,
        ticketNo,
        items: [...items],
        totalAmount,
        totalItems,
      })

      notifyRenderer('scale:event', {
        type: 'void',
        scaleId,
        vendor,
        cart: [],
      })
      break
    }

    case 'D': {
      // Delete last item from this vendor
      const deleted = cart[vendor].pop()
      const remainingAmount = cart[vendor].reduce((s, i) => s + i.amount, 0)
      const status = cart[vendor].length === 0 ? '000' : String(cart[vendor].length).padStart(3, '0')
      const resp = `0bD${scaleId}${vendor}${status}${formatAmount(remainingAmount)}`
      socket.write(`${resp}\r\n\x03`)
      console.log(`[TCP] TX: ${resp}`)

      notifyRenderer('scale:event', {
        type: 'delete',
        scaleId,
        vendor,
        deletedItem: deleted,
        cart: [...cart[vendor]],
      })
      break
    }

    case 'V': {
      // Void this vendor
      cart[vendor] = []
      const resp = `0bV${scaleId}${vendor}000${formatAmount(0)}`
      socket.write(`${resp}\r\n\x03`)
      console.log(`[TCP] TX: ${resp}`)

      notifyRenderer('scale:event', {
        type: 'void',
        scaleId,
        vendor,
        cart: [],
      })
      break
    }

    default:
      console.warn(`[TCP] Unknown subCmd: '${subCmd}'`)
  }
}
