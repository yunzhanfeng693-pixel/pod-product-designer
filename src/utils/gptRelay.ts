export type GptReferenceSide = 'front' | 'back'

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

export const sendGptTasks = async (payload: {
  shirtId: string
  shirtName: string
  images: GptReferenceImage[]
  tasks: GptSelectedTask[]
}) => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) throw new Error('豆包自动发送仅支持桌面版程序。')
  return ipcRenderer.invoke('gpt:send-tasks', payload) as Promise<Array<{
    requestId: string
    title: string
    status: 'SENT' | 'DRAFT' | 'NEEDS_ATTENTION'
    error?: string
  }>>
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
  status: 'SEND_PENDING' | 'SENT' | 'DRAFT' | 'NEEDS_ATTENTION' | 'RETRIEVED'
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