import { useState, useCallback, useRef, useEffect } from 'react'
import { Upload, X, ImageIcon, FolderOpen } from 'lucide-react'
import { Design } from '@/types'
import { useCompositeStore } from '@/store/compositeStore'
import { saveDirectoryHandle, loadDirectoryHandle, clearDirectoryHandle } from '@/store/dbStorage'

interface ThumbItem {
  file: File
  thumbUrl: string
  name: string
}

const DesignUploader = () => {
  const { currentSide, frontDesign, backDesign, setFrontDesign, setBackDesign } = useCompositeStore()
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const [folderItems, setFolderItems] = useState<ThumbItem[]>([])
  const [folderPath, setFolderPath] = useState('')
  const [topPaneHeight, setTopPaneHeight] = useState<number | null>(null)
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const topPaneRef = useRef<HTMLDivElement>(null)
  const directoryHandleRef = useRef<any>(null)
  const knownFileNamesRef = useRef(new Set<string>())
  const isFolderRefreshingRef = useRef(false)

  const currentDesign = currentSide === 'front' ? frontDesign : backDesign
  const setCurrentDesign = currentSide === 'front' ? setFrontDesign : setBackDesign

  const loadFileAsDesign = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const design: Design = {
          id: Date.now().toString(),
          name: file.name,
          imageData: e.target?.result as string,
          width: img.width,
          height: img.height
        }
        setCurrentDesign(design)
        setError('')
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }, [setCurrentDesign])

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请上传图片文件')
      return
    }
    if (!file.name.toLowerCase().endsWith('.png')) {
      setError('仅支持PNG格式图片')
      return
    }
    loadFileAsDesign(file)
  }, [loadFileAsDesign])

  const generateThumb = useCallback((file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const size = 80
          const ratio = Math.min(size / img.width, size / img.height, 1)
          canvas.width = img.width * ratio
          canvas.height = img.height * ratio
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          }
          const dataUrl = canvas.toDataURL('image/png')
          console.log('缩略图生成成功:', file.name, dataUrl.length)
          resolve(dataUrl)
        }
        img.onerror = (err) => {
          console.error('图片加载失败:', file.name, err)
          resolve('')
        }
        img.src = e.target?.result as string
      }
      reader.onerror = (err) => {
        console.error('文件读取失败:', file.name, err)
        resolve('')
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const loadFolder = useCallback(async (dirHandle: any) => {
    console.log('开始加载文件夹:', dirHandle.name)
    setFolderPath(dirHandle.name)
    const items: ThumbItem[] = []
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.png')) {
        console.log('找到PNG文件:', entry.name)
        const file = await entry.getFile()
        const thumbUrl = await generateThumb(file)
        if (thumbUrl) {
          items.push({ file, thumbUrl, name: entry.name })
        } else {
          console.log('缩略图生成失败:', entry.name)
        }
      }
    }
    console.log('加载完成，共', items.length, '个文件')
    knownFileNamesRef.current = new Set(items.map(item => item.name))
    setFolderItems(items)
  }, [generateThumb])

  const refreshFolder = useCallback(async () => {
    const dirHandle = directoryHandleRef.current
    if (!dirHandle || isFolderRefreshingRef.current) return

    try {
      const permission = await dirHandle.queryPermission({ mode: 'read' })
      if (permission !== 'granted') return

      isFolderRefreshingRef.current = true
      const newItems: ThumbItem[] = []
      const knownNames = knownFileNamesRef.current

      for await (const entry of dirHandle.values()) {
        if (
          entry.kind === 'file' &&
          entry.name.toLowerCase().endsWith('.png') &&
          !knownNames.has(entry.name)
        ) {
          // Reserve the name immediately so overlapping scans cannot add it twice.
          knownNames.add(entry.name)
          const file = await entry.getFile()
          const thumbUrl = await generateThumb(file)
          if (thumbUrl) {
            newItems.push({ file, thumbUrl, name: entry.name })
          } else {
            knownNames.delete(entry.name)
          }
        }
      }

      if (newItems.length > 0) {
        // Only append new files. Existing items keep their position, so the grid
        // does not jump or flash during a background refresh.
        setFolderItems(items => [...items, ...newItems])
      }
    } catch (err) {
      console.error('后台刷新文件夹失败:', err)
    } finally {
      isFolderRefreshingRef.current = false
    }
  }, [generateThumb])

  const handleFolderSelect = useCallback(async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker()
      if (!dirHandle) return
      directoryHandleRef.current = dirHandle
      await saveDirectoryHandle(dirHandle)
      await loadFolder(dirHandle)
    } catch {
      directoryHandleRef.current = null
      const input = document.createElement('input')
      input.type = 'file'
      ;(input as any).webkitdirectory = true
      input.onchange = async (e: any) => {
        const files = Array.from(e.target.files || []) as File[]
        const pngFiles = files.filter(f => f.name.toLowerCase().endsWith('.png'))
        if (pngFiles.length === 0) return
        const folderName = pngFiles[0]?.webkitRelativePath?.split('/')[0] || '文件夹'
        setFolderPath(folderName)
        const items: ThumbItem[] = []
        for (const file of pngFiles) {
          const thumbUrl = await generateThumb(file)
          if (thumbUrl) {
            items.push({ file, thumbUrl, name: file.name })
          }
        }
        knownFileNamesRef.current = new Set(items.map(item => item.name))
        setFolderItems(items)
      }
      input.click()
    }
  }, [generateThumb, loadFolder])

  const handleClearFolder = useCallback(async () => {
    directoryHandleRef.current = null
    knownFileNamesRef.current.clear()
    setFolderItems([])
    setFolderPath('')
    await clearDirectoryHandle()
  }, [])

  const handleThumbnailClick = useCallback((item: ThumbItem) => {
    loadFileAsDesign(item.file)
  }, [loadFileAsDesign])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  const handleClear = () => {
    setCurrentDesign(null)
    setError('')
  }

  const handleVerticalResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const container = splitContainerRef.current
    const topPane = topPaneRef.current
    if (!container || !topPane) return

    const startY = e.clientY
    const startHeight = topPane.getBoundingClientRect().height
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const minTopHeight = 120
      const minBottomHeight = 120
      const dividerHeight = 10
      const maxTopHeight = Math.max(
        minTopHeight,
        container.clientHeight - minBottomHeight - dividerHeight
      )
      const nextHeight = Math.min(
        maxTopHeight,
        Math.max(minTopHeight, startHeight + moveEvent.clientY - startY)
      )
      setTopPaneHeight(nextHeight)
    }

    const handleMouseUp = () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  useEffect(() => {
    return () => {
      folderItems.forEach(item => {
        if (item.thumbUrl.startsWith('blob:')) {
          URL.revokeObjectURL(item.thumbUrl)
        }
      })
    }
  }, [folderItems])

  useEffect(() => {
    const restoreFolder = async () => {
      const handle = await loadDirectoryHandle()
      if (handle) {
        try {
          const permission = await (handle as any).requestPermission({ mode: 'read' })
          if (permission === 'granted') {
            directoryHandleRef.current = handle
            await loadFolder(handle)
          }
        } catch (err) {
          console.error('恢复文件夹失败:', err)
        }
      }
    }
    restoreFolder()
  }, [loadFolder])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshFolder()
    }, 3000)
    return () => window.clearInterval(interval)
  }, [refreshFolder])

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-sm">
      <div className="px-3 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <ImageIcon className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <h2 className="text-sm font-semibold text-gray-800 whitespace-nowrap">设计贴图</h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 flex-shrink-0">
              {currentSide === 'front' ? '正面' : '背面'}
            </span>
          </div>
          <button
            onClick={handleFolderSelect}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
            title="选择文件夹"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            文件夹
          </button>
        </div>
      </div>
      
      <div ref={splitContainerRef} className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {/* 上半部分：预览/上传区 */}
        <div
          ref={topPaneRef}
          className="shrink-0 min-h-[120px] overflow-hidden p-4"
          style={{ height: topPaneHeight === null ? '65%' : topPaneHeight }}
        >
          {currentDesign ? (
            <div className="relative flex h-full min-h-0 flex-col">
              <div
                className={`relative flex-1 min-h-0 rounded-lg overflow-hidden border-2 border-dashed transition-colors ${
                  isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle,_#e5e7eb_1px,_transparent_1px)] bg-[size:10px_10px]" />
                <img
                  src={currentDesign.imageData}
                  alt={currentDesign.name}
                  className="block w-full h-full object-contain relative z-10"
                />
                <button
                  onClick={handleClear}
                  className="absolute top-2 right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-colors z-10"
                  title="清除设计图"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="shrink-0 text-center mt-2">
                <p className="text-sm text-gray-600 truncate">{currentDesign.name}</p>
                <p className="text-xs text-gray-400">{currentDesign.width} × {currentDesign.height} px</p>
              </div>
            </div>
          ) : (
            <div 
              className={`h-full min-h-0 flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-colors cursor-pointer py-4 ${
                isDragging 
                  ? 'border-primary-500 bg-primary-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => document.getElementById('design-file-input')?.click()}
            >
              <Upload className={`w-10 h-10 mb-2 ${isDragging ? 'text-primary-500' : 'text-gray-400'}`} />
              <p className="text-gray-600 mb-1 text-sm">拖拽PNG图片到此处</p>
              <p className="text-xs text-gray-400">或点击选择文件</p>
              <input
                id="design-file-input"
                type="file"
                accept="image/png"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}
          
          {error && (
            <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div
          className="group relative z-20 h-2.5 shrink-0 cursor-row-resize select-none flex items-center justify-center hover:bg-gray-100"
          onMouseDown={handleVerticalResizeStart}
          title="上下拖动调节图片区大小"
        >
          <div className="h-px w-full bg-gray-300 transition-colors group-hover:bg-primary-500" />
        </div>

        {/* 下半部分：文件夹预览区 */}
        <div className="flex-1 min-h-[120px] min-w-0 overflow-y-auto p-4">
          {folderItems.length > 0 ? (
            <div className="h-full min-w-0 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 truncate flex-1">
                   {folderPath} ({folderItems.length})
                </p>
                <button
                  onClick={handleClearFolder}
                  className="text-xs text-gray-400 hover:text-red-500 ml-2"
                >
                  清除
                </button>
              </div>
              <div className="flex-1 min-w-0 grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-2 auto-rows-min content-start overflow-y-auto">
                {folderItems.map((item, i) => (
                  <div
                    key={i}
                    onClick={() => handleThumbnailClick(item)}
                    className="group relative min-w-0 aspect-square rounded-lg border border-gray-200 overflow-hidden cursor-pointer hover:border-primary-400 hover:shadow-sm transition-all"
                    title={`单击使用: ${item.name}`}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle,_#e5e7eb_1px,_transparent_1px)] bg-[size:10px_10px]" />
                    <img
                      src={item.thumbUrl}
                      alt={item.name}
                      className="block w-full max-w-full h-full object-contain relative z-10"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-colors flex items-center justify-center">
                      <span className="text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-50 px-1.5 py-0.5 rounded">
                        单击
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <FolderOpen className="w-10 h-10 mb-2 text-gray-300" />
              <p className="text-sm">点击「文件夹」选择设计图目录</p>
              <p className="text-xs text-gray-300 mt-1">单击缩略图即可使用</p>
            </div>
          )}
        </div>
      </div>

      <canvas ref={thumbCanvasRef} className="hidden" />
    </div>
  )
}

export default DesignUploader
