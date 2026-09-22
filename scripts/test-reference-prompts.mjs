import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
import ts from 'typescript'
import { buildReferenceContext, normalizeReferenceTemplate } from '../electron/doubao-relay/reference-prompt.mjs'
import { buildModelPrompt } from '../electron/doubao-relay/model-prompt.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const cache = new Map()
async function loadSource(relative) {
  if (cache.has(relative)) return cache.get(relative)
  const file = path.join(root, relative)
  let code = ts.transpileModule(await readFile(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext }
  }).outputText
  for (const match of [...code.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const specifier = match[1]
    const target = specifier.startsWith('@/') ? path.join(root, 'src', specifier.slice(2)) : path.resolve(path.dirname(file), specifier)
    const url = target.endsWith('.mjs') ? pathToFileURL(target).href : await loadSource(path.relative(root, target + '.ts'))
    code = code.replace(specifier, url)
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  cache.set(relative, url)
  return url
}

const { createDefaultPromptStyles } = await import(await loadSource('src/data/defaultPromptStyles.ts'))
const { buildPromptTasks } = await import(await loadSource('src/utils/promptTasks.ts'))
const { normalizePromptStyle } = await import(await loadSource('src/utils/promptStyleNormalization.ts'))
const styles = createDefaultPromptStyles()
const forbidden = /(?:chest|front|back) (?:graphic|artwork|print)|graphic on the chest|正面经典|胸前印花|looking up at the camera|looking straight at the camera|graphic flowing naturally/i
let count = 0
for (const style of styles) {
  assert.equal(style.shots.length, normalizePromptStyle(style).shots.length)
  assert.deepEqual(normalizePromptStyle(style), style, `${style.name}: normalization must be stable`)
  for (const roles of [['front'], ['back'], ['model', 'back'], ['model', 'back', 'front']]) {
    const tasks = buildPromptTasks(style, 'generic', '', { enabled: true, garmentType: '卫衣', referenceRoles: roles })
    for (const task of tasks) {
      assert.doesNotMatch(task.prompt, forbidden, style.name)
      assert.ok(task.prompt.includes('不能倒穿衣服'))
      if (roles.join(',') === 'model,back') {
        assert.ok(task.prompt.includes('第 1 张：模特身份参考图'))
        assert.ok(task.prompt.includes('第 2 张：产品反面图'))
        assert.ok(task.prompt.includes('坐姿也从背后拍'))
      }
      if (roles.join(',') === 'front') assert.ok(task.prompt.includes('本次仅提供产品正面'))
      if (roles.length === 3) assert.ok(task.prompt.includes('本次提供多个产品衣面'))
      count++
    }
  }
}

const legacy = {
  ...styles[0],
  shots: [{ id: 'old', order: 1, title: '主图（正面经典站姿体态展现）', prompt: 'A medium close-up focusing on the chest. The graphic on the chest is clear. The model is looking up at the camera, with the graphic flowing naturally.' }]
}
const snapshot = JSON.stringify(legacy)
const [manual] = buildPromptTasks(legacy, 'generic', '', { enabled: false, garmentType: '', referenceRoles: ['back'] })
assert.doesNotMatch(manual.prompt, forbidden)
assert.ok(manual.prompt.includes('第 1 张：产品反面图'))
assert.equal(JSON.stringify(legacy), snapshot, 'Sending must not mutate stored input')
const automatic = buildModelPrompt(manual.prompt, { modelLocked: true, referenceRoles: ['model', 'back'] })
assert.ok(automatic.includes('第 2 张：产品反面图'))
assert.doesNotMatch(automatic, forbidden)
assert.ok(buildReferenceContext(['model', 'front', 'back']).includes('第 3 张：产品反面图'))
assert.ok(buildReferenceContext([]).includes('无法确定的衣面不自行补画'))
assert.ok(normalizeReferenceTemplate('35mm film grain, warm soft light, birthday party.').includes('birthday party'))
assert.equal(buildPromptTasks(styles[0], 'generic').length, 5)
assert.throws(() => buildPromptTasks(styles[0], 'midjourney', 'bad-url'))
assert.ok(buildPromptTasks(styles[0], 'midjourney', 'https://example.com/ref.png')[0].prompt.includes('--cref https://example.com/ref.png'))
console.log(`Passed: ${styles.length} styles, ${count} prompts across front/back/model/dual references; legacy stored style and manual-copy regressions.`)
