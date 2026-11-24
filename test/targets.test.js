import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diagnosePositioning, entrySuggestions, parsePains, positioningSentence, suggestTargets } from '../src/targets.js'

const base = { subject: '物理', grade: '高二', city: '北京', situations: ['期中掉队'], pains: ['期中 58 分还能补吗'] }

test('目标客户建议：按学生情况排第一，四张卡，要素齐全', () => {
  const list = suggestTargets(base)
  assert.equal(list.length, 4)
  assert.equal(list[0].key, 'middle')
  assert.equal(list[0].match, true)
  assert.match(list[0].title, /高二物理/)
  assert.match(list[0].value, /北京/)
  for (const card of list) {
    assert.ok(card.why && card.fear && card.entry && card.value && card.title, card.key)
  }
  assert.equal(suggestTargets({ ...base, situations: ['艺考补基础'] })[0].key, 'exam')
  assert.equal(suggestTargets({ ...base, situations: ['想冲高分'] })[0].key, 'top')
  assert.equal(suggestTargets({ ...base, situations: ['偏科'] })[0].key, 'subject')
  assert.equal(suggestTargets({ ...base, situations: ['基础差、听不懂'] })[0].key, 'weak')
})

test('不推荐已经放弃的差生，坑里写明低转正率（IP8）', () => {
  const list = suggestTargets(base)
  assert.ok(!list.some(card => card.title.includes('已经放弃')))
  const diagnosis = diagnosePositioning({ ...base, target: '北京高二物理 40 分以下', entry: '受力分析', fear: '怕来不及' })
  assert.ok(diagnosis.pitfalls.some(row => row.includes('差生')))
})

test('定位体检：空输入列出缺口，填完就 ready', () => {
  const empty = diagnosePositioning({})
  const keys = empty.gaps.map(row => row.key)
  for (const key of ['who', 'city', 'target', 'entry', 'fear', 'pains', 'notDo']) assert.ok(keys.includes(key), key)
  assert.equal(empty.ready, false)

  const full = diagnosePositioning({
    ...base,
    pains: ['期中 58 分还能补吗', '物质的量听不懂'],
    target: '北京高二物理 40–60 分、家长急但没方向',
    entry: '期中卷丢分最多的一块',
    fear: '怕补了没起色',
    notDo: '外地、竞赛',
  })
  assert.equal(full.ready, true)
  assert.equal(full.gaps.length, 0)
  assert.match(full.headline, /先只抓/)
})

test('目标太宽会被点出来', () => {
  const out = diagnosePositioning({ ...base, target: '所有需要补物理的孩子', entry: '电学', fear: '怕花钱', notDo: '外地' })
  assert.ok(out.gaps.some(row => row.label.includes('太宽')))
})

test('第一批视频按 3:3:3:1 给四条，同城才有本地条', () => {
  const local = diagnosePositioning({
    ...base,
    target: '北京高二物理 40–60 分',
    entry: '期中卷丢分最多的一块',
    fear: '怕补了没起色',
    notDo: '外地',
  })
  assert.equal(local.firstVideos.length, 4)
  assert.deepEqual(local.firstVideos.map(row => row.angle), ['考情', '科目', '家庭', '本地'])
  assert.ok(local.firstVideos[0].text.includes('北京'))

  const online = diagnosePositioning({
    ...base,
    city: '线上',
    target: '高一化学 60 分',
    entry: '物质的量',
    fear: '怕补了没用',
    notDo: '外地',
  })
  assert.equal(online.firstVideos.length, 4)
  assert.ok(!online.firstVideos.some(row => row.angle === '本地'))
  assert.ok(online.pitfalls.some(row => row.includes('同城')))
})

test('切入点建议、定位一句话、家长原话解析', () => {
  const rows = entrySuggestions(base)
  assert.ok(rows.length >= 3)
  assert.ok(rows.some(row => row.includes('期中 58 分')))
  const sentence = positioningSentence({ city: '北京', grade: '高二', subject: '物理', target: '期中掉队的家长', entry: '期中卷' })
  assert.match(sentence, /我是北京高二物理老师/)
  assert.match(sentence, /期中掉队的家长/)
  assert.match(sentence, /期中卷/)
  assert.deepEqual(parsePains('期中 58 分还能补吗，物质的量听不懂；上课走神'), ['期中 58 分还能补吗', '物质的量听不懂', '上课走神'])
})

test('城市写成「北京；线上」仍算同城，句子里只取城市名', () => {
  const list = suggestTargets({ ...base, city: '北京；线上' })
  assert.match(list[0].value, /^北京/)
  const sentence = positioningSentence({ city: '北京；线上', grade: '高二', subject: '物理', target: '期中掉队的家长', entry: '期中卷' })
  assert.match(sentence, /我是北京高二物理老师/)
  const diagnosis = diagnosePositioning({
    ...base,
    city: '北京；线上',
    pains: ['期中 58 分还能补吗', '物质的量听不懂'],
    target: '北京高二物理 40–60 分',
    entry: '期中卷',
    fear: '怕没起色',
    notDo: '外地',
  })
  assert.ok(diagnosis.firstVideos.some(row => row.angle === '本地'))
})
