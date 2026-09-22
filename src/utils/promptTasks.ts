import { PromptShot, PromptStyle } from '@/types'
import { buildReferenceContext, normalizeReferenceTemplate, type ReferenceRole } from '../../electron/doubao-relay/reference-prompt.mjs'

export type PromptOutputMode = 'generic' | 'midjourney'

export interface FlatLayOptions {
  enabled: boolean
  garmentType: string
  referenceRoles?: ReferenceRole[]
}

export const buildFlatLayPreface = ({ enabled, garmentType }: FlatLayOptions) => {
  if (!enabled) return ''
  const product = garmentType.trim()
  if (!product) throw new Error('请先选择或填写衣服类型')
  return ['【平铺产品穿着要求】',
    '产品平铺参考图用于锁定' + product + '，让模特正常穿着产品后拍摄。另有模特参考图时按该图保持身份；没有人物参考时再选择一位美国成年模特，整套保持同一人物。',
    '衣服类型为' + product + '，服装结构、面料、领口、袖长及图案位置以产品参考图为准。每个分镜为独立的 1:1 图片，不要拼图。'
  ].join('\n')
}
const REFERENCE_PLACEHOLDER = /\[参考图链接\]/g
const REFERENCE_INSTRUCTION = /^\[请在这里粘贴您的第一张完美参考图链接\]\s*$/gm
const MIDJOURNEY_PARAMETERS = /\s*--cref\s+\S+\s+--cw\s+\d+\s+--sref\s+\S+\s+--sw\s+\d+\s+--v\s+\S+\s+--ar\s+\S+/gi

export const isValidReferenceUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const prepareTemplateText = (value: string, mode: PromptOutputMode, referenceUrl: string) => normalizeReferenceTemplate(value)
  .replace(MIDJOURNEY_PARAMETERS, '')
  .replace(REFERENCE_INSTRUCTION, '')
  .replace(REFERENCE_PLACEHOLDER, mode === 'midjourney' ? referenceUrl : '')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

export const buildPrompt = (
  style: PromptStyle,
  shot: PromptShot,
  mode: PromptOutputMode,
  referenceUrl = '',
  flatLayOptions?: FlatLayOptions
) => {
  if (mode === 'midjourney' && !isValidReferenceUrl(referenceUrl)) throw new Error('请填写有效的 http/https 参考图链接')

  const body = [flatLayOptions ? buildFlatLayPreface(flatLayOptions) : '', style.corePrompt, style.photographyPrompt, `【${shot.order}. ${shot.title}】`, shot.prompt]
    .map(value => prepareTemplateText(value, mode, referenceUrl))
    .filter(Boolean)
    .join('\n\n')

  const result = [buildReferenceContext(flatLayOptions?.referenceRoles), body].join('\n\n')
  if (mode === 'generic') return result
  return `${result}\n\n${referenceUrl} --cref ${referenceUrl} --cw 100 --sref ${referenceUrl} --sw 1000 --v 6.0 --ar 1:1`
}

export const buildPromptTasks = (
  style: PromptStyle,
  mode: PromptOutputMode,
  referenceUrl = '',
  flatLayOptions?: FlatLayOptions
) => [...style.shots]
  .sort((a, b) => a.order - b.order)
  .map(shot => ({ shotId: shot.id, title: normalizeReferenceTemplate(shot.title), prompt: buildPrompt(style, shot, mode, referenceUrl, flatLayOptions) }))
