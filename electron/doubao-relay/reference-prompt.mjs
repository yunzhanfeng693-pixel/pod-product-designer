// Used by both the renderer (including manual copy) and the desktop relay.
// Rewrite legacy template instructions before adding the actual image roles.
export function normalizeReferenceTemplate(text) {
  return String(text || '')
    .replace(/请严格参考我发送的这张原图，保持图中模特的脸部特征、发型、性别以及 T 恤的图案花型、底色 100% 完全一致。/g, '服装颜色、版型、印花及其位置以产品参考图为准。人物身份参考单独提供的模特图；没有人物参考时整套使用同一位模特。')
    .replace(/Centered on the chest is the precise white graphic of the heartbeat pulse line ending in a soccer ball, rendered with sharp lines\./gi, 'Preserve the exact artwork and placement shown in the product reference, rendered with sharp lines.')
    .replace(/subtle chest print, and identical large back graphic print/gi, 'the exact referenced artwork and its original placement and scale')
    .replace(/[^\n.!?]*(?:located only on the front chest|back (?:of the (?:tee|shirt)|panel)[^\n.!?]*(?:blank|plain)|completely (?:blank|plain)[^\n.!?]*back)[^\n.!?]*[.!?]?/gi, 'Preserve the artwork only on its documented garment panel; choose a camera angle supported by the product reference.')
    .replace(/[^\n。！？]*(?:背面无印花|后背是完全干净空白|前胸图案不可见)[^\n。！？]*[。！？]?/g, '按产品参考图展示对应衣面的版型、印花和落肩线条；未提供参考的衣面不作为商品展示面。')
    .replace(/后背干净|背面无印花/g, '衣面随产品参考图')
    .replace(/(?:the )?(?:large, intricate faith-themed|faith-themed small|faith-themed|large|small|subtle)\s+(?:chest|back)\s+(?:graphic\s+)?print/gi, 'the referenced artwork')
    .replace(/\b(?:chest|front|back)\s+(?:graphic(?:\s+print)?|print|artwork|design)(?:\s+details)?\b/gi, 'referenced artwork')
    .replace(/\bon (?:both of their chests|the front chest|the chest|the back)\b/gi, 'on the referenced garment panel')
    .replace(/\b(?:upper chest|chest area|chest)\b/gi, 'referenced garment area')
    .replace(/across the broad back of the tee/gi, 'at its original location on the referenced garment panel')
    .replace(/\bback (crewneck line|collar)\b/gi, '$1')
    .replace(/\bupper back fabric\b/gi, 'referenced garment fabric')
    .replace(/with the graphic flowing naturally/gi, 'with fabric folding naturally and artwork staying on its original garment panel')
    .replace(/(?:胸前|前胸|正面|背面|后背)(?:的)?(?:具体)?(?:原图的)?(?=图案|印花|服装|衣服)/g, '参考衣面上的')
    .replace(/胸前|前胸/g, '参考衣面')
    .replace(/衣服背面/g, '参考衣面')

    .replace(/除背面展示任务以外/g, '展示参考衣面时')
    .replace(/背面或侧面|背对或侧对镜头|背面展示|背面特写/g, '参考衣面展示')
    .replace(/(?:正面|背面)经典/g, '参考衣面经典')
    .replace(/正面主图|正面近景图|正面服装展示感|服装正面主视觉/g, '参考衣面主图')
    .replace(/正面\s*[\/／]\s*(?:接近正面|微侧面)|正面或接近正面|正面或轻微侧身/g, '参考衣面或自然斜侧面')
    .replace(/\b(?:Front|Back)[/-]Side View\b/gi, 'Reference-panel View')
    .replace(/\b(?:front|back)[ -](?:facing|view|close-up)\b/gi, 'reference-panel view')
    .replace(/\bcandid side-and-back shot\b/gi, 'candid reference-panel shot')
    .replace(/\b(?:viewed|shot|view) from behind\b/gi, 'view of the referenced garment panel')
    .replace(/\bfacing (?:approximately \d+ degrees toward the camera|the camera|forward)\b/gi, 'orienting the referenced garment panel toward the camera')
    .replace(/\blooking (?:up )?(?:(?:directly|straight) )?(?:at|into|towards?) the camera\b/gi, 'keeping a relaxed head position aligned with the shoulders')
    .replace(/\blooking up and laughing (?:genuinely at|towards?) the camera\b/gi, 'smiling naturally with the head aligned with the shoulders')
    .replace(/\bwalking slowly toward the camera\b/gi, 'walking slowly while the camera follows the referenced garment panel')
    .replace(/看着镜头|直视镜头|正对镜头/g, '头部与肩膀保持自然朝向')
    .replace(/微微挺胸/g, '自然站立')
    .replace(/\bfirst-person POV\b/gi, 'friend-photographer perspective')
    .replace(/第一人称(?:视角)?|自拍视角/g, '朋友抓拍视角')
    .replace(/模拟模特自己举着手机对镜自拍/g, '由朋友从参考衣面方向拍摄')
    .replace(/\bthe snug tight crewneck\b|\ba snug tight crewneck\b|\bsnug tight crewneck\b/gi, 'the original neckline from the product reference')
    .replace(/领口紧实服帖（snug tight crewneck）/g, '领口结构及开口方向严格随产品参考图')
    .replace(/\[THE_GRAPHIC_DESCRIPTION\]|\[图案描述\]/g, 'the exact artwork from the product reference')
    .replace(/\[REFERENCE_IMAGE\]|\[参考图\]/g, '')
    .replace(/模特参考衣面展示/g, '模特以参考衣面朝向镜头')
    .replace(/朋友抓拍视角\/朋友抓拍视角/g, '朋友抓拍视角')
    .trim()
}

export function buildReferenceContext(roles = []) {
  const validRoles = roles.filter(role => ['model', 'front', 'back'].includes(role))
  const products = validRoles.filter(role => role !== 'model')
  const labels = { model: '模特身份参考图（仅参考人物，不沿用其服装或姿势）', front: '产品正面图（对应穿着者身体前侧）', back: '产品反面图（对应穿着者背部）' }
  const lines = ['【本次参考图与拍摄方向】']
  validRoles.forEach((role, index) => lines.push(`第 ${index + 1} 张：${labels[role]}。`))
  if (products.length && products.every(role => role === 'back')) {
    lines.push('本次仅提供产品反面：所有分镜从模特背部或自然侧后方拍摄，反面印花保留在背部。特写对准背部参考印花区域；坐姿也从背后拍。人物脸部可以不出现，最多自然侧脸，不能要求背部朝向镜头的同时完整正脸朝向镜头。')
  } else if (products.length && products.every(role => role === 'front')) {
    lines.push('本次仅提供产品正面：所有分镜从模特身体前侧或自然侧前方拍摄，正面印花保留在身体前侧。特写和坐姿均展示该参考面。')
  } else if (products.length) {
    lines.push('本次提供多个产品衣面：每个分镜只选择一个有参考图的衣面拍摄，分别对应其印花与位置，不互换、不合并。头部与身体朝向必须符合该机位。')
  } else {
    lines.push('先根据产品参考图的领口、接缝和版型确认衣面，再从该衣面方向拍摄；无法确定的衣面不自行补画。')
  }
  lines.push('服装按正常方式穿着：前后领口、肩线、袖子、手臂、躯干和头部的空间关系一致。改变拍摄机位来展示图案，不能倒穿衣服、移动图案或扭转躯干来迁就镜头。')
  lines.push('图案仅保留在对应产品参考面的原位置、原比例。未展示衣面的设计未知，不默认纯色或相同印花；避免拍摄未经提供的衣面。已展示为空白的衣面仍保持空白。')
  lines.push('自然褶皱及透视可遮挡部分图案，不强求每张全脸、完整图案与领口同时可见。模特参考图仅锁定身份，姿势由本次产品衣面与分镜决定。')
  return lines.join('\n')
}
