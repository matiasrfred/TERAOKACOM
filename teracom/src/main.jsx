import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── Electron IPC setup ────────────────────────────────────────────
// Expose teracom API for the browser build (dev without electron)
if (typeof window !== 'undefined' && !window.teracom) {
  window.teracom = {
    onScaleConnected: () => {},
    onScaleDisconnected: () => {},
    onScaleEvent: () => {},
    onPrintStream: () => {},
    sendCommand: async () => ({ ok: false, error: 'Not in Electron' }),
    getCart: async () => ({}),
    clearVendor: async () => {},
    clearScale: async () => {},
    clearAll: async () => {},
    triggerPrint: async () => {},
    deleteLast: async () => {},
    voidVendor: async () => {},
    removeAllListeners: () => {},
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
