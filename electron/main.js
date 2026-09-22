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
          const version = app.getVersion()
          const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>关于</title><style>body{margin:24px;font-family:"Microsoft YaHei",Arial,sans-serif;text-align:center;color:#1f2937}h2{margin:0 0 14px}p{margin:8px 0;color:#4b5563}</style></head><body><h2>POD产品设计器</h2><p>版本 ${version}</p><p>作者：lufan</p><p>服装产品设计与 AI 裂变工具</p></body></html>`
          aboutWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
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

const createPatternFolderName = patternKey => `pattern-${createHash('sha256').update(String(patternKey || 'unknown-pattern')).digest('hex').slice(0, 12)}`
const createJobFolderName = (createdAt, requestId) => {
  const stamp = String(createdAt || new Date().toISOString()).replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  return `job-${stamp}-${String(requestId || '').slice(-8)}`
}
const resolveNumberedPatternFolder = async (outputPath, patternFolderName) => {
  const suffix = String(patternFolderName || 'pattern-legacy')
  await fs.mkdir(outputPath, { recursive: true })
  const entries = await fs.readdir(outputPath, { withFileTypes: true })
  const existing = entries.find(entry => entry.isDirectory() && entry.name.endsWith(`-${suffix}`))
  if (existing) return existing.name
  const highest = entries.reduce((maximum, entry) => {
    if (!entry.isDirectory()) return maximum
    const match = entry.name.match(/^(\d+)-pattern-/)
    return match ? Math.max(maximum, Number(match[1])) : maximum
  }, 0)
  return `${String(highest + 1).padStart(3, '0')}-${suffix}`
}
const saveReferenceImages = async (taskDir, images) => {
  await fs.mkdir(taskDir, { recursive: true })
  const saved = []
  for (const image of images) {
    if (!['front', 'back', 'model'].includes(image.side) || typeof image.dataUrl !== 'string') throw new Error('参考图格式无效。')
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
  taskKind: record.taskKind || 'suite',
  expectedCount: record.expectedCount || 5,
  modelReferencePath: record.modelReferencePath || '',
  queuePosition: record.queuePosition || 0,
  status: record.status,
  createdAt: record.createdAt,
  sentAt: record.sentAt,
  retrievedAt: record.retrievedAt,
  resultPath: record.resultPath,
  fileCount: Array.isArray(record.files) ? record.files.length : 0,
  detectedCount: record.detectedCount || 0,
  error: record.lastCheckError || record.error || ''
})

const QUEUE_REVIEW_TIMEOUT_MS = 5 * 60 * 1000
const QUEUE_AUTO_SKIP_TIMEOUT_MS = QUEUE_REVIEW_TIMEOUT_MS + 2 * 60 * 1000
const queueWatchStartedAt = record => Date.parse(record.queueWatchStartedAt || record.sentAt || '')
const shouldPauseQueuedTask = record => {
  if (!record.queuePosition || record.status !== 'SENT') return false
  const startedAt = queueWatchStartedAt(record)
  return Number.isFinite(startedAt) && Date.now() - startedAt >= QUEUE_REVIEW_TIMEOUT_MS
}
const shouldAutoSkipQueuedTask = record => {
  if (!record.queuePosition || record.status !== 'NEEDS_ATTENTION') return false
  const startedAt = queueWatchStartedAt(record)
  return Number.isFinite(startedAt) && Date.now() - startedAt >= QUEUE_AUTO_SKIP_TIMEOUT_MS
}
const getPendingGptTasks = async () => (await getAllGptTasks()).filter(item =>
  ['SENT', 'NEEDS_ATTENTION'].includes(item.record.status) ||
  (item.record.status === 'RETRIEVED' && (!Array.isArray(item.record.files) || item.record.files.length < (item.record.expectedCount || 5)))
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
    const options = { debug_endpoint: 'http://127.0.0.1:9223', session_url: binding.sessionUrl || item.record.sessionUrl || 'https://www.doubao.com/chat/', window_key: item.record.windowKey, window_session_urls: binding.sessionUrl ? [binding.sessionUrl] : [], request_id: item.record.requestId, kind: 'IMAGE', expected_count: item.record.expectedCount || 5, output_dir: requestOutput, timeout_ms: 35000, background: true }
    try {
      const result = await relay.withWindow('__doubao_operations__', async () => { await relay.ensureBrowser(options); return relay.retrieve(options) })
      if (result.status !== 'RETRIEVED') {
        const autoSkipQueue = result.status === 'NOT_READY' && shouldAutoSkipQueuedTask(item.record)
        const pauseQueue = result.status === 'NOT_READY' && shouldPauseQueuedTask(item.record)
        const updated = { ...item.record, status: autoSkipQueue ? 'CANCELLED' : (pauseQueue ? 'NEEDS_ATTENTION' : (result.status === 'NOT_READY' ? (item.record.status === 'NEEDS_ATTENTION' ? 'NEEDS_ATTENTION' : 'SENT') : item.record.status)), detectedCount: result.count || item.record.detectedCount || 0, lastCheckedAt: new Date().toISOString(), lastCheckError: autoSkipQueue ? '累计等待 7 分钟未获人工确认，已自动跳过并继续后续队列。' : (pauseQueue ? '等待图片保存超过 5 分钟，队列已暂停，请选择继续等待或跳过此任务。' : (result.message || '')), autoSkippedAt: autoSkipQueue ? new Date().toISOString() : item.record.autoSkippedAt }
        await writeJson(item.taskPath, updated)
        if (autoSkipQueue) void processSendQueue().catch(() => undefined)
        outcomes.push({ requestId: item.record.requestId, status: autoSkipQueue ? 'CANCELLED' : result.status, count: result.count || 0 })
        continue
      }
      const resultFiles = Array.isArray(result.files) ? result.files : []
      if (resultFiles.length < (item.record.expectedCount || 5)) {
        const autoSkipQueue = shouldAutoSkipQueuedTask(item.record)
        const pauseQueue = shouldPauseQueuedTask(item.record)
        await writeJson(item.taskPath, { ...item.record, status: autoSkipQueue ? 'CANCELLED' : (pauseQueue ? 'NEEDS_ATTENTION' : (item.record.status === 'NEEDS_ATTENTION' ? 'NEEDS_ATTENTION' : 'SENT')), detectedCount: resultFiles.length, lastCheckedAt: new Date().toISOString(), lastCheckError: autoSkipQueue ? '累计等待 7 分钟未获人工确认，已自动跳过并继续后续队列。' : (pauseQueue ? '等待图片保存超过 5 分钟，队列已暂停，请选择继续等待或跳过此任务。' : item.record.lastCheckError || ''), autoSkippedAt: autoSkipQueue ? new Date().toISOString() : item.record.autoSkippedAt })
        if (autoSkipQueue) void processSendQueue().catch(() => undefined)
        outcomes.push({ requestId: item.record.requestId, status: autoSkipQueue ? 'CANCELLED' : 'NOT_READY', count: resultFiles.length })
        continue
      }
      const patternFolderName = await resolveNumberedPatternFolder(outputPath, item.record.patternFolderName || 'pattern-legacy')
      const destination = path.join(outputPath, patternFolderName, item.record.patternFolderName ? (item.record.resultFolderName || createJobFolderName(item.record.createdAt, item.record.requestId)) : createJobFolderName(item.record.createdAt, item.record.requestId))
      await fs.mkdir(destination, { recursive: true })
      for (const file of resultFiles) await fs.copyFile(file.path, path.join(destination, path.basename(file.path)))
      const completed = { ...item.record, status: 'RETRIEVED', patternFolderName, resultPath: destination, retrievedAt: result.retrieved_at, files: resultFiles, modelReferencePath: item.record.taskKind === 'model-anchor' ? resultFiles[0]?.path || '' : item.record.modelReferencePath || '', detectedCount: resultFiles.length, lastCheckedAt: new Date().toISOString(), lastCheckError: '', notifiedAt: item.record.notifiedAt || new Date().toISOString() }
      await writeJson(item.taskPath, completed)
      if (!item.record.notifiedAt) notifyTaskCompleted(completed, resultFiles.length, destination)
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('gpt:task-updated', summarizeTask(completed))
      outcomes.push({ requestId: item.record.requestId, status: 'RETRIEVED', resultPath: destination, count: resultFiles.length })
      void processSendQueue().catch(() => undefined)
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
ipcMain.handle('gpt:get-model-reference', async (_event, requestId) => {
  if (!/^pod-[0-9a-f-]+$/i.test(String(requestId || ''))) throw new Error('模特任务编号无效。')
  const taskPath = path.join(relayRoot(), 'tasks', String(requestId), 'task.json')
  const record = await readJson(taskPath, null)
  const source = record?.taskKind === 'model-anchor' ? (record.modelReferencePath || record.files?.[0]?.path) : ''
  if (!source) throw new Error('模特参考图尚未生成完成。')
  const buffer = await fs.readFile(source)
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw new Error('模特参考图大小异常。')
  const extension = path.extname(source).toLowerCase()
  const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : extension === '.webp' ? 'image/webp' : 'image/png'
  return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, name: path.basename(source) }
})
ipcMain.handle('gpt:open-result', async (_event, requestId) => {
  if (!/^pod-[0-9a-f-]+$/i.test(String(requestId || ''))) throw new Error('任务编号无效。')
  const taskPath = path.join(relayRoot(), 'tasks', String(requestId), 'task.json')
  const record = await readJson(taskPath, null)
  if (!record?.resultPath) throw new Error('该任务还没有可打开的结果文件夹。')
  const openError = await shell.openPath(record.resultPath)
  if (openError) throw new Error(openError)
  return { opened: true }
})
let queueSendPromise = null
const dispatchQueuedTask = async (item) => {
  const bindingsPath = getBindingsPath()
  const bindings = await readJson(bindingsPath, {})
  const relay = getRelay()
  const record = item.record
  const taskFile = item.taskPath
  const binding = bindings[record.windowKey] || {}
  const options = {
    debug_endpoint: 'http://127.0.0.1:9223',
    session_url: binding.sessionUrl || 'https://www.doubao.com/chat/',
    window_key: record.windowKey,
    window_name: `POD产品设计器 · ${String(record.shirtName || '裂变任务').slice(0, 50)}`,
    window_session_urls: binding.sessionUrl ? [binding.sessionUrl] : [],
    request_id: record.requestId,
    prompt: `${record.prompt}\n\n【任务编号：${record.requestId}】`,
    image_paths: record.imagePaths,
    timeout_ms: 35000
  }
  await writeJson(taskFile, { ...record, status: 'SEND_PENDING', queueStartedAt: new Date().toISOString(), error: '' })
  try {
    const sent = await relay.withWindow('__doubao_operations__', async () => {
      await relay.ensureBrowser(options)
      return relay.send(options)
    })
    bindings[record.windowKey] = { sessionUrl: sent.bound_url, updatedAt: new Date().toISOString() }
    await writeJson(bindingsPath, bindings)
    const sentRecord = { ...record, status: 'SENT', sentAt: sent.sent_at, sessionUrl: sent.bound_url, error: '' }
    await writeJson(taskFile, sentRecord)
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('gpt:task-updated', summarizeTask(sentRecord))
    return { status: 'SENT' }
  } catch (error) {
    const phase = error?.phase || 'before_send'
    const manualReady = String(error?.message || error).includes('提示词已填写')
    const status = phase === 'after_click' || manualReady ? 'NEEDS_ATTENTION' : 'DRAFT'
    const failed = { ...record, status, error: String(error?.message || error), updatedAt: new Date().toISOString() }
    await writeJson(taskFile, failed)
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('gpt:task-updated', summarizeTask(failed))
    return { status, error: failed.error }
  }
}

const recoverInterruptedQueue = async () => {
  const records = await getAllGptTasks()
  for (const item of records) {
    const record = item.record
    if (record.status !== 'SEND_PENDING' || !record.queuePosition || record.sentAt) continue
    const startedAt = Date.parse(record.queueStartedAt || record.createdAt || '')
    if (!Number.isFinite(startedAt) || Date.now() - startedAt < 45000) continue
    await writeJson(item.taskPath, { ...record, status: 'QUEUED', recoveredAt: new Date().toISOString(), error: '' })
  }
}
const isQueueTaskFinished = record => record.status === 'RETRIEVED' && Array.isArray(record.files) && record.files.length >= (record.expectedCount || 5)
const processSendQueue = async () => {
  if (queueSendPromise) return queueSendPromise
  queueSendPromise = (async () => {
    await recoverInterruptedQueue()
    const records = await getAllGptTasks()
    const queued = records
      .filter(item => item.record.status === 'QUEUED')
      .sort((a, b) => Number(a.record.queuePosition || 0) - Number(b.record.queuePosition || 0) || String(a.record.createdAt).localeCompare(String(b.record.createdAt)))
    const next = queued[0]
    if (!next) return

    // A queued job may only start after every earlier queued job has fully downloaded.
    // This keeps the Doubao conversation clear while it is still generating images.
    const hasEarlierUnfinished = records.some(item => {
      const position = Number(item.record.queuePosition || 0)
      const blocksQueue = ['QUEUED', 'SEND_PENDING', 'SENT', 'NEEDS_ATTENTION'].includes(item.record.status)
      return position > 0 && position < Number(next.record.queuePosition || 0) && blocksQueue && !isQueueTaskFinished(item.record)
    })
    if (hasEarlierUnfinished) return

    await dispatchQueuedTask(next)
  })().finally(() => { queueSendPromise = null })
  return queueSendPromise
}

ipcMain.handle('gpt:queue-tasks', async (_event, input = {}) => {
  const shirtId = String(input.shirtId || '').trim()
  const images = Array.isArray(input.images) ? input.images : []
  const taskKind = input.taskKind === 'model-anchor' ? 'model-anchor' : 'suite'
  const expectedCount = taskKind === 'model-anchor' ? 1 : 5
  const tasks = Array.isArray(input.tasks) ? input.tasks : []
  if (!shirtId) throw new Error('请先选择基板。')
  if (!images.length && taskKind !== 'model-anchor') throw new Error('请先选择至少一张已完成设计的正面或反面合成图。')
  if (!tasks.length) throw new Error('请至少选择一条裂变关键词。')
  const outcomes = []
  for (const selectedTask of tasks) {
    const title = String(selectedTask.title || '').trim()
    const originalPrompt = String(selectedTask.prompt || '').trim()
    const prompt = originalPrompt ? (taskKind === 'model-anchor' ? originalPrompt : buildModelPrompt(originalPrompt, { modelLocked: Boolean(input.modelLocked), gender: String(input.modelGender || ''), referenceRoles: images.map(image => image.side) })) : ''
    if (!title || !prompt) throw new Error('裂变关键词不完整。')
    const requestId = `pod-${randomUUID()}`
    const createdAt = new Date().toISOString()
    const shirtName = String(input.shirtName || '未命名产品').trim() || '未命名产品'
    const patternFolderName = createPatternFolderName(String(input.patternKey || (taskKind === 'model-anchor' ? 'model-anchor' : requestId)))
    const taskDir = path.join(relayRoot(), 'tasks', requestId)
    const imagePaths = await saveReferenceImages(taskDir, images)
    const queuePosition = Date.now() + outcomes.length
    const taskRecord = { provider: 'doubao', requestId, status: 'QUEUED', title, prompt, shirtName, sides: images.filter(image => ['front', 'back'].includes(image.side)).map(image => image.side), referenceRoles: images.map(image => image.side), taskKind, expectedCount, queuePosition, patternFolderName, resultFolderName: createJobFolderName(createdAt, requestId), windowKey: createWindowKey(shirtId), imagePaths, createdAt }
    await writeJson(path.join(taskDir, 'task.json'), taskRecord)
    outcomes.push({ requestId, title, status: 'QUEUED' })
  }
  void processSendQueue()
  return outcomes
})

ipcMain.handle('gpt:cancel-queued-task', async (_event, requestId) => {
  if (!/^pod-[0-9a-f-]+$/i.test(String(requestId || ''))) throw new Error('任务编号无效。')
  const taskPath = path.join(relayRoot(), 'tasks', String(requestId), 'task.json')
  const record = await readJson(taskPath, null)
  if (!record || record.status !== 'QUEUED') throw new Error('只能取消尚未发送的队列任务。')
  const cancelled = { ...record, status: 'CANCELLED', cancelledAt: new Date().toISOString() }
  await writeJson(taskPath, cancelled)
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('gpt:task-updated', summarizeTask(cancelled))
  return { cancelled: true }
})
ipcMain.handle('gpt:resolve-queue-blocker', async (_event, input = {}) => {
  const requestId = String(input.requestId || '')
  const action = String(input.action || '')
  if (!/^pod-[0-9a-f-]+$/i.test(requestId) || !['wait', 'skip'].includes(action)) throw new Error('队列处理参数无效。')
  const taskPath = path.join(relayRoot(), 'tasks', requestId, 'task.json')
  const record = await readJson(taskPath, null)
  if (!record || record.status !== 'NEEDS_ATTENTION' || !record.queuePosition) throw new Error('该任务当前不需要处理。')
  const updated = action === 'skip'
    ? { ...record, status: 'CANCELLED', cancelledAt: new Date().toISOString(), error: '已跳过，后续队列继续执行。' }
    : { ...record, status: 'SENT', queueWatchStartedAt: new Date().toISOString(), lastCheckError: '', resumedAt: new Date().toISOString() }
  await writeJson(taskPath, updated)
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('gpt:task-updated', summarizeTask(updated))
  if (action === 'skip') void processSendQueue()
  return { status: updated.status }
})
ipcMain.handle('gpt:delete-task', async (_event, requestId) => {
  if (!/^pod-[0-9a-f-]+$/i.test(String(requestId || ''))) throw new Error('任务编号无效。')
  const taskDir = path.join(relayRoot(), 'tasks', String(requestId))
  const taskPath = path.join(taskDir, 'task.json')
  const record = await readJson(taskPath, null)
  if (!record) throw new Error('任务记录不存在。')
  if (!['DRAFT', 'NEEDS_ATTENTION', 'CANCELLED'].includes(record.status)) throw new Error('只能删除失败、待确认或已跳过的任务记录。')
  await fs.rm(taskDir, { recursive: true, force: true })
  void processSendQueue().catch(() => undefined)
  return { deleted: true }
})
ipcMain.handle('gpt:send-tasks', async (_event, input = {}) => {
  const shirtId = String(input.shirtId || '').trim()
  const images = Array.isArray(input.images) ? input.images : []
  const taskKind = input.taskKind === 'model-anchor' ? 'model-anchor' : 'suite'
  const expectedCount = taskKind === 'model-anchor' ? 1 : 5
  const tasks = Array.isArray(input.tasks) ? input.tasks : []
  if (!shirtId) throw new Error('请先选择基板。')
  if (!images.length && taskKind !== 'model-anchor') throw new Error('请先选择至少一张已完成设计的正面或反面合成图。')
  if (!tasks.length) throw new Error('请至少勾选一条裂变关键词。')

  const windowKey = createWindowKey(shirtId)
  const bindingsPath = getBindingsPath()
  const bindings = await readJson(bindingsPath, {})
  const relay = getRelay()
  const outcomes = []

  for (const selectedTask of tasks) {
    const title = String(selectedTask.title || '').trim()
    const originalPrompt = String(selectedTask.prompt || '').trim()
    const prompt = originalPrompt ? (taskKind === 'model-anchor' ? originalPrompt : buildModelPrompt(originalPrompt, { modelLocked: Boolean(input.modelLocked), gender: String(input.modelGender || ''), referenceRoles: images.map(image => image.side) })) : ''
    if (!title || !prompt) throw new Error('裂变关键词不完整。')

    const requestId = `pod-${randomUUID()}`
    const createdAt = new Date().toISOString()
    const shirtName = String(input.shirtName || '未命名产品').trim() || '未命名产品'
    const patternFolderName = createPatternFolderName(String(input.patternKey || (taskKind === 'model-anchor' ? 'model-anchor' : requestId)))
    const resultFolderName = createJobFolderName(createdAt, requestId)
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
      sides: images.filter(image => ['front', 'back'].includes(image.side)).map(image => image.side),
      referenceRoles: images.map(image => image.side),
      taskKind,
      expectedCount,
      patternFolderName,
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
  setTimeout(() => { void processSendQueue().catch(() => undefined); void retrieveGptResults().catch(() => undefined) }, 3000)
  backgroundMonitorTimer = setInterval(() => { void processSendQueue().catch(() => undefined); void retrieveGptResults().catch(() => undefined) }, 15000)
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
