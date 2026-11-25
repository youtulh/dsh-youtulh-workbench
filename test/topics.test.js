import assert from 'node:assert/strict'
import { test } from 'node:test'
import { improvePrompt, localScript, localTopics, normalizeBrief, normalizeImprove, normalizeScript, normalizeTopics, scriptPrompt, topicsPrompt, variantsPrompt } from '../src/topics.js'

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

test('本地口播按六段结构：场景提问 → 接情绪 → 破旧认知 → 说法 → 讲 why → 引导', () => {
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
  assert.match(system, /六段/)
  const topics = topicsPrompt(state, 30)
  assert.match(topics.system, /家长的原话/)
})

test('经验块会拼进选题和口播 prompt', async () => {
  const { scriptPrompt, topicsPrompt } = await import('../src/topics.js')
  const lessons = '\n经验（照这个来）：\n- 「偏科的孩子卡在哪」私信 6'
  assert.match(scriptPrompt(state, '偏科', lessons).system, /偏科的孩子卡在哪/)
  assert.match(topicsPrompt(state, 30, lessons).system, /偏科的孩子卡在哪/)
  // 三个版本也要吃到经验块，不然「越用越好」只到选题这一层
  const { variantsPrompt } = await import('../src/topics.js')
  assert.match(variantsPrompt(state, '偏科', lessons).system, /偏科的孩子卡在哪/)
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

test('一个选题出三个版本：标题和开头各不相同，本地兜底也能出 3 条', async () => {
  const { localVariants, normalizeVariants } = await import('../src/topics.js')
  const list = localVariants(state, '偏科的孩子，多半卡在物质的量')
  assert.equal(list.length, 3)
  assert.equal(new Set(list.map(item => item.title)).size, 3)
  assert.equal(new Set(list.map(item => item.script.split('\n')[0])).size >= 2, true)
  assert.ok(list.every(item => item.script.includes('先说结论')))

  const normalized = normalizeVariants({ variants: [
    { title: 'a', script: 'x' }, { title: '', script: '' }, { title: 'b', script: 'y' }, { title: 'c', script: 'z' }, { title: 'd', script: 'w' },
  ] })
  assert.equal(normalized.length, 3)
  assert.deepEqual(normalized.map(item => item.title), ['a', 'b', 'c'])
  // 页面上靠这个标 A/B/C，别三版全写成 A
  assert.deepEqual(normalized.map(item => item.variant), ['A', 'B', 'C'])
  assert.deepEqual(list.map(item => item.variant), ['A', 'B', 'C'])
})

test('按提示改：只认一句要求和 1 到 3 条原稿', () => {
  const got = normalizeImprove({
    topic: '  期中 58 分，先补哪一块  ',
    note: '  开头别报分数\n压到 40 秒  ',
    variants: [
      { title: 'a', script: 'x' },
      { title: '', script: '' },
      { title: 'b', script: 'y' },
      { title: 'c', script: 'z' },
      { title: 'd', script: 'w' },
    ],
  })
  assert.equal(got.topic, '期中 58 分，先补哪一块')
  assert.equal(got.note, '开头别报分数 压到 40 秒')
  assert.deepEqual(got.variants.map(row => row.title), ['a', 'b', 'c'])
  assert.equal(normalizeImprove({ note: '   ' }).note, '')
  assert.equal(normalizeImprove({ note: '改'.repeat(300) }).note.length, 200)
  assert.deepEqual(normalizeImprove(null).variants, [])
})

test('改稿 prompt：带上老师的要求和原稿，不让他从零重写', () => {
  const variants = [
    { title: '期中 58 分还能补吗', script: '第一行\n第二行', tags: [] },
    { title: '别急着报班', script: '第三行', tags: [] },
  ]
  const prompt = improvePrompt(state, '期中 58 分，先补哪一块', variants, '开头别报分数，压到 40 秒')
  assert.match(prompt.user, /老师的要求：开头别报分数，压到 40 秒/)
  assert.match(prompt.user, /\[A\] 期中 58 分还能补吗/)
  assert.match(prompt.user, /\[B\] 别急着报班/)
  assert.match(prompt.system, /不要推翻重写/)
  assert.match(prompt.system, /红线/)
  assert.match(prompt.system, /只输出 JSON/)
  assert.match(prompt.system, /\{"variants"/)
})

test('选题去重与配比：换皮的去掉，缺的类补上，四类都要有', async () => {
  const { normalizeTopicEntries, fillTopicAngles, similarTopic } = await import('../src/topics.js')

  // 两句只差一个字，算换皮
  assert.equal(similarTopic('高二物理听不懂，先看受力分析', '高二物理听不懂，先看受力分析题'), true)
  assert.equal(similarTopic('孩子一写作业就看手机', '期中物理掉到及格线'), false)

  const entries = normalizeTopicEntries({ topics: [
    { text: '高二物理听不懂，先看受力分析', angle: '知识点' },
    { text: '高二物理听不懂，先看受力分析题', angle: '知识点' },
    '孩子一写作业就看手机',
    { text: '期中物理掉到及格线', angle: '考情' },
  ] }, 10)
  assert.equal(entries.length, 3)
  assert.equal(entries.find(row => row.text === '孩子一写作业就看手机').angle, '家庭')

  const filled = fillTopicAngles(entries, state, 10)
  assert.equal(filled.length, 10)
  const angles = new Set(filled.map(row => row.angle))
  for (const angle of ['知识点', '家庭', '考情', '本地']) assert.ok(angles.has(angle), angle)
  assert.equal(new Set(filled.map(row => row.text)).size, 10)
})

test('选题 prompt 要求每条带角度，只有四种角度', () => {
  const { system } = topicsPrompt(state, 10)
  assert.match(system, /angle/)
  assert.match(system, /知识点 \/ 家庭 \/ 考情 \/ 本地/)
  assert.match(system, /同一个意思只留一条/)
})

test('目标客户、切入点、最怕什么会进 prompt，并要求只写给她', async () => {
  const { scriptPrompt, topicsPrompt } = await import('../src/topics.js')
  const state = {
    positioning: {
      subject: '物理', grade: '高二', city: '北京',
      target: '北京高二物理 40–60 分、家长急但没方向',
      entry: '期中卷丢分最多的一块',
      fear: '怕补了没起色',
    },
    painPoints: ['期中 58 分还能补吗'],
  }
  const script = scriptPrompt(state, '偏科').system
  assert.match(script, /北京高二物理 40–60 分/)
  assert.match(script, /期中卷丢分最多的一块/)
  assert.match(script, /怕补了没起色/)
  assert.match(script, /只面向这一类家长/)
  assert.match(topicsPrompt(state, 10).system, /北京高二物理 40–60 分/)
})

test('normalizeBrief：压成一行、去空、截断，空值当成没写', () => {
  assert.equal(normalizeBrief('  讲一道期中卷上最常丢分的题  '), '讲一道期中卷上最常丢分的题')
  assert.equal(normalizeBrief('第一行\n第二行'), '第一行 第二行')
  assert.equal(normalizeBrief('   '), '')
  assert.equal(normalizeBrief(undefined), '')
  assert.equal(normalizeBrief(42), '')
  assert.equal(normalizeBrief('长'.repeat(200)).length, 120)
})

test('按提示写时不另起选题，提示原样进 user', () => {
  const brief = '家长总问来得及吗，我想正面回一次'
  const prompt = variantsPrompt(state, brief, '', brief)
  assert.match(prompt.user, /我的要求：家长总问来得及吗/)
  assert.doesNotMatch(prompt.user, /^选题：/)
  assert.match(prompt.system, /主题由老师直接给定/)
  assert.equal(prompt.user.includes('我的要求'), true)
})

test('不给提示时还是照选题写，system 不多那句话', () => {
  const prompt = variantsPrompt(state, '期中 58 分，先补哪一块')
  assert.equal(prompt.user, '选题：期中 58 分，先补哪一块')
  assert.doesNotMatch(prompt.system, /主题由老师直接给定/)
})


test('内容 prompt 把引流做成硬要求：选题能带动作，口播结尾留轻动作', () => {
  assert.match(topicsPrompt(state, 10).system, /轻动作/)
  assert.match(topicsPrompt(state, 10).system, /不要直接写「加微信」/)
  assert.match(scriptPrompt(state, '期中 58 分先补哪').system, /引流动作/)
})
