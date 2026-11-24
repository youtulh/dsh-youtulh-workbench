import assert from 'node:assert/strict'
import { test } from 'node:test'
import { feedbackPrompt, localFeedback } from '../src/feedback.js'

const state = { positioning: { subject: '高中物理', grade: '高二', city: '北京' } }
const student = { name: '王小明', grade: '高二', school: '某中学', layer: '动量守恒', note: '做题慢' }
const lessons = [
  { no: 4, date: '2026-11-20', attend: '到', mastery: '半会', homework: '未交', note: '动量题有思路' },
  { no: 3, date: '2026-11-13', attend: '到', mastery: '不会', homework: '交', note: '' },
]

test('家长反馈 prompt：带学生、课次、口气和边界', () => {
  const { system, user } = feedbackPrompt(state, student, lessons, ['我平时说话比较直'])
  assert.match(system, /家长您好/)
  assert.match(system, /不承诺分数/)
  assert.match(system, /我平时说话比较直/)
  assert.match(user, /王小明/)
  assert.match(user, /动量守恒/)
  assert.match(user, /第4次/)
  assert.match(user, /作业没交/)
})

test('家长反馈本地兜底：说数据，不编细节', () => {
  const text = localFeedback(student, lessons, '高中物理')
  assert.match(text, /王小明/)
  assert.match(text, /物理老师/)
  assert.match(text, /动量守恒/)
  assert.match(text, /10 分钟/)
  assert.match(text, /哪一步/)
})
