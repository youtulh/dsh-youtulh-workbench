// 做内容：先出 30 个选题草稿让人勾，再给勾中的每一条生成口播（标题 + 稿子 + 标签）。
// 两段都可以用模型；没有模型就用本地模板拼，保证页面永远有东西可用。
import { currentLang, tr } from './i18n.js'

const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

function settingBlock(state) {
  const p = state?.positioning ?? {}
  const who = [p.subject, p.grade, p.city].filter(Boolean).join(' · ')
  const rows = [['教什么', who], ['只做', p.only], ['不做', p.notDo], ['说法', p.voice], ['红线', p.redline]]
    .filter(([, value]) => typeof value === 'string' && value.trim())
  return rows.length ? `\n我的设定：\n${rows.map(([key, value]) => `- ${key}：${value.trim()}`).join('\n')}` : ''
}

// ---- 选题 ----

export function topicsPrompt(state, count = 30) {
  const pains = (state?.painPoints ?? []).slice(0, 20)
  const system = `你是给补课老师排选题的编辑。老师要做短视频（口播），你帮他列出 ${count} 个能直接拍成视频的选题。
${settingBlock(state)}${pains.length ? `\n家长常愁的（都要用上，别浪费）：${pains.join('、')}` : ''}

规则：
- 每个选题一句话，12 到 24 字，像家长会搜的词，不用「干货」「秘籍」「必看」
- 角度要散开：基础薄弱、分数焦虑、方法、时间形式、具体知识点、家长误区、老师视角，各占一部分
- 不重复、不换皮同一个意思
- 不承诺提分、不报价

只输出 JSON：{"topics":["…","…"]}`
  return { system, user: `请给出 ${count} 个选题。` }
}

export function normalizeTopics(json, max = 40) {
  const list = (Array.isArray(json?.topics) ? json.topics : []).map(row => text(row, 40)).filter(Boolean)
  return [...new Set(list)].slice(0, max)
}

// 每个句式都必须带 {pain}，否则痛点不同拼出来的标题会重复
const FRAMES = [
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

/** 没有模型时的选题：把痛点 × 句式摊开，去重后尽量凑够 count 条。 */
export function localTopics(state, count = 30) {
  const p = state?.positioning ?? {}
  const who = `${text(p.grade, 10)}${text(p.subject, 10)}`.trim() || tr('这门课')
  const pains = (state?.painPoints ?? []).filter(Boolean)
  const seeds = pains.length ? pains : [tr('基础不牢'), tr('上课听得懂、做题就废'), tr('期中掉分')]
  const out = []
  for (const frame of FRAMES) {
    for (const pain of seeds) {
      const title = frame.replaceAll('{pain}', pain).replaceAll('{who}', who)
      if (title.length <= 40 && !out.includes(title)) out.push(title)
      if (out.length >= count) return out
    }
  }
  return out
}

// ---- 口播 ----

export function scriptPrompt(state, topic) {
  const pains = (state?.painPoints ?? []).slice(0, 8)
  const system = `你是给补课老师写短视频口播的编辑。老师给了你一个选题，你写一条能直接拍的口播视频。
${settingBlock(state)}${pains.length ? `\n家长常愁的：${pains.join('、')}` : ''}

规则：
- 标题 1 个：具体、有钩子，不超过 24 字，用家长会说的话
- 口播稿 45 到 60 秒：一句话一行、按气口断句；开头 3 秒就抓人；中段说清楚一件事；结尾只留一个动作（私信「诊断」或加微信）
- 标签 5 个，不带 # 号，中文，含科目、年级、家长关心的词
- 不承诺提分、不说包过、不报价格、不编造孩子的情况

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

/** 没模型时的一条完整口播：标题就用选题，稿子按「接住 → 说清 → 引导」三段拼。 */
export function localScript(state, topic) {
  const p = state?.positioning ?? {}
  const who = `${text(p.grade, 10)}${text(p.subject, 10)}`.trim()
  const lines = [
    `${topic}。`,
    tr('这句话我每天都能听到。'),
    who ? tr('带{who}的这些年，我发现一个规律：', { who }) : tr('这些年我发现一个规律：'),
    tr('孩子不是不努力，是前面那一块没真正过。'),
    tr('所以第一步不是加量，是先弄清楚卡在哪一章。'),
    tr('想知道孩子卡在哪，私信「诊断」两个字。'),
  ]
  return {
    title: topic,
    script: lines.join('\n'),
    tags: [p.subject, p.grade, p.city, tr('家长必看'), tr('学习方法')].filter(Boolean).slice(0, 5),
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
