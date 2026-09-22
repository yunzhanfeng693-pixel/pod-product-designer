import { PromptStyle } from '@/types'
import { normalizeReferenceTemplate } from '../../electron/doubao-relay/reference-prompt.mjs'

export const normalizePromptStyle = (style: PromptStyle): PromptStyle => ({
  ...style,
  corePrompt: normalizeReferenceTemplate(style.corePrompt),
  photographyPrompt: normalizeReferenceTemplate(style.photographyPrompt),
  shots: style.shots.map(shot => ({
    ...shot,
    title: normalizeReferenceTemplate(shot.title),
    prompt: normalizeReferenceTemplate(shot.prompt)
  }))
})
