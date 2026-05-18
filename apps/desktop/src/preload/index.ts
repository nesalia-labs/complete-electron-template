import { contextBridge, ipcRenderer } from 'electron'

// Secure IPC pattern — expose a typed API, not raw ipcRenderer
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