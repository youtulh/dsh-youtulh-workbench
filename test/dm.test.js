import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dmPrompt, localDm, normalizeDm } from '../src/dm.js'

const state = {
  positioning: { subject: '物理', grade: '高二', city: '北京', only: '北京、高二', notDo: '高三', redline: '不承诺提分' },
  painPoints: ['孩子成绩一直没提升'],
}

test('私信 prompt：带人设、边界、两条话术要求和台账字段', () => {
  const { system, user } = dmPrompt(state, '老师你好，孩子高二物理 58 分还能补吗', { lessons: '- 家长问价格 → 加了微信' })
  assert.match(system, /高二/)
  assert.match(system, /两条话术/)
  assert.match(system, /加微信/)
  assert.match(system, /不许编/)
  assert.match(system, /家长问价格/)
  assert.match(user, /58 分/)
})

test('normalizeDm：只留两条、判断归到四类、字段去空', () => {
  const out = normalizeDm({
    type: '家长', category: 'C 怎么补',
    drafts: [{ tag: 'a', text: 'x' }, { tag: 'b', text: 'y' }, { text: '' }],
    fields: { name: '', grade: '高二', school: '  ' },
  })
  assert.equal(out.drafts.length, 2)
  assert.equal(out.fields.grade, '高二')
  assert.equal(out.fields.name, '')

  const weird = normalizeDm({ type: '机器人', category: '价格', drafts: [] })
  assert.equal(weird.type, '')
  assert.equal(weird.category, '')
})

test('没模型时的兜底：两条人话，第二条引导加微信，不承诺提分', () => {
  const out = localDm(state, '老师你好，我孩子高二物理期中才 58 分，还能补上来吗？')
  assert.equal(out.drafts.length, 2)
  assert.match(out.drafts[1].text, /加个微信/)
  assert.doesNotMatch(out.drafts.map(row => row.text).join(''), /保证|一定能|包过/)
  assert.ok(out.fields.painPoint.length > 0)
  assert.equal(out.fallback, true)
})

test('私信 prompt 会判断对方是不是目标客户', () => {
  const state = {
    positioning: {
      subject: '物理', grade: '高二', city: '北京',
      target: '北京高二物理 40–60 分、家长急但没方向',
      entry: '期中卷丢分最多的一块',
      fear: '怕补了没起色',
    },
    painPoints: [],
  }
  const { system } = dmPrompt(state, '老师你好，孩子物理 58 分还能补吗')
  assert.match(system, /北京高二物理 40–60 分/)
  assert.match(system, /是不是我们这一阶段要接的家长/)
})
