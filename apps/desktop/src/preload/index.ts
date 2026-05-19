import { contextBridge, ipcRenderer } from 'electron'

const ALLOWED_ORIGIN = 'http://127.0.0.1:5173'

// orpc MessagePort forwarding with origin verification
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

// Secure IPC pattern
const api = {
  ping: () => ipcRenderer.invoke('ping')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (window types)
  window.electron = api
}