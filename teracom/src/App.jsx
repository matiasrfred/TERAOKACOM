import { useState, useEffect, useRef } from 'react'

const VENDORS = ['A', 'B', 'C', 'D']
const VENDOR_LABELS = { A: 'Vendedor A', B: 'Vendedor B', C: 'Vendedor C', D: 'Vendedor D' }

function formatMoney(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n)
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── VendorPanel ────────────────────────────────────────────────────────
function VendorPanel({ vendor, items, onClear, onPrint }) {
  const total = items.reduce((s, i) => s + i.amount, 0)
  const totalQty = items.reduce((s, i) => s + i.qty, 0)
  const count = items.length

  return (
    <div className={`vendor-panel vp-${vendor.toLowerCase()}`}>
      <div className="vendor-header">
        <span className="vendor-label">{VENDOR_LABELS[vendor]}</span>
        <span className="vendor-badge">{count} item{count !== 1 ? 's' : ''}</span>
      </div>

      <div className="vendor-items">
        {items.length === 0 ? (
          <div className="vendor-empty">Sin productos</div>
        ) : (
          items.map((item) => (
            <div key={item.lineNo + item.scaleId + item.ts} className="item-row">
              <div className="item-info">
                <span className="item-name">{item.name}</span>
                <span className="item-plu">PLU {item.plu} · #B{item.scaleId}</span>
              </div>
              <div className="item-right">
                <div className="item-amount">{formatMoney(item.amount)}</div>
                <div className="item-qty">×{item.qty}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="vendor-footer">
        <div>
          <div className="vendor-total">{formatMoney(total)}</div>
          <div className="vendor-units">{totalQty} unidades</div>
        </div>
        <div className="vendor-actions">
          {count > 0 && (
            <>
              <button className="btn-print-vendor" onClick={() => onPrint(vendor)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
                </svg>
                Imprimir
              </button>
              <button className="btn-clear-sm" onClick={() => onClear(vendor)}>
                Limpiar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────
function Sidebar({ scales }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Básculas</span>
        <span className="sidebar-count">{scales.length}</span>
      </div>
      <div className="sidebar-list">
        {scales.length === 0 ? (
          <div className="sidebar-empty">Ninguna conectada</div>
        ) : (
          scales.map((s) => (
            <div key={s.ip} className="sidebar-scale">
              <div className="scale-indicator" />
              <div className="scale-info">
                <div className="scale-name">Báscula #{s.scaleId}</div>
                <div className="scale-ip">{s.ip}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}

// ── EventLog ───────────────────────────────────────────────────────────
function EventLog({ events }) {
  return (
    <div className="event-log">
      <div className="event-log-header"><span>Actividad</span></div>
      <div className="event-log-body">
        {events.length === 0 ? (
          <div className="event-empty">Sin actividad</div>
        ) : (
          events.map((ev) => (
            <div key={ev.id} className="event-row">
              <span className="ev-time">{ev.ts}</span>
              <span className={`ev-tag ev-${ev.type}`}>{ev.type}</span>
              <span className="ev-msg">{ev.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── EmptyState ─────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon">⚖️</div>
      <h2>Sin productos acumulados</h2>
      <p>Agrega productos desde las balanzas Teraoka conectadas. Los productos de cada vendedor se acumulan aquí.</p>
    </div>
  )
}

// Module-level guard to prevent duplicate IPC registration under React StrictMode (dev)
let ipcRegistered = false

// ── App ────────────────────────────────────────────────────────────────
export default function App() {
  /** @type {Record<string, Array>}} flat cart keyed by vendor */
  const [cart, setCart] = useState({ A: [], B: [], C: [], D: [] })
  const [scales, setScales] = useState([])
  const [events, setEvents] = useState([])

  const addEventRef = useRef(null)
  addEventRef.current = (type, message) => {
    setEvents((prev) => [
      { id: makeId(), type, message, ts: new Date().toLocaleTimeString('es-CL', { hour12: false }) },
      ...prev,
    ].slice(0, 50))
  }

  useEffect(() => {
    if (!window.teracom) return
    if (ipcRegistered) return
    ipcRegistered = true

    const onConnected = ({ ip, scaleId }) => {
      addEventRef.current('connected', `#${scaleId} conectada`)
    }

    const onDisconnected = ({ ip, scaleId }) => {
      addEventRef.current('disconnected', `#${scaleId} desconectada`)
    }

    const onScaleEvent = ({ type, scaleId, vendor, item, cart: vendorCart }) => {
      setCart((prev) => ({ ...prev, [vendor]: vendorCart }))
      if (type === 'add') {
        addEventRef.current('add', `+${item.name} (#B${scaleId} ${vendor})`)
      } else if (type === 'delete') {
        addEventRef.current('del', `-eliminó "${item?.name || 'último'}"`)
      } else if (type === 'void') {
        addEventRef.current('void', `${vendor} limpiado`)
      }
    }

    const onPrintStream = ({ scaleId, vendor, ticketNo, totalAmount, totalItems }) => {
      addEventRef.current('print', `ticket #${ticketNo} — ${totalItems} productos, ${formatMoney(totalAmount)}`)
    }

    const onScalesUpdated = (updated) => {
      setScales(updated)
    }

    window.teracom.onScaleConnected(onConnected)
    window.teracom.onScaleDisconnected(onDisconnected)
    window.teracom.onScaleEvent(onScaleEvent)
    window.teracom.onPrintStream(onPrintStream)
    window.teracom.onScalesUpdated(onScalesUpdated)

    // Load initial state
    window.teracom.getCart().then((c) => {
      if (c && Object.keys(c).length > 0) setCart(c)
    })
    window.teracom.getScales().then((s) => {
      setScales(s)
    })

    // Safety poll: re-check scales every 1.5s until at least one is connected.
    // Covers the StrictMode double-mount window where a scale could connect
    // between the cleanup and re-registration of listeners.
    let pollCount = 0
    const poll = setInterval(() => {
      pollCount++
      if (pollCount > 20) {
        clearInterval(poll)
        return
      }
      window.teracom.getScales().then((s) => {
        if (s && s.length > 0) {
          setScales(s)
          clearInterval(poll)
        }
      })
    }, 1500)

    return () => clearInterval(poll)
  }, [])

  useEffect(() => {
    window.teracom?.sendRendererReady()
  }, [])

  // ── Actions ────────────────────────────────────────────────────────
  const handleClearVendor = async (vendor) => {
    await window.teracom?.clearVendor(vendor)
    setCart((prev) => ({ ...prev, [vendor]: [] }))
    addEventRef.current('void', `${vendor} limpiado`)
  }

  const handleClearAll = async () => {
    await window.teracom?.clearAll()
    setCart({ A: [], B: [], C: [], D: [] })
    addEventRef.current('void', 'Todo limpiado')
  }

  const handlePrintVendor = async (vendor) => {
    await window.teracom?.triggerPrint(vendor)
    // The print + void events will update the UI
  }

  // Totals across all vendors
  const allItems = VENDORS.flatMap((v) => cart[v] || [])
  const grandTotal = allItems.reduce((s, i) => s + i.amount, 0)
  const totalItems = allItems.length

  return (
    <div className="app">
      {/* Title bar */}
      <div className="title-bar">
        <div className="title-bar-brand">
          <span className="brand-icon">⚖️</span>
          <div>
            <h1 className="brand-name">TeraCom</h1>
            <p className="brand-sub">Acumulador de Balanza</p>
          </div>
        </div>

        {totalItems > 0 && (
          <div className="title-stats">
            <div className="stat-block">
              <div className="stat-value stat-total">{formatMoney(grandTotal)}</div>
              <div className="stat-label">Total</div>
            </div>
            <div className="stat-block">
              <div className="stat-value">{totalItems}</div>
              <div className="stat-label">Items</div>
            </div>
            <div className="stat-block">
              <div className="stat-value">{scales.length}</div>
              <div className="stat-label">Básculas</div>
            </div>
          </div>
        )}

        {totalItems > 0 && (
          <button className="btn-danger" onClick={handleClearAll}>
            Vaciar todo
          </button>
        )}
      </div>

      {/* Status bar */}
      <div className="status-bar">
        <div className="status-left">
          <div className="status-dot" style={{ backgroundColor: scales.length > 0 ? '#34d399' : '#6b7280' }} />
          <span className="status-text">
            {scales.length > 0
              ? `${scales.length} balanza${scales.length !== 1 ? 's' : ''} conectada${scales.length !== 1 ? 's' : ''}`
              : 'Esperando balanzas…'}
          </span>
          <span className="status-port">· TCP :4001</span>
        </div>
        <span className="status-version">TeraCom v1.0</span>
      </div>

      {/* Body */}
      <div className="app-body">
        {/* Sidebar */}
        <Sidebar scales={scales} />

        {/* Main content */}
        <main className="main-area">
          {totalItems === 0 ? (
            <EmptyState />
          ) : (
            <div className="panels-grid">
              {VENDORS.map((v) => (
                <VendorPanel
                  key={v}
                  vendor={v}
                  items={cart[v] || []}
                  onClear={handleClearVendor}
                  onPrint={handlePrintVendor}
                />
              ))}
            </div>
          )}

          <EventLog events={events} />
        </main>
      </div>
    </div>
  )
}
