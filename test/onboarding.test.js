import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildProfile, profileReady } from '../src/onboarding.js'

test('问卷答案拼成设定：城市、年级、科目、学生情况按顺序拼进「只做」', () => {
  const { positioning, painPoints } = buildProfile({
    subject: '化学', grade: '高一', city: '北京', situations: ['期中掉队', '基础差、听不懂'], excludes: ['外地线上', '高二高三'], pains: '期中 58 分还能补吗，物质的量听不懂',
  })
  assert.equal(positioning.subject, '化学')
  assert.equal(positioning.grade, '高一')
  assert.equal(positioning.city, '北京')
  assert.equal(positioning.only, '北京、高一、化学、期中掉队、基础差、听不懂')
  assert.equal(positioning.notDo, '外地线上、高二高三')
  assert.match(positioning.redline, /不承诺提分/)
  assert.deepEqual(painPoints, ['期中 58 分还能补吗', '物质的量听不懂'])
})

test('「都不排斥」不写进不做；其他科目走自定义；没填的字段留空', () => {
  const a = buildProfile({ subject: '其他', subjectOther: '信息技术', grade: '高二', excludes: ['都不排斥'] })
  assert.equal(a.positioning.subject, '信息技术')
  assert.equal(a.positioning.notDo, '')
  const b = buildProfile({})
  assert.equal(b.positioning.subject, '')
  assert.deepEqual(b.painPoints, [])
})

test('profileReady 要求科目、年级、城市至少填两样', () => {
  assert.equal(profileReady({}), false)
  assert.equal(profileReady({ subject: '化学' }), false)
  assert.equal(profileReady({ subject: '化学', grade: '高一' }), true)
})
