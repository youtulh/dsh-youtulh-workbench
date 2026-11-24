import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendCase, appendChat, chatLessons, chatPrompt, localChat, normalizeChat, readCases, readChats } from '../src/chat.js'

const state = { positioning: { subject: '物理', grade: '高二', city: '北京' }, painPoints: ['期中 58 分还能补吗'] }
const temp = () => mkdtemp(join(tmpdir(), 'workbench-chat-'))

test('平台阶段：一两句把人挪走私信，不报价不展开；微信阶段才谈诊断和试听', () => {
  const platform = chatPrompt(state, { channel: '平台私信', raw: '高一物理 58 分还能补吗' }).system
  assert.match(platform, /私信 \/ 主页/)
  assert.match(platform, /一两句话/)
  assert.match(platform, /不报价/)
  assert.match(platform, /vx|威信|绿泡泡/)
  const wechat = chatPrompt(state, { channel: '微信', raw: '一节课多少钱' }).system
  assert.match(wechat, /试听/)
  assert.match(wechat, /不报价|不报数字/)
  assert.match(wechat, /诊断/)
})

test('聊成的案例会进提示词；没案例时不编', () => {
  const withCase = chatPrompt(state, { channel: '微信', raw: '多少钱', cases: '- 家长问价格（成交）：先别报数字，先问孩子卡在哪。' }).system
  assert.match(withCase, /先别报数字/)
  assert.doesNotMatch(chatPrompt(state, { channel: '微信', raw: '多少钱' }).system, /先别报数字/)
})

test('normalizeChat：只留两条、阶段校验、台账字段照抽', () => {
  const one = normalizeChat({
    judge: '在问价格', stage: '成交',
    drafts: [{ tag: 'A', text: '先说结论' }, { tag: 'B', text: '约试听' }, { tag: 'C', text: '第三条' }],
    fields: { name: '王', grade: '高二', painPoint: '配平不会', school: 42 },
  })
  assert.equal(one.drafts.length, 2)
  assert.equal(one.stage, '成交')
  assert.equal(one.fields.name, '王')
  assert.equal(one.fields.school, '')
  assert.equal(normalizeChat({ drafts: [] }).drafts.length, 0)
  assert.equal(normalizeChat({ stage: '瞎写' }).stage, '')
})

test('本地兜底：平台推私信，微信用卷子换判断', () => {
  const platform = localChat(state, { channel: '平台私信', raw: '58 分还能补吗' })
  assert.match(platform.drafts.map(row => row.text).join(''), /私信/)
  const wechat = localChat(state, { channel: '微信', raw: '多少钱' })
  assert.match(wechat.drafts.map(row => row.text).join(''), /卷子/)
})

test('对话记录和案例库：写进去能读回来，案例按渠道取', async () => {
  const root = await temp()
  try {
    appendChat(root, { channel: '微信', name: '王', incoming: '多少钱', outgoing: '先看看孩子卡在哪', stage: '成交', result: '约试听' })
    appendChat(root, { channel: '平台私信', incoming: '58 分还能补吗', outgoing: '我私信您' })
    const chats = readChats(root)
    assert.equal(chats.length, 2)
    assert.equal(chats[1].channel, '平台私信')
    assert.equal(chats[0].result, '约试听')

    appendCase(root, { channel: '微信', scene: '家长问价格', result: '成交', text: '家长：多少钱？老师：先别报数字，先看孩子卡在哪。' })
    appendCase(root, { channel: '平台私信', scene: '引流', result: '加微', text: '老师：平台打字不方便，我私信你。' })
    appendCase(root, { channel: '微信', scene: '没聊成', result: '流失', text: '家长：太贵了。' })
    const cases = readCases(root)
    assert.equal(cases.length, 3)
    const lessons = chatLessons(root, '微信')
    assert.match(lessons, /先别报数字/)
    assert.doesNotMatch(lessons, /太贵了/) // 流失的不当成功经验
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
