import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { styleMarkdown, styleBlock, STYLE_VERSION } from '../src/style-guide.js'
import { parseVoiceSamples, readVoiceSamples } from '../src/workspace.js'
import { dmPrompt } from '../src/dm.js'
import { scriptPrompt, topicsPrompt } from '../src/topics.js'

const state = { positioning: { subject: '物理', grade: '高二', city: '北京' }, painPoints: ['期中 58 分还能补吗'] }

test('说话样本.md 只取用户自己的原话，占位句不算', () => {
  const text = [
    '# 说话样本', '', '## 规则', '- 用短句', '', '## 原话样本', '',
    '- 我跟家长说话从来不绕：孩子哪块不会，就补哪块。',
    '- （把你的原话放这里，一行一句。）',
    '', '## 别的', '- 这不是样本',
  ].join('\n')
  assert.deepEqual(parseVoiceSamples(text), ['我跟家长说话从来不绕：孩子哪块不会，就补哪块。'])
  assert.deepEqual(parseVoiceSamples('没有这一节'), [])
})

test('一个新用户没有样本文件时，读取返回空，不会读到别人的话', async () => {
  const root = await mkdtemp(join(tmpdir(), 'voice-'))
  try {
    assert.deepEqual(readVoiceSamples(root), [])
    await writeFile(join(root, '说话样本.md'), styleMarkdown())
    assert.deepEqual(readVoiceSamples(root), [])
    assert.match(styleMarkdown(), new RegExp(`^<!-- ${STYLE_VERSION} -->`))
    assert.doesNotMatch(styleMarkdown(), /数学|初中孩子/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('生成口播时用用户自己的原话当口气，不再串数学老师的样本', () => {
  const own = '我一般先问孩子哪一章卡住，再聊怎么补。'
  const block = styleBlock([own])
  assert.match(block, /我一般先问孩子哪一章卡住/)
  assert.doesNotMatch(block, /数学|初中孩子/)
  const prompt = scriptPrompt(state, '期中掉队先补哪一块', '', [own])
  assert.match(prompt.system, /我一般先问孩子哪一章卡住/)
  assert.match(topicsPrompt(state, 10, '', [own]).system, /我一般先问孩子哪一章卡住/)
  assert.match(dmPrompt(state, '老师你好，孩子高二物理 58 分', { samples: [own] }).system, /我一般先问孩子哪一章卡住/)
})

test('没填样本时 prompt 明确说不套用别人的口气', () => {
  const block = styleBlock()
  assert.match(block, /还没填自己的原话样本/)
  assert.doesNotMatch(block, /数学/)
  assert.doesNotMatch(scriptPrompt(state, '偏科').system, /数学/)
})
