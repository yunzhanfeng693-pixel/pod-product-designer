import { useRef, useEffect, useState, useCallback } from 'react'
import { useCompositeStore } from '@/store/compositeStore'
import { Eye, EyeOff } from 'lucide-react'

const CanvasEditor = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { 
    selectedShirt, 
    getCurrentDesign,
    currentSide,
    frontTransform,
    backTransform,
    setCurrentSide,
    setDesignPosition,
    setDesignScale,
    setDesignRotation
  } = useCompositeStore()
  
  const [isDragging, setIsDragging] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [transformStart, setTransformStart] = useState({ x: 0, y: 0, rotation: 0, scale: 0 })
  const [shirtImage, setShirtImage] = useState<HTMLImageElement | null>(null)
  const [designImage, setDesignImage] = useState<HTMLImageElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 800 })
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const animationFrameRef = useRef<number | null>(null)
  const pendingPointRef = useRef<{ x: number, y: number } | null>(null)

  const currentTransform = currentSide === 'front' ? frontTransform : backTransform
  const designPosition = currentTransform.position
  const designScale = currentTransform.scale
  const designRotation = currentTransform.rotation
  const selectedDesign = getCurrentDesign()

  useEffect(() => {
    if (selectedShirt) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        setShirtImage(img)
        if (img.width > 0 && img.height > 0) {
          setCanvasSize({ width: img.width, height: img.height })
        }
      }
      img.src = currentSide === 'front' ? selectedShirt.frontImage : selectedShirt.backImage
    } else {
      setShirtImage(null)
      setCanvasSize({ width: 600, height: 800 })
    }
  }, [selectedShirt, currentSide])

  useEffect(() => {
    if (selectedDesign) {
      const img = new Image()
      img.onload = () => setDesignImage(img)
      img.src = selectedDesign.imageData
    } else {
      setDesignImage(null)
    }
  }, [selectedDesign])

  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return
      
      const container = containerRef.current
      const rect = container.getBoundingClientRect()
      
      const scaleX = rect.width / canvasSize.width
      const scaleY = rect.height / canvasSize.height
      const newScale = Math.min(scaleX, scaleY)
      
      setScale(newScale)
      
      const offsetX = (rect.width - canvasSize.width * newScale) / 2
      const offsetY = (rect.height - canvasSize.height * newScale) / 2
      
      setCanvasOffset({ x: offsetX, y: offsetY })
    }
    
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [canvasSize])

  const getDesignBounds = useCallback(() => {
    if (!selectedDesign) return { x: 0, y: 0, width: 0, height: 0 }
    
    const designWidth = selectedDesign.width * designScale
    const designHeight = selectedDesign.height * designScale
    const centerX = canvasSize.width / 2 + designPosition.x
    const centerY = canvasSize.height / 2 + designPosition.y
    
    return {
      x: centerX - designWidth / 2,
      y: centerY - designHeight / 2,
      width: designWidth,
      height: designHeight,
      centerX,
      centerY
    }
  }, [selectedDesign, designScale, designPosition, canvasSize])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height)

    if (shirtImage) {
      ctx.drawImage(shirtImage, 0, 0, canvasSize.width, canvasSize.height)
    }

    if (designImage && selectedDesign) {
      const bounds = getDesignBounds()
      const centerX = bounds.centerX ?? canvasSize.width / 2
      const centerY = bounds.centerY ?? canvasSize.height / 2
      
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate((designRotation * Math.PI) / 180)
      ctx.scale(designScale, designScale)
      
      const origWidth = selectedDesign.width
      const origHeight = selectedDesign.height
      
      ctx.drawImage(
        designImage,
        -origWidth / 2,
        -origHeight / 2,
        origWidth,
        origHeight
      )
      
      ctx.restore()
    }
    
    if (selectedDesign) {
      const bounds = getDesignBounds()
      const centerX = bounds.centerX ?? canvasSize.width / 2
      const centerY = bounds.centerY ?? canvasSize.height / 2
      const width = bounds.width ?? selectedDesign.width * designScale
      const height = bounds.height ?? selectedDesign.height * designScale

      ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate((designRotation * Math.PI) / 180)
      ctx.strokeRect(-width / 2, -height / 2, width, height)
      ctx.restore()

      ctx.setLineDash([])
      
      const handleSize = 12
      
      const corners = [
        { x: -width / 2 - handleSize / 2, y: -height / 2 - handleSize / 2, type: 'nw' },
        { x: width / 2 - handleSize / 2, y: -height / 2 - handleSize / 2, type: 'ne' },
        { x: -width / 2 - handleSize / 2, y: height / 2 - handleSize / 2, type: 'sw' },
        { x: width / 2 - handleSize / 2, y: height / 2 - handleSize / 2, type: 'se' }
      ]
      
      const edges = [
        { x: -handleSize / 2, y: -height / 2 - handleSize / 2, type: 'n' },
        { x: -handleSize / 2, y: height / 2 - handleSize / 2, type: 's' },
        { x: -width / 2 - handleSize / 2, y: -handleSize / 2, type: 'w' },
        { x: width / 2 - handleSize / 2, y: -handleSize / 2, type: 'e' }
      ]

      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate((designRotation * Math.PI) / 180)

      edges.forEach(edge => {
        ctx.fillStyle = '#3b82f6'
        ctx.fillRect(edge.x, edge.y, handleSize, handleSize)
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1
        ctx.strokeRect(edge.x, edge.y, handleSize, handleSize)
      })

      corners.forEach(corner => {
        ctx.fillStyle = '#ef4444'
        ctx.beginPath()
        ctx.arc(corner.x + handleSize / 2, corner.y + handleSize / 2, handleSize / 2 + 2, 0, Math.PI * 2)
        ctx.fill()
        
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 10px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('↻', corner.x + handleSize / 2, corner.y + handleSize / 2)
      })

      ctx.restore()
    }
  }, [shirtImage, designImage, selectedDesign, designScale, designRotation, designPosition, canvasSize, getDesignBounds])

  const getCanvasPoint = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    
    const container = containerRef.current
    const rect = container.getBoundingClientRect()
    
    return {
      x: (e.clientX - rect.left - canvasOffset.x) / scale,
      y: (e.clientY - rect.top - canvasOffset.y) / scale
    }
  }, [canvasOffset, scale])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectedDesign || !designImage) return
    
    const point = getCanvasPoint(e)
    const bounds = getDesignBounds()
    const centerX = bounds.centerX ?? canvasSize.width / 2
    const centerY = bounds.centerY ?? canvasSize.height / 2
    const width = bounds.width ?? (selectedDesign ? selectedDesign.width * designScale : 0)
    const height = bounds.height ?? (selectedDesign ? selectedDesign.height * designScale : 0)
    
    const cos = Math.cos((designRotation * Math.PI) / 180)
    const sin = Math.sin((designRotation * Math.PI) / 180)
    
    const dx = point.x - centerX
    const dy = point.y - centerY
    const rotatedDx = dx * cos + dy * sin
    const rotatedDy = -dx * sin + dy * cos
    
    const handleSize = 18
    
    const corners = [
      { x: -width / 2, y: -height / 2, type: 'nw' as const },
      { x: width / 2, y: -height / 2, type: 'ne' as const },
      { x: -width / 2, y: height / 2, type: 'sw' as const },
      { x: width / 2, y: height / 2, type: 'se' as const }
    ]
    
    const edges = [
      { x: 0, y: -height / 2, type: 'n' as const },
      { x: 0, y: height / 2, type: 's' as const },
      { x: -width / 2, y: 0, type: 'w' as const },
      { x: width / 2, y: 0, type: 'e' as const }
    ]

    let hitHandle: typeof corners[0]['type'] | typeof edges[0]['type'] | null = null
    let isCorner = false

    for (const corner of corners) {
      if (Math.abs(rotatedDx - corner.x) < handleSize && 
          Math.abs(rotatedDy - corner.y) < handleSize) {
        hitHandle = corner.type
        isCorner = true
        break
      }
    }

    if (!hitHandle) {
      for (const edge of edges) {
        if (Math.abs(rotatedDx - edge.x) < handleSize && 
            Math.abs(rotatedDy - edge.y) < handleSize) {
          hitHandle = edge.type
          break
        }
      }
    }

    if (hitHandle) {
      if (isCorner) {
        setIsRotating(true)
        setResizeHandle(null)
      } else {
        setIsResizing(true)
        setResizeHandle(hitHandle)
      }
      setDragStart(point)
      setTransformStart({ ...designPosition, rotation: designRotation, scale: designScale })
      return
    }

    if (rotatedDx >= -width / 2 && rotatedDx <= width / 2 &&
        rotatedDy >= -height / 2 && rotatedDy <= height / 2) {
      setIsDragging(true)
      setDragStart(point)
      setTransformStart({ ...designPosition, rotation: designRotation, scale: designScale })
    }
  }, [selectedDesign, designImage, designPosition, designScale, designRotation, getCanvasPoint, getDesignBounds])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging && !isRotating && !isResizing) return

    pendingPointRef.current = getCanvasPoint(e)
    if (animationFrameRef.current !== null) return

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null
      const point = pendingPointRef.current
      if (!point) return

      if (isDragging) {
      const dx = point.x - dragStart.x
      const dy = point.y - dragStart.y
      setDesignPosition({
        x: transformStart.x + dx,
        y: transformStart.y + dy
      })
      } else if (isRotating) {
      const centerX = canvasSize.width / 2 + transformStart.x
      const centerY = canvasSize.height / 2 + transformStart.y
      
      const startAngle = Math.atan2(dragStart.y - centerY, dragStart.x - centerX)
      const currentAngle = Math.atan2(point.y - centerY, point.x - centerX)
      
      const deltaAngle = ((currentAngle - startAngle) * 180) / Math.PI
      setDesignRotation(transformStart.rotation + deltaAngle)
      } else if (isResizing && resizeHandle && selectedDesign) {
      const centerX = canvasSize.width / 2 + transformStart.x
      const centerY = canvasSize.height / 2 + transformStart.y
      
      const dx = point.x - dragStart.x
      const dy = point.y - dragStart.y
      
      const cos = Math.cos((transformStart.rotation * Math.PI) / 180)
      const sin = Math.sin((transformStart.rotation * Math.PI) / 180)
      
      const rotatedDx = dx * cos + dy * sin
      const rotatedDy = -dx * sin + dy * cos

      let newScale = transformStart.scale
      let newX = transformStart.x
      let newY = transformStart.y

      const sensitivity = 0.002
      
      switch (resizeHandle) {
        case 'n':
          newScale = Math.max(0.01, Math.min(5, transformStart.scale - rotatedDy * sensitivity))
          break
        case 's':
          newScale = Math.max(0.01, Math.min(5, transformStart.scale + rotatedDy * sensitivity))
          break
        case 'e':
          newScale = Math.max(0.01, Math.min(5, transformStart.scale + rotatedDx * sensitivity))
          break
        case 'w':
          newScale = Math.max(0.01, Math.min(5, transformStart.scale - rotatedDx * sensitivity))
          break
        case 'ne':
          newScale = Math.max(0.01, Math.min(5, transformStart.scale + (rotatedDx - rotatedDy) * sensitivity * 0.5))
          break
        case 'nw':
          newScale = Math.max(0.01, Math.min(5, transformStart.scale + (-rotatedDx - rotatedDy) * sensitivity * 0.5))
          break
        case 'se':
          newScale = Math.max(0.01, Math.min(5, transformStart.scale + (rotatedDx + rotatedDy) * sensitivity * 0.5))
          break
        case 'sw':
          newScale = Math.max(0.01, Math.min(5, transformStart.scale + (-rotatedDx + rotatedDy) * sensitivity * 0.5))
          break
      }
      
      const scaleDiff = newScale / transformStart.scale
      const offsetX = (centerX - canvasSize.width / 2) * (scaleDiff - 1)
      const offsetY = (centerY - canvasSize.height / 2) * (scaleDiff - 1)
      
        setDesignScale(newScale)
        setDesignPosition({ x: newX - offsetX, y: newY - offsetY })
      }
    })
  }, [isDragging, isRotating, isResizing, resizeHandle, dragStart, transformStart, canvasSize, selectedDesign, getCanvasPoint])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsRotating(false)
    setIsResizing(false)
    setResizeHandle(null)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (!selectedDesign) return

      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY
      const zoomFactor = Math.exp(-delta * 0.0015)
      const nextScale = Math.min(5, Math.max(0.01, designScale * zoomFactor))

      if (nextScale !== designScale) setDesignScale(nextScale)
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [selectedDesign, designScale, setDesignScale])

  useEffect(() => () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
  }, [])

  return (
    <div className="flex-1 flex flex-col bg-gray-100 rounded-lg overflow-hidden">
      <div className="flex items-center justify-center gap-2 py-2 bg-white border-b border-gray-200">
        <button
          onClick={() => setCurrentSide('front')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            currentSide === 'front'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Eye className="w-4 h-4" />
          正面
        </button>
        <button
          onClick={() => setCurrentSide('back')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            currentSide === 'back'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <EyeOff className="w-4 h-4" />
          背面
        </button>
        <span className="ml-2 text-sm text-gray-400">
          {currentSide === 'front' ? '正面' : '背面'}已设计: {currentTransform.hasDesign ? '是' : '否'}
        </span>
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-auto p-4"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div 
          className="relative rounded-lg shadow-lg overflow-hidden bg-white"
          style={{
            width: `${canvasSize.width * scale}px`,
            height: `${canvasSize.height * scale}px`
          }}
        >
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="absolute top-0 left-0"
            style={{ 
              cursor: isDragging ? 'grabbing' : isRotating ? 'grabbing' : isResizing ? 'nwse-resize' : 'grab',
              width: `${canvasSize.width * scale}px`,
              height: `${canvasSize.height * scale}px`,
              imageRendering: 'auto'
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default CanvasEditor
