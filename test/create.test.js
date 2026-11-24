import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPrompts, fallbackCreative, normalizeCreative } from '../src/create.js'

test('normalizeCreative 只认三组字段，数量按上限截断', () => {
  const creative = normalizeCreative({
    titles: ['a', 'b', 'c', 'd', ''],
    scripts: [{ label: '直给版', text: '第一行\n第二行' }, { label: '故事版', text: '另一个' }, { text: '多出来的' }, {}],
    tags: [['#物质', '量', ''], ['x', 'y', 'z', 'p', 'q', 'r', '多出来'], 'bad'],
  })
  assert.deepEqual(creative.titles, ['a', 'b', 'c'])
  assert.equal(creative.scripts.length, 2)
  assert.equal(creative.scripts[0].text, '第一行\n第二行')
  assert.deepEqual(creative.tags[0], ['物质', '量'])
  assert.equal(creative.tags[1].length, 6)
  // 全空时三组都是空数组，界面能据此提示「换一批」
  assert.deepEqual(normalizeCreative(null), { titles: [], scripts: [], tags: [] })
})

test('fallbackCreative 没模型时也能给出标题、口播和标签', () => {
  const state = { positioning: { subject: '高中化学', grade: '高一', city: '北京' }, painPoints: ['期中 58 分还能补吗'] }
  const creative = fallbackCreative(state, '期中 58 分')
  assert.equal(creative.titles.length >= 1, true)
  assert.equal(creative.scripts.length, 2)
  assert.match(creative.scripts[0].text, /期中 58 分/)
  assert.match(creative.scripts[0].text, /诊断/)
  assert.equal(creative.tags.length, 2)
  // 标签不带 #
  assert.equal(creative.tags[0].every(tag => !tag.startsWith('#')), true)
})

test('createPrompts 把设定、痛点和「只做口播」的规则写进 system', () => {
  const state = { positioning: { subject: '高中化学', grade: '高一', city: '北京', voice: '先接住焦虑' }, painPoints: ['期中 58 分', '物质的量听不懂'] }
  const { system, user } = createPrompts(state, '期中 58 分怎么开口')
  assert.match(system, /高中化学 · 高一 · 北京/)
  assert.match(system, /先接住焦虑/)
  assert.match(system, /期中 58 分/)
  assert.match(system, /口播文案 2 版/)
  assert.match(system, /不承诺提分/)
  assert.match(user, /期中 58 分怎么开口/)
})
