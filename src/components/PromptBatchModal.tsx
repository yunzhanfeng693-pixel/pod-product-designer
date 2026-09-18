import { useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, Copy, FilePlus2, Image as ImageIcon, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import { useCompositeStore } from '@/store/compositeStore'
import { PromptShot } from '@/types'
import { renderCompositeDataUrl } from '@/utils/compositeRenderer'
import { copyPlainText, copyPngDataUrl } from '@/utils/clipboard'
import { buildPromptTasks, isValidReferenceUrl, PromptOutputMode } from '@/utils/promptTasks'

interface PromptBatchModalProps {
  isOpen: boolean
  onClose: () => void
}

interface GeneratedTask {
  shotId: string
  title: string
  prompt: string
}

const PromptBatchModal = ({ isOpen, onClose }: PromptBatchModalProps) => {
  const {
    selectedShirt,
    frontDesign,
    backDesign,
    frontTransform,
    backTransform,
    promptStyles,
    addPromptStyle,
    updatePromptStyle,
    duplicatePromptStyle,
    removePromptStyle,
    resetPromptStyles
  } = useCompositeStore()
  const [selectedStyleId, setSelectedStyleId] = useState('')
  const [mode, setMode] = useState<PromptOutputMode>('generic')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [tasks, setTasks] = useState<GeneratedTask[]>([])
  const [copiedTasks, setCopiedTasks] = useState<Set<string>>(new Set())
  const [imageCopied, setImageCopied] = useState(false)
  const [copySide, setCopySide] = useState<'front' | 'back'>('front')
  const [useFlatLayPreface, setUseFlatLayPreface] = useState(false)
  const [garmentType, setGarmentType] = useState('T恤')
  const [customGarmentType, setCustomGarmentType] = useState('')
  const [error, setError] = useState('')
  const [allPromptsCopied, setAllPromptsCopied] = useState(false)
  const [showStyleEditor, setShowStyleEditor] = useState(false)

  const selectedStyle = useMemo(
    () => promptStyles.find(style => style.id === selectedStyleId) ?? promptStyles[0] ?? null,
    [promptStyles, selectedStyleId]
  )

  useEffect(() => {
    if (selectedStyle && selectedStyle.id !== selectedStyleId) setSelectedStyleId(selectedStyle.id)
  }, [selectedStyle, selectedStyleId])

  useEffect(() => {
    if (!isOpen) {
      setTasks([])
      setCopiedTasks(new Set())
      setImageCopied(false)
      setError('')
      setAllPromptsCopied(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const updateShots = (shots: PromptShot[]) => {
    if (!selectedStyle) return
    updatePromptStyle(selectedStyle.id, { shots: shots.map((shot, index) => ({ ...shot, order: index + 1 })) })
  }

  const addShot = () => {
    if (!selectedStyle) return
    updateShots([...selectedStyle.shots, {
      id: `shot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: `分镜 ${selectedStyle.shots.length + 1}`,
      prompt: '',
      order: selectedStyle.shots.length + 1
    }])
  }

  const copyReferenceImage = async () => {
    setError('')
    if (!selectedShirt) {
      setError('请先选择基板。')
      return
    }
    const design = copySide === 'front' ? frontDesign : backDesign
    const transform = copySide === 'front' ? frontTransform : backTransform
    if (!design || !transform.hasDesign) {
      setError(`请先完成${copySide === 'front' ? '正面' : '反面'}设计，再复制合成图。`)
      return
    }
    try {
      const dataUrl = await renderCompositeDataUrl(selectedShirt, design, transform, copySide)
      await copyPngDataUrl(dataUrl)
      setImageCopied(true)
    } catch (copyError) {
      console.error('复制裂变参考图失败:', copyError)
      setError('参考图复制失败，请检查浏览器剪贴板权限。')
    }
  }

  const copyTask = async (task: GeneratedTask) => {
    try {
      await copyPlainText(task.prompt)
      setCopiedTasks(current => new Set(current).add(task.shotId))
    } catch (copyError) {
      console.error('复制提示词失败:', copyError)
      setError('提示词复制失败，请检查浏览器剪贴板权限。')
    }
  }

  const copyAllPrompts = async () => {
    setError('')
    setAllPromptsCopied(false)
    if (!selectedStyle) {
      setError('请先选择一个提示词风格。')
      return
    }
    if (mode === 'midjourney' && !isValidReferenceUrl(referenceUrl)) {
      setError('Midjourney 模式需要填写有效的 http/https 参考图链接。')
      return
    }
    try {
      const generated = buildPromptTasks(selectedStyle, mode, referenceUrl, { enabled: useFlatLayPreface, garmentType: garmentType === '自定义' ? customGarmentType : garmentType })
      const combined = generated.map((task, index) =>
        `===== ${index + 1}. ${task.title} =====\n${task.prompt}`
      ).join('\n\n')
      await copyPlainText(combined)
      setTasks(generated)
      setCopiedTasks(new Set(generated.map(task => task.shotId)))
      setAllPromptsCopied(true)
    } catch (copyError) {
      console.error('一键复制裂变关键词失败:', copyError)
      setError(copyError instanceof Error ? copyError.message : '关键词复制失败，请检查剪贴板权限。')
    }
  }
  const handleAddStyle = () => setSelectedStyleId(addPromptStyle())
  const handleDuplicateStyle = () => {
    if (!selectedStyle) return
    const id = duplicatePromptStyle(selectedStyle.id)
    if (id) setSelectedStyleId(id)
  }
  const handleDeleteStyle = () => {
    if (!selectedStyle || !confirm(`确定删除提示词风格“${selectedStyle.name}”吗？`)) return
    removePromptStyle(selectedStyle.id)
    setSelectedStyleId('')
    setTasks([])
  }
  const handleResetStyles = () => {
    if (!confirm('确定恢复默认提示词风格吗？现有自定义风格会被替换。')) return
    resetPromptStyles()
    setSelectedStyleId('')
    setTasks([])
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3 sm:p-5">
      <div className="flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-gray-100 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800">
              <Sparkles className="h-5 w-5 text-violet-600" />
              批量裂变生图任务包
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">当前衣服 × 一个风格，生成可交给外部 AI 的分镜提示词</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:overflow-hidden ${showStyleEditor ? 'lg:grid-cols-[420px_minmax(0,1fr)]' : ''}`}>
          <section className={`${showStyleEditor ? 'flex' : 'hidden'} min-h-[60vh] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white lg:min-h-0`}>
            <div className="shrink-0 border-b border-gray-200 p-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">提示词风格</label>
              <select
                value={selectedStyle?.id ?? ''}
                onChange={event => setSelectedStyleId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {promptStyles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
              </select>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                <button onClick={handleAddStyle} className="flex items-center justify-center gap-1 rounded-md bg-violet-50 px-2 py-1.5 text-xs text-violet-700 hover:bg-violet-100"><FilePlus2 className="h-3.5 w-3.5" />新增</button>
                <button onClick={handleDuplicateStyle} disabled={!selectedStyle} className="flex items-center justify-center gap-1 rounded-md bg-gray-100 px-2 py-1.5 text-xs hover:bg-gray-200 disabled:opacity-40"><Copy className="h-3.5 w-3.5" />复制</button>
                <button onClick={handleDeleteStyle} disabled={!selectedStyle} className="flex items-center justify-center gap-1 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-600 hover:bg-red-100 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />删除</button>
                <button onClick={handleResetStyles} className="flex items-center justify-center gap-1 rounded-md bg-gray-100 px-2 py-1.5 text-xs hover:bg-gray-200"><RefreshCw className="h-3.5 w-3.5" />默认</button>
              </div>
            </div>

            {selectedStyle ? (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                <label className="block text-xs font-medium text-gray-600">风格名称
                  <input value={selectedStyle.name} onChange={event => updatePromptStyle(selectedStyle.id, { name: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs font-medium text-gray-600">核心产品保持规则
                  <textarea value={selectedStyle.corePrompt} onChange={event => updatePromptStyle(selectedStyle.id, { corePrompt: event.target.value })} rows={7} className="mt-1 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-xs leading-5" />
                </label>
                <label className="block text-xs font-medium text-gray-600">摄影风格与光影
                  <textarea value={selectedStyle.photographyPrompt} onChange={event => updatePromptStyle(selectedStyle.id, { photographyPrompt: event.target.value })} rows={6} className="mt-1 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-xs leading-5" />
                </label>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">分镜动作（{selectedStyle.shots.length}）</span>
                  <button onClick={addShot} className="rounded-md bg-violet-50 px-2 py-1 text-xs text-violet-700 hover:bg-violet-100">+ 添加分镜</button>
                </div>
                {selectedStyle.shots.map((shot, index) => (
                  <div key={shot.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="w-5 text-center text-xs font-bold text-violet-600">{index + 1}</span>
                      <input
                        value={shot.title}
                        onChange={event => updateShots(selectedStyle.shots.map(item => item.id === shot.id ? { ...item, title: event.target.value } : item))}
                        className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                      <button onClick={() => updateShots(selectedStyle.shots.filter(item => item.id !== shot.id))} className="p-1 text-red-500 hover:bg-red-50" title="删除分镜"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <textarea
                      value={shot.prompt}
                      onChange={event => updateShots(selectedStyle.shots.map(item => item.id === shot.id ? { ...item, prompt: event.target.value } : item))}
                      rows={5}
                      className="w-full resize-y rounded border border-gray-300 px-2 py-1.5 text-xs leading-5"
                    />
                  </div>
                ))}
              </div>
            ) : <div className="flex flex-1 items-center justify-center text-sm text-gray-400">请新建提示词风格</div>}
          </section>

          <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white lg:min-h-0">
            <div className="shrink-0 space-y-3 border-b border-gray-200 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[240px] flex-1 text-xs font-medium text-gray-600">选择裂变风格
                  <select value={selectedStyle?.id ?? ''} onChange={event => { setSelectedStyleId(event.target.value); setTasks([]); setAllPromptsCopied(false) }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm">
                    {promptStyles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
                  </select>
                </label>
                <button onClick={() => setShowStyleEditor(value => !value)} className="rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-200">{showStyleEditor ? '收起风格管理' : '管理风格'}</button>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={useFlatLayPreface} onChange={event => { setUseFlatLayPreface(event.target.checked); setAllPromptsCopied(false); setTasks([]) }} className="h-4 w-4" />
                  平铺图先穿模特（可选）
                </label>
                {useFlatLayPreface && <>
                  <label className="flex items-center gap-2 text-sm text-gray-600">衣服类型
                    <select value={garmentType} onChange={event => { setGarmentType(event.target.value); setAllPromptsCopied(false); setTasks([]) }} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm">
                      {['T恤', '卫衣', '连帽卫衣', '长袖T恤', '背心', 'Polo衫', '夹克', '自定义'].map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  {garmentType === '自定义' && <input value={customGarmentType} onChange={event => { setCustomGarmentType(event.target.value); setAllPromptsCopied(false); setTasks([]) }} placeholder="输入衣服类型" className="min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />}
                  <span className="text-xs text-gray-500">优先按平铺参考图还原衣服，再生成美国模特套图</span>
                </>}
              </div>              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => { setMode('generic'); setAllPromptsCopied(false) }} className={`rounded-lg px-3 py-2 text-sm ${mode === 'generic' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'}`}>通用模式</button>
                <button onClick={() => { setMode('midjourney'); setAllPromptsCopied(false) }} className={`rounded-lg px-3 py-2 text-sm ${mode === 'midjourney' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Midjourney</button>
                <div className="flex-1" />
                <label className="flex items-center gap-2 text-sm text-gray-600">复制画面
                  <select value={copySide} onChange={event => { setCopySide(event.target.value as 'front' | 'back'); setImageCopied(false) }} className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm">
                    <option value="front">正面</option>
                    <option value="back">反面</option>
                  </select>
                </label>                <button onClick={copyReferenceImage} className="flex min-w-[160px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
                  {imageCopied ? <Check className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                  {imageCopied ? `${copySide === 'front' ? '正面' : '反面'}图已复制` : '复制合成图'}
                </button>
                <button onClick={copyAllPrompts} className="flex min-w-[210px] items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700">
                  {allPromptsCopied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                  {allPromptsCopied ? '全部关键词已复制' : '一键复制裂变关键词'}
                </button>
              </div>
              {mode === 'midjourney' && (
                <label className="block text-xs font-medium text-gray-600">在线参考图链接
                  <input value={referenceUrl} onChange={event => setReferenceUrl(event.target.value)} placeholder="https://..." className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${referenceUrl && !isValidReferenceUrl(referenceUrl) ? 'border-red-400' : 'border-gray-300'}`} />
                </label>
              )}
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">文字约束不能绝对保证同一张脸，实际一致性取决于外部 AI。Midjourney 需要可公开访问的参考图链接，本地剪贴板图片不能直接用作 --cref。</p>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {tasks.length > 0 ? (
                <div className="space-y-3">
                  {tasks.map((task, index) => {
                    const copied = copiedTasks.has(task.shotId)
                    return (
                      <article key={task.shotId} className={`rounded-xl border p-3 ${copied ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-gray-800">{index + 1}. {task.title}</h3>
                          <button onClick={() => copyTask(task)} className={`flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs ${copied ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                            {copied ? '已复制' : '复制提示词'}
                          </button>
                        </div>
                        <pre className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-600">{task.prompt}</pre>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">
                  <Sparkles className="mb-3 h-10 w-10 text-gray-300" />
                  <p className="text-sm">选择风格后点击“一键复制裂变关键词”</p>
                  <p className="mt-1 text-xs">也可以在上方直接复制合成图，然后粘贴到外部 AI</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default PromptBatchModal
