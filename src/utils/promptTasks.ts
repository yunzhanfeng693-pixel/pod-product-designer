import { PromptShot, PromptStyle } from '@/types'

export type PromptOutputMode = 'generic' | 'midjourney'

export interface FlatLayOptions {
  enabled: boolean
  garmentType: string
}

export const buildFlatLayPreface = ({ enabled, garmentType }: FlatLayOptions) => {
  if (!enabled) return ''
  const product = garmentType.trim()
  if (!product) throw new Error('请先选择或填写衣服类型')
  return `【最高优先级：先将平铺产品穿到模特身上】
我提供的是一张${product}的平铺合成参考图，图中没有可沿用的模特。请先让一位美国模特穿上这件${product}，再按照下面的分镜生成组图。参考图仅用于锁定产品，不要把平铺图误认为已经有模特的照片。
无论下方旧模板如何描述，衣服类型必须是${product}；忽略与之冲突的 T 恤、短袖、卫衣等品类及袖长描述。模特采用美国时尚商业摄影中的欧美面孔，不要沿用旧模板的既有模特身份或脸部一致性要求。
严格保持参考图中的服装颜色、版型、领口、袖长、正反面印花、文字、排版和图案位置；不得自行修改、增加或删除。整套图中保持同一位新生成的模特、同一件衣服。单次每个分镜输出一张 1:1 图片，不要拼图。`
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

const prepareTemplateText = (value: string, mode: PromptOutputMode, referenceUrl: string) => value
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

  if (mode === 'generic') return body
  return `${body}\n\n${referenceUrl} --cref ${referenceUrl} --cw 100 --sref ${referenceUrl} --sw 1000 --v 6.0 --ar 1:1`
}

export const buildPromptTasks = (
  style: PromptStyle,
  mode: PromptOutputMode,
  referenceUrl = '',
  flatLayOptions?: FlatLayOptions
) => [...style.shots]
  .sort((a, b) => a.order - b.order)
  .map(shot => ({ shotId: shot.id, title: shot.title, prompt: buildPrompt(style, shot, mode, referenceUrl, flatLayOptions) }))
