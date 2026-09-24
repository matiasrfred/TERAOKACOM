import { useState, useEffect, useRef } from 'react'

const VENDORS = ['A', 'B', 'C', 'D']

const T = {
  en: {
    vendorA: 'Vendor A', vendorB: 'Vendor B', vendorC: 'Vendor C', vendorD: 'Vendor D',
    noProducts: 'No products',
    print: 'Print', clear: 'Clear', delLast: 'Del', voidAll: 'Void',
    units: 'units',
    scales: 'Scales', noneConnected: 'None connected',
    scaleN: 'Scale #',
    activity: 'Activity', noActivity: 'No activity',
    emptyTitle: 'No accumulated products',
    emptyBody: 'Add products from the connected Teraoka scales. Products from each vendor accumulate here.',
    connected: 'connected', disconnected: 'disconnected',
    cleared: 'cleared', allCleared: 'All cleared',
    total: 'Total', items: 'Items',
    clearAll: 'Clear all',
    waitingScales: 'Waiting for scales…',
    scaleConnected: 'scale connected', scalesConnected: 'scales connected',
    scaleAccumulator: 'Scale Accumulator',
    itemLabel: 'item', itemsLabel: 'items',
    clearDisplay: 'CLEAR', clearDisplaySub: 'DISPLAY',
  },
  es: {
    vendorA: 'Vendedor A', vendorB: 'Vendedor B', vendorC: 'Vendedor C', vendorD: 'Vendedor D',
    noProducts: 'Sin productos',
    print: 'Imprimir', clear: 'Limpiar', delLast: 'Sup', voidAll: 'Anular',
    units: 'unidades',
    scales: 'Básculas', noneConnected: 'Ninguna conectada',
    scaleN: 'Báscula #',
    activity: 'Actividad', noActivity: 'Sin actividad',
    emptyTitle: 'Sin productos acumulados',
    emptyBody: 'Agrega productos desde las balanzas Teraoka conectadas. Los productos de cada vendedor se acumulan aquí.',
    connected: 'conectada', disconnected: 'desconectada',
    cleared: 'limpiado', allCleared: 'Todo limpiado',
    total: 'Total', items: 'Items',
    clearAll: 'Vaciar todo',
    waitingScales: 'Esperando balanzas…',
    scaleConnected: 'balanza conectada', scalesConnected: 'balanzas conectadas',
    scaleAccumulator: 'Acumulador de Balanza',
    itemLabel: 'item', itemsLabel: 'items',
    clearDisplay: 'LIMPIAR', clearDisplaySub: 'PANTALLA',
  },
}

const VENDOR_LABELS = { A: 'vendorA', B: 'vendorB', C: 'vendorC', D: 'vendorD' }

function formatMoney(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'CLP' }).format(n)
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── LangToggle ────────────────────────────────────────────────────────
function LangToggle({ lang, onToggle }) {
  return (
    <button className="lang-toggle" onClick={onToggle} title="Toggle language">
      <span className={lang === 'en' ? 'active' : ''}>EN</span>
      <span className={lang === 'es' ? 'active' : ''}>ES</span>
    </button>
  )
}

// ── VendorPanel ────────────────────────────────────────────────────────
function VendorPanel({ vendor, items, onDeleteLast, onVoid, onPrint, t }) {
  const total = items.reduce((s, i) => s + i.amount, 0)
  const totalQty = items.reduce((s, i) => s + i.qty, 0)
  const count = items.length

  return (
    <div className={`vendor-panel vp-${vendor.toLowerCase()}`}>
      <div className="vendor-header">
        <span className="vendor-label">{t(VENDOR_LABELS[vendor])}</span>
        <span className="vendor-badge">{count} {count !== 1 ? t('itemsLabel') : t('itemLabel')}</span>
      </div>

      <div className="vendor-items">
        {items.length === 0 ? (
          <div className="vendor-empty">{t('noProducts')}</div>
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
          <div className="vendor-units">{totalQty} {t('units')}</div>
        </div>
        <div className="vendor-actions">
          {count > 0 && (
            <>
              <button className="btn-delete-last" onClick={() => onDeleteLast(vendor)} title={t('delLast')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                {t('delLast')}
              </button>
              <button className="btn-void" onClick={() => onVoid(vendor)} title={t('voidAll')}>
                {t('voidAll')}
              </button>
              <button className="btn-print-vendor" onClick={() => onPrint(vendor)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
                </svg>
                {t('print')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────
function Sidebar({ scales, t, onClearDisplay }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">{t('scales')}</span>
        <span className="sidebar-count">{scales.length}</span>
      </div>
      <div className="sidebar-list">
        {scales.length === 0 ? (
          <div className="sidebar-empty">{t('noneConnected')}</div>
        ) : (
          scales.map((s) => (
            <div key={s.ip} className="sidebar-scale">
              <div className="scale-indicator" />
              <div className="scale-info">
                <div className="scale-name">{t('scaleN')}{s.scaleId}</div>
                <div className="scale-ip">{s.ip}</div>
              </div>
              <button
                className="sidebar-clear-btn"
                onClick={() => onClearDisplay(s.ip)}
                title="Limpiar display"
              >
                {t('clearDisplay')}
                <span>{t('clearDisplaySub')}</span>
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}

// ── EventLog ───────────────────────────────────────────────────────────
function EventLog({ events, t }) {
  return (
    <div className="event-log">
      <div className="event-log-header"><span>{t('activity')}</span></div>
      <div className="event-log-body">
        {events.length === 0 ? (
          <div className="event-empty">{t('noActivity')}</div>
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
function EmptyState({ t }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">⚖️</div>
      <h2>{t('emptyTitle')}</h2>
      <p>{t('emptyBody')}</p>
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
  const [lang, setLang] = useState('en')

  const t = (key) => T[lang][key]

  const addEventRef = useRef(null)
  addEventRef.current = (type, message) => {
    setEvents((prev) => [
      ...prev,
      { id: makeId(), type, message, ts: new Date().toLocaleTimeString('en-US', { hour12: false }) },
    ].slice(-50))
  }

  useEffect(() => {
    if (!window.teracom) return
    if (ipcRegistered) return
    ipcRegistered = true

    const onConnected = ({ ip, scaleId }) => {
      const msg = lang === 'es' ? `#${scaleId} conectada` : `#${scaleId} connected`
      addEventRef.current('connected', msg)
    }

    const onDisconnected = ({ ip, scaleId }) => {
      const msg = lang === 'es' ? `#${scaleId} desconectada` : `#${scaleId} disconnected`
      addEventRef.current('disconnected', msg)
    }

    const onScaleEvent = ({ type, scaleId, vendor, item, cart: vendorCart, frame }) => {
      setCart((prev) => ({ ...prev, [vendor]: vendorCart }))
      if (type === 'add') {
        addEventRef.current('add', `+${item.name}  ${frame}`)
      } else if (type === 'delete') {
        addEventRef.current('del', `- "${item?.name || 'last'}"  ${frame}`)
      } else if (type === 'void') {
        const msg = lang === 'es' ? `${frame}  ${vendor} limpiado` : `${frame}  ${vendor} cleared`
        addEventRef.current('void', msg)
      }
    }

    const onPrintStream = ({ scaleId, vendor, ticketNo, totalAmount, totalItems, frames }) => {
      addEventRef.current('print', `${frames.join(' ')}  ${ticketNo} — ${totalItems}p, ${formatMoney(totalAmount)}`)
    }

    const onScalesUpdated = (updated) => {
      setScales(updated)
    }

    window.teracom.onScaleConnected(onConnected)
    window.teracom.onScaleDisconnected(onDisconnected)
    window.teracom.onScaleEvent(onScaleEvent)
    window.teracom.onPrintStream(onPrintStream)
    window.teracom.onScalesUpdated(onScalesUpdated)
    window.teracom.onScaleTx(({ scaleId, vendor, frame }) => {
      addEventRef.current('tx', `${frame}`)
    })

    // Load initial state
    window.teracom.getCart().then((c) => {
      if (c && Object.keys(c).length > 0) setCart(c)
    })
    window.teracom.getScales().then((s) => {
      setScales(s)
    })

    // Safety poll: re-check scales every 1.5s until at least one is connected.
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
  }, [lang])

  useEffect(() => {
    window.teracom?.sendRendererReady()
  }, [])

  // ── Actions ────────────────────────────────────────────────────────
  const handleDeleteLast = async (vendor) => {
    await window.teracom?.deleteLast(vendor)
    // Response event 'scale:event' with type='delete' will update cart
  }

  const handleVoidVendor = async (vendor) => {
    await window.teracom?.voidVendor(vendor)
    // Response event 'scale:event' with type='void' will update cart
  }

  const handleClearAll = async () => {
    await window.teracom?.clearAll()
    setCart({ A: [], B: [], C: [], D: [] })
    addEventRef.current('void', t('allCleared'))
  }

  const handlePrintVendor = async (vendor) => {
    await window.teracom?.triggerPrint(vendor)
  }

  const handleClearDisplay = async (ip) => {
    await window.teracom?.clearDisplay(ip)
  }

  // Totals across all vendors
  const allItems = VENDORS.flatMap((v) => cart[v] || [])
  const grandTotal = allItems.reduce((s, i) => s + i.amount, 0)
  const totalItems = allItems.length

  const scaleLabel = scales.length === 1
    ? `1 ${t('scaleConnected')}`
    : `${scales.length} ${t('scalesConnected')}`

  return (
    <div className="app">
      {/* Title bar */}
      <div className="title-bar">
        <div className="title-bar-brand">
          <span className="brand-icon">⚖️</span>
          <div>
            <h1 className="brand-name">TeraCom</h1>
            <p className="brand-sub">{t('scaleAccumulator')}</p>
          </div>
        </div>

        <LangToggle lang={lang} onToggle={() => setLang((l) => (l === 'en' ? 'es' : 'en'))} />

        {totalItems > 0 && (
          <div className="title-stats">
            <div className="stat-block">
              <div className="stat-value stat-total">{formatMoney(grandTotal)}</div>
              <div className="stat-label">{t('total')}</div>
            </div>
            <div className="stat-block">
              <div className="stat-value">{totalItems}</div>
              <div className="stat-label">{t('items')}</div>
            </div>
            <div className="stat-block">
              <div className="stat-value">{scales.length}</div>
              <div className="stat-label">{t('scales')}</div>
            </div>
          </div>
        )}

        {totalItems > 0 && (
          <button className="btn-danger" onClick={handleClearAll}>
            {t('clearAll')}
          </button>
        )}
      </div>

      {/* Status bar */}
      <div className="status-bar">
        <div className="status-left">
          <div className="status-dot" style={{ backgroundColor: scales.length > 0 ? '#34d399' : '#6b7280' }} />
          <span className="status-text">
            {scales.length > 0 ? scaleLabel : t('waitingScales')}
          </span>
          <span className="status-port">· TCP :4001</span>
        </div>
        <span className="status-version">TeraCom v1.0</span>
      </div>

      {/* Body */}
      <div className="app-body">
        {/* Sidebar */}
        <Sidebar scales={scales} t={t} onClearDisplay={handleClearDisplay} />

        {/* Main content */}
        <main className="main-area">
          {scales.length === 0 && totalItems === 0 ? (
            <EmptyState t={t} />
          ) : (
            <div className="panels-grid">
              {VENDORS.map((v) => (
                <VendorPanel
                  key={v}
                  vendor={v}
                  items={cart[v] || []}
                  onDeleteLast={handleDeleteLast}
                  onVoid={handleVoidVendor}
                  onPrint={handlePrintVendor}
                  t={t}
                />
              ))}
            </div>
          )}
        </main>

        {/* Right sidebar — Activity */}
        <aside className="activity-sidebar">
          <EventLog events={events} t={t} />
        </aside>
      </div>
    </div>
  )
}
