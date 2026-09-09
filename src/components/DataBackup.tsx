import { useState } from 'react'
import { DatabaseBackup, FolderInput } from 'lucide-react'
import { useCompositeStore } from '@/store/compositeStore'
import { loadBackupDirectoryHandle, saveBackupDirectoryHandle } from '@/store/dbStorage'

const BACKUP_FOLDER_NAME = 'POD产品设计器备份'
const BACKUP_FILE_NAME = 'backup.json'
const FILE_PREFIX = 'backup-file:'

const safeName = (value: string) => value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')

const writeImage = async (
  imageData: string | undefined,
  fileName: string,
  imagesDir: FileSystemDirectoryHandle
) => {
  if (!imageData?.startsWith('data:image/')) return imageData
  const blob = await fetch(imageData).then(response => response.blob())
  const safeFileName = `${safeName(fileName)}.png`
  const fileHandle = await imagesDir.getFileHandle(safeFileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
  return `${FILE_PREFIX}images/${safeFileName}`
}

const readImage = async (value: string | undefined, backupDir: FileSystemDirectoryHandle) => {
  if (!value?.startsWith(FILE_PREFIX)) return value
  const relativePath = value.slice(FILE_PREFIX.length).split('/')
  let directory = backupDir
  for (const part of relativePath.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part)
  }
  const fileHandle = await directory.getFileHandle(relativePath.at(-1)!)
  const file = await fileHandle.getFile()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const getWritableRoot = async () => {
  let handle = await loadBackupDirectoryHandle()
  if (handle) {
    const permission = await (handle as any).queryPermission({ mode: 'readwrite' })
    if (permission !== 'granted') {
      const requested = await (handle as any).requestPermission({ mode: 'readwrite' })
      if (requested !== 'granted') handle = null
    }
  }
  if (!handle) {
    handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    await saveBackupDirectoryHandle(handle!)
  }
  return handle!
}

const DataBackup = () => {
  const [isBusy, setIsBusy] = useState(false)

  const handleBackup = async () => {
    try {
      setIsBusy(true)
      const root = await getWritableRoot()
      const backupDir = await root.getDirectoryHandle(BACKUP_FOLDER_NAME, { create: true })
      const imagesDir = await backupDir.getDirectoryHandle('images', { create: true })
      const state = useCompositeStore.getState()

      const shirts = await Promise.all(state.shirts.map(async shirt => ({
        ...shirt,
        frontImage: await writeImage(shirt.frontImage, `shirt-${shirt.id}-front`, imagesDir),
        backImage: await writeImage(shirt.backImage, `shirt-${shirt.id}-back`, imagesDir)
      })))
      const frontDesign = state.frontDesign ? {
        ...state.frontDesign,
        imageData: await writeImage(state.frontDesign.imageData, 'design-front', imagesDir)
      } : null
      const backDesign = state.backDesign ? {
        ...state.backDesign,
        imageData: await writeImage(state.backDesign.imageData, 'design-back', imagesDir)
      } : null

      const manifest = {
        format: 'pod-product-designer-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          shirts,
          categories: state.categories,
          colors: state.colors,
          frontDesign,
          backDesign,
          frontTransform: state.frontTransform,
          backTransform: state.backTransform,
          currentSide: state.currentSide,
          selectedShirtId: state.selectedShirt?.id ?? null
        }
      }
      const fileHandle = await backupDir.getFileHandle(BACKUP_FILE_NAME, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(JSON.stringify(manifest, null, 2))
      await writable.close()
      alert(`备份完成：${root.name}\\${BACKUP_FOLDER_NAME}`)
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('备份失败:', error)
        alert('备份失败，请重新选择一个可写入的文件夹。')
      }
    } finally {
      setIsBusy(false)
    }
  }

  const handleRestore = async () => {
    try {
      setIsBusy(true)
      const selectedDir = await (window as any).showDirectoryPicker({ mode: 'read' })
      let backupDir = selectedDir as FileSystemDirectoryHandle
      let fileHandle: FileSystemFileHandle
      try {
        fileHandle = await backupDir.getFileHandle(BACKUP_FILE_NAME)
      } catch {
        backupDir = await backupDir.getDirectoryHandle(BACKUP_FOLDER_NAME)
        fileHandle = await backupDir.getFileHandle(BACKUP_FILE_NAME)
      }
      const manifest = JSON.parse(await (await fileHandle.getFile()).text())
      if (manifest?.format !== 'pod-product-designer-backup' || !manifest.data) {
        throw new Error('不是有效的 POD产品设计器备份')
      }

      const data = manifest.data
      const shirts = await Promise.all(data.shirts.map(async (shirt: any) => ({
        ...shirt,
        frontImage: await readImage(shirt.frontImage, backupDir),
        backImage: await readImage(shirt.backImage, backupDir)
      })))
      const frontDesign = data.frontDesign ? {
        ...data.frontDesign,
        imageData: await readImage(data.frontDesign.imageData, backupDir)
      } : null
      const backDesign = data.backDesign ? {
        ...data.backDesign,
        imageData: await readImage(data.backDesign.imageData, backupDir)
      } : null
      const selectedShirt = shirts.find((shirt: any) => shirt.id === data.selectedShirtId) ?? null

      useCompositeStore.setState({
        shirts,
        categories: data.categories,
        colors: data.colors,
        frontDesign,
        backDesign,
        frontTransform: data.frontTransform,
        backTransform: data.backTransform,
        currentSide: data.currentSide,
        selectedShirt
      })
      alert(`恢复完成，共恢复 ${shirts.length} 件胚衣。`)
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('恢复失败:', error)
        alert('恢复失败，请选择包含 backup.json 的备份文件夹。')
      }
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleBackup}
        disabled={isBusy}
        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm disabled:bg-gray-300"
        title="备份全部胚衣、图片和设计数据"
      >
        <DatabaseBackup className="w-4 h-4" />
        一键备份
      </button>
      <button
        onClick={handleRestore}
        disabled={isBusy}
        className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm disabled:text-gray-400"
        title="从备份文件夹恢复数据"
      >
        <FolderInput className="w-4 h-4" />
        一键恢复
      </button>
    </div>
  )
}

export default DataBackup


