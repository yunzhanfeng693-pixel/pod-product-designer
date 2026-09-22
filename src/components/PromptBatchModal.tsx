import { useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, Copy, FilePlus2, Image as ImageIcon, RefreshCw, Send, Sparkles, Trash2, UserRound, X } from 'lucide-react'
import { useCompositeStore } from '@/store/compositeStore'
import { PromptShot } from '@/types'
import { renderCompositeDataUrl } from '@/utils/compositeRenderer'
import { copyPlainText, copyPngDataUrl } from '@/utils/clipboard'
import { buildPromptTasks } from '@/utils/promptTasks'
import { cancelQueuedGptTask, chooseGptOutputPath, deleteGptTask, resolveGptQueueBlocker, getGeneratedModelReference, getGptSettings, getGptTasks, isGptRelayAvailable, openGptResult, queueGptTasks, retrieveGptResults, sendGptTasks, type GptTaskRecord } from '@/utils/gptRelay'

interface PromptBatchModalProps {
  isOpen: boolean
  onClose: () => void
}

type ModelMode = 'none' | 'generate' | 'upload'

interface ModelReference {
  dataUrl: string
  name: string
}

interface GeneratedTask {
  shotId: string
  title: string
  prompt: string
}

const taskStatusText: Record<GptTaskRecord['status'], string> = {
  QUEUED: '队列等待',
  SEND_PENDING: '正在发送',
  SENT: '生成中',
  DRAFT: '发送失败',
  NEEDS_ATTENTION: '待手动确认',
  RETRIEVED: '已完成',
  CANCELLED: '已取消'
}

const taskStatusClass: Record<GptTaskRecord['status'], string> = {
  QUEUED: 'bg-violet-100 text-violet-700',
  SEND_PENDING: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  DRAFT: 'bg-red-100 text-red-700',
  NEEDS_ATTENTION: 'bg-amber-100 text-amber-700',
  RETRIEVED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500'
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
    resetPromptStyles,
    modelReferences,
    addModelReference,
    removeModelReference
  } = useCompositeStore()
  const [selectedStyleId, setSelectedStyleId] = useState('')

  const [useFlatLayPreface, setUseFlatLayPreface] = useState(false)
  const [garmentType, setGarmentType] = useState('T恤')
  const [error, setError] = useState('')
  const [showStyleEditor, setShowStyleEditor] = useState(false)
  const [sendSides, setSendSides] = useState<Set<'front' | 'back'>>(new Set(['front']))
  const [isSendingToGpt, setIsSendingToGpt] = useState(false)
  const [gptStatus, setGptStatus] = useState('')
  const [manualSide, setManualSide] = useState<'front' | 'back'>('front')
  const [manualImageCopied, setManualImageCopied] = useState(false)
  const [manualPromptsCopied, setManualPromptsCopied] = useState(false)
  const [outputPath, setOutputPath] = useState('')
  const [isRetrieving, setIsRetrieving] = useState(false)
  const [taskRecords, setTaskRecords] = useState<GptTaskRecord[]>([])
  const [modelMode, setModelMode] = useState<ModelMode>('none')
  const [modelGender, setModelGender] = useState<'male' | 'female' | ''>('')
  const [modelReference, setModelReference] = useState<ModelReference | null>(null)
  const [modelTaskId, setModelTaskId] = useState('')
  const [isGeneratingModel, setIsGeneratingModel] = useState(false)

  const selectedStyle = useMemo(
    () => promptStyles.find(style => style.id === selectedStyleId) ?? promptStyles[0] ?? null,
    [promptStyles, selectedStyleId]
  )

  useEffect(() => {
    if (selectedStyle && selectedStyle.id !== selectedStyleId) setSelectedStyleId(selectedStyle.id)
  }, [selectedStyle, selectedStyleId])

  useEffect(() => {
    if (!isOpen) {
      setError('')
      setGptStatus('')
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !isGptRelayAvailable()) return
    void getGptSettings().then(settings => setOutputPath(settings.outputPath)).catch(() => undefined)
  }, [isOpen])

  const saveCurrentModelReference = () => {
    if (!modelReference) return
    addModelReference({
      name: modelReference.name || `${modelGender === 'male' ? '男模' : modelGender === 'female' ? '女模' : '模特'}参考图`,
      gender: modelGender,
      imageData: modelReference.dataUrl
    })
    setGptStatus('已保存到“我的模特库”，下次可直接复用。')
  }

  const useSavedModelReference = (reference: { name: string; gender: 'male' | 'female' | ''; imageData: string }) => {
    setModelReference({ name: reference.name, dataUrl: reference.imageData })
    setModelGender('')
    setModelMode('upload')
    setModelTaskId('')
    setError('')
  }
  const handleModelUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('请上传 JPG、PNG 等图片格式的模特参考图。')
    if (file.size > 20 * 1024 * 1024) return setError('模特参考图不能超过 20MB。')
    const reader = new FileReader()
    reader.onload = () => {
      setModelReference({ dataUrl: String(reader.result), name: file.name })
      setModelTaskId('')
      setError('')
    }
    reader.onerror = () => setError('模特参考图读取失败。')
    reader.readAsDataURL(file)
  }

  const handleGenerateModel = async () => {
    setError('')
    setGptStatus('')
    if (!selectedShirt) return setError('请先选择基板。')
    if (!modelGender) return setError('请先选择男模或女模。')
    setIsGeneratingModel(true)
    const genderText = modelGender === 'male' ? '美国成年男性模特' : '美国成年女性模特'
    const prompt = `请生成一张用于后续服装套图的模特身份参考图。人物为${genderText}，正面或轻微 15 度角的上半身时尚肖像，脸部清晰、发型完整可见、自然真实皮肤质感、简洁纯色或极简背景、自然光、无文字、无 Logo、无水印。服装使用无图案的基础中性色上衣。只生成一张 1:1 独立图片，不要拼图。后续任务会以此图锁定同一位模特的脸部特征、发型、性别和身材气质。`
    try {
      const payload = {
        shirtId: selectedShirt.id,
        shirtName: `${selectedShirt.name} · 模特参考`,
        images: [],
        tasks: [{ title: `${modelGender === 'male' ? '男模' : '女模'}参考图`, prompt }],
        taskKind: 'model-anchor' as const,
        modelGender
      }
      const outcomes = await sendGptTasks(payload)
      const outcome = outcomes[0]
      if (outcome?.status === 'SENT') {
        setModelTaskId(outcome.requestId)
        setModelReference(null)
        setGptStatus('模特参考图已发送到豆包，生成完成后程序会自动收取并显示在这里。')
        setTaskRecords(await getGptTasks())
      } else {
        setError(outcome?.error || '模特参考图未发送，请检查豆包登录或页面提示。')
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '生成模特参考图失败。')
    } finally {
      setIsGeneratingModel(false)
    }
  }
  const handleChooseOutputPath = async () => {
    try {
      const settings = await chooseGptOutputPath()
      setOutputPath(settings.outputPath)
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : '设置保存路径失败。')
    }
  }
  useEffect(() => {
    if (!isOpen || !isGptRelayAvailable()) return
    let cancelled = false
    const refresh = async () => {
      try {
        const records = await getGptTasks()
        if (!cancelled) setTaskRecords(records)
      } catch {
        // 主程序继续后台监控；任务记录稍后自动刷新。
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [isOpen])

  useEffect(() => {
    if (!modelTaskId || modelReference) return
    const completed = taskRecords.find(record => record.requestId === modelTaskId && record.taskKind === 'model-anchor' && record.status === 'RETRIEVED')
    if (!completed) return
    void getGeneratedModelReference(modelTaskId).then(reference => {
      setModelReference(reference)
      setGptStatus('模特参考图已准备好。确认预览后即可发送裂变套图。')
    }).catch(referenceError => setError(referenceError instanceof Error ? referenceError.message : '读取生成的模特参考图失败。'))
  }, [modelReference, modelTaskId, taskRecords])
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

  const handleRetrieveResults = async () => {
    setError('')
    setGptStatus('')
    setIsRetrieving(true)
    try {
      const outcomes = await retrieveGptResults()
      const received = outcomes.filter(item => item.status === 'RETRIEVED')
      const failed = outcomes.find(item => item.status === 'ERROR')
      if (received.length) setGptStatus(`已收取 ${received.reduce((total, item) => total + (item.count || 0), 0)} 张豆包图片，保存到：${received[0].resultPath}`)
      else if (failed) setError(failed.error || '检查豆包结果失败。')
      else setGptStatus('豆包仍在生成或当前没有可收取的图片，稍后再点一次。')
    } catch (retrieveError) {
      setError(retrieveError instanceof Error ? retrieveError.message : '检查豆包结果失败。')
    } finally {
      setIsRetrieving(false)
    }
  }
  const copyManualReference = async () => {
    setError('')
    if (!selectedShirt) {
      setError('请先选择基板。')
      return
    }
    const design = manualSide === 'front' ? frontDesign : backDesign
    const transform = manualSide === 'front' ? frontTransform : backTransform
    if (!design || !transform.hasDesign) {
      setError(`请先完成${manualSide === 'front' ? '正面' : '反面'}设计。`)
      return
    }
    try {
      await copyPngDataUrl(await renderCompositeDataUrl(selectedShirt, design, transform, manualSide))
      setManualImageCopied(true)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : '复制合成图失败。')
    }
  }

  const copyManualPrompts = async () => {
    setError('')
    if (!selectedStyle) return setError('请先选择一个提示词风格。')
    try {
      const generated = buildPromptTasks(selectedStyle, 'generic', '', { enabled: useFlatLayPreface, garmentType, referenceRoles: [manualSide] })
      await copyPlainText(generated.map((task, index) => `===== ${index + 1}. ${task.title} =====\n${task.prompt}`).join('\n\n'))
      setManualPromptsCopied(true)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : '复制关键词失败。')
    }
  }
  const handleSendToGpt = async () => {
    setError('')
    setGptStatus('')
    if (!selectedShirt) {
      setError('请先选择基板。')
      return
    }
    if (!selectedStyle) {
      setError('请先选择一个提示词风格。')
      return
    }
    let selectedTasks: GeneratedTask[]
    try {
      selectedTasks = buildPromptTasks(selectedStyle, 'generic', '', { enabled: useFlatLayPreface, garmentType, referenceRoles: [...(modelMode !== 'none' && modelReference ? ['model' as const] : []), ...sendSides] })
    } catch (promptError) {
      setError(promptError instanceof Error ? promptError.message : '生成裂变关键词失败。')
      return
    }
    if (modelMode !== 'none' && !modelReference) {
      setError(modelMode === 'generate' ? '请先生成并收取模特参考图，再发送裂变套图。' : '请先上传一张模特参考图。')
      return
    }
    if (!sendSides.size) {
      setError('请至少选择一张要发送的正面或反面合成图。')
      return
    }
    const images: Array<{ side: 'front' | 'back' | 'model'; dataUrl: string }> = []
    try {
      for (const side of sendSides) {
        const design = side === 'front' ? frontDesign : backDesign
        const transform = side === 'front' ? frontTransform : backTransform
        if (!design || !transform.hasDesign) throw new Error(`请先完成${side === 'front' ? '正面' : '反面'}设计，再发送到豆包。`)
        images.push({ side, dataUrl: await renderCompositeDataUrl(selectedShirt, design, transform, side) })
      }

      if (modelMode !== 'none' && modelReference) images.unshift({ side: 'model', dataUrl: modelReference.dataUrl })

      setIsSendingToGpt(true)
      const batchPrompt = selectedTasks
        .map((task, index) => selectedTasks.length > 1 ? `===== ${index + 1}. ${task.title} =====\n${task.prompt}` : task.prompt)
        .join('\n\n')
      const patternKey = Array.from(sendSides)
        .map(side => side === 'front' ? frontDesign?.id : backDesign?.id)
        .filter((id): id is string => Boolean(id))
        .sort()
        .join('-')
      const payload = {
        shirtId: selectedShirt.id,
        shirtName: selectedShirt.name,
        patternKey,
        images,
        tasks: [{ title: `${selectedStyle.name} · 整套提示词`, prompt: batchPrompt }],
        taskKind: 'suite' as const,
        modelLocked: modelMode !== 'none' && Boolean(modelReference),
        modelGender: modelMode === 'generate' ? modelGender : ''
      }
      await queueGptTasks(payload)
      setTaskRecords(await getGptTasks())
      setGptStatus('任务已提交：空闲时会立即发送；有任务生成或保存中时会自动排队。')
    } catch (sendError) {
      console.error('提交豆包任务失败:', sendError)
      setError(sendError instanceof Error ? sendError.message : '提交豆包任务失败。')
    } finally {
      setIsSendingToGpt(false)
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
  }
  const handleResetStyles = () => {
    if (!confirm('确定恢复默认提示词风格吗？现有自定义风格会被替换。')) return
    resetPromptStyles()
    setSelectedStyleId('')
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3 sm:p-5">
      <div className="flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-gray-100 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800">
              <Sparkles className="h-5 w-5 text-violet-600" />
              一键生成模特图
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">设置套图后提交，在任务区查看生成和保存进度</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:overflow-hidden ${showStyleEditor ? 'lg:grid-cols-[340px_minmax(0,1fr)]' : ''}`}>
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

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
              <div className={'mx-auto grid w-full max-w-6xl items-start gap-5 ' + (showStyleEditor ? '' : 'lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]')}>
                <div className="min-w-0 space-y-4">
                  <div className="rounded-xl border border-gray-200 p-4">
                    <div className="mb-4 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">1</span><h3 className="text-sm font-semibold text-gray-900">套图设置</h3></div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label htmlFor="batch-style" className="text-xs font-medium text-gray-600">裂变风格</label>
                      <button onClick={() => setShowStyleEditor(value => !value)} aria-expanded={showStyleEditor} className="rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50">{showStyleEditor ? '收起风格管理' : '管理风格'}</button>
                    </div>
                    <select id="batch-style" value={selectedStyle?.id ?? ''} onChange={event => { setSelectedStyleId(event.target.value); setError(''); setGptStatus('') }} className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
                      {promptStyles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
                    </select>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium text-gray-600">参考衣面</p>
                        <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
                          {([
                            { key: 'front', label: '正面' },
                            { key: 'back', label: '反面' },
                            { key: 'both', label: '正反面' }
                          ] as const).map(option => {
                            const active = option.key === 'both' ? sendSides.size === 2 : sendSides.size === 1 && sendSides.has(option.key)
                            return <button key={option.key} aria-pressed={active} onClick={() => setSendSides(option.key === 'both' ? new Set(['front', 'back']) : new Set([option.key]))} className={'rounded-md border px-2 py-2 text-xs font-medium ' + (active ? 'border-blue-200 bg-white text-blue-700 shadow-sm' : 'border-transparent text-gray-600 hover:bg-white/70')}>{option.label}</button>
                          })}
                        </div>
                      </div>
                      <label className="block min-w-0 text-xs font-medium text-gray-600">产品类型（可选）
                        <select value={useFlatLayPreface ? garmentType : ''} onChange={event => { const value = event.target.value; setUseFlatLayPreface(Boolean(value)); setGarmentType(value || 'T恤') }} className="mt-2 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
                          <option value="">随参考图</option>
                          {['T恤', '卫衣', '连帽卫衣', '长袖T恤', '背心', 'Polo衫', '夹克'].map(type => <option key={type} value={type}>{type}：先穿到美国模特身上</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">2</span><UserRound className="h-4 w-4 text-violet-600" /><p className="text-sm font-semibold text-gray-800">模特设置</p></div>
                <p className="mt-1 text-xs leading-5 text-gray-500">选择生成或上传参考图，也可从模特库复用。</p>
                <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
                  {([['none', '不锁定'], ['generate', '生成专属模特'], ['upload', '上传参考模特图']] as const).map(([mode, label]) => (
                    <button key={mode} onClick={() => { setModelMode(mode); if (mode === 'upload') setModelGender(''); setError('') }} className={`rounded-lg border px-2 py-2 text-xs font-medium ${modelMode === mode ? 'border-blue-200 bg-white text-blue-700 shadow-sm' : 'border-transparent text-gray-600 hover:bg-white/70'}`}>{label}</button>
                  ))}
                </div>
                {modelMode !== 'none' && <>
                  {modelMode === 'generate' && <><label className="mt-3 block text-xs font-medium text-gray-700">模特性别
                    <select value={modelGender} onChange={event => setModelGender(event.target.value as 'male' | 'female' | '')} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                      <option value="">请选择</option><option value="male">男模</option><option value="female">女模</option>
                    </select>
                  </label>
                  <div className="mt-3">
                    <button onClick={handleGenerateModel} disabled={isGeneratingModel || !modelGender || !isGptRelayAvailable()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-4 w-4" />{isGeneratingModel ? '正在发送模特任务…' : '生成模特参考图'}</button>
                    {!modelReference && modelTaskId && <p className="mt-2 text-xs text-violet-700">模特图生成中，程序会在后台自动收取。</p>}
                  </div></>}
                  {modelMode === 'upload' && <label className="mt-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-violet-300 bg-white px-3 py-3 text-sm text-violet-700 hover:bg-violet-50">上传模特参考图<input type="file" accept="image/*" className="hidden" onChange={handleModelUpload} /></label>}
                  {modelReference && <div className="mt-3 flex items-center gap-3 rounded-lg border border-violet-200 bg-white p-2"><img src={modelReference.dataUrl} alt="模特参考图" className="h-14 w-14 rounded-md object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-gray-700">{modelReference.name}</p><p className="mt-1 text-[11px] text-green-700">后续套图将同时发送此模特图与衣服合成图</p></div><div className="flex shrink-0 flex-col gap-1"><button onClick={saveCurrentModelReference} className="rounded-md bg-violet-100 px-2 py-1 text-xs text-violet-700 hover:bg-violet-200">保存复用</button><button onClick={() => { setModelReference(null); setModelTaskId('') }} className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50">清除</button></div></div>}
                  {modelReferences.length > 0 && <div className="mt-3"><p className="mb-2 text-xs font-medium text-gray-700">我的模特库（单击复用）</p><div className="grid grid-cols-4 gap-2">{modelReferences.slice(0, 12).map(reference => <div key={reference.id} className="group relative min-w-0"><button onClick={() => useSavedModelReference(reference)} className="block w-full overflow-hidden rounded-md border border-gray-200 bg-white text-left hover:border-violet-500"><img src={reference.imageData} alt={reference.name} className="aspect-square w-full object-cover" /><span className="block truncate px-1.5 py-1 text-[10px] text-gray-600">{reference.name}</span></button><button onClick={() => removeModelReference(reference.id)} className="absolute right-1 top-1 hidden rounded bg-white/90 p-1 text-red-600 shadow group-hover:block" title="删除此模特"><Trash2 className="h-3 w-3" /></button></div>)}</div></div>}
                </>}
              </div>
              <details className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">保存设置<span className="ml-2 inline-block max-w-[180px] truncate align-bottom text-xs font-normal text-gray-500" title={outputPath}>{outputPath || '默认路径'}</span></summary>
                <div className="mt-3 flex items-center gap-2"><p className="min-w-0 flex-1 break-all text-xs text-gray-500">{outputPath || '桌面版启动后自动设置默认路径'}</p><button onClick={handleChooseOutputPath} disabled={!isGptRelayAvailable()} className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 disabled:opacity-50">更改文件夹</button></div>
              </details>
              <details className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <summary className="cursor-pointer font-medium text-gray-700">手动备用 · 复制图片与关键词</summary>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select value={manualSide} onChange={event => { setManualSide(event.target.value as 'front' | 'back'); setManualImageCopied(false) }} className="rounded-lg border border-gray-300 bg-white px-3 py-2"><option value="front">正面合成图</option><option value="back">反面合成图</option></select>
                  <button onClick={copyManualReference} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm text-blue-700 shadow-sm ring-1 ring-blue-200">{manualImageCopied ? <Check className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}{manualImageCopied ? '合成图已复制' : '复制合成图'}</button>
                  <button onClick={copyManualPrompts} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm text-violet-700 shadow-sm ring-1 ring-violet-200">{manualPromptsCopied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}{manualPromptsCopied ? '关键词已复制' : '复制整套关键词'}</button>
                </div>
              </details>
                </div>
                <div className="min-w-0 space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">任务与记录 <span className="ml-1 font-normal text-gray-400">{taskRecords.length}</span></h3>
                  <div className="flex items-center gap-1">
                    <button onClick={handleRetrieveResults} disabled={!isGptRelayAvailable() || isRetrieving} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">{isRetrieving ? '正在检查…' : '检查收图'}</button>
                    <button onClick={() => void getGptTasks().then(setTaskRecords).catch(refreshError => setError(refreshError instanceof Error ? refreshError.message : '刷新任务失败。'))} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="刷新任务记录" aria-label="刷新任务记录"><RefreshCw className="h-4 w-4" /></button>
                  </div>
                </div>
                <p className="mb-3 text-xs leading-5 text-gray-500">任务自动排队，前一项保存完成后继续。关闭此弹窗后，程序仍会收图。</p>
                <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                  {!taskRecords.length && <div className="rounded-lg border border-dashed border-gray-200 px-4 py-12 text-center"><p className="text-sm text-gray-500">还没有任务</p><p className="mt-2 text-xs text-gray-400">设置好后，点击下方“发送套图到豆包”</p></div>}
                  {taskRecords.map(record => (
                    <div key={record.requestId} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800">{record.shirtName} · {record.title}</p><p className="mt-1 text-xs text-gray-500">{record.sides.map(side => side === 'front' ? '正面' : '反面').join('、') || '历史任务'} · {new Date(record.createdAt).toLocaleString('zh-CN')}</p></div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${taskStatusClass[record.status] ?? 'bg-gray-100 text-gray-700'}`}>{taskStatusText[record.status] ?? record.status}</span>
                      </div>
                      {record.status === 'SENT' && <p className="mt-2 text-xs text-blue-700">豆包生成中{record.detectedCount ? `，已识别 ${record.detectedCount}/${record.expectedCount || 5} 张` : '，程序正在后台等待'}</p>}
                      {record.status === 'QUEUED' && <div className="mt-2 flex items-center justify-between gap-2"><p className="text-xs text-violet-700">等待前面的任务完成后自动发送。</p><button onClick={() => void cancelQueuedGptTask(record.requestId).then(() => getGptTasks()).then(setTaskRecords).catch(cancelError => setError(cancelError instanceof Error ? cancelError.message : '取消队列任务失败。'))} className="shrink-0 rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100">取消</button></div>}
                      {record.status === 'NEEDS_ATTENTION' && record.queuePosition ? <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2"><p className="text-xs text-amber-800">等待超过 5 分钟仍未保存完成。请在 2 分钟内处理，否则会自动跳过并继续队列。</p><div className="mt-2 flex gap-2"><button onClick={() => void resolveGptQueueBlocker(record.requestId, 'wait').then(() => getGptTasks()).then(setTaskRecords).catch(actionError => setError(actionError instanceof Error ? actionError.message : '继续等待失败。'))} className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800 hover:bg-amber-200">继续等待</button><button onClick={() => void resolveGptQueueBlocker(record.requestId, 'skip').then(() => getGptTasks()).then(setTaskRecords).catch(actionError => setError(actionError instanceof Error ? actionError.message : '跳过任务失败。'))} className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100">跳过并继续队列</button></div></div> : record.status === 'NEEDS_ATTENTION' ? <p className="mt-2 text-xs text-amber-700">这是旧的待确认记录，不会影响当前队列。</p> : null}
                      {['DRAFT', 'NEEDS_ATTENTION', 'CANCELLED'].includes(record.status) && <button onClick={() => { if (!confirm('确定删除这条失败/待确认任务记录吗？')) return; void deleteGptTask(record.requestId).then(() => getGptTasks()).then(setTaskRecords).catch(deleteError => setError(deleteError instanceof Error ? deleteError.message : '删除任务记录失败。')) }} className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100">删除此记录</button>}
                      {record.error && record.status !== 'RETRIEVED' && <p className="mt-2 line-clamp-2 text-xs text-red-600">{record.error}</p>}
                      {record.status === 'RETRIEVED' && <div className="mt-2 flex items-center justify-between gap-2"><p className="truncate text-xs text-green-700">已下载 {record.fileCount} 张 · {record.resultPath}</p><button onClick={() => void openGptResult(record.requestId).catch(openError => setError(openError instanceof Error ? openError.message : '打开文件夹失败。'))} className="shrink-0 rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200">打开文件夹</button></div>}
                    </div>
                  ))}
                </div>
              </div>



                </div>
              </div>
            </div>
            <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 sm:px-5">
              <div className="mx-auto max-w-6xl">
                {gptStatus && <p role="status" className="mb-2 max-h-20 overflow-y-auto rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">{gptStatus}</p>}
                {error && <p role="alert" className="mb-2 max-h-20 overflow-y-auto rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
                {!isGptRelayAvailable() && <p className="mb-2 text-xs text-amber-700">自动发送请使用 Start-POD-Desktop.cmd 启动桌面版；浏览器中可使用手动备用。</p>}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800" title={selectedStyle?.name}>{selectedStyle?.name ?? '请选择风格'}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">{sendSides.size === 2 ? '正反面' : sendSides.has('back') ? '反面' : '正面'} · {useFlatLayPreface ? garmentType : '类型随参考图'} · 自动排队与保存</p>
                  </div>
                  <button onClick={() => void handleSendToGpt()} disabled={!isGptRelayAvailable() || isSendingToGpt || !sendSides.size} className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"><Send className="h-4 w-4" />{isSendingToGpt ? '正在提交…' : '发送套图到豆包'}</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default PromptBatchModal
