import { useState, useRef, useCallback } from 'react'

interface ResizablePanelProps {
  children: React.ReactNode
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  handleSide?: 'left' | 'right'
  onResize?: (width: number) => void
}

export default function ResizablePanel({ 
  children, 
  defaultWidth = 256, 
  minWidth = 120, 
  maxWidth = 500,
  handleSide = 'right',
  onResize 
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth)
  const [isDragging, setIsDragging] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)

    const startX = e.clientX
    const startWidth = width

    const handleMouseMove = (e: MouseEvent) => {
      const direction = handleSide === 'right' ? 1 : -1
      const deltaX = (e.clientX - startX) * direction
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX))
      setWidth(newWidth)
      onResize?.(newWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [width, minWidth, maxWidth, handleSide, onResize])

  const resizeHandle = (
    <div
      className={`group relative z-20 w-2.5 flex-shrink-0 cursor-col-resize select-none touch-none flex items-center justify-center ${
        isDragging ? 'bg-primary-100' : 'hover:bg-gray-100'
      }`}
      onMouseDown={handleMouseDown}
      title="拖动调节宽度"
    >
      <div className={`w-px h-full transition-colors ${
        isDragging ? 'bg-primary-500' : 'bg-gray-300 group-hover:bg-gray-500'
      }`} />
    </div>
  )

  return (
    <div 
      ref={panelRef}
      className="flex-shrink-0 flex"
      style={{ width }}
    >
      {handleSide === 'left' && resizeHandle}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
      {handleSide === 'right' && resizeHandle}
    </div>
  )
}
