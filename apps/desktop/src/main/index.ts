import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp } from '@electron-toolkit/utils'

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

  // Retry loading until the web server is ready
  const loadWithRetry = (url: string, retries = 30) => {
    const tryLoad = (attempt: number) => {
      mainWindow.loadURL(url).then(() => {
        // Success
      }).catch(() => {
        if (attempt < retries) {
          setTimeout(() => tryLoad(attempt + 1), 500)
        }
      })
    }
    tryLoad(0)
  }

  // In dev mode, load the web dev server with retry
  loadWithRetry('http://127.0.0.1:3456')

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  createWindow()

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
})