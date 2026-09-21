import { app, BrowserWindow, Menu, shell, ipcMain, dialog, Notification } from 'electron'
import { promises as fs } from 'fs'
import { createHash, randomUUID } from 'crypto'
import { ExternalAiRelay as DoubaoRelay } from './doubao-relay/relay.mjs'
import { buildModelPrompt } from './doubao-relay/model-prompt.mjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  let saveWindowTimer
  const saveWindowState = () => {
    clearTimeout(saveWindowTimer)
    saveWindowTimer = setTimeout(() => {
      if (!mainWindow.isDestroyed()) {
        const bounds = mainWindow.getBounds()
        void writeJson(getWindowSettingsPath(), { bounds, isMaximized: mainWindow.isMaximized() })
      }
    }, 300)
  }
  mainWindow.on('resize', saveWindowState)
  mainWindow.on('move', saveWindowState)
  mainWindow.on('close', saveWindowState)

  void readJson(getWindowSettingsPath(), {}).then(state => {
    const bounds = state?.bounds
    if (!mainWindow.isDestroyed() && bounds && Number.isFinite(bounds.width) && Number.isFinite(bounds.height)) {
      mainWindow.setBounds({
        x: Number.isFinite(bounds.x) ? bounds.x : undefined,
        y: Number.isFinite(bounds.y) ? bounds.y : undefined,
        width: Math.max(1024, bounds.width),
        height: Math.max(768, bounds.height)
      })
      if (state.isMaximized) mainWindow.maximize()
    }
  }).catch(() => undefined)
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
            resizable: false
          })
          aboutWindow.loadURL(`data:text/html,
            <html>
              <head><title>关于</title><style>body{margin:20px;font-family:Arial;text-align:center;}</style></head>
              <body>
                <h2>POD产品设计器</h2>
                <p>版本 1.1.1</p>
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

const relayRoot = () => path.join(app.getPath('userData'), 'gpt-relay')
let gptRelay

const getRelay = () => {
  if (!gptRelay) {
    const bundledNode = app.isPackaged ? path.join(process.resourcesPath, 'runtime', 'node.exe') : 'node'
    const workerPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'doubao-relay', 'worker.mjs')
      : undefined
    gptRelay = new DoubaoRelay({ dataRoot: relayRoot(), workerPath, runtimePath: process.env.POD_GPT_NODE || bundledNode, timeoutMs: 35000 })
  }
  return gptRelay
}

const readJson = async (filePath, fallback) => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

const createWindowKey = (shirtId) => `pod-product-designer:shirt:${createHash('sha256').update(String(shirtId)).digest('hex').slice(0, 16)}`
const safeResultName = value => String(value || '产品').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 40) || '产品'

const saveReferenceImages = async (taskDir, images) => {
  await fs.mkdir(taskDir, { recursive: true })
  const saved = []
  for (const image of images) {
    if (!['front', 'back'].includes(image.side) || typeof image.dataUrl !== 'string') throw new Error('参考图格式无效。')
    const match = image.dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)
    if (!match) throw new Error('参考图必须是 PNG。')
    const buffer = Buffer.from(match[1], 'base64')
    if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw new Error('参考图大小异常。')
    const imagePath = path.join(taskDir, `reference-${image.side}.png`)
    await fs.writeFile(imagePath, buffer)
    saved.push(imagePath)
  }
  return saved
}

const getBindingsPath = () => path.join(relayRoot(), 'doubao-bindings.json')
const getSettingsPath = () => path.join(relayRoot(), 'settings.json')
const defaultOutputPath = () => path.join(app.getPath('documents'), 'POD产品设计器', '豆包结果')
const getDesignLibrarySettingsPath = () => path.join(app.getPath('userData'), 'design-library.json')
const getWindowSettingsPath = () => path.join(app.getPath('userData'), 'window-state.json')

const listDesignLibraryFiles = async (folderPath, knownNames = new Set()) => {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true })
    const files = []
    for (const entry of entries.filter(item => item.isFile() && /\.png$/i.test(item.name) && !knownNames.has(item.name)).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))) {
      try {
        const data = await fs.readFile(path.join(folderPath, entry.name))
        files.push({ name: entry.name, dataUrl: `data:image/png;base64,${data.toString('base64')}` })
      } catch {
        // A file may be temporarily locked while an external generator is writing it.
      }
    }
    return files
  } catch {
    return []
  }
}

ipcMain.handle('design-library:get-folder', async (_event, input = {}) => {
  const settings = await readJson(getDesignLibrarySettingsPath(), {})
  const folderPath = typeof settings.folderPath === 'string' ? settings.folderPath : ''
  if (!folderPath) return { files: [] }
  const knownNames = new Set(Array.isArray(input.knownNames) ? input.knownNames.filter(name => typeof name === 'string') : [])
  return { folderPath, folderName: path.basename(folderPath), files: await listDesignLibraryFiles(folderPath, knownNames) }
})

ipcMain.handle('design-library:clear-folder', async () => {
  await fs.rm(getDesignLibrarySettingsPath(), { force: true })
  return { cleared: true }
})

ipcMain.handle('design-library:choose-folder', async () => {
  const settings = await readJson(getDesignLibrarySettingsPath(), {})
  const result = await dialog.showOpenDialog({
    title: '选择设计素材文件夹',
    defaultPath: settings.folderPath,
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return { canceled: true, files: [] }
  const folderPath = result.filePaths[0]
  await writeJson(getDesignLibrarySettingsPath(), { folderPath, updatedAt: new Date().toISOString() })
  return { canceled: false, folderPath, folderName: path.basename(folderPath), files: await listDesignLibraryFiles(folderPath) }
})
ipcMain.handle('gpt:get-settings', async () => {
  const settings = await readJson(getSettingsPath(), {})
  const outputPath = settings.outputPath || defaultOutputPath()
  await fs.mkdir(outputPath, { recursive: true })
  return { outputPath }
})

ipcMain.handle('gpt:choose-output-path', async () => {
  const current = await readJson(getSettingsPath(), {})
  const result = await dialog.showOpenDialog({ title: '选择豆包图片保存文件夹', defaultPath: current.outputPath || defaultOutputPath(), properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled || !result.filePaths[0]) return { outputPath: current.outputPath || defaultOutputPath(), canceled: true }
  const outputPath = result.filePaths[0]
  await fs.mkdir(outputPath, { recursive: true })
  await writeJson(getSettingsPath(), { ...current, outputPath })
  return { outputPath, canceled: false }
})

ipcMain.handle('gpt:open', async (_event, input = {}) => {
  const windowKey = 'pod-product-designer:manual-login'
  const relay = getRelay()
  const options = {
    debug_endpoint: 'http://127.0.0.1:9223',
    session_url: 'https://www.doubao.com/chat/',
    window_key: windowKey,
    window_name: 'POD产品设计器 · 豆包登录'
  }
  return relay.ensureBrowser(options)
})

const getOutputPath = async () => {
  const settings = await readJson(getSettingsPath(), {})
  const outputPath = settings.outputPath || defaultOutputPath()
  await fs.mkdir(outputPath, { recursive: true })
  return outputPath
}

const getAllGptTasks = async () => {
  const tasksRoot = path.join(relayRoot(), 'tasks')
  try {
    const entries = await fs.readdir(tasksRoot, { withFileTypes: true })
    const records = await Promise.all(entries.filter(entry => entry.isDirectory()).map(async entry => {
      const taskPath = path.join(tasksRoot, entry.name, 'task.json')
      return { taskPath, taskDir: path.join(tasksRoot, entry.name), record: await readJson(taskPath, null) }
    }))
    return records.filter(item => item.record?.provider === 'doubao').sort((a, b) => String(b.record.createdAt || '').localeCompare(String(a.record.createdAt || '')))
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

const summarizeTask = record => ({
  requestId: record.requestId,
  title: record.title,
  shirtName: record.shirtName || '未命名产品',
  sides: record.sides || [],
  status: record.status,
  createdAt: record.createdAt,
  sentAt: record.sentAt,
  retrievedAt: record.retrievedAt,
  resultPath: record.resultPath,
  fileCount: Array.isArray(record.files) ? record.files.length : 0,
  detectedCount: record.detectedCount || 0,
  error: record.lastCheckError || record.error || ''
})

const getPendingGptTasks = async () => (await getAllGptTasks()).filter(item =>
  ['SENT', 'NEEDS_ATTENTION'].includes(item.record.status) ||
  (item.record.status === 'RETRIEVED' && (!Array.isArray(item.record.files) || item.record.files.length < 5))
)

const notifyTaskCompleted = (record, count, destination) => {
  if (!Notification.isSupported()) return
  const notice = new Notification({ title: '豆包套图已完成', body: `${record.shirtName || '当前产品'} 已下载 ${count} 张图片。` })
  notice.on('click', () => void shell.openPath(destination))
  notice.show()
}

let retrievePromise = null
const retrieveGptResultsOnce = async () => {
  const pending = await getPendingGptTasks()
  const bindings = await readJson(getBindingsPath(), {})
  const relay = getRelay()
  const outputPath = await getOutputPath()
  const outcomes = []
  for (const item of pending) {
    const binding = bindings[item.record.windowKey] || {}
    const requestOutput = path.join(item.taskDir, 'retrieved')
    const options = { debug_endpoint: 'http://127.0.0.1:9223', session_url: binding.sessionUrl || item.record.sessionUrl || 'https://www.doubao.com/chat/', window_key: item.record.windowKey, window_session_urls: binding.sessionUrl ? [binding.sessionUrl] : [], request_id: item.record.requestId, kind: 'IMAGE', output_dir: requestOutput, timeout_ms: 35000, background: true }
    try {
      const result = await relay.withWindow('__doubao_operations__', async () => { await relay.ensureBrowser(options); return relay.retrieve(options) })
      if (result.status !== 'RETRIEVED') {
        const updated = { ...item.record, status: result.status === 'NOT_READY' ? 'SENT' : item.record.status, detectedCount: result.count || item.record.detectedCount || 0, lastCheckedAt: new Date().toISOString(), lastCheckError: result.message || '' }
        await writeJson(item.taskPath, updated)
        outcomes.push({ requestId: item.record.requestId, status: result.status, count: result.count || 0 })
        continue
      }
      const resultFiles = Array.isArray(result.files) ? result.files : []
      if (resultFiles.length < 5) {
        await writeJson(item.taskPath, { ...item.record, status: 'SENT', detectedCount: resultFiles.length, lastCheckedAt: new Date().toISOString() })
        outcomes.push({ requestId: item.record.requestId, status: 'NOT_READY', count: resultFiles.length })
        continue
      }
      const destination = path.join(outputPath, item.record.resultFolderName || item.record.requestId)
      await fs.mkdir(destination, { recursive: true })
      for (const file of resultFiles) await fs.copyFile(file.path, path.join(destination, path.basename(file.path)))
      const completed = { ...item.record, status: 'RETRIEVED', resultPath: destination, retrievedAt: result.retrieved_at, files: resultFiles, detectedCount: resultFiles.length, lastCheckedAt: new Date().toISOString(), lastCheckError: '', notifiedAt: item.record.notifiedAt || new Date().toISOString() }
      await writeJson(item.taskPath, completed)
      if (!item.record.notifiedAt) notifyTaskCompleted(completed, resultFiles.length, destination)
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('gpt:task-updated', summarizeTask(completed))
      outcomes.push({ requestId: item.record.requestId, status: 'RETRIEVED', resultPath: destination, count: resultFiles.length })
    } catch (error) {
      const message = String(error?.message || error)
      await writeJson(item.taskPath, { ...item.record, lastCheckedAt: new Date().toISOString(), lastCheckError: message })
      outcomes.push({ requestId: item.record.requestId, status: 'ERROR', error: message })
    }
  }
  return outcomes
}

const retrieveGptResults = () => {
  if (!retrievePromise) retrievePromise = retrieveGptResultsOnce().finally(() => { retrievePromise = null })
  return retrievePromise
}

ipcMain.handle('gpt:list-tasks', async () => (await getAllGptTasks()).slice(0, 50).map(item => summarizeTask(item.record)))
ipcMain.handle('gpt:open-result', async (_event, requestId) => {
  if (!/^pod-[0-9a-f-]+$/i.test(String(requestId || ''))) throw new Error('任务编号无效。')
  const taskPath = path.join(relayRoot(), 'tasks', String(requestId), 'task.json')
  const record = await readJson(taskPath, null)
  if (!record?.resultPath) throw new Error('该任务还没有可打开的结果文件夹。')
  const openError = await shell.openPath(record.resultPath)
  if (openError) throw new Error(openError)
  return { opened: true }
})
ipcMain.handle('gpt:send-tasks', async (_event, input = {}) => {
  const shirtId = String(input.shirtId || '').trim()
  const images = Array.isArray(input.images) ? input.images : []
  const tasks = Array.isArray(input.tasks) ? input.tasks : []
  if (!shirtId) throw new Error('请先选择基板。')
  if (!images.length) throw new Error('请先选择至少一张已完成设计的正面或反面合成图。')
  if (!tasks.length) throw new Error('请至少勾选一条裂变关键词。')

  const windowKey = createWindowKey(shirtId)
  const bindingsPath = getBindingsPath()
  const bindings = await readJson(bindingsPath, {})
  const relay = getRelay()
  const outcomes = []

  for (const selectedTask of tasks) {
    const title = String(selectedTask.title || '').trim()
    const originalPrompt = String(selectedTask.prompt || '').trim()
    const prompt = originalPrompt ? buildModelPrompt(originalPrompt) : ''
    if (!title || !prompt) throw new Error('裂变关键词不完整。')

    const requestId = `pod-${randomUUID()}`
    const createdAt = new Date().toISOString()
    const shirtName = String(input.shirtName || '未命名产品').trim() || '未命名产品'
    const stamp = createdAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    const resultFolderName = `${stamp}-${safeResultName(shirtName)}-${requestId.slice(-8)}`
    const taskDir = path.join(relayRoot(), 'tasks', requestId)
    const imagePaths = await saveReferenceImages(taskDir, images)
    const taskFile = path.join(taskDir, 'task.json')
    const taskRecord = {
      provider: 'doubao',
      requestId,
      status: 'SEND_PENDING',
      title,
      prompt,
      shirtName,
      sides: images.map(image => image.side),
      resultFolderName,
      windowKey,
      imagePaths,
      createdAt
    }
    await writeJson(taskFile, taskRecord)

    const binding = bindings[windowKey] || {}
    const options = {
      debug_endpoint: 'http://127.0.0.1:9223',
      session_url: binding.sessionUrl || 'https://www.doubao.com/chat/',
      window_key: windowKey,
      window_name: `POD产品设计器 · ${String(input.shirtName || '裂变任务').slice(0, 50)}`,
      window_session_urls: binding.sessionUrl ? [binding.sessionUrl] : [],
      request_id: requestId,
      prompt: `${prompt}\n\n【任务编号：${requestId}】`,
      image_paths: imagePaths,
      timeout_ms: 35000
    }

    try {
      const sent = await relay.withWindow('__doubao_operations__', async () => {
        await relay.ensureBrowser(options)
        return relay.send(options)
      })
      bindings[windowKey] = { sessionUrl: sent.bound_url, updatedAt: new Date().toISOString() }
      await writeJson(bindingsPath, bindings)
      const sentRecord = { ...taskRecord, status: 'SENT', sentAt: sent.sent_at, sessionUrl: sent.bound_url }
      await writeJson(taskFile, sentRecord)
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('gpt:task-updated', summarizeTask(sentRecord))
      outcomes.push({ requestId, title, status: 'SENT' })
    } catch (error) {
      const phase = error?.phase || 'before_send'
      const manualReady = String(error?.message || error).includes('提示词已填写')
      const status = phase === 'after_click' || manualReady ? 'NEEDS_ATTENTION' : 'DRAFT'
      await writeJson(taskFile, { ...taskRecord, status, error: String(error?.message || error), updatedAt: new Date().toISOString() })
      outcomes.push({ requestId, title, status, error: String(error?.message || error) })
      if (status === 'NEEDS_ATTENTION') break
    }
  }

  return outcomes
})

ipcMain.handle('gpt:retrieve-results', async () => retrieveGptResults())

let backgroundMonitorTimer
const startBackgroundMonitor = () => {
  setTimeout(() => void retrieveGptResults().catch(() => undefined), 3000)
  backgroundMonitorTimer = setInterval(() => void retrieveGptResults().catch(() => undefined), 15000)
}

app.whenReady().then(() => {
  const menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)
  
  createWindow()
  startBackgroundMonitor()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => { if (backgroundMonitorTimer) clearInterval(backgroundMonitorTimer) })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
