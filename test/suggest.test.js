import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localSuggestions, normalizeSuggestions } from '../src/suggest.js'

test('本地案例：按设定和痛点拼出 5 条，去重且带科目年级', () => {
  const state = { positioning: { subject: '化学', grade: '初三', city: '北京' }, painPoints: ['期中 58 分还能补吗', '物质的量听不懂'] }
  const list = localSuggestions(state)
  assert.equal(list.length, 5)
  assert.equal(new Set(list).size, list.length)
  assert.ok(list.some(row => row.includes('初三化学')))
  assert.ok(list.some(row => row.includes('期中 58 分')))
})

test('normalizeSuggestions 只认 prompts，去重并截断', () => {
  const list = normalizeSuggestions({ prompts: ['a', 'a', 'b', '', 42, 'c', 'd', 'e', 'f', 'g'] })
  assert.deepEqual(list.slice(0, 3), ['a', 'b', 'c'])
  assert.equal(list.length <= 6, true)
  assert.deepEqual(normalizeSuggestions(null), [])
})
