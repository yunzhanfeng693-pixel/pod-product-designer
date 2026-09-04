import { useState, useCallback } from 'react'
import { Save, RotateCw, ZoomIn, ZoomOut, RefreshCw, Image, Layers } from 'lucide-react'
import { useCompositeStore } from '@/store/compositeStore'

const Toolbar = () => {
  const { 
    selectedShirt,
    frontDesign,
    backDesign,
    frontTransform,
    backTransform,
    currentSide,
    shirts,
    setDesignScale, 
    setDesignRotation, 
    resetDesignTransform,
  } = useCompositeStore()
  
  const currentTransform = currentSide === 'front' ? frontTransform : backTransform
  const designScale = currentTransform.scale
  const designRotation = currentTransform.rotation
  
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [saveAllColors, setSaveAllColors] = useState(false)
  const [saveFront, setSaveFront] = useState(true)
  const [saveBack, setSaveBack] = useState(true)

  const renderImage = useCallback((shirt: typeof selectedShirt, side: 'front' | 'back') => {
    return new Promise<string>((resolve) => {
      const design = side === 'front' ? frontDesign : backDesign
      if (!shirt || !design) {
        resolve('')
        return
      }

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve('')
        return
      }

      const shirtImg = document.createElement('img')
      shirtImg.crossOrigin = 'anonymous'
      shirtImg.onload = () => {
        canvas.width = shirtImg.width
        canvas.height = shirtImg.height
        
        ctx.drawImage(shirtImg, 0, 0)

        const designImg = document.createElement('img')
        designImg.onload = () => {
          const transform = side === 'front' ? frontTransform : backTransform
          
          if (!transform.hasDesign) {
            resolve(canvas.toDataURL('image/png', 1.0))
            return
          }

          const displayScale = Math.min(
            canvas.width / shirtImg.width,
            canvas.height / shirtImg.height,
            1
          )
          
          const positionScaleX = canvas.width / (shirtImg.width * displayScale)
          const positionScaleY = canvas.height / (shirtImg.height * displayScale)

          const centerX = canvas.width / 2 + transform.position.x * positionScaleX
          const centerY = canvas.height / 2 + transform.position.y * positionScaleY

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

          resolve(canvas.toDataURL('image/png', 1.0))
        }
        designImg.src = design.imageData
      }
      shirtImg.src = side === 'front' ? shirt.frontImage : shirt.backImage
    })
  }, [frontDesign, backDesign, frontTransform, backTransform])

  const handleSave = useCallback(async () => {
    if (!selectedShirt) return

    setIsSaving(true)
    setSaveProgress(0)

    const sidesToSave: ('front' | 'back')[] = []
    if (saveFront && frontTransform.hasDesign) sidesToSave.push('front')
    if (saveBack && backTransform.hasDesign) sidesToSave.push('back')

    if (sidesToSave.length === 0) {
      alert('请至少选择一个面进行保存')
      setIsSaving(false)
      return
    }

    const shirtsToProcess = saveAllColors && selectedShirt.category
      ? shirts.filter(s => s.category === selectedShirt.category)
      : [selectedShirt]

    const totalSteps = shirtsToProcess.length * sidesToSave.length
    let currentStep = 0

    for (const shirt of shirtsToProcess) {
      for (const side of sidesToSave) {
        const dataUrl = await renderImage(shirt, side)
        if (dataUrl) {
          const link = document.createElement('a')
          link.download = `${shirt.name}_${shirt.colorName}_${side}_${Date.now()}.png`
          link.href = dataUrl
          link.click()
        }
        currentStep++
        setSaveProgress((currentStep / totalSteps) * 100)
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    setIsSaving(false)
    setSaveProgress(100)
    setShowSaveDialog(false)

    setTimeout(() => {
      alert(`成功保存 ${currentStep} 张图片`)
    }, 300)
  }, [selectedShirt, frontTransform.hasDesign, backTransform.hasDesign, renderImage, shirts, saveAllColors, saveFront, saveBack])

  const handleSaveWithPath = useCallback(() => {
    handleSave()
  }, [handleSave])

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDesignScale(Math.max(0.01, designScale - 0.1))}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-5 h-5 text-gray-600" />
          </button>
          <input
            type="number"
            min="1"
            max="500"
            value={Math.round(designScale * 100)}
            onChange={(e) => {
              const value = parseInt(e.target.value) || 1
              setDesignScale(Math.min(5, Math.max(0.01, value / 100)))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur()
              }
            }}
            className="w-16 text-center text-sm font-medium text-gray-700 border border-gray-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            title="输入缩放百分比"
          />
          <span className="text-sm text-gray-500">%</span>
          <button
            onClick={() => setDesignScale(Math.min(5, designScale + 0.1))}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            title="放大"
          >
            <ZoomIn className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="w-px h-8 bg-gray-200" />

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDesignRotation(designRotation - 15)}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            title="逆时针旋转15°"
          >
            <RotateCw className="w-5 h-5 text-gray-600 rotate-180" />
          </button>
          <input
            type="number"
            value={Math.round(designRotation)}
            onChange={(e) => setDesignRotation(parseFloat(e.target.value) || 0)}
            className="w-20 text-center text-sm font-medium text-gray-700 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="0"
            min="-180"
            max="180"
          />
          <button
            onClick={() => setDesignRotation(designRotation + 15)}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            title="顺时针旋转15°"
          >
            <RotateCw className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="w-px h-8 bg-gray-200" />

        <button
          onClick={resetDesignTransform}
          className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
          title="重置变换"
        >
          <RefreshCw className="w-5 h-5 text-gray-600" />
        </button>

        <div className="flex-1" />

        <div className="flex items-center gap-2 mr-2">
          <span className="text-sm text-gray-500">设计状态:</span>
          <span className={`px-2 py-1 text-xs rounded-full ${frontTransform.hasDesign ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            正面{frontTransform.hasDesign ? '✓' : ''}
          </span>
          <span className={`px-2 py-1 text-xs rounded-full ${backTransform.hasDesign ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            背面{backTransform.hasDesign ? '✓' : ''}
          </span>
        </div>

        <button
          onClick={() => setShowSaveDialog(true)}
          disabled={!selectedShirt || (!frontTransform.hasDesign && !backTransform.hasDesign)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <Save className="w-5 h-5" />
          {isSaving ? '保存中...' : '快速保存'}
        </button>
      </div>

      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Image className="w-5 h-5 text-primary-600" />
              保存设置
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">保存内容</label>
              <div className="flex flex-wrap gap-2">
                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  saveFront && frontTransform.hasDesign 
                    ? 'border-green-300 bg-green-50 hover:bg-green-100' 
                    : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                }`}>
                  <input
                    type="checkbox"
                    checked={saveFront}
                    onChange={(e) => setSaveFront(e.target.checked)}
                    disabled={!frontTransform.hasDesign}
                    className="w-4 h-4 text-primary-600 rounded"
                  />
                  <span className="text-sm font-medium">
                    正面 {frontTransform.hasDesign ? '✓' : ''}
                  </span>
                </label>
                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  saveBack && backTransform.hasDesign 
                    ? 'border-green-300 bg-green-50 hover:bg-green-100' 
                    : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                }`}>
                  <input
                    type="checkbox"
                    checked={saveBack}
                    onChange={(e) => setSaveBack(e.target.checked)}
                    disabled={!backTransform.hasDesign}
                    className="w-4 h-4 text-primary-600 rounded"
                  />
                  <span className="text-sm font-medium">
                    背面 {backTransform.hasDesign ? '✓' : ''}
                  </span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={saveAllColors}
                    onChange={(e) => setSaveAllColors(e.target.checked)}
                    className="w-4 h-4 text-primary-600 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Layers className="w-4 h-4" />
                    保存所有颜色
                  </span>
                </label>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {saveAllColors && selectedShirt?.category 
                  ? `将保存 ${shirts.filter(s => s.category === selectedShirt.category).length} 种颜色 × ${((saveFront && frontTransform.hasDesign) ? 1 : 0) + ((saveBack && backTransform.hasDesign) ? 1 : 0)} 面 = ${shirts.filter(s => s.category === selectedShirt.category).length * (((saveFront && frontTransform.hasDesign) ? 1 : 0) + ((saveBack && backTransform.hasDesign) ? 1 : 0))} 张图片`
                  : `将保存 ${((saveFront && frontTransform.hasDesign) ? 1 : 0) + ((saveBack && backTransform.hasDesign) ? 1 : 0)} 张图片`
                }
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">下载设置</label>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>提示：</strong>由于浏览器安全限制，图片将保存到您的浏览器默认下载目录。
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  您可以在浏览器设置中更改默认下载位置。
                </p>
              </div>
            </div>

            {isSaving && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">保存进度</span>
                  <span className="text-primary-600">{Math.round(saveProgress)}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary-600 transition-all duration-300"
                    style={{ width: `${saveProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveDialog(false)}
                disabled={isSaving}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveWithPath}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {isSaving ? '保存中...' : '保存图片'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Toolbar
