import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localScript, localTopics, normalizeScript, normalizeTopics, topicsPrompt } from '../src/topics.js'

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
  assert.match(one.script, /私信我「诊断」/)
  assert.equal(one.tags.every(tag => !tag.startsWith('#')), true)
})

test('normalizeScript：只认三个字段，标签去掉 #', () => {
  const one = normalizeScript({ title: 'T', script: 'A\nB', tags: ['#x', 'y', '', 1] })
  assert.equal(one.title, 'T')
  assert.equal(one.script, 'A\nB')
  assert.deepEqual(one.tags, ['x', 'y'])
})

test('本地口播按五段结构：场景提问 → 破旧认知 → 说法 → 三条动作 → 引导', () => {
  const one = localScript(state, '偏科的孩子，多半卡在物质的量')
  const lines = one.script.split('\n')
  assert.match(lines[0], /有没有这样的情况/)
  // 结论句要早，共情在方法前
  assert.match(one.script, /先说结论/)
  assert.match(one.script, /我特别理解你现在的心情/)
  assert.match(one.script, /其实都不是/)
  // 只给一半 how，留钩子
  assert.match(one.script, /第一步，/)
  assert.match(one.script, /第二步，/)
  assert.doesNotMatch(one.script, /第三步，/)
  assert.match(one.script, /后面还有几步/)
  assert.match(one.script, /私信我「诊断」/)
  // 不能有书面连接词和黑话
  assert.doesNotMatch(one.script, /首先|其次|综上所述|赋能|闭环|底层逻辑/)
})

test('口播 prompt 带上他的开头句式，选题 prompt 要求从家长原话里来', async () => {
  const { scriptPrompt, topicsPrompt } = await import('../src/topics.js')
  const { system } = scriptPrompt(state, '偏科的孩子')
  assert.match(system, /我不知道咱们家里边有没有这样的孩子/)
  assert.match(system, /五段/)
  const topics = topicsPrompt(state, 30)
  assert.match(topics.system, /家长的原话/)
})

test('经验块会拼进选题和口播 prompt', async () => {
  const { scriptPrompt, topicsPrompt } = await import('../src/topics.js')
  const lessons = '\n经验（照这个来）：\n- 「偏科的孩子卡在哪」私信 6'
  assert.match(scriptPrompt(state, '偏科', lessons).system, /偏科的孩子卡在哪/)
  assert.match(topicsPrompt(state, 30, lessons).system, /偏科的孩子卡在哪/)
})

test('课程要求：选题按 3:3:3:1、口播带八条红线、同城要带地名', async () => {
  const { cityRule, localTopics, scriptPrompt, topicsPrompt } = await import('../src/topics.js')
  const { RED_LINES, SCRIPT_STRUCTURE } = await import('../src/style-guide.js')

  // 红线八条，够覆盖课程 IP6
  assert.equal(RED_LINES.length, 8)
  assert.ok(RED_LINES.some(row => row.includes('分数承诺')))
  assert.ok(RED_LINES.some(row => row.includes('极限词')))

  // 六段结构：共情在方法前、只给一半 how
  assert.match(SCRIPT_STRUCTURE, /接住情绪/)
  assert.match(SCRIPT_STRUCTURE, /占一半以上/)
  assert.match(SCRIPT_STRUCTURE, /钩子/)

  // prompt 里带上红线
  const { system } = scriptPrompt(state, '偏科')
  assert.match(system, /平台红线/)
  assert.match(system, /提高 20 分/)

  // 选题分四类，且带配比说明
  const topics = topicsPrompt(state, 30).system
  assert.match(topics, /3:3:3:1/)
  assert.match(topics, /家庭教育/)
  assert.match(topics, /考试和考情/)

  // 同城：北京要带地名；线上不要求
  assert.match(cityRule({ positioning: { city: '北京' } }), /北京/)
  assert.match(cityRule({ positioning: { city: '线上' } }), /不用刻意带地名/)

  // 本地选题也能分出三类以上
  const list = localTopics(state, 30)
  assert.equal(list.length, 30)
  assert.ok(list.some(row => row.includes('写作业') || row.includes('手机')))
  assert.ok(list.some(row => row.includes('期中') || row.includes('一模') || row.includes('志愿')))
})

test('选题规则：五类家长、选题公式、反例、自检都写进 prompt', () => {
  const { system } = topicsPrompt(state, 30)
  assert.match(system, /差生家长/)
  assert.match(system, /偏科生家长/)
  assert.match(system, /选题公式/)
  assert.match(system, /如何提高化学成绩/)
  assert.match(system, /换成任何科目、任何年级都成立/)
})
