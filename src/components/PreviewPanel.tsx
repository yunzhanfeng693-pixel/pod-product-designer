import { useState, useCallback, useEffect } from 'react'
import { Eye, Download, Copy, RefreshCw } from 'lucide-react'
import { useCompositeStore } from '@/store/compositeStore'

interface PreviewItem {
  url: string
  blob: Blob | null
  width: number
  height: number
  side: 'front' | 'back'
  hasDesign: boolean
}

const PreviewPanel = () => {
  const { selectedShirt, frontDesign, backDesign, frontTransform, backTransform } = useCompositeStore()
  const [frontPreview, setFrontPreview] = useState<PreviewItem | null>(null)
  const [backPreview, setBackPreview] = useState<PreviewItem | null>(null)
  const [draggingSide, setDraggingSide] = useState<'front' | 'back' | null>(null)

  const generatePreview = useCallback((side: 'front' | 'back'): Promise<PreviewItem> => {
    if (!selectedShirt) {
      return Promise.resolve({ url: '', blob: null, width: 0, height: 0, side, hasDesign: false })
    }

    return new Promise<PreviewItem>((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve({ url: '', blob: null, width: 0, height: 0, side, hasDesign: false })
        return
      }

      const shirtImg = new Image()
      shirtImg.crossOrigin = 'anonymous'
      shirtImg.onload = () => {
        canvas.width = shirtImg.width
        canvas.height = shirtImg.height
        
        ctx.drawImage(shirtImg, 0, 0)

        const transform = side === 'front' ? frontTransform : backTransform
        const design = side === 'front' ? frontDesign : backDesign

        const drawDesignAndResolve = () => {
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob)
              resolve({ url, blob, width: shirtImg.width, height: shirtImg.height, side, hasDesign: transform.hasDesign })
            } else {
              const url = canvas.toDataURL('image/png', 1.0)
              resolve({ url, blob: null, width: shirtImg.width, height: shirtImg.height, side, hasDesign: transform.hasDesign })
            }
          }, 'image/png', 1.0)
        }

        if (design && transform.hasDesign) {
          const designImg = new Image()
          designImg.onload = () => {
            const centerX = shirtImg.width / 2 + transform.position.x
            const centerY = shirtImg.height / 2 + transform.position.y

            ctx.save()
            ctx.translate(centerX, centerY)
            ctx.rotate((transform.rotation * Math.PI) / 180)
            ctx.scale(transform.scale, transform.scale)
            
            const origWidth = design.width
            const origHeight = design.height
            
            ctx.drawImage(
              designImg,
              -origWidth / 2,
              -origHeight / 2,
              origWidth,
              origHeight
            )
            ctx.restore()

            drawDesignAndResolve()
          }
          designImg.src = design.imageData
        } else {
          drawDesignAndResolve()
        }
      }
      shirtImg.src = side === 'front' ? selectedShirt.frontImage : selectedShirt.backImage
    })
  }, [selectedShirt, frontDesign, backDesign, frontTransform, backTransform])

  useEffect(() => {
    const updatePreviews = async () => {
      if (selectedShirt) {
        const [f, b] = await Promise.all([
          generatePreview('front'),
          generatePreview('back')
        ])
        if (frontPreview?.url) URL.revokeObjectURL(frontPreview.url)
        if (backPreview?.url) URL.revokeObjectURL(backPreview.url)
        setFrontPreview(f)
        setBackPreview(b)
      } else {
        if (frontPreview?.url) URL.revokeObjectURL(frontPreview.url)
        if (backPreview?.url) URL.revokeObjectURL(backPreview.url)
        setFrontPreview(null)
        setBackPreview(null)
      }
    }
    
    // Full-resolution PNG encoding is expensive. Wait until the interaction has
    // paused so dragging only needs to redraw the editor canvas.
    const debounce = setTimeout(updatePreviews, 250)
    return () => {
      clearTimeout(debounce)
    }
  }, [selectedShirt, frontDesign, backDesign, frontTransform.position, frontTransform.scale, frontTransform.rotation, frontTransform.hasDesign, backTransform.position, backTransform.scale, backTransform.rotation, backTransform.hasDesign, generatePreview])

  const handleDragStart = useCallback((e: React.DragEvent, preview: PreviewItem | { url: string; blob: Blob | null }, side?: string) => {
    if (!preview.url) return
    setDraggingSide(side as any || null)
    e.dataTransfer.clearData()
    
    if (preview.blob) {
      const file = new File([preview.blob], `design_${side || 'preview'}_${Date.now()}.png`, { type: 'image/png' })
      
      if (e.dataTransfer.items) {
        try {
          e.dataTransfer.items.add(file)
        } catch (err) {
          console.warn('无法添加File到dataTransfer:', err)
        }
      }
    }
    
    e.dataTransfer.setData('image/png', preview.url)
    e.dataTransfer.setData('application/octet-stream', preview.url)
    e.dataTransfer.setData('text/uri-list', preview.url)
    e.dataTransfer.effectAllowed = 'copy'
    
    const dragImage = document.createElement('img')
    dragImage.src = preview.url
    dragImage.style.width = '100px'
    dragImage.style.height = '100px'
    dragImage.style.objectFit = 'contain'
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 50, 50)
    setTimeout(() => document.body.removeChild(dragImage), 0)
  }, [])

  const handleCopyToClipboard = useCallback(async (preview: PreviewItem | { url: string; blob: Blob | null }) => {
    if (!preview.blob) {
      alert('无法复制，图片数据不可用')
      return
    }
    
    try {
      const item = new ClipboardItem({ 'image/png': preview.blob })
      await navigator.clipboard.write([item])
      alert('图片已复制到剪贴板！\n\n现在可以粘贴到 Photoshop 或其他软件中')
    } catch (err) {
      console.error('复制到剪贴板失败:', err)
      alert('复制失败，请尝试拖拽方式或下载后使用')
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingSide(null)
  }, [])

  const handleDownload = useCallback((preview: PreviewItem | { url: string; blob: Blob | null }, filename: string) => {
    if (!preview.url) return
    
    let urlToUse = preview.url
    let shouldRevoke = false
    
    if (preview.blob) {
      urlToUse = URL.createObjectURL(preview.blob)
      shouldRevoke = true
    }
    
    const link = document.createElement('a')
    link.download = filename
    link.href = urlToUse
    link.click()
    
    if (shouldRevoke) {
      URL.revokeObjectURL(urlToUse)
    }
  }, [])

  const renderSideCard = (preview: PreviewItem | null) => {
    if (!preview || !preview.url) return null
    return (
      <div className="flex flex-col">
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, preview, preview.side)}
          onDragEnd={handleDragEnd}
          className={`relative w-full rounded-lg overflow-hidden cursor-grab bg-gray-50 transition-all ${
            draggingSide === preview.side ? 'opacity-50 scale-95 cursor-grabbing ring-2 ring-primary-400' : 'hover:ring-1 hover:ring-gray-200'
          }`}
        >
          <img
            src={preview.url}
            alt={`${preview.side === 'front' ? '正面' : '背面'}预览`}
            className="w-full h-auto block"
            crossOrigin="anonymous"
          />
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-2 mb-1.5">
          <span className="text-sm font-medium text-gray-700">
            {preview.side === 'front' ? '正面' : '背面'}
          </span>
          {preview.hasDesign && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">已设计</span>
          )}
        </div>
        <div className="flex gap-2 w-full">
          <button
            onClick={() => handleDownload(preview, `${selectedShirt?.name}_${preview.side}_${Date.now()}.png`)}
            disabled={!preview.url}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            下载
          </button>
          <button
            onClick={() => handleCopyToClipboard(preview)}
            disabled={!preview.blob}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-sm disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed"
          >
            <Copy className="w-4 h-4" />
            复制
          </button>
        </div>
      </div>
    )
  }

  const hasAnyPreview = frontPreview?.url || backPreview?.url

  return (
    <div className="w-full bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Eye className="w-5 h-5 text-primary-600" />
          合成预览
        </h3>
        <button
          onClick={() => {
            if (selectedShirt) {
              setFrontPreview(null)
              setBackPreview(null)
              setTimeout(() => {
                generatePreview('front').then(setFrontPreview)
                generatePreview('back').then(setBackPreview)
              }, 50)
            }
          }}
          disabled={!selectedShirt}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="刷新预览"
        >
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>
      
      <div className="flex-1 p-4 overflow-auto">
        {hasAnyPreview ? (
          <div className="space-y-4">
            {renderSideCard(frontPreview)}
            {renderSideCard(backPreview)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <div className="w-16 h-16 mb-3 bg-gray-100 rounded-full flex items-center justify-center">
              <Eye className="w-8 h-8" />
            </div>
            <p className="text-sm text-center">
              {selectedShirt ? '请上传设计图' : '请选择胚衣'}
            </p>
          </div>
        )}
      </div>
      
      <div className="px-4 py-3 border-t border-gray-200">
        <div className="text-xs text-gray-400 space-y-0.5">
          <p>• 拖拽预览图到桌面保存为文件</p>
          <p>• 点击「复制」后粘贴到 Photoshop</p>
          <p>• 点击下载保存后再上传到网页</p>
        </div>
      </div>
    </div>
  )
}

export default PreviewPanel
