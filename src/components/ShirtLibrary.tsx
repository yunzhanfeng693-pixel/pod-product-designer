import { useState } from 'react'
import { ChevronDown, ChevronRight, Shirt as ShirtIcon, Eye, EyeOff, Upload, X, Plus, Trash2, Edit3, Settings } from 'lucide-react'
import { Shirt } from '@/types'
import { useCompositeStore, Category } from '@/store/compositeStore'

interface ColorGroup {
  color: string
  colorName: string
  shirts: Shirt[]
}

interface ContextMenu {
  visible: boolean
  x: number
  y: number
  shirtId: string
}

interface EditModalData {
  type: 'category' | 'shirt' | null
  data: Category | Shirt | null
}

const ShirtLibrary = () => {
  const { 
    selectedShirt, 
    setSelectedShirt, 
    shirts, 
    addShirt, 
    updateShirt,
    removeShirt,
    categories,
    addCategory,
    updateCategory,
    removeCategory
  } = useCompositeStore()
  
  const [expandedCategories, setExpandedCategories] = useState<string[]>(categories.map(c => c.name))
  const [viewMode, setViewMode] = useState<'front' | 'back'>('front')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFrontImage, setUploadFrontImage] = useState<string>('')
  const [uploadBackImage, setUploadBackImage] = useState<string>('')
  const [shirtName, setShirtName] = useState('')
  const [shirtColor, setShirtColor] = useState('#000000')
  const [shirtColorName, setShirtColorName] = useState('')
  const [shirtCategoryId, setShirtCategoryId] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenu>({ visible: false, x: 0, y: 0, shirtId: '' })
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [editModal, setEditModal] = useState<EditModalData>({ type: null, data: null })
  const [editCategoryName, setEditCategoryName] = useState('')

  const getShirtsGroupedByColor = (categoryId: string): ColorGroup[] => {
    const categoryShirts = shirts.filter(s => s.category === categoryId)
    
    const colorMap = new Map<string, ColorGroup>()
    
    categoryShirts.forEach(shirt => {
      if (!colorMap.has(shirt.color)) {
        colorMap.set(shirt.color, {
          color: shirt.color,
          colorName: shirt.colorName,
          shirts: []
        })
      }
      colorMap.get(shirt.color)!.shirts.push(shirt)
    })
    
    return Array.from(colorMap.values())
  }

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => 
      prev.includes(categoryName) 
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    )
  }

  const isCategoryExpanded = (categoryName: string) => expandedCategories.includes(categoryName)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isFront: boolean) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      if (isFront) {
        setUploadFrontImage(event.target?.result as string)
      } else {
        setUploadBackImage(event.target?.result as string)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleAddShirt = () => {
    if (!uploadFrontImage) {
      alert('请上传正面图片')
      return
    }
    if (!shirtName) {
      alert('请填写胚衣名称')
      return
    }
    if (!shirtCategoryId) {
      alert('请选择分类')
      return
    }
    if (!shirtColorName) {
      alert('请输入颜色名称')
      return
    }

    const newShirt: Shirt = {
      id: 'shirt_' + Date.now(),
      name: shirtName,
      color: shirtColor,
      colorName: shirtColorName,
      frontImage: uploadFrontImage,
      backImage: uploadBackImage || uploadFrontImage,
      category: shirtCategoryId
    }

    addShirt(newShirt)
    resetUploadForm()
    setTimeout(() => {
      setShowSettingsModal(true)
    }, 100)
  }

  const resetUploadForm = () => {
    setShowUploadModal(false)
    setUploadFrontImage('')
    setUploadBackImage('')
    setShirtName('')
    setShirtColor('#000000')
    setShirtColorName('')
    setShirtCategoryId('')
    setEditModal({ type: null, data: null })
  }

  const handleUpdateShirt = () => {
    if (!editModal.data || editModal.type !== 'shirt') return
    
    const shirt = editModal.data as Shirt
    updateShirt(shirt.id, {
      name: shirtName || shirt.name,
      color: shirtColor,
      colorName: shirtColorName || shirt.colorName,
      frontImage: uploadFrontImage || shirt.frontImage,
      backImage: uploadBackImage || shirt.backImage,
      category: shirtCategoryId || shirt.category
    })
    resetUploadForm()
    setTimeout(() => {
      setShowSettingsModal(true)
    }, 100)
  }

  const handleRemoveShirt = (shirtId: string) => {
    if (confirm('确定要删除这个胚衣吗？')) {
      removeShirt(shirtId)
    }
    setContextMenu({ visible: false, x: 0, y: 0, shirtId: '' })
  }

  const handleClickOutside = () => {
    setContextMenu({ visible: false, x: 0, y: 0, shirtId: '' })
  }

  const handleEditShirt = (shirt: Shirt) => {
    setEditModal({ type: 'shirt', data: shirt })
    setShirtName(shirt.name)
    setShirtColor(shirt.color)
    setShirtColorName(shirt.colorName)
    setUploadFrontImage(shirt.frontImage)
    setUploadBackImage(shirt.backImage)
    setShirtCategoryId(shirt.category)
    setContextMenu({ visible: false, x: 0, y: 0, shirtId: '' })
  }

  const handleOpenCategoryEdit = (category: Category) => {
    setEditModal({ type: 'category', data: category })
    setEditCategoryName(category.name)
  }

  const handleSaveCategory = () => {
    if (!editModal.data || editModal.type !== 'category') return
    const category = editModal.data as Category
    if (!editCategoryName.trim()) {
      alert('请输入分类名称')
      return
    }
    updateCategory(category.id, editCategoryName)
    setEditModal({ type: null, data: null })
    setEditCategoryName('')
  }

  const handleRemoveCategory = (categoryId: string) => {
    if (confirm('确定要删除这个分类吗？此操作会删除该分类下的所有胚衣。')) {
      removeCategory(categoryId)
    }
  }

  const handleAddCategory = () => {
    const name = prompt('请输入款式名称')
    if (name && name.trim()) {
      if (categories.some(c => c.name === name.trim())) {
        alert('该款式已存在')
        return
      }
      addCategory(name.trim())
    }
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-sm">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShirtIcon className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-800">胚衣库</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="管理分类和颜色"
            >
              <Settings className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('front')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              viewMode === 'front' 
                ? 'bg-primary-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Eye className="w-4 h-4 inline-block mr-1" />
            正面
          </button>
          <button
            onClick={() => setViewMode('back')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              viewMode === 'back' 
                ? 'bg-primary-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <EyeOff className="w-4 h-4 inline-block mr-1" />
            背面
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {categories.map(category => (
          <div key={category.id} className="mb-2">
            <button
              onClick={() => toggleCategory(category.name)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">
                  {category.name}
                </span>
                <span className="text-xs text-gray-400">
                  ({getShirtsGroupedByColor(category.id).length})
                </span>
              </div>
              {isCategoryExpanded(category.name) ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>
            
            {isCategoryExpanded(category.name) && (
              <div className="ml-2 mt-1">
                <div className="grid grid-cols-4 gap-2">
                  {getShirtsGroupedByColor(category.id).map(colorGroup => {
                    const shirt = colorGroup.shirts[0]
                    return (
                      <div key={colorGroup.color} className="flex flex-col items-center">
                        <button
                          onClick={() => {
                            if (shirt) {
                              setSelectedShirt(shirt)
                            }
                          }}
                          className={`relative w-full aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all hover:shadow-md ${
                            shirt 
                              ? (selectedShirt?.id === shirt.id 
                                ? 'border-primary-500 shadow-md' 
                                : 'border-transparent hover:border-gray-300')
                              : 'border-dashed border-gray-200 bg-gray-50 cursor-not-allowed'
                          }`}
                        >
                          {shirt ? (
                            <img
                              src={viewMode === 'front' ? shirt.frontImage : shirt.backImage}
                              alt={shirt.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                target.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 267' fill='%23e5e7eb'%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' fill='%239ca3af' font-size='12'%3E图片加载失败%3C/text%3E%3C/svg%3E`
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-xs text-gray-400">未上传</span>
                            </div>
                          )}
                          {selectedShirt?.id === shirt?.id && (
                            <div className="absolute inset-0 bg-primary-500 bg-opacity-20 flex items-center justify-center">
                              <div className="w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            </div>
                          )}
                        </button>
                        <div className="flex items-center gap-1 mt-1">
                          <div 
                            className="w-3 h-3 rounded-full border border-gray-300"
                            style={{ backgroundColor: colorGroup.color }}
                          />
                          <span className="text-xs text-gray-600">{colorGroup.colorName}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                {editModal.type === 'shirt' ? '编辑胚衣' : '上传胚衣'}
              </h3>
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setEditModal({ type: null, data: null })
                  resetUploadForm()
                }}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">胚衣名称</label>
                <input
                  type="text"
                  value={shirtName}
                  onChange={(e) => setShirtName(e.target.value)}
                  placeholder="输入胚衣名称"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">分类</label>
                <select
                  value={shirtCategoryId}
                  onChange={(e) => setShirtCategoryId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">请选择分类</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">颜色</label>
                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="color"
                    value={shirtColor}
                    onChange={(e) => setShirtColor(e.target.value)}
                    className="w-16 h-10 rounded-lg cursor-pointer border-2 border-gray-200"
                  />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={shirtColor}
                      onChange={(e) => {
                        if (e.target.value.startsWith('#') && e.target.value.length <= 7) {
                          setShirtColor(e.target.value)
                        }
                      }}
                      placeholder="#000000"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={shirtColorName}
                  onChange={(e) => setShirtColorName(e.target.value)}
                  placeholder="颜色名称（如：白色、黑色、红色等）"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">正面图片</label>
                <button
                  className={`w-full border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    uploadFrontImage ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onClick={() => document.getElementById('front-image-input')?.click()}
                >
                  {uploadFrontImage ? (
                    <div className="flex flex-col items-center">
                      <img src={uploadFrontImage} alt="正面预览" className="max-h-32 mx-auto rounded mb-2" />
                      <p className="text-sm text-green-600">点击更换</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                      <p className="text-gray-600">点击上传正面图片</p>
                      <p className="text-sm text-gray-400">支持 JPG、PNG 格式</p>
                    </>
                  )}
                </button>
                <input
                  id="front-image-input"
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => handleImageUpload(e, true)}
                  className="hidden"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">背面图片（可选）</label>
                <button
                  className={`w-full border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    uploadBackImage ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onClick={() => document.getElementById('back-image-input')?.click()}
                >
                  {uploadBackImage ? (
                    <div className="flex flex-col items-center">
                      <img src={uploadBackImage} alt="背面预览" className="max-h-32 mx-auto rounded mb-2" />
                      <p className="text-sm text-green-600">点击更换</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                      <p className="text-gray-600">点击上传背面图片</p>
                      <p className="text-sm text-gray-400">不设置则使用正面图片</p>
                    </>
                  )}
                </button>
                <input
                  id="back-image-input"
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => handleImageUpload(e, false)}
                  className="hidden"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setEditModal({ type: null, data: null })
                  resetUploadForm()
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (editModal.type === 'shirt') {
                    handleUpdateShirt()
                  } else {
                    handleAddShirt()
                  }
                }}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors cursor-pointer active:bg-primary-800"
              >
                {editModal.type === 'shirt' ? '保存修改' : '添加胚衣'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-800">管理分类和颜色</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-700">款式管理</h4>
                <button
                  onClick={handleAddCategory}
                  className="flex items-center gap-1 px-2 py-1 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  添加款式
                </button>
              </div>
              {categories.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">暂无款式</p>
              ) : (
                <div className="space-y-2">
                  {categories.map(category => {
                    const colorGroups = getShirtsGroupedByColor(category.id)
                    return (
                      <div key={category.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between p-3 bg-gray-50">
                          <span className="text-sm text-gray-700">{category.name}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenCategoryEdit(category)}
                              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                              title="编辑"
                            >
                              <Edit3 className="w-4 h-4 text-gray-600" />
                            </button>
                            <button
                              onClick={() => handleRemoveCategory(category.id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </div>
                        <div className="p-2 space-y-2">
                          {colorGroups.map(colorGroup => {
                            const existingShirt = colorGroup.shirts[0]
                            return (
                              <div key={colorGroup.color} className={`flex items-center justify-between p-2 rounded-lg ${
                                existingShirt ? 'bg-green-50 border border-green-200' : 'bg-white border border-gray-100'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <div 
                                    className={`w-5 h-5 rounded-full border-2 ${
                                      existingShirt ? 'border-green-500' : 'border-gray-300'
                                    }`}
                                    style={{ backgroundColor: colorGroup.color }}
                                  />
                                  <span className={`text-xs ${existingShirt ? 'text-green-700' : 'text-gray-600'}`}>
                                    {colorGroup.colorName}
                                  </span>
                                  {existingShirt && (
                                    <span className="flex items-center gap-1 text-xs text-green-600">
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      已上传
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setShirtCategoryId(category.id)
                                      setShirtColor(colorGroup.color)
                                      setShirtColorName(colorGroup.colorName)
                                      setShirtName(category.name)
                                      if (existingShirt) {
                                        setUploadFrontImage(existingShirt.frontImage)
                                        setUploadBackImage(existingShirt.backImage)
                                        setEditModal({ type: 'shirt', data: existingShirt })
                                      }
                                      setTimeout(() => {
                                        setShowSettingsModal(false)
                                        setTimeout(() => {
                                          setShowUploadModal(true)
                                        }, 50)
                                      }, 0)
                                    }}
                                    className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded transition-colors cursor-pointer relative z-10 ${
                                      existingShirt 
                                        ? 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700' 
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 active:bg-gray-400'
                                    }`}
                                  >
                                    {existingShirt ? (
                                      <>
                                        <Edit3 className="w-3 h-3" />
                                        编辑
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="w-3 h-3" />
                                        上传
                                      </>
                                    )}
                                  </button>
                                  {existingShirt && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (confirm(`确定删除 ${colorGroup.colorName} 颜色的胚衣吗？`)) {
                                          removeShirt(existingShirt.id)
                                        }
                                      }}
                                      className="p-1.5 hover:bg-red-50 rounded-lg transition-colors cursor-pointer relative z-10 active:bg-red-100"
                                      title="删除"
                                    >
                                      <Trash2 className="w-3 h-3 text-red-600" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          <button
                            onClick={() => {
                              setShirtCategoryId(category.id)
                              setShirtName(category.name)
                              resetUploadForm()
                              setShowSettingsModal(false)
                              setShowUploadModal(true)
                            }}
                            className="w-full flex items-center justify-center gap-1 py-2 text-xs text-gray-500 border border-dashed border-gray-200 rounded-lg hover:border-primary-300 hover:text-primary-600 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            添加新颜色
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {editModal.type === 'category' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">编辑分类名称</h3>
            <input
              type="text"
              value={editCategoryName}
              onChange={(e) => setEditCategoryName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setEditModal({ type: null, data: null })
                  setEditCategoryName('')
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveCategory}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu.visible && (
        <>
          <div 
            className="fixed inset-0 z-40"
            onClick={handleClickOutside}
          />
          <div
            className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                const shirt = shirts.find(s => s.id === contextMenu.shirtId)
                if (shirt) handleEditShirt(shirt)
              }}
              className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Edit3 className="w-4 h-4" />
              编辑胚衣
            </button>
            <button
              onClick={() => handleRemoveShirt(contextMenu.shirtId)}
              className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              删除胚衣
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default ShirtLibrary
