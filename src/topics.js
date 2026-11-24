// 做内容：先出 30 个选题草稿让人勾，再给勾中的每一条生成口播（标题 + 稿子 + 标签）。
// 两段都可以用模型；没有模型就用本地模板拼，保证页面永远有东西可用。
import { currentLang, tr } from './i18n.js'
import { RED_LINES, styleBlock } from './style-guide.js'

const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

function settingBlock(state) {
  const p = state?.positioning ?? {}
  const who = [p.subject, p.grade, p.city].filter(Boolean).join(' · ')
  const rows = [
    ['教什么', who], ['先抓哪类家长', p.target], ['从哪切进去', p.entry], ['她最怕什么', p.fear],
    ['只做', p.only], ['不做', p.notDo], ['说法', p.voice], ['红线', p.redline],
  ].filter(([, value]) => typeof value === 'string' && value.trim())
  if (!rows.length) return ''
  const targeting = p.target
    ? `\n这一阶段只面向这一类家长：${p.target.trim()}。每条内容都要让她觉得「说的就是我家」；别的人群最多偶尔带一条。`
    : ''
  return `\n我的设定：\n${rows.map(([key, value]) => `- ${key}：${value.trim()}`).join('\n')}${targeting}`
}

// ---- 选题 ----

export function topicsPrompt(state, count = 10, lessons = '') {
  const pains = (state?.painPoints ?? []).slice(0, 20)
  const system = `你是给补课老师排选题的编辑。老师要做短视频（口播），你帮他列出 ${count} 个能直接拍成视频的选题。
${settingBlock(state)}${pains.length ? `\n家长常愁的（都要用上，别浪费）：${pains.join('、')}` : ''}

先想清楚人，再出题。家长不是一个群体，至少分这五类，每类的痛点完全不同：
- 差生家长：孩子已经放弃、家长也快放弃了，最怕「花钱也没用」
- 中等生家长：分数卡在中间上不去，最怕「一直原地踏步」
- 偏科生家长：一科拖后腿，最怕「就这一科毁了总分」
- 艺考/转学/复读家长：时间紧、底子空，最怕「来不及」
- 尖子生家长：想稳住、想冲重点，最怕「关键时刻掉链子」

选题公式：**具体人群 + 具体场景（几分/哪一章/哪个时间点）+ 一句反常识或扎心的判断**
好例子：期中 58 分的初三娃，第一步不是刷题 / 偏科的孩子，多半卡在某一章没接上 / 补课报了一堆，孩子反而更不想学
坏例子（一律不要）：如何提高化学成绩 / 学好化学的五个方法 / 家长必看 / 初中化学怎么学

规则（按内容配比排，3:3:3:1，顺序别乱）：
- 每个选题一句话，12 到 24 字，像家长会搜的词，不用「干货」「秘籍」「必看」
- 前 30%（约 3 条）讲学科本身：某个知识点、某类题、某一章怎么过
- 接下来 30%（约 3 条）讲家庭教育：习惯、手机、亲子沟通、心态 —— 不讲课，只讲家里的事
- 接下来 30%（约 3 条）讲考试和考情：期中期末、分数线、命题趋势、志愿
- 最后 10%（约 1 条）讲本地：本地的学校、考试节奏、升学路径
- 五类家长至少每一类都覆盖到 2 条以上
- 最好的选题来自家长的原话：私信里怎么说、评论区怎么问，就照着那个句子改
- 不重复、不换皮同一个意思${lessons}
- 红线：${RED_LINES.slice(0, 2).join('；')}；不报价

出完自己检查一遍：把「换成任何科目、任何年级都成立」的题删掉重写；同一个意思只留一条；凑够 ${count} 条再输出。

每条选题都要标一个 angle，只能是这四个之一：知识点 / 家庭 / 考情 / 本地。

只输出 JSON：{"topics":[{"text":"一句话选题","angle":"知识点"}]}`
  return { system, user: `请给出 ${count} 个选题。` }
}

export function normalizeTopics(json, max = 40) {
  const list = (Array.isArray(json?.topics) ? json.topics : []).map(row => text(row, 40)).filter(Boolean)
  return [...new Set(list)].slice(0, max)
}

// 每个句式都必须带 {pain}，否则痛点不同拼出来的标题会重复
// 学科类句式：必须带 {pain}，否则不同痛点拼出来会重复
const SUBJECT_FRAMES = [
  '{pain}，先补哪一块',
  '{who}：{pain}到底难在哪',
  '孩子说听不懂，真的只是{pain}吗',
  '{who}期中掉队，多半是{pain}没过',
  '为什么{who}上课听懂了，一到{pain}就废',
  '{pain}，刷题还是先补基础',
  '家长最容易忽略的一件事：{pain}',
  '{who}分数卡在中游，{pain}是那道坎',
  '补{pain}，一个假期够不够',
  '别急着报班，先看孩子是不是{pain}',
  '{pain}不是笨，是前面那一块没接上',
  '到了{pain}这一章，孩子开始听不懂了',
]

// 家庭教育：不讲课，讲家里的事
const FAMILY_FRAMES = [
  '孩子写作业老走神，先管手机还是先管计划',
  '一写作业就吵架，问题多半不在孩子',
  '补课报了一堆，孩子越来越不想学',
  '孩子说「反正我也学不会」，怎么接这句话',
  '初中了还盯着写作业，要不要放手',
  '孩子考完就哭，先说哪句话',
  '暑假一开始就躺平，家长做三件事就够',
  '要不要给孩子手机，先说清这三条',
]

// 考试与考情
const EXAM_FRAMES = [
  '{who}期中分数出来，先看哪三列',
  '这次比上次低 20 分，不一定是退步',
  '一模二模的差别，家长得知道',
  '{who}中考前三个月，别做这三件事',
  '分数卡在普高线，志愿怎么填',
  '期末前的两周，抓什么最有效',
]

const localExam = (who) => EXAM_FRAMES.map(frame => frame.replaceAll('{who}', who))

/** 四类选题池：知识点 / 家庭 / 考情 / 本地。本地没有（纯线上）就是空数组。 */
export function localTopicPools(state) {
  const p = state?.positioning ?? {}
  const who = `${text(p.grade, 10)}${text(p.subject, 10)}`.trim() || tr('这门课')
  const city = text(p.city, 12)
  const pains = (state?.painPoints ?? []).filter(Boolean)
  const seeds = pains.length ? pains : [tr('基础不牢'), tr('上课听得懂、做题就废'), tr('期中掉分')]

  const subject = []
  for (const frame of SUBJECT_FRAMES) {
    for (const pain of seeds) {
      const title = frame.replaceAll('{pain}', pain).replaceAll('{who}', who)
      if (title.length <= 40 && !subject.includes(title)) subject.push(title)
    }
  }
  const family = FAMILY_FRAMES.slice()
  const exam = localExam(who)
  const local = /线上|全国|网课/.test(city) || !city
    ? []
    : [`${city}的${text(p.grade, 8)}家长，最常问我的三个问题`, `${city}${text(p.subject, 8)}，学校讲到哪了`, `${city}中考分数线，家长容易看错哪个数`]
  return { 知识点: subject, 家庭: family, 考情: exam, 本地: local }
}

/** 没有模型时的选题：按 3:3:3:1 配额拼，凑够 count 条。 */
export function localTopics(state, count = 10) {
  const { 知识点: subject, 家庭: family, 考情: exam, 本地: local } = localTopicPools(state)
  const quota = [Math.round(count * 0.3), Math.round(count * 0.3), Math.round(count * 0.3), Math.max(1, count - Math.round(count * 0.9))]
  const pick = (list, n) => list.slice(0, n)
  const out = [...pick(subject, quota[0]), ...pick(family, quota[1]), ...pick(exam, quota[2]), ...pick(local, quota[3])]
  // 不够就回填学科类，保证页面上有 count 条可选
  for (const title of [...subject, ...family, ...exam, ...local]) {
    if (out.length >= count) break
    if (!out.includes(title)) out.push(title)
  }
  return out.slice(0, count)
}

// ---- 选题的角度与去重 ----
// 模型经常把同一句话说三遍（换皮），也经常把四类写成一样多。这两件事在这里兜底。

export const TOPIC_ANGLES = ['知识点', '家庭', '考情', '本地']
const ANGLE_ALIAS = {
  知识点: '知识点', 学科: '知识点', 方法: '知识点', 干货: '知识点',
  家庭: '家庭', 习惯: '家庭', 亲子: '家庭', 沟通: '家庭',
  考情: '考情', 考试: '考情', 分数: '考情',
  本地: '本地', 同城: '本地', 地区: '本地',
}

function angleOf(value) {
  const key = String(value ?? '').trim()
  return ANGLE_ALIAS[key] ?? ''
}

/** 按字面猜一下角度（模型没给的时候用）。 */
export function guessTopicAngle(title) {
  const row = String(title ?? '')
  if (/手机|写作业|拖拉|沟通|吵架|不想学|躺平|叛逆|盯着|放手|家里/.test(row)) return '家庭'
  if (/期中|期末|一模|二模|中考|高考|分数线|志愿|命题|考试|分数出来/.test(row)) return '考情'
  return '知识点'
}

const bigrams = (value) => {
  const chars = String(value ?? '').replace(/[^\u4e00-\u9fa5a-z0-9]/gi, '')
  const out = new Set()
  for (let i = 0; i < chars.length - 1; i++) out.add(chars.slice(i, i + 2))
  return out
}

/** 两条选题是不是同一个意思（2-gram 重叠超过 0.6 就算换皮）。 */
export function similarTopic(a, b) {
  const left = bigrams(a)
  const right = bigrams(b)
  if (!left.size || !right.size) return String(a).trim() === String(b).trim()
  let overlap = 0
  for (const gram of left) if (right.has(gram)) overlap++
  return overlap / (left.size + right.size - overlap) > 0.6
}

/**
 * 模型的选题输出归一化：兼容纯字符串和 {text, angle}，
 * 同一意思的只留第一条，角度按模型给的或字面猜。
 */
export function normalizeTopicEntries(json, max = 40) {
  const raw = Array.isArray(json?.topics) ? json.topics : []
  const out = []
  for (const row of raw) {
    const value = typeof row === 'string' ? row : (row && typeof row === 'object' ? row.text : '')
    const title = text(value, 40)
    if (!title) continue
    if (out.some(item => item.text === title || similarTopic(item.text, title))) continue
    const angle = (row && typeof row === 'object' ? angleOf(row.angle) : '') || guessTopicAngle(title)
    out.push({ text: title, angle })
  }
  return out.slice(0, max)
}

/** 缺哪一类就从本地池里补，保证四类都有，最后凑够 count 条。 */
export function fillTopicAngles(entries, state, count = 10) {
  const pools = localTopicPools(state)
  const out = entries.slice(0, count)
  const has = title => out.some(item => item.text === title || similarTopic(item.text, title))
  const target = Math.max(1, Math.round(count * 0.2))
  for (const angle of TOPIC_ANGLES) {
    let filled = out.filter(item => item.angle === angle).length
    for (const title of pools[angle] ?? []) {
      if (filled >= target || out.length >= count) break
      if (has(title)) continue
      out.push({ text: title, angle })
      filled++
    }
  }
  for (const title of TOPIC_ANGLES.flatMap(angle => pools[angle] ?? [])) {
    if (out.length >= count) break
    if (has(title)) continue
    out.push({ text: title, angle: guessTopicAngle(title) })
  }
  return out.slice(0, count)
}

// ---- 口播 ----

export function scriptPrompt(state, topic, lessons = '') {
  const pains = (state?.painPoints ?? []).slice(0, 8)
  const system = `你是给补课老师写短视频口播的编辑。老师给了你一个选题，你写一条能直接拍的口播视频。
${settingBlock(state)}${pains.length ? `\n家长常愁的：${pains.join('、')}` : ''}

写之前先定一件事：这条是拍给哪一类家长看的（差生家长 / 中等生 / 偏科生 / 艺考转学 / 尖子生）。开头第一句就得让他觉得「说的就是我家」，别写成说给所有家长听的话。

规则：
- 标题 1 个：具体、有钩子，不超过 24 字，用家长会说的话，带上人群或分数或地名
- 口播稿 45 到 60 秒，一句话一行、按气口断句
- 标签 5 个，不带 # 号，中文，含科目、年级，再加一个地区词或考试词
${cityRule(state)}
${styleBlock()}
严格按上面那个六段结构写，六段都要有，顺序不要换。${lessons}

只输出 JSON：{"title":"标题","script":"一句话一行","tags":["标签1","标签2","标签3","标签4","标签5"]}`
  return { system, user: `选题：${topic}` }
}

export function normalizeScript(json) {
  return {
    title: text(json?.title, 60),
    script: text(json?.script, 2000),
    tags: (Array.isArray(json?.tags) ? json.tags : []).map(row => text(row, 20).replace(/^#+/, '')).filter(Boolean).slice(0, 6),
  }
}

/** 没模型时的一条完整口播：严格按六段结构拼，短句、口语、具体动作、留钩子。 */
export function localScript(state, topic) {
  const p = state?.positioning ?? {}
  const who = `${text(p.grade, 10)}${text(p.subject, 10)}`.trim()
  const city = text(p.city, 12)
  const local = city && !/线上|全国|网课/.test(city)
  const lines = [
    // 1 场景提问
    tr('我不知道咱们家里边有没有这样的情况：'),
    `${topic}？`,
    // 结论句（5 秒内给人一个判断）
    tr('先说结论：这件事不是靠加量解决的。'),
    // 2 接住情绪
    tr('我特别理解你现在的心情 —— 钱花了、时间也搭进去了，看着孩子成绩不动，人是会急的。'),
    // 3 破旧认知
    tr('但很多家长第一反应是孩子不努力，或者天赋不行。'),
    tr('其实都不是。'),
    // 4 立一个能听懂的说法 + 具体场景
    local ? tr('在{city}带{who}这些年，我发现掉队基本是同一件事：前面那一块没真正过。', { city, who }) : (who ? tr('带{who}这些年，我发现掉队基本是同一件事：前面那一块没真正过。', { who }) : tr('这些年我发现掉队基本是同一件事：前面那一块没真正过。')),
    tr('就像盖房子，地基缺一块，上面越盖越歪。'),
    // 5 讲 why（占一半），只给一半 how
    tr('为什么会这样？因为新课一直在往前走，前面缺的那块没人回头补。'),
    tr('孩子上课听的是第三章，可他的第二章是空的，所以他只能靠背、靠套。'),
    tr('套不出来的时候，他就觉得是自己笨。这个念头一旦种下去，后面越补越慢。'),
    tr('所以别急着加量，先回头把那一块补上。'),
    tr('第一步，把这次丢分的题找出来，看看集中在哪一章。'),
    tr('第二步，让他在不看答案的情况下，把那一章的基础题重做一遍。'),
    tr('后面还有几步，得看孩子具体卡在哪，一句两句说不清。'),
    // 6 复述 + 动作
    tr('这两步做完，你大概就知道孩子卡在哪了。'),
    tr('想知道具体卡在哪一章、后面那几步怎么做，私信我「诊断」两个字。'),
  ]
  return {
    title: topic,
    script: lines.join('\n'),
    tags: [p.subject, p.grade, local ? city : '', tr('家长必看'), tr('学习方法')].filter(Boolean).slice(0, 5),
  }
}

export function creativeText({ title, script, tags }) {
  const lines = []
  if (title) lines.push(`【标题】${title}`)
  if (script) lines.push(`【口播文案】\n${script}`)
  if (tags?.length) lines.push(`【标签】${tags.map(tag => `#${tag}`).join(' ')}`)
  return `${lines.join('\n\n')}\n`
}

export const topicsLang = () => currentLang()

/** 同城规则：城市不是「线上」时，开头前两句要带地名，标签要带地区词。 */
export function cityRule(state) {
  const city = text(state?.positioning?.city, 20)
  if (!city || /线上|全国|网课/.test(city)) return '- 我做的是线上，不用刻意带地名'
  return `- 我做的是同城（${city}）：开头前两句里要带上「${city}」或本地学校名，标签里加一个地区词`
}

// ---- 一个选题出 3 个版本 ----

export function variantsPrompt(state, topic, lessons = '') {
  const base = scriptPrompt(state, topic, lessons)
  return {
    system: `${base.system}

这次要写 3 个版本，角度必须不一样，让人一眼能看出不是同一条：
- A 版：从分数/焦虑切入（先说分数、先说急）
- B 版：从具体知识点或场景切入（先说某一章、某类题）
- C 版：从家长误区或反常识切入（先说家长做错了什么）
三个版本的标题不能一样，开头第一句不能一样，但都要严格按上面的六段结构和红线写。

只输出 JSON：{"variants":[{"title":"…","script":"…","tags":["…"]},{"title":"…","script":"…","tags":["…"]},{"title":"…","script":"…","tags":["…"]}]}`,
    user: `选题：${topic}`,
  }
}

export function normalizeVariants(json) {
  const list = Array.isArray(json?.variants) ? json.variants : []
  return list.map(row => normalizeScript(row)).filter(row => row.title && row.script).slice(0, 3)
}

/** 没模型时的三个版本：换开场，其余照六段结构。 */
export function localVariants(state, topic) {
  const p = state?.positioning ?? {}
  const who = `${text(p.grade, 10)}${text(p.subject, 10)}`.trim()
  const city = text(p.city, 12)
  const local = city && !/线上|全国|网课/.test(city)
  const base = localScript(state, topic)
  const opens = [
    [tr('我不知道咱们家里边有没有这样的情况：'), `${topic}？`],
    [local ? tr('{city}的家长最近老问我一个问题：', { city }) : tr('这两天有三个家长问我同一个问题：'), `${topic}？`],
    [tr('很多家长一上来就问：怎么给孩子补？'), tr('先别急着补 —— '), `${topic}？`],
  ]
  const titles = [base.title, `${topic}（说清楚版）`, `${topic}（家长版）`]
  return opens.map((opening, index) => ({
    ...base,
    title: titles[index],
    script: [...opening, base.script.split('\n').slice(2).join('\n')].filter(Boolean).join('\n'),
  }))
}
