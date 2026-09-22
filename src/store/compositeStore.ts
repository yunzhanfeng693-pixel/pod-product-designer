import { normalizePromptStyle } from '@/utils/promptStyleNormalization'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Shirt, Design, Position, PromptStyle, SavedModelReference } from '@/types'
import { createDefaultPromptStyles } from '@/data/defaultPromptStyles'
import { indexedDBStorage } from './dbStorage'
import { bundledCategories, bundledColors, bundledShirts } from '@/data/bundledData'

interface TransformState {
  position: Position
  scale: number
  rotation: number
  hasDesign: boolean
}

export interface Category {
  id: string
  name: string
}

export interface ColorOption {
  id: string
  color: string
  colorName: string
}

interface CompositeStore {
  selectedShirt: Shirt | null
  frontDesign: Design | null
  backDesign: Design | null
  currentSide: 'front' | 'back'
  frontTransform: TransformState
  backTransform: TransformState
  savePath: string
  shirts: Shirt[]
  categories: Category[]
  colors: ColorOption[]
  promptStyles: PromptStyle[]
  modelReferences: SavedModelReference[]
  setSelectedShirt: (shirt: Shirt | null) => void
  setFrontDesign: (design: Design | null) => void
  setBackDesign: (design: Design | null) => void
  setCurrentSide: (side: 'front' | 'back') => void
  setDesignPosition: (position: Position) => void
  setDesignScale: (scale: number) => void
  setDesignRotation: (rotation: number) => void
  setSavePath: (path: string) => void
  resetDesignTransform: () => void
  addShirt: (shirt: Shirt) => void
  updateShirt: (shirtId: string, updates: Partial<Shirt>) => void
  removeShirt: (shirtId: string) => void
  getCurrentTransform: () => TransformState
  getCurrentDesign: () => Design | null
  setTransformHasDesign: (hasDesign: boolean) => void
  addCategory: (name: string) => void
  updateCategory: (categoryId: string, name: string) => void
  removeCategory: (categoryId: string) => void
  addColor: (color: string, colorName: string) => void
  updateColor: (colorId: string, color: string, colorName: string) => void
  removeColor: (colorId: string) => void
  addPromptStyle: () => string
  updatePromptStyle: (styleId: string, updates: Partial<Omit<PromptStyle, 'id' | 'createdAt'>>) => void
  duplicatePromptStyle: (styleId: string) => string | null
  removePromptStyle: (styleId: string) => void
  resetPromptStyles: () => void
  addModelReference: (reference: Omit<SavedModelReference, 'id' | 'createdAt'>) => string
  removeModelReference: (id: string) => void
}

const defaultCategories: Category[] = bundledCategories
const defaultColors: ColorOption[] = bundledColors
const defaultShirts: Shirt[] = bundledShirts

const migrateFromLocalStorage = async () => {
  const oldData = localStorage.getItem('product-composite-storage')
  if (oldData) {
    try {
      const parsed = JSON.parse(oldData)
      const state = parsed.state || parsed
      
      // 检查数据格式是否兼容（category应为ID而不是名称）
      const hasOldFormat = state.shirts?.some((shirt: any) => 
        shirt.category && !shirt.category.startsWith('cat_')
      )
      
      if (hasOldFormat) {
        console.log('检测到旧格式数据，自动进行格式转换...')
        
        const defaultCategories: Category[] = [
          { id: 'cat_1', name: '圆领' },
          { id: 'cat_2', name: 'V领' },
          { id: 'cat_3', name: '运动' },
          { id: 'cat_4', name: 'Polo' }
        ]
        
        const categoriesMap: Record<string, string> = {}
        defaultCategories.forEach(cat => {
          categoriesMap[cat.name] = cat.id
        })
        
        let migratedCount = 0
        if (state.shirts) {
          state.shirts.forEach((shirt: any) => {
            if (shirt.category && !shirt.category.startsWith('cat_')) {
              const categoryName = shirt.category
              let categoryId = categoriesMap[categoryName]
              
              if (!categoryId) {
                categoryId = 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
                categoriesMap[categoryName] = categoryId
                if (!state.categories) state.categories = []
                state.categories.push({ id: categoryId, name: categoryName })
              }
              
              shirt.category = categoryId
              migratedCount++
            }
          })
        }
        
        console.log(`已迁移 ${migratedCount} 个胚衣的数据格式`)
      }
      
      await indexedDBStorage.setItem(
        'product-composite-storage',
        JSON.stringify({ state, version: 0 })
      )
      localStorage.removeItem('product-composite-storage')
      console.log('数据已从 localStorage 迁移到 IndexedDB')
    } catch (e) {
      console.error('迁移失败:', e)
    }
  }
}

migrateFromLocalStorage()

export const useCompositeStore = create<CompositeStore>()(
  persist(
    (set, get) => ({
      selectedShirt: null,
      frontDesign: null,
      backDesign: null,
      currentSide: 'front',
      frontTransform: { position: { x: 0, y: 0 }, scale: 1, rotation: 0, hasDesign: false },
      backTransform: { position: { x: 0, y: 0 }, scale: 1, rotation: 0, hasDesign: false },
      savePath: '',
      shirts: defaultShirts,
      categories: defaultCategories,
      colors: defaultColors,
      promptStyles: createDefaultPromptStyles(),
      modelReferences: [],

      setSelectedShirt: (shirt) => set({ selectedShirt: shirt }),
      setFrontDesign: (design) => {
        console.log('设置正面设计:', design ? { name: design.name, size: design.imageData.length } : null)
        set((state) => ({
          frontDesign: design,
          frontTransform: { ...state.frontTransform, hasDesign: !!design }
        }))
      },
      setBackDesign: (design) => {
        console.log('设置背面设计:', design ? { name: design.name, size: design.imageData.length } : null)
        set((state) => ({
          backDesign: design,
          backTransform: { ...state.backTransform, hasDesign: !!design }
        }))
      },
      setCurrentSide: (side) => set({ currentSide: side }),
      setDesignPosition: (position) => {
        const { currentSide } = get()
        set((state) => ({
          frontTransform: currentSide === 'front' 
            ? { ...state.frontTransform, position }
            : state.frontTransform,
          backTransform: currentSide === 'back'
            ? { ...state.backTransform, position }
            : state.backTransform
        }))
      },
      setDesignScale: (scale) => {
        const { currentSide } = get()
        set((state) => ({
          frontTransform: currentSide === 'front'
            ? { ...state.frontTransform, scale }
            : state.frontTransform,
          backTransform: currentSide === 'back'
            ? { ...state.backTransform, scale }
            : state.backTransform
        }))
      },
      setDesignRotation: (rotation) => {
        const { currentSide } = get()
        set((state) => ({
          frontTransform: currentSide === 'front'
            ? { ...state.frontTransform, rotation }
            : state.frontTransform,
          backTransform: currentSide === 'back'
            ? { ...state.backTransform, rotation }
            : state.backTransform
        }))
      },
      setSavePath: (path) => {
        console.log('设置 savePath:', path)
        set({ savePath: path })
      },
      resetDesignTransform: () => {
        const { currentSide } = get()
        set((state) => ({
          frontTransform: currentSide === 'front'
            ? { position: { x: 0, y: 0 }, scale: 1, rotation: 0, hasDesign: state.frontTransform.hasDesign }
            : state.frontTransform,
          backTransform: currentSide === 'back'
            ? { position: { x: 0, y: 0 }, scale: 1, rotation: 0, hasDesign: state.backTransform.hasDesign }
            : state.backTransform
        }))
      },
      addShirt: (shirt) => set((state) => ({
        shirts: [...state.shirts, shirt]
      })),
      updateShirt: (shirtId, updates) => set((state) => ({
        shirts: state.shirts.map(s => 
          s.id === shirtId ? { ...s, ...updates } : s
        )
      })),
      removeShirt: (shirtId) => set((state) => ({
        shirts: state.shirts.filter(s => s.id !== shirtId)
      })),
      getCurrentTransform: () => {
        const { currentSide, frontTransform, backTransform } = get()
        return currentSide === 'front' ? frontTransform : backTransform
      },
      getCurrentDesign: () => {
        const { currentSide, frontDesign, backDesign } = get()
        return currentSide === 'front' ? frontDesign : backDesign
      },
      setTransformHasDesign: (hasDesign) => {
        const { currentSide } = get()
        set((state) => ({
          frontTransform: currentSide === 'front'
            ? { ...state.frontTransform, hasDesign }
            : state.frontTransform,
          backTransform: currentSide === 'back'
            ? { ...state.backTransform, hasDesign }
            : state.backTransform
        }))
      },
      addPromptStyle: () => {
        const now = new Date().toISOString()
        const id = `style_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        set((state) => ({
          promptStyles: [...state.promptStyles, {
            id,
            name: '新提示词风格',
            corePrompt: '',
            photographyPrompt: '',
            shots: [{ id: `shot_${Date.now()}`, title: '主图', prompt: '', order: 1 }],
            createdAt: now,
            updatedAt: now
          }]
        }))
        return id
      },
      updatePromptStyle: (styleId, updates) => set((state) => ({
        promptStyles: state.promptStyles.map(style => style.id === styleId
          ? { ...style, ...updates, updatedAt: new Date().toISOString() }
          : style)
      })),
      duplicatePromptStyle: (styleId) => {
        const source = get().promptStyles.find(style => style.id === styleId)
        if (!source) return null
        const now = new Date().toISOString()
        const id = `style_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        set((state) => ({
          promptStyles: [...state.promptStyles, {
            ...source,
            id,
            name: `${source.name} 副本`,
            shots: source.shots.map((shot, index) => ({ ...shot, id: `shot_${Date.now()}_${index}` })),
            createdAt: now,
            updatedAt: now
          }]
        }))
        return id
      },
      removePromptStyle: (styleId) => set((state) => ({
        promptStyles: state.promptStyles.filter(style => style.id !== styleId)
      })),
      resetPromptStyles: () => set({ promptStyles: createDefaultPromptStyles() }),
      addModelReference: (reference) => {
        const existing = get().modelReferences.find(item => item.imageData === reference.imageData)
        if (existing) return existing.id
        const id = `model_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        set((state) => ({ modelReferences: [{ ...reference, id, createdAt: new Date().toISOString() }, ...state.modelReferences] }))
        return id
      },
      removeModelReference: (id) => set((state) => ({ modelReferences: state.modelReferences.filter(reference => reference.id !== id) })),
      addCategory: (name) => set((state) => ({
        categories: [...state.categories, { id: 'cat_' + Date.now(), name }]
      })),
      updateCategory: (categoryId, name) => set((state) => ({
        categories: state.categories.map(c => 
          c.id === categoryId ? { ...c, name } : c
        ),
        shirts: state.shirts.map(s => 
          s.category === categoryId ? { ...s, categoryName: name } : s
        )
      })),
      removeCategory: (categoryId) => set((state) => ({
        categories: state.categories.filter(c => c.id !== categoryId),
        shirts: state.shirts.filter(s => s.category !== categoryId)
      })),
      addColor: (color, colorName) => set((state) => ({
        colors: [...state.colors, { id: 'color_' + Date.now(), color, colorName }]
      })),
      updateColor: (colorId, newColor, newColorName) => {
        const state = get()
        const oldColor = state.colors.find(c => c.id === colorId)
        if (oldColor) {
          set({
            colors: state.colors.map(c => 
              c.id === colorId ? { ...c, color: newColor, colorName: newColorName } : c
            ),
            shirts: state.shirts.map(s => 
              s.color === oldColor.color ? { ...s, color: newColor, colorName: newColorName } : s
            )
          })
        }
      },
      removeColor: (colorId) => {
        const state = get()
        const colorToRemove = state.colors.find(c => c.id === colorId)
        if (colorToRemove) {
          set({
            colors: state.colors.filter(c => c.id !== colorId),
            shirts: state.shirts.filter(s => s.color !== colorToRemove.color)
          })
        }
      }
    }),
    {
      name: 'product-composite-storage',
      storage: createJSONStorage(() => indexedDBStorage),
      version: 4,
      migrate: (persistedState: unknown) => {
        const persisted = (persistedState ?? {}) as Partial<CompositeStore>
        const existingStyles = Array.isArray(persisted.promptStyles) ? persisted.promptStyles : []
        const modelReferences = Array.isArray(persisted.modelReferences) ? persisted.modelReferences : []
        const existingShirts = Array.isArray(persisted.shirts) ? persisted.shirts : []
        const existingCategories = Array.isArray(persisted.categories) ? persisted.categories : []
        const existingColors = Array.isArray(persisted.colors) ? persisted.colors : []
        const missingDefaults = createDefaultPromptStyles().filter(
          defaultStyle => !existingStyles.some(style => style.id === defaultStyle.id)
        )
        const missingShirts = bundledShirts.filter(
          bundledShirt => !existingShirts.some(shirt => shirt.id === bundledShirt.id)
        )
        const missingCategories = bundledCategories.filter(
          category => !existingCategories.some(existing => existing.id === category.id)
        )
        const missingColors = bundledColors.filter(
          color => !existingColors.some(existing => existing.id === color.id)
        )
        return {
          ...persisted,
          promptStyles: [...existingStyles, ...missingDefaults].map(normalizePromptStyle),
          modelReferences,
          shirts: [...existingShirts, ...missingShirts],
          categories: [...existingCategories, ...missingCategories],
          colors: [...existingColors, ...missingColors]
        }
      },
      partialize: (state) => ({
        shirts: state.shirts,
        savePath: state.savePath,
        categories: state.categories,
        colors: state.colors,
        promptStyles: state.promptStyles,
        modelReferences: state.modelReferences,
        frontDesign: state.frontDesign,
        backDesign: state.backDesign,
        frontTransform: state.frontTransform,
        backTransform: state.backTransform,
        selectedShirt: state.selectedShirt
      }),
      onRehydrateStorage: () => (state) => {
        console.log('IndexedDB 数据恢复完成')
        if (state) {
          console.log('恢复的数据:', {
            frontDesign: state.frontDesign ? { name: state.frontDesign.name, hasData: !!state.frontDesign.imageData } : null,
            backDesign: state.backDesign ? { name: state.backDesign.name, hasData: !!state.backDesign.imageData } : null,
            shirts: state.shirts.length,
            savePath: state.savePath || '(空)'
          })
        }
      }
    }
  )
)
