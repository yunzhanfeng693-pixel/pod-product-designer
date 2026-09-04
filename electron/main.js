import { app, BrowserWindow, Menu, shell } from 'electron'
import path from 'path'

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'POD产品设计器',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../public/favicon.ico')
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

const menuTemplate = [
  {
    label: '文件',
    submenu: [
      {
        label: '退出',
        accelerator: 'Ctrl+Q',
        click: () => app.quit()
      }
    ]
  },
  {
    label: '编辑',
    submenu: [
      { label: '撤销', accelerator: 'Ctrl+Z', role: 'undo' },
      { label: '重做', accelerator: 'Shift+Ctrl+Z', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', accelerator: 'Ctrl+X', role: 'cut' },
      { label: '复制', accelerator: 'Ctrl+C', role: 'copy' },
      { label: '粘贴', accelerator: 'Ctrl+V', role: 'paste' },
      { label: '全选', accelerator: 'Ctrl+A', role: 'selectAll' }
    ]
  },
  {
    label: '视图',
    submenu: [
      { label: '刷新', accelerator: 'F5', click: (_, focusedWindow) => focusedWindow?.reload() },
      { label: '开发者工具', accelerator: 'Ctrl+Shift+I', click: (_, focusedWindow) => focusedWindow?.webContents.toggleDevTools() },
      { type: 'separator' },
      { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' }
    ]
  },
  {
    label: '帮助',
    submenu: [
      {
        label: '关于',
        click: () => {
          const aboutWindow = new BrowserWindow({
            width: 300,
            height: 200,
            title: '关于 POD产品设计器',
            resizable: false,
            icon: path.join(__dirname, '../public/favicon.ico')
          })
          aboutWindow.loadURL(`data:text/html,
            <html>
              <head><title>关于</title><style>body{margin:20px;font-family:Arial;text-align:center;}</style></head>
              <body>
                <h2>POD产品设计器</h2>
                <p>版本 1.0.0</p>
                <p>作者：lufan</p>
                <p>一款专业的T恤设计工具</p>
              </body>
            </html>
          `)
        }
      }
    ]
  }
]

app.whenReady().then(() => {
  const menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)
  
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
