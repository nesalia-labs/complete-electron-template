import { app, BrowserWindow, Menu, shell, ipcMain, session } from 'electron'
import { join } from 'path'
import { RPCHandler } from '@orpc/server/message-port'
import { onError } from '@orpc/server'
import { createRouter } from '@electron-template/api'
import { initDatabase, closeSqlite, runMigrations } from '@electron-template/db'
import { store as settingsStore } from './settings.js'
import { closeProject } from './projects.js'

const dataPath = join(app.getPath('userData'), 'data')
const handle = initDatabase({ dataPath, backup: true })
runMigrations(handle.db)

const router = createRouter(handle.db, settingsStore)
const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error('[RPCHandler error]', error)
    })
  ]
})

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    frame: false,              // removes native chrome
    titleBarStyle: 'hidden',   // macOS: hides traffic lights
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('console-message', (event) => {
    const { level, message, lineNumber, sourceId } = event
    console.log(`[renderer ${level.toUpperCase()}] ${message} (${sourceId}:${lineNumber})`)
  })

  return mainWindow
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)

  // Install Content-Security-Policy via webRequest. This is the compensating
  // control for `sandbox: false` (see ADR docs/internal/security.md).
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = app.isPackaged
      ? // Prod: no inline scripts (bundled), inline styles allowed (Tailwind/shadcn inject <style> tags).
        "default-src 'self' file:; " +
        "script-src 'self' file:; " +
        "style-src 'self' file: 'unsafe-inline'; " +
        "img-src 'self' file: data:; " +
        "connect-src 'self' file:; " +
        "font-src 'self' file: data:; " +
        "object-src 'none'; " +
        "base-uri 'none'; " +
        "form-action 'none'; " +
        "frame-ancestors 'none';"
      : // Dev: Vite HMR needs inline scripts + WebSocket to the dev server.
        "default-src 'self' http://127.0.0.1:5173; " +
        "script-src 'self' http://127.0.0.1:5173 'unsafe-inline'; " +
        "style-src 'self' http://127.0.0.1:5173 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "connect-src 'self' ws://127.0.0.1:5173 http://127.0.0.1:5173; " +
        "font-src 'self' data:; " +
        "object-src 'none'; " +
        "base-uri 'none';"

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  ipcMain.on('start-orpc-server', async (event) => {
    const [serverPort] = event.ports
    handler.upgrade(serverPort)
    serverPort.start()
  })

  const mainWindow = createWindow()

  // Remove the default menu bar completely (defense-in-depth alongside Menu.setApplicationMenu(null))
  mainWindow.removeMenu()
  mainWindow.setMenu(null)

  // Window control IPC handlers (must come AFTER mainWindow is created)
  ipcMain.handle('window:minimize', () => mainWindow.minimize())
  ipcMain.handle('window:maximize-toggle', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.handle('window:quit', () => app.quit())

  if (!app.isPackaged) {
    await mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
})

app.on('before-quit', () => {
  closeProject()
  closeSqlite(handle)
})
