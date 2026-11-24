import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localScript, localTopics, normalizeScript, normalizeTopics } from '../src/topics.js'

const state = { positioning: { subject: '化学', grade: '高一', city: '北京' }, painPoints: ['期中 58 分还能补吗', '物质的量听不懂', '上课听懂了做题就废'] }

test('本地选题：凑够 30 个、去重、痛点都用到', () => {
  const list = localTopics(state, 30)
  assert.equal(list.length, 30)
  assert.equal(new Set(list).size, 30)
  // 有的句式带年级科目，有的只讲痛点，两种都要有
  assert.ok(list.some(row => row.includes('高一化学')))
  assert.ok(list.some(row => row.includes('物质的量听不懂')))
})

test('normalizeTopics：去重、去空、截断', () => {
  const list = normalizeTopics({ topics: ['a', 'a', 'b', '', 42, 'c'] }, 3)
  assert.deepEqual(list, ['a', 'b', 'c'])
  assert.deepEqual(normalizeTopics(null), [])
})

test('本地口播：标题就是选题，稿子有开场和引导，标签不带 #', () => {
  const one = localScript(state, '期中 58 分，先补哪一块')
  assert.equal(one.title, '期中 58 分，先补哪一块')
  assert.match(one.script, /私信「诊断」/)
  assert.equal(one.tags.every(tag => !tag.startsWith('#')), true)
})

test('normalizeScript：只认三个字段，标签去掉 #', () => {
  const one = normalizeScript({ title: 'T', script: 'A\nB', tags: ['#x', 'y', '', 1] })
  assert.equal(one.title, 'T')
  assert.equal(one.script, 'A\nB')
  assert.deepEqual(one.tags, ['x', 'y'])
})
