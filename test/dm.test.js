import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dmPrompts, fallbackVerdict, normalizeVerdict } from '../src/dm.js'
import { applyOps } from '../src/ops.js'

test('normalizeVerdict 只认表里的类型和分类，草稿最多两条', () => {
  const verdict = normalizeVerdict({ type: '同行', category: 'A 价格', drafts: ['a', 'b', 'c'], ledger: { grade: '高一', next: '乱写的下一步' }, note: '提醒' })
  assert.equal(verdict.type, '同行')
  assert.equal(verdict.category, 'A 价格')
  assert.equal(verdict.drafts.length, 2)
  assert.equal(verdict.ledger.grade, '高一')
  assert.equal(verdict.ledger.next, '待加微')
  assert.equal(verdict.note, '提醒')
  // 认不出的类型退回「家长」，分类退回「无」
  const odd = normalizeVerdict({ type: '外星人', category: 'E 别的' })
  assert.equal(odd.type, '家长')
  assert.equal(odd.category, '无')
})

test('fallbackVerdict 没有模型时也能判类型和分类，并抽出年级和分数', () => {
  const verdict = fallbackVerdict('老师你好，我孩子高一，化学期中才 58 分，还能补上来吗？')
  assert.equal(verdict.type, '家长')
  assert.equal(verdict.category, 'B 能不能提分')
  assert.equal(verdict.ledger.grade, '高一')
  assert.match(verdict.ledger.painPoint, /58/)
  assert.equal(verdict.drafts.length, 2)
  // 没说具体模块时提醒里要建议追问
  assert.match(verdict.note, /追问/)
  // 同行和广告不走家长话术
  assert.equal(fallbackVerdict('你好，你们是怎么招生的？').type, '同行')
  assert.equal(fallbackVerdict('在吗').type, '广告')
})

test('dmPrompts 把定位卡和红线一起写进 system', () => {
  const { system, user } = dmPrompts({ positioning: { only: '北京、高一、化学', redline: '不承诺提分' } }, '我孩子高一 58 分')
  assert.match(system, /北京、高一、化学/)
  assert.match(system, /不承诺提分/)
  assert.match(system, /不承诺效果/)
  assert.match(system, /两条草稿|草稿 1/)
  assert.match(user, /我孩子高一 58 分/)
})

test('线索：存一条、改下一步、删掉，正文为空时拒绝', () => {
  const state = { items: [], leads: [] }
  applyOps(state, [{ op: 'add_lead', raw: '我孩子高一 58 分', type: '家长', category: 'B 能不能提分', next: '待加微' }])
  assert.equal(state.leads.length, 1)
  assert.equal(state.leads[0].createdAt !== undefined, true)
  applyOps(state, [{ op: 'update_lead', id: state.leads[0].id, next: '约了试听', painPoint: '物质的量没听懂' }])
  assert.equal(state.leads[0].next, '约了试听')
  assert.equal(state.leads[0].painPoint, '物质的量没听懂')
  applyOps(state, [{ op: 'delete_lead', id: state.leads[0].id }])
  assert.equal(state.leads.length, 0)
  const result = applyOps({ items: [], leads: [] }, [{ op: 'add_lead', raw: '   ' }])
  assert.equal(result.errors.length, 1)
})
