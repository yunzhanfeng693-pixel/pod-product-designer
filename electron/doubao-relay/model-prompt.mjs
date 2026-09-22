import { buildReferenceContext } from './reference-prompt.mjs'

export function buildModelPrompt(prompt, { modelLocked = false, gender = '', referenceRoles = [] } = {}) {
  const identityRule = modelLocked
    ? [
      '【模特与产品参考图优先级】',
      '本次上传的参考图中：模特参考图用于锁定人物身份；产品参考图用于锁定服装和印花。请严格保持模特参考图中的脸部特征、性别、肤色、发型基础特征和身材气质一致；姿势、表情、造型与场景可以自然变化。严格保持产品参考图中的服装颜色、版型、面料、印花、文字、排版和位置一致。不要把产品平铺图误认为模特图。',
      gender ? `模特性别要求：${gender === 'male' ? '男性' : '女性'}；如与模特参考图冲突，以模特参考图为准。` : ''
    ].filter(Boolean).join('\n')
    : [
      '【模特连续性偏好】',
      '在符合本次风格和产品要求的前提下，尽量沿用当前对话之前使用过的模特，让不同款式看起来由同一个人拍摄；同一套图尽量保持人物身份和面部特征一致。姿势、表情、发型造型、妆容和场景可以自然变化。如果本次提示词明确指定了不同的性别、年龄或人物设定，以本次要求为准；没有可沿用的模特时再选择合适的人物。服装始终以本次上传的产品图为准。'
    ].join('\n')
  return [identityRule, buildReferenceContext(referenceRoles), prompt].join('\n\n')
}
