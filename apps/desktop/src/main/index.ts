import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { RPCHandler } from '@orpc/server/message-port'
import { onError } from '@orpc/server'
import { router } from '@electron-template/api'
import { initDatabase } from '@electron-template/db'

const dataPath = join(app.getPath('userData'), 'data')
initDatabase({ dataPath })

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
  ipcMain.on('start-orpc-server', async (event) => {
    const [serverPort] = event.ports
    handler.upgrade(serverPort)
    serverPort.start()
  })

  const mainWindow = createWindow()
  if (is.dev || !app.isPackaged) {
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