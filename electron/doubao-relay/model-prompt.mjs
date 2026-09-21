// A preference within each user's conversation; no shared model reference image.
export function buildModelPrompt(prompt) {
  return [
    '【模特连续性偏好】',
    '在符合本次风格和产品要求的前提下，尽量沿用当前对话之前使用过的模特，让不同款式看起来由同一个人拍摄；同一套图尽量保持人物身份和面部特征一致。姿势、表情、发型造型、妆容和场景可以自然变化。如果本次提示词明确指定了不同的性别、年龄或人物设定，以本次要求为准；没有可沿用的模特时再选择合适的人物。服装始终以本次上传的产品图为准。',
    prompt
  ].join('\n\n');
}