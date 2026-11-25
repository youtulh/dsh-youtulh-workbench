import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reviewPositioning } from '../src/review.js'

const positioning = { subject: '物理', grade: '高二', entry: '动量守恒', target: '北京高二物理 40 分左右', proof: '带过 3 届' }

test('定位复盘：内容跑偏、年级不匹配、来源集中都能看出来', () => {
  const content = [
    { '标题': '高二物理期中卷丢分在哪', '选题': '高二物理期中', '私信': '6' },
    { '标题': '高二物理动量题怎么判断', '选题': '动量守恒', '私信': '2' },
    { '标题': '小学数学怎么启蒙', '选题': '小学', '私信': '0' },
    { '标题': '高三英语作文模板', '选题': '英语', '私信': '0' },
  ]
  const leads = [
    { grade: '高二', source: '小红书', stage: '已报课', result: '加微成功' },
    { grade: '高二', source: '小红书', stage: '约试听', result: '加微成功' },
    { grade: '初三', source: '抖音', stage: '私信', result: '待定' },
    { grade: '高三', source: '抖音', stage: '私信', result: '待定' },
  ]
  const out = reviewPositioning({ positioning, painPoints: [], content, leads })
  assert.equal(out.contentTotal, 4)
  assert.equal(out.contentMatched, 2)
  assert.equal(out.gradedLeads, 4)
  assert.equal(out.gradeMatched, 2)
  assert.equal(out.topSource[0], '小红书')
  assert.equal(out.topContent.dms, 6)
  assert.ok(out.notes.some(row => row.key === 'review_content_drift'))
  assert.ok(out.notes.some(row => row.key === 'review_grade_drift'))
  assert.ok(out.notes.some(row => row.key === 'review_top_source'))
})

test('定位复盘：没内容时给出先拍 5 条的建议', () => {
  const out = reviewPositioning({ positioning })
  assert.equal(out.contentTotal, 0)
  assert.ok(out.notes.some(row => row.key === 'review_no_content'))
})


test('定位复盘会给出 3 个回到定位的选题', () => {
  const out = reviewPositioning({ positioning, painPoints: ['期中 58 分还能补吗'], content: [], leads: [] })
  assert.equal(out.nextTopics.length, 3)
  assert.ok(out.nextTopics.some(row => row.includes('物理') || row.includes('高二')))
  assert.ok(out.nextTopics.some(row => row.includes('动量守恒') || row.includes('期中 58')))
})


test('复盘选题避开内容库已经拍过的同题', () => {
  const out = reviewPositioning({
    positioning,
    painPoints: [],
    content: [{ '标题': '高二物理：动量守恒，先补哪一步', '选题': '动量守恒', '私信': '0' }],
  })
  assert.ok(!out.nextTopics.includes('高二物理：动量守恒，先补哪一步'))
  assert.equal(out.nextTopics.length, 3)
})


test('同城定位：连着 5 条都没提城市会提醒', () => {
  const content = Array.from({ length: 5 }, (_, i) => ({ '标题': `高二物理第${i}讲`, '选题': '物理', '私信': '0' }))
  const out = reviewPositioning({ positioning: { ...positioning, city: '北京' }, content, leads: [] })
  assert.equal(out.local, true)
  assert.equal(out.cityMentions, 0)
  assert.ok(out.notes.some(row => row.key === 'review_local_missing'))
})


test('线索来源能对上内容标题时，复盘指出哪条内容带来了家长', () => {
  const content = [
    { '标题': '高二物理期中卷丢分在哪', '选题': '高二物理', '私信': '3' },
    { '标题': '动量守恒怎么判断', '选题': '动量', '私信': '0' },
  ]
  const leads = [
    { grade: '高二', source: '高二物理期中卷丢分在哪', stage: '已加微信' },
    { grade: '高二', source: '高二物理期中卷丢分在哪', stage: '私信' },
  ]
  const out = reviewPositioning({ positioning, content, leads })
  assert.equal(out.topLeadContent.title, '高二物理期中卷丢分在哪')
  assert.equal(out.topLeadContent.n, 2)
  assert.ok(out.notes.some(row => row.key === 'review_top_lead_content'))
})


test('加微/报课最多的内容可以单独归因', () => {
  const content = [
    { '标题': '高二物理期中卷丢分在哪', '选题': '高二物理' },
    { '标题': '动量守恒怎么判断', '选题': '动量守恒' },
  ]
  const leads = [
    { grade: '高二', source: '高二物理期中卷丢分在哪', stage: '私信', result: '待定' },
    { grade: '高二', source: '动量守恒怎么判断', stage: '已报课', result: '加微成功' },
  ]
  const out = reviewPositioning({ positioning, content, leads })
  assert.equal(out.topLeadContent.title, '高二物理期中卷丢分在哪')
  assert.equal(out.topWonContent.title, '动量守恒怎么判断')
  assert.ok(out.notes.some(row => row.key === 'review_top_won_content'))
})
