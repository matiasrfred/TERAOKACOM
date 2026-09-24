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
// Track last vendor targeted per scale IP (for BD/BV response handling)
const lastVendorByScale = new Map()

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
    // Log exact bytes so we can compare with physical keyboard TX
    const hex = Buffer.from(data).toString('hex')
    console.log(`[TCP] TX → (bytes hex): ${hex} | ascii: ${JSON.stringify(data)}`)
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
    console.log(`[TCP] Scale connected: ${addr} ←`)

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
      console.log(`[TCP] Scale disconnected: ${addr} ←`)
    })

    let buffer = ''
    let flushTimer = null
    const FLUSH_MS = 200

    const flushBuffer = (force = false) => {
      if (!buffer || buffer.length === 0) return
      if (!force && buffer.includes('\r\n\x03')) return
      // If buffer starts with 0b and has no terminator, try to parse it as-is.
      // The scale sends bare 0bD / 0bV / 0bA responses without \r\n\x03.
      const frame = buffer
      buffer = ''
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
      processFrame(socket, frame, addr)
    }

    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      // Always flush immediately for bare 0bX (3-byte scale response) or
      // full frames with terminator.
      if (buffer.startsWith('0b') && buffer.length >= 3) {
        flushBuffer(true)
        return
      }
      if (buffer.includes('\r\n\x03')) {
        flushBuffer(true)
        return
      }
      // Fallback: flush after timeout for incomplete frames
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = setTimeout(() => flushBuffer(true), FLUSH_MS)
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

  // Set scale mode (F = FUNC mode, N = NORMAL mode) — FUNC mode is
  // required for the scale to process BD/BV commands sent via TCP.
  ipcMain.handle('scale:setMode', async (_e, { ip, mode }) => {
    const sock = socketByIp.get(ip)
    if (sock && !sock.destroyed) {
      const cmd = `BM${mode}`
      sock.write(`!0${cmd}\r\n\x03`)
      console.log(`[IPC] scale:setMode(${mode}) TX → !0${cmd} to ${ip}`)
      return { ok: true }
    }
    return { ok: false }
  })

  // Query scale mode (F = FUNC mode, N = NORMAL mode) — helps diagnose why
  // BD/BV commands return only 3-byte echo instead of full response.
  ipcMain.handle('scale:queryMode', async (_e, { ip }) => {
    const sock = socketByIp.get(ip)
    if (sock && !sock.destroyed) {
      const cmd = 'BM'
      sock.write(`!0${cmd}\r\n\x03`)
      console.log(`[IPC] scale:queryMode TX → !0${cmd} to ${ip}`)
      return { ok: true }
    }
    return { ok: false }
  })

  // Force clear display on a specific scale
  ipcMain.handle('scale:clearDisplay', async (_e, { ip }) => {
    const sock = socketByIp.get(ip)
    if (sock && !sock.destroyed) {
      sock.write('!0BC\r\n\x03')
      console.log(`[IPC] scale:clearDisplay TX → !0BC to ${ip}`)
      return { ok: true }
    }
    return { ok: false }
  })

  ipcMain.handle('print:trigger', async (_e, vendor) => {
    // ── Print Directo ──────────────────────────────────────────────────
    // El software envía el stream de impresión directamente a cada balanza
    // sin necesidad de presionar el botón físico.
    // Protocolo:
    //   Software → !0BX{scaleId}{vendor}{count}{items...}  (batch print request)
    //   Scale    → 0bX{scaleId}{vendor}000                  (echo/ack)
    //   Software → !0BS{ticketNo}                            (print start)
    //   Software → !0BH{ticketNo}{title(32)}                (header)
    //   Software → !0BL{lineNo}{plu}{name}{qty}{amt}×N     (lines)
    //   Software → !0BE{ticketNo}{count}{amount}            (total)
    //
    // Cada balanza imprime solo los items que tiene en su carrito local.
    const scaleId = '01'
    const results = []

    for (const scale of connectedScales) {
      const sock = socketByIp.get(scale.ip)
      if (!sock || sock.destroyed) {
        results.push({ ip: scale.ip, ok: false })
        continue
      }

      // Items de esta balanza específica (filtrar por IP del socket TCP)
      const scaleItems = cart[vendor].filter((i) => i.ip === scale.ip)
      const totalAmount = scaleItems.reduce((s, i) => s + i.amount, 0)
      const totalItems = scaleItems.length

      if (totalItems === 0) {
        console.log(`[IPC] print:trigger — ${scale.ip} no tiene items para vendor ${vendor}`)
        results.push({ ip: scale.ip, ok: false, reason: 'empty' })
        continue
      }

      const ticketNo = String(Date.now() % 100000).padStart(5, '0')

      // 1) Batch print request
      const count = String(totalItems).padStart(2, '0')
      let itemsData = ''
      for (const item of scaleItems) {
        itemsData += `${item.plu.padEnd(5).slice(0, 5)}${item.name.padEnd(14).slice(0, 14)}${formatQty(item.qty)}${formatAmount(item.amount)}`
      }
      const bxCmd = `BX${scaleId}${vendor}${count}${itemsData}`
      sock.write(`!0${bxCmd}\r\n\x03`)
      console.log(`[IPC] print:trigger BX TX → !0${bxCmd} to ${scale.ip}`)

      // 2) Print stream: S + H + L×N + E (enviados en paralelo, la balanza los cola)
      const frames = []
      frames.push(`0bS${scaleId}${vendor}${ticketNo}`)
      frames.push(`0bH${ticketNo}${'Print Ticket'.padEnd(32)}`)
      for (const item of scaleItems) {
        frames.push(
          `0bL${item.lineNo.padStart(5, '0')}${item.plu}${item.name}${formatQty(item.qty)}${formatAmount(item.amount)}`
        )
      }
      frames.push(`0bE${ticketNo}${String(totalItems).padStart(3, '0')}${formatAmount(totalAmount)}`)

      for (const frame of frames) {
        sock.write(`${frame}\r\n\x03`)
        console.log(`[IPC] print:trigger TX → ${frame} to ${scale.ip}`)
      }

      results.push({ ip: scale.ip, ok: true, items: totalItems })
    }

    // Limpiar cart del vendor en todas las balanzas
    cart[vendor] = []
    notifyRenderer('scale:event', {
      type: 'void',
      scaleId: '01',
      vendor,
      cart: [],
      frame: `0bV01${vendor}000${formatAmount(0)}`,
    })

    return results
  })

  // Send Delete Last Item (protocol "D") to all connected scales for this vendor
  // NOTE: scaleId is hardcoded to "01" — the scale only responds to commands
  // addressed with its own scale number, regardless of which IP they come from.
  // Strategy: send BQ first (select vendor) then BD (delete). The 50ms delay
  // gives the scale time to process the BQ and activate that vendor.
  ipcMain.handle('scale:deleteLast', async (_e, { vendor }) => {
    const scaleId = '01'
    console.log('[IPC] scale:deleteLast vendor:', vendor, '→ will send BQ then BD')
    // Track vendor per scale IP so bare 0bD response can update correct cart
    for (const scale of connectedScales) {
      lastVendorByScale.set(scale.ip, vendor)
    }
    const results = []
    for (const scale of connectedScales) {
      const sock = socketByIp.get(scale.ip)
      if (sock && !sock.destroyed) {
        // Step 1: Select vendor via BQ
        const cmd1 = `BQ${scaleId}${vendor}`
        sock.write(`!0${cmd1}\r\n\x03`)
        console.log(`[IPC] scale:deleteLast BQ TX → !0${cmd1} to ${scale.ip}`)
        results.push({ ip: scale.ip, ok: true, step: 'bq' })
      } else {
        results.push({ ip: scale.ip, ok: false })
      }
    }
    // Small delay to let scale process BQ and activate the vendor
    await new Promise((r) => setTimeout(r, 50))
    for (const scale of connectedScales) {
      const sock = socketByIp.get(scale.ip)
      if (sock && !sock.destroyed) {
        // Step 2: Delete last item
        const cmd2 = `BD${scaleId}${vendor}`
        sock.write(`!0${cmd2}\r\n\x03`)
        console.log(`[IPC] scale:deleteLast BD TX → !0${cmd2} to ${scale.ip}`)
      }
    }
    return results
  })

  // Send Void Entire Transaction (protocol "V") to all connected scales for this vendor
  // Send BQ first to activate the vendor, then BV to void it.
  ipcMain.handle('scale:voidVendor', async (_e, { vendor }) => {
    const scaleId = '01'
    console.log('[IPC] scale:voidVendor vendor:', vendor, '→ will send BQ then BV')
    // Track vendor per scale IP so bare 0bV response can update correct cart
    for (const scale of connectedScales) {
      lastVendorByScale.set(scale.ip, vendor)
    }
    const results = []
    for (const scale of connectedScales) {
      const sock = socketByIp.get(scale.ip)
      if (sock && !sock.destroyed) {
        const cmd1 = `BQ${scaleId}${vendor}`
        sock.write(`!0${cmd1}\r\n\x03`)
        console.log(`[IPC] scale:voidVendor BQ TX → !0${cmd1} to ${scale.ip}`)
        results.push({ ip: scale.ip, ok: true })
      } else {
        results.push({ ip: scale.ip, ok: false })
      }
    }
    await new Promise((r) => setTimeout(r, 50))
    for (const scale of connectedScales) {
      const sock = socketByIp.get(scale.ip)
      if (sock && !sock.destroyed) {
        const cmd2 = `BV${scaleId}${vendor}`
        sock.write(`!0${cmd2}\r\n\x03`)
        console.log(`[IPC] scale:voidVendor BV TX → !0${cmd2} to ${scale.ip}`)
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
  // Log exact bytes received so we can compare software vs physical DELETE
  const hex = Buffer.from(raw).toString('hex')
  console.log(`[TCP] RX ← (bytes hex): ${hex} | ascii: ${JSON.stringify(raw)} | raw: ${raw}`)

  // Frames from scale start with "0b" (responses) or "!0" (echo/commands)
  // scaleId is always the last IP octet assigned on TCP connect
  const ip = socket.remoteAddress
  const scaleReg = connectedScales.find((s) => s.ip === ip)
  const scaleId = scaleReg ? scaleReg.scaleId : '??'

  // Handle responses from scale (start with 0b) — these need the cart to be
  // pre-populated from the scale's own commands (keyboard-triggered).
  // If we see a bare "0bD" it means the scale sent only a sub-command
  // (no scaleId/vendor/amount). The full 0bD{scaleId}{vendor}{status}{amount}
  // form is what we need to update cart state.
  if (raw.startsWith('0b') && raw.length >= 3) {
    const subCmd = raw[2]
    if (subCmd === 'D') {
      // Full delete response: 0bD{scaleId(2)}{vendor(1)}{status(3)}{amount(8)} = 16+ bytes.
      // Bare 0bD (3 bytes) or 0bD\r\n\x03 (6 bytes, terminator IS present but no data after subCmd).
      // Only treat as full response if raw.length >= 16 AND vendor byte is valid A-D.
      if (raw.length >= 16) {
        const sId = raw.slice(2, 4)
        const vendor = raw[4]
        const status = raw.slice(5, 8)
        const amount = raw.slice(8, 16)
        if (sId && vendor && status !== undefined && amount) {
          const numItems = parseInt(status, 10) || 0
          const amt = parseInt(amount, 10) || 0
          if (numItems === 0) {
            cart[vendor] = []
          } else {
            const existing = cart[vendor] || []
            if (existing.length > 0 && amt >= 0) {
              const last = existing[existing.length - 1]
              last.amount = amt
            }
          }
          notifyRenderer('scale:event', {
            type: 'delete',
            scaleId: sId,
            vendor,
            deletedItem: null,
            cart: [...(cart[vendor] || [])],
            frame: raw,
          })
        }
      } else {
        // Bare 0bD or 0bD\r\n\x03 — no full data after subCmd, use lastVendorByScale.
        const vendor = lastVendorByScale.get(ip)
        if (vendor) {
          const deleted = cart[vendor].pop()
          notifyRenderer('scale:event', {
            type: 'delete',
            scaleId,
            vendor,
            deletedItem: deleted,
            cart: [...cart[vendor]],
            frame: raw,
          })
          console.log(`[TCP] Bare 0bD → removed last item from vendor ${vendor}, remaining: ${cart[vendor].length}`)
        } else {
          console.warn('[TCP] 0bD received but no lastVendorByScale entry, ignoring')
        }
      }
      return
    }
    // Handle 0bV (void vendor)
    if (subCmd === 'V') {
      // Full void response: 0bV{scaleId(2)}{vendor(1)}{status(3)}{amount(8)} = 16+ bytes.
      if (raw.length >= 16) {
        const sId = raw.slice(2, 4)
        const vendor = raw[4]
        if (vendor) {
          cart[vendor] = []
          notifyRenderer('scale:event', {
            type: 'void',
            scaleId: sId,
            vendor,
            cart: [],
            frame: raw,
          })
        }
      } else {
        // Bare 0bV or 0bV\r\n\x03 — use lastVendorByScale
        const vendor = lastVendorByScale.get(ip)
        if (vendor) {
          cart[vendor] = []
          notifyRenderer('scale:event', {
            type: 'void',
            scaleId,
            vendor,
            cart: [],
            frame: raw,
          })
          console.log(`[TCP] Bare 0bV → cleared vendor ${vendor}`)
        }
      }
      return
    }
    // Handle 0bM (mode response) and any other 0b response
    if (subCmd === 'M') {
      // Response: 0bMF (FUNC mode) or 0bMN (NORMAL mode)
      const mode = raw[3] // 'F' or 'N'
      console.log(`[TCP] Scale mode query response: ${raw} (mode: ${mode})`)
      notifyRenderer('scale:mode', { ip, mode })
      return
    }
    // Ignore other 0b responses (0bA, 0bQ, etc.) — they come from the scale
    // as echo/responses, not as commands we need to process here.
    return
  }

  if (!raw.startsWith('!0') || raw.length < 6) return

  const inner = raw.slice(2) // strip !0

  // inner[0] = 'B' (fixed prefix — ignore)
  // inner[1] = subCmd
  // inner[2..3] = scaleId (2 digits)
  // inner[4] = vendor
  // rest = everything after vendor
  const subCmd = inner[1]
  const frameScaleId = inner.slice(2, 4)
  const vendor = inner[4]
  const rest = inner.slice(5)
  // 'ip' already declared at function scope above (line 222)

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
      // Normal BQ from scale keyboard — respond with cart summary.
      const items = cart[vendor] || []
      const totalAmount = items.reduce((s, i) => s + i.amount, 0)
      const totalQty = items.reduce((s, i) => s + i.qty, 0)
      const status = items.length === 0 ? '000' : String(items.length).padStart(3, '0')
      const itemName = items.length > 0 ? items[items.length - 1].name : ''
      const resp = `0bQ${frameScaleId}${vendor}${status}${itemName}${formatQty(totalQty)}${formatAmount(totalAmount)}`
      socket.write(`${resp}\r\n\x03`)
      console.log(`[TCP] TX → : ${resp}`)
      notifyRenderer('scale:tx', { scaleId: frameScaleId, vendor, frame: resp })
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
      const item = { lineNo, plu, name, qty, amount, scaleId: frameScaleId, vendor, ts, ip }
      cart[vendor].push(item)

      const newTotal = cart[vendor].reduce((s, i) => s + i.amount, 0)
      const resp = `0bA${frameScaleId}${vendor}${name.padEnd(14).slice(0, 14)}${lineNo}${formatAmount(newTotal)}`
      socket.write(`${resp}\r\n\x03`)
      console.log(`[TCP] TX → : ${resp}`)

      notifyRenderer('scale:event', {
        type: 'add',
        scaleId: frameScaleId,
        vendor,
        item,
        cart: [...cart[vendor]],
        frame: resp,
      })
      break
    }

    case 'S': {
      // Scale sends BS = user pressed Print on this scale's keyboard.
      // Trigger print on ALL connected scales for this vendor — each prints only its own items.
      const allItems = cart[vendor] || []
      let totalClearedCount = 0

      for (const scale of connectedScales) {
        const sock = socketByIp.get(scale.ip)
        if (!sock || sock.destroyed) continue

        const scaleItems = allItems.filter((i) => i.ip === scale.ip)
        if (scaleItems.length === 0) continue

        const scaleTicketNo = String(Date.now() % 100000).padStart(5, '0')
        const totalAmount = scaleItems.reduce((s, i) => s + i.amount, 0)
        const totalItems = scaleItems.length

        const writeFrame = (frame) => {
          if (!sock.writable || sock.destroyed) return false
          sock.write(`${frame}\r\n\x03`)
          console.log(`[TCP] TX → : ${frame}`)
          return true
        }

        // 1) Batch print request (BX) — same as print:trigger
        const count = String(totalItems).padStart(2, '0')
        let itemsData = ''
        for (const item of scaleItems) {
          itemsData += `${item.plu.padEnd(5).slice(0, 5)}${item.name.padEnd(14).slice(0, 14)}${formatQty(item.qty)}${formatAmount(item.amount)}`
        }
        const bxCmd = `BX${frameScaleId}${vendor}${count}${itemsData}`
        sock.write(`!0${bxCmd}\r\n\x03`)
        console.log(`[TCP] BS-trigger BX TX → !0${bxCmd} to ${scale.ip}`)

        // 2) Print stream: S + H + L×N + E
        writeFrame(`0bS${frameScaleId}${vendor}${scaleTicketNo}`)
        writeFrame(`0bH${scaleTicketNo}${'Print Ticket'.padEnd(32)}`)
        for (const item of scaleItems) {
          writeFrame(`0bL${item.lineNo.padStart(5, '0')}${item.plu}${item.name}${formatQty(item.qty)}${formatAmount(item.amount)}`)
        }
        writeFrame(`0bE${scaleTicketNo}${String(totalItems).padStart(3, '0')}${formatAmount(totalAmount)}`)

        totalClearedCount += scaleItems.length
      }

      console.log(`[TCP] BS triggered print on ${totalClearedCount} items across ${connectedScales.length} scales for vendor ${vendor}`)

      // Limpiar cart del vendor en todas las balanzas
      cart[vendor] = []

      // Notificar a renderer con todos los items impresos (todas las balanzas)
      notifyRenderer('scale:print', {
        scaleId: frameScaleId,
        vendor,
        ticketNo: String(Date.now() % 100000).padStart(5, '0'),
        items: [...allItems],
        totalAmount: allItems.reduce((s, i) => s + i.amount, 0),
        totalItems: allItems.length,
        frames: [],
      })

      notifyRenderer('scale:event', {
        type: 'void',
        scaleId: frameScaleId,
        vendor,
        cart: [],
        frame: `0bV${frameScaleId}${vendor}000${formatAmount(0)}`,
      })
      break
    }

    case 'P': {
      // Batch Print: software sends merged items to scale for consolidated printing.
      // Format: !0BP{scaleId}{vendor}{count}{plu1}{name1}{qty1}{amt1}{plu2}...
      // Each item = plu(5) + name(14) + qty(5) + amount(8) = 32 chars.
      const count = parseInt(rest.slice(0, 2), 10) || 0
      const itemSize = 32
      const items = []
      for (let i = 0; i < count; i++) {
        const offset = 2 + i * itemSize
        const chunk = rest.slice(offset, offset + itemSize)
        if (chunk.length < itemSize) break
        const plu = chunk.slice(0, 5).trimEnd()
        const name = chunk.slice(5, 19).trimEnd()
        const qty = parseInt(chunk.slice(19, 24), 10) || 1
        const amount = parseInt(chunk.slice(24, 32), 10) || 0
        if (plu || name) {
          items.push({ lineNo: String(i + 1).padStart(3, '0'), plu, name, qty, amount })
        }
      }

      const ticketNo = String(Date.now() % 100000).padStart(5, '0')
      const totalAmount = items.reduce((s, i) => s + i.amount, 0)
      const totalItems = items.length

      const writeFrame = (frame) => {
        if (!socket.writable || socket.destroyed) {
          console.error(`[TCP] Cannot send ${frame.slice(0, 4)} — socket closed`)
          return false
        }
        socket.write(`${frame}\r\n\x03`)
        console.log(`[TCP] TX → : ${frame}`)
        return true
      }

      const frames = []
      // 1) Confirmation
      frames.push(`0bP${frameScaleId}${vendor}000`)
      writeFrame(frames[frames.length - 1])
      // 2) Header
      const title = `merged ticket`.padEnd(32)
      frames.push(`0bH${ticketNo}${title}`)
      writeFrame(frames[frames.length - 1])
      // 3) Line items
      for (const item of items) {
        frames.push(
          `0bL${item.lineNo.padStart(5, '0')}${item.plu}${item.name}${formatQty(item.qty)}${formatAmount(item.amount)}`
        )
        writeFrame(frames[frames.length - 1])
      }
      // 4) End / total
      frames.push(
        `0bE${ticketNo}${String(totalItems).padStart(3, '0')}${formatAmount(totalAmount)}`
      )
      writeFrame(frames[frames.length - 1])

      // NOTE: do NOT clear cart[vendor] here — the unified cart is shared across
      // all scales. Each scale's physical print job is independent; the server-side
      // cart is kept in sync via BA (add) and BD/BV (delete) events from the scales.
      notifyRenderer('scale:print', {
        scaleId: frameScaleId,
        vendor,
        ticketNo,
        items: [...items],
        totalAmount,
        totalItems,
        frames,
      })

      notifyRenderer('scale:event', {
        type: 'void',
        scaleId: frameScaleId,
        vendor,
        cart: [],
        frame: `0bV${frameScaleId}${vendor}000${formatAmount(0)}`,
      })
      break
    }

    case 'X': {
      // Print Directo — software envía stream de impresión directamente
      // sin esperar botón físico. Solo responde el echo 0bX.
      const resp = `0bX${frameScaleId}${vendor}000`
      socket.write(`${resp}\r\n\x03`)
      console.log(`[TCP] TX → : ${resp}`)
      break
    }

    case 'D': {
      // Delete last item from this vendor
      const deleted = cart[vendor].pop()
      const remainingAmount = cart[vendor].reduce((s, i) => s + i.amount, 0)
      const status = cart[vendor].length === 0 ? '000' : String(cart[vendor].length).padStart(3, '0')
      const resp = `0bD${frameScaleId}${vendor}${status}${formatAmount(remainingAmount)}`
      socket.write(`${resp}\r\n\x03`)
      console.log(`[TCP] TX → : ${resp}`)

      notifyRenderer('scale:event', {
        type: 'delete',
        scaleId: frameScaleId,
        vendor,
        deletedItem: deleted,
        cart: [...cart[vendor]],
        frame: resp,
      })
      break
    }

    case 'V': {
      // Void this vendor
      cart[vendor] = []
      const resp = `0bV${frameScaleId}${vendor}000${formatAmount(0)}`
      socket.write(`${resp}\r\n\x03`)
      console.log(`[TCP] TX → : ${resp}`)

      notifyRenderer('scale:event', {
        type: 'void',
        scaleId: frameScaleId,
        vendor,
        cart: [],
        frame: resp,
      })
      break
    }

    default:
      console.warn(`[TCP] Unknown subCmd: '${subCmd}'`)
  }
}
