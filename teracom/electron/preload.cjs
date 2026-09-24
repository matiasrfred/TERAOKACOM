const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('teracom', {
  // Signal that React is mounted and ready
  sendRendererReady: () => ipcRenderer.send('renderer:ready'),

  // TCP scale events
  onScaleConnected: (cb) => ipcRenderer.on('scale:connected', (_e, d) => cb(d)),
  onScaleDisconnected: (cb) => ipcRenderer.on('scale:disconnected', (_e, d) => cb(d)),
  onScaleEvent: (cb) => ipcRenderer.on('scale:event', (_e, d) => cb(d)),
  onPrintStream: (cb) => ipcRenderer.on('scale:print', (_e, d) => cb(d)),
  onScalesUpdated: (cb) => ipcRenderer.on('scales:updated', (_e, d) => cb(d)),
  onScaleTx: (cb) => ipcRenderer.on('scale:tx', (_e, d) => cb(d)),

  // Commands
  sendCommand: (cmd) => ipcRenderer.invoke('tcp:send', cmd),

  // Cart
  getCart: () => ipcRenderer.invoke('cart:get'),
  clearVendor: (vendor) => ipcRenderer.invoke('cart:clearVendor', vendor),
  clearAll: () => ipcRenderer.invoke('cart:clearAll'),

  // Scales
  getScales: () => ipcRenderer.invoke('scales:list'),

  // Print
  triggerPrint: (vendor) => ipcRenderer.invoke('print:trigger', vendor),

  // Scale control
  deleteLast: (vendor) => ipcRenderer.invoke('scale:deleteLast', { vendor }),
  voidVendor: (vendor) => ipcRenderer.invoke('scale:voidVendor', { vendor }),
  queryMode: (ip) => ipcRenderer.invoke('scale:queryMode', { ip }),
  clearDisplay: (ip) => ipcRenderer.invoke('scale:clearDisplay', { ip }),
  setMode: (ip, mode) => ipcRenderer.invoke('scale:setMode', { ip, mode }),

  // Cleanup
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('scale:connected')
    ipcRenderer.removeAllListeners('scale:disconnected')
    ipcRenderer.removeAllListeners('scale:event')
    ipcRenderer.removeAllListeners('scale:print')
    ipcRenderer.removeAllListeners('scales:updated')
  },
})
