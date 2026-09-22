export type GptReferenceSide = 'front' | 'back' | 'model'

export interface GptReferenceImage {
  side: GptReferenceSide
  dataUrl: string
}

export interface GptSelectedTask {
  title: string
  prompt: string
}

interface ElectronIpcRenderer {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>
}

const getIpcRenderer = (): ElectronIpcRenderer | null => {
  const desktopWindow = window as Window & { require?: (name: string) => { ipcRenderer?: ElectronIpcRenderer } }
  try {
    return desktopWindow.require?.('electron').ipcRenderer ?? null
  } catch {
    return null
  }
}

export const isGptRelayAvailable = () => Boolean(getIpcRenderer())

export const openGptRelay = async () => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) throw new Error('豆包自动发送仅支持桌面版程序。')
  return ipcRenderer.invoke('gpt:open')
}

export type GptSendPayload = {
  shirtId: string
  shirtName: string
  patternKey?: string
  images: GptReferenceImage[]
  tasks: GptSelectedTask[]
  taskKind?: 'suite' | 'model-anchor'
  modelLocked?: boolean
  modelGender?: 'male' | 'female' | ''
}

export const sendGptTasks = async (payload: GptSendPayload) => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) throw new Error('豆包自动发送仅支持桌面版程序。')
  return ipcRenderer.invoke('gpt:send-tasks', payload) as Promise<Array<{
    requestId: string
    title: string
    status: 'SENT' | 'DRAFT' | 'NEEDS_ATTENTION'
    error?: string
  }>>
}
export const queueGptTasks = async (payload: GptSendPayload) => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) throw new Error('豆包任务队列仅支持桌面版程序。')
  return ipcRenderer.invoke('gpt:queue-tasks', payload) as Promise<Array<{ requestId: string; title: string; status: 'QUEUED'; error?: string }>>
}

export const cancelQueuedGptTask = async (requestId: string) => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) throw new Error('豆包任务队列仅支持桌面版程序。')
  return ipcRenderer.invoke('gpt:cancel-queued-task', requestId)
}

export const resolveGptQueueBlocker = async (requestId: string, action: 'wait' | 'skip') => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) throw new Error('豆包任务队列仅支持桌面版程序。')
  return ipcRenderer.invoke('gpt:resolve-queue-blocker', { requestId, action })
}

export const deleteGptTask = async (requestId: string) => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) throw new Error('豆包任务记录仅支持桌面版程序。')
  return ipcRenderer.invoke('gpt:delete-task', requestId)
}
export const getGptSettings = async () => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) throw new Error('豆包设置仅支持桌面版程序。')
  return ipcRenderer.invoke('gpt:get-settings') as Promise<{ outputPath: string }>
}

export const chooseGptOutputPath = async () => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) throw new Error('豆包设置仅支持桌面版程序。')
  return ipcRenderer.invoke('gpt:choose-output-path') as Promise<{ outputPath: string; canceled: boolean }>
}
export const retrieveGptResults = async () => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) throw new Error('豆包自动收图仅支持桌面版程序。')
  return ipcRenderer.invoke('gpt:retrieve-results') as Promise<Array<{ requestId: string; status: string; count?: number; resultPath?: string; error?: string }>>
}
export interface GptTaskRecord {
  requestId: string
  title: string
  shirtName: string
  sides: Array<'front' | 'back'>
  taskKind: 'suite' | 'model-anchor'
  queuePosition?: number
  expectedCount: number
  modelReferencePath?: string
  status: 'QUEUED' | 'SEND_PENDING' | 'SENT' | 'DRAFT' | 'NEEDS_ATTENTION' | 'RETRIEVED' | 'CANCELLED'
  createdAt: string
  sentAt?: string
  retrievedAt?: string
  resultPath?: string
  fileCount: number
  detectedCount: number
  error?: string
}

export const getGptTasks = async () => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return [] as GptTaskRecord[]
  return ipcRenderer.invoke('gpt:list-tasks') as Promise<GptTaskRecord[]>
}

export const openGptResult = async (requestId: string) => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) throw new Error('结果文件夹仅支持桌面版程序。')
  return ipcRenderer.invoke('gpt:open-result', requestId)
}
export const getGeneratedModelReference = async (requestId: string) => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) throw new Error('模特参考图仅支持桌面版程序。')
  return ipcRenderer.invoke('gpt:get-model-reference', requestId) as Promise<{ dataUrl: string; name: string }>
}