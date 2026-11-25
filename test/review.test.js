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
