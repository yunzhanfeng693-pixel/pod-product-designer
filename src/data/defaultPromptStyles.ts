import { PromptStyle } from '@/types'
import { createDocumentPromptStyles } from '@/data/documentPromptStyles'

export const DEFAULT_STYLE_ID = 'style_birthday_ugc'

export const createDefaultPromptStyles = (): PromptStyle[] => {
  const now = new Date().toISOString()
  return [{
    id: DEFAULT_STYLE_ID,
    name: '极简高级生日聚会 UGC',
    corePrompt: `【垫图与核心产品保持（核心原则）】
[请在这里粘贴您的第一张完美参考图链接]
请严格参考我发送的这张原图，保持图中模特的脸部特征、发型、性别以及 T 恤的图案花型、底色 100% 完全一致。生成图为 1:1 正方形图。
产品版型：原图的服装保持为重磅纯棉宽大版型 T 恤（Oversized Heavyweight Cotton Tee），剪裁保留原图的挺括落肩。
材质与细节：强调重磅纯棉（Heavyweight cotton）的厚实质感（Thick and heavy texture），面料要有厚度。领口紧实服帖（snug tight crewneck），肩线呈现自然的落肩挺括状态（structured dropshoulder silhouette），布料要有自然的垂坠感和真实的褶皱光影，拒绝软塌。服装必须占到整个画面的 70% 以上。`,
    photographyPrompt: `【摄影风格与光影（UGC 场景感）】
核心调性：极简高级超时尚大片风生日聚会风、UGC 风格真实生活感摄影（Authentic lifestyle photography, UGC style）。画面要极致简洁，不要太杂乱。
光影：使用适合超时尚大片风生日聚会的柔和自然光或局部环境光，带有自然的明暗过渡，拒绝死板影棚打光。
质感：胶片颗粒感（35mm film grain），保留真实的皮肤纹理与瑕疵，消除 AI 塑料感，营造随性、不经意的抓拍氛围。`,
    shots: [
      {
        id: 'shot_main', order: 1, title: '主图（正面经典站姿体态展现）',
        prompt: 'A professional fashion editorial shot of a model standing confidently in an ultra-stylish minimalist birthday party setting. The model is wearing an oversized heavyweight cotton tee with a snug tight crewneck and structured dropshoulder silhouette, occupying 70% of the frame. Clean, simple background with monochromatic blur and subtle party elements. Natural soft lighting, 35mm film grain, authentic lifestyle photography, UGC style, 1:1 aspect ratio.'
      },
      {
        id: 'shot_detail', order: 2, title: '细节特写（面料与图案凸显）',
        prompt: 'A medium close-up shot focusing on the chest of a model wearing an oversized heavyweight cotton tee, occupying 80% of the frame. Extremely sharp detail on the snug tight crewneck and the un-distorted graphic on the chest. Utilizing natural side lighting from a minimalist birthday party environment to accentuate the thick and heavy texture of the fabric. Pure, clean background, 35mm film grain.'
      },
      {
        id: 'shot_lifestyle', order: 3, title: '生活化场景（UGC 视角放松动作）',
        prompt: 'A candid UGC lifestyle snapshot. The model is comfortably sitting and leaning in a minimalist birthday party scene, holding a single elegant party prop, laughing naturally while looking away. Wearing an oversized heavyweight cotton tee, showcasing realistic folds and heavy drape of the thick fabric. Clean, softly blurred background with a stylish party vibe, 35mm film grain.'
      },
      {
        id: 'shot_side', order: 4, title: '侧面/氛围感（线条与版型展现）',
        prompt: "A premium fashion editorial portrait. The model's body is angled at 45 degrees, showcasing the structured dropshoulder lines and heavy drape of the oversized heavyweight cotton tee from the side, with the graphic flowing naturally. The background is an extremely clean, solid-colored wall in a minimalist, stylish party setting, high-end commercial campaign vibe, 35mm film grain."
      },
      {
        id: 'shot_pov', order: 5, title: '第一人称视角（高度纪实抓拍）',
        prompt: 'A first-person POV candid snapshot. The model is sitting relaxed on the floor in a minimalist birthday party scene, looking up and laughing genuinely at the camera while naturally running a hand through their hair. Wearing an oversized heavyweight cotton tee, capturing realistic heavy folds stacking on the torso. High interaction, abundant negative space, 35mm film grain.'
      }
    ],
    createdAt: now,
    updatedAt: now
  }, ...createDocumentPromptStyles()]
}
