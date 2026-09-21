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

export interface DesktopDesignFile {
  name: string
  dataUrl: string
}

export const isDesktopDesignLibraryAvailable = () => Boolean(getIpcRenderer())

export const chooseDesktopDesignFolder = async () => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return null
  return ipcRenderer.invoke('design-library:choose-folder') as Promise<{ canceled: boolean; folderPath?: string; folderName?: string; files: DesktopDesignFile[] }>
}

export const getDesktopDesignFolder = async (knownNames: string[] = []) => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return null
  return ipcRenderer.invoke('design-library:get-folder', { knownNames }) as Promise<{ folderPath?: string; folderName?: string; files: DesktopDesignFile[] }>
}

export const clearDesktopDesignFolder = async () => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return
  await ipcRenderer.invoke('design-library:clear-folder')
}