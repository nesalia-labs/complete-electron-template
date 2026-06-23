import { contextBridge, ipcRenderer } from 'electron'

const ALLOWED_ORIGIN = 'http://127.0.0.1:5173'

// oRPC MessagePort forwarding with origin verification.
// Renderer sends 'start-orpc-client' via postMessage; we forward the
// transferred port to main via the 'start-orpc-server' IPC channel.
window.addEventListener('message', (event) => {
  if (event.origin !== ALLOWED_ORIGIN) {
    console.warn('Blocked postMessage from origin:', event.origin)
    return
  }
  if (event.data === 'start-orpc-client') {
    const [serverPort] = event.ports
    ipcRenderer.postMessage('start-orpc-server', null, [serverPort])
  }
})

// Expose window controls to the renderer.
// Type declaration must stay in sync with apps/web/src/components/headers/app-title-bar.tsx
contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximize-toggle'),
  quit: () => ipcRenderer.invoke('window:quit'),
})