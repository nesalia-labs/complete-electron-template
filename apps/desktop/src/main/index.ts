import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp } from '@electron-toolkit/utils'
import { RPCHandler } from '@orpc/server/message-port'
import { onError } from '@orpc/server'
import { router } from './router'
import { runMigrations } from './db'

console.log('[MAIN] index.ts module loaded')

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error('[MAIN] RPCHandler error:', error)
      console.error('[MAIN] error stack:', error instanceof Error ? error.stack : 'no stack')
    })
  ]
})
console.log('[MAIN] RPCHandler created:', handler ? 'ok' : 'null')

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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

  return mainWindow
}

app.whenReady().then(async () => {
  console.log('[MAIN] App whenReady fired')

  console.log('[MAIN] Running migrations...')
  await runMigrations()
  console.log('[MAIN] Migrations done')

  ipcMain.on('start-orpc-server', async (event) => {
    console.log('[MAIN] start-orpc-server received')
    const [serverPort] = event.ports
    handler.upgrade(serverPort)
    serverPort.start()
  })

  const mainWindow = createWindow()
  console.log('[MAIN] Window created, loading URL...')

  await mainWindow.loadURL('http://127.0.0.1:5173')
  console.log('[MAIN] loadURL complete')

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