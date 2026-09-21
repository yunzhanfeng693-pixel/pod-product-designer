import { useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, Copy, FilePlus2, Image as ImageIcon, RefreshCw, Send, Sparkles, Trash2, X } from 'lucide-react'
import { useCompositeStore } from '@/store/compositeStore'
import { PromptShot } from '@/types'
import { renderCompositeDataUrl } from '@/utils/compositeRenderer'
import { copyPlainText, copyPngDataUrl } from '@/utils/clipboard'
import { buildPromptTasks } from '@/utils/promptTasks'
import { chooseGptOutputPath, getGptSettings, getGptTasks, isGptRelayAvailable, openGptResult, retrieveGptResults, sendGptTasks, type GptTaskRecord } from '@/utils/gptRelay'

interface PromptBatchModalProps {
  isOpen: boolean
  onClose: () => void
}

interface GeneratedTask {
  shotId: string
  title: string
  prompt: string
}

const taskStatusText: Record<GptTaskRecord['status'], string> = {
  SEND_PENDING: '准备发送',
  SENT: '生成中',
  DRAFT: '发送失败',
  NEEDS_ATTENTION: '待手动确认',
  RETRIEVED: '已完成'
}

const taskStatusClass: Record<GptTaskRecord['status'], string> = {
  SEND_PENDING: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  DRAFT: 'bg-red-100 text-red-700',
  NEEDS_ATTENTION: 'bg-amber-100 text-amber-700',
  RETRIEVED: 'bg-green-100 text-green-700'
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
      const generated = buildPromptTasks(selectedStyle, 'generic', '', { enabled: useFlatLayPreface, garmentType })
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
      selectedTasks = buildPromptTasks(selectedStyle, 'generic', '', { enabled: useFlatLayPreface, garmentType })
    } catch (promptError) {
      setError(promptError instanceof Error ? promptError.message : '生成裂变关键词失败。')
      return
    }
    if (!sendSides.size) {
      setError('请至少选择一张要发送的正面或反面合成图。')
      return
    }
    const images: Array<{ side: 'front' | 'back'; dataUrl: string }> = []
    try {
      for (const side of sendSides) {
        const design = side === 'front' ? frontDesign : backDesign
        const transform = side === 'front' ? frontTransform : backTransform
        if (!design || !transform.hasDesign) throw new Error(`请先完成${side === 'front' ? '正面' : '反面'}设计，再发送到豆包。`)
        images.push({ side, dataUrl: await renderCompositeDataUrl(selectedShirt, design, transform, side) })
      }

      setIsSendingToGpt(true)
      const batchPrompt = selectedTasks
        .map((task, index) => selectedTasks.length > 1 ? `===== ${index + 1}. ${task.title} =====\n${task.prompt}` : task.prompt)
        .join('\n\n')
      const outcomes = await sendGptTasks({
        shirtId: selectedShirt.id,
        shirtName: selectedShirt.name,
        images,
        tasks: [{ title: `${selectedStyle.name} · 整套提示词`, prompt: batchPrompt }]
      })
      setTaskRecords(await getGptTasks())
      const sentCount = outcomes.filter(item => item.status === 'SENT').length
      const attention = outcomes.find(item => item.status === 'NEEDS_ATTENTION')
      if (attention) {
        setGptStatus(`套图任务发送状态待核实，请在豆包窗口检查任务编号，程序不会自动重发。`)
      } else if (sentCount === outcomes.length) {
        setGptStatus(`已将该风格的整套提示词一次性发送到豆包。`)
      } else {
        const failed = outcomes.find(item => item.error)
        setError(failed?.error || '部分任务未发送，请检查豆包登录、验证或限额提示。')
      }
    } catch (sendError) {
      console.error('发送到豆包失败:', sendError)
      setError(sendError instanceof Error ? sendError.message : '发送到豆包失败。')
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

          <section className="flex min-h-[60vh] flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 lg:min-h-0">
            <div className="mx-auto w-full max-w-2xl space-y-5">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-gray-800">一键发送豆包裂变套图</h3>
                <p className="mt-2 text-sm text-gray-500">选择下面三项后，直接发送该风格的整套分镜到豆包。</p>
              </div>

              <label className="block text-sm font-medium text-gray-700">裂变风格
                <select value={selectedStyle?.id ?? ''} onChange={event => { setSelectedStyleId(event.target.value); setError(''); setGptStatus('') }} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base">
                  {promptStyles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
                </select>
              </label>

              <div>
                <p className="text-sm font-medium text-gray-700">发送哪一面</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {([
                    { key: 'front', label: '正面' },
                    { key: 'back', label: '反面' },
                    { key: 'both', label: '正反面' }
                  ] as const).map(option => {
                    const active = option.key === 'both' ? sendSides.size === 2 : sendSides.size === 1 && sendSides.has(option.key)
                    return <button key={option.key} onClick={() => setSendSides(option.key === 'both' ? new Set(['front', 'back']) : new Set([option.key]))} className={`rounded-xl border px-3 py-3 text-sm font-medium ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>{option.label}</button>
                  })}
                </div>
              </div>

              <label className="block text-sm font-medium text-gray-700">产品类型（可选）
                <select value={useFlatLayPreface ? garmentType : ''} onChange={event => { const value = event.target.value; setUseFlatLayPreface(Boolean(value)); setGarmentType(value || 'T恤') }} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base">
                  <option value="">不添加模特穿衣要求</option>
                  {['T恤', '卫衣', '连帽卫衣', '长袖T恤', '背心', 'Polo衫', '夹克'].map(type => <option key={type} value={type}>{type}：先穿到美国模特身上</option>)}
                </select>
              </label>

              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-700">豆包图片保存路径</p>
                <div className="mt-2 flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-xs text-gray-500" title={outputPath}>{outputPath || '桌面版启动后自动设置默认路径'}</p><button onClick={handleChooseOutputPath} disabled={!isGptRelayAvailable()} className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 disabled:opacity-50">选择文件夹</button></div>
              </div>

              <button onClick={handleSendToGpt} disabled={!isGptRelayAvailable() || isSendingToGpt || !sendSides.size} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-4 text-lg font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-5 w-5" />{isSendingToGpt ? '正在发送…' : `一键发送「${selectedStyle?.name ?? '当前风格'}」套图到豆包`}</button>
              {!isGptRelayAvailable() && <p className="text-center text-sm text-amber-700">当前是浏览器预览，豆包自动发送不可用；请双击 Start-POD-Desktop.cmd 启动桌面版。</p>}

              <button onClick={handleRetrieveResults} disabled={!isGptRelayAvailable() || isRetrieving} className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-5 py-3 text-base font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{isRetrieving ? '正在检查豆包图片…' : '立即检查并收取豆包图片'}</button>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div><p className="font-medium text-gray-800">后台任务记录</p><p className="mt-1 text-xs text-gray-500">发送成功后可关闭本窗口，程序会继续检查并自动下载。</p></div>
                  <button onClick={() => void getGptTasks().then(setTaskRecords)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="刷新任务记录"><RefreshCw className="h-4 w-4" /></button>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {!taskRecords.length && <p className="py-4 text-center text-sm text-gray-400">还没有豆包任务</p>}
                  {taskRecords.slice(0, 12).map(record => (
                    <div key={record.requestId} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800">{record.shirtName} · {record.title}</p><p className="mt-1 text-xs text-gray-500">{record.sides.map(side => side === 'front' ? '正面' : '反面').join('、') || '历史任务'} · {new Date(record.createdAt).toLocaleString('zh-CN')}</p></div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${taskStatusClass[record.status] ?? 'bg-gray-100 text-gray-700'}`}>{taskStatusText[record.status] ?? record.status}</span>
                      </div>
                      {record.status === 'SENT' && <p className="mt-2 text-xs text-blue-700">豆包生成中{record.detectedCount ? `，已识别 ${record.detectedCount}/5 张` : '，程序正在后台等待'}</p>}
                      {record.error && record.status !== 'RETRIEVED' && <p className="mt-2 line-clamp-2 text-xs text-red-600">{record.error}</p>}
                      {record.status === 'RETRIEVED' && <div className="mt-2 flex items-center justify-between gap-2"><p className="truncate text-xs text-green-700">已下载 {record.fileCount} 张 · {record.resultPath}</p><button onClick={() => void openGptResult(record.requestId).catch(openError => setError(openError instanceof Error ? openError.message : '打开文件夹失败。'))} className="shrink-0 rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200">打开文件夹</button></div>}
                    </div>
                  ))}
                </div>
              </div>

              <details className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <summary className="cursor-pointer font-medium text-gray-700">手动发送备用（豆包自动窗口不能用时）</summary>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select value={manualSide} onChange={event => { setManualSide(event.target.value as 'front' | 'back'); setManualImageCopied(false) }} className="rounded-lg border border-gray-300 bg-white px-3 py-2"><option value="front">正面合成图</option><option value="back">反面合成图</option></select>
                  <button onClick={copyManualReference} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm text-blue-700 shadow-sm ring-1 ring-blue-200">{manualImageCopied ? <Check className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}{manualImageCopied ? '合成图已复制' : '复制合成图'}</button>
                  <button onClick={copyManualPrompts} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm text-violet-700 shadow-sm ring-1 ring-violet-200">{manualPromptsCopied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}{manualPromptsCopied ? '关键词已复制' : '复制整套关键词'}</button>
                </div>
              </details>

              <div className="flex items-center justify-center gap-3 text-sm">
                <button onClick={() => setShowStyleEditor(value => !value)} className="text-gray-500 hover:text-gray-800">{showStyleEditor ? '收起风格管理' : '管理风格'}</button>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">该风格会发送 {selectedStyle?.shots.length ?? 0} 个分镜</span>
              </div>
              {gptStatus && <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">{gptStatus}</p>}
              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <p className="text-center text-xs leading-5 text-gray-500">首次点击会打开豆包专用窗口。登录后回到这里再点一次即可；不会发送未选风格以外的内容。</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default PromptBatchModal
