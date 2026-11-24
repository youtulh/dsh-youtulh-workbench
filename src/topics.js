// 做内容：先出 30 个选题草稿让人勾，再给勾中的每一条生成口播（标题 + 稿子 + 标签）。
// 两段都可以用模型；没有模型就用本地模板拼，保证页面永远有东西可用。
import { currentLang, tr } from './i18n.js'
import { SCRIPT_STRUCTURE, STYLE_RULES, styleBlock } from './style-guide.js'

const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

function settingBlock(state) {
  const p = state?.positioning ?? {}
  const who = [p.subject, p.grade, p.city].filter(Boolean).join(' · ')
  const rows = [['教什么', who], ['只做', p.only], ['不做', p.notDo], ['说法', p.voice], ['红线', p.redline]]
    .filter(([, value]) => typeof value === 'string' && value.trim())
  return rows.length ? `\n我的设定：\n${rows.map(([key, value]) => `- ${key}：${value.trim()}`).join('\n')}` : ''
}

// ---- 选题 ----

export function topicsPrompt(state, count = 30, lessons = '') {
  const pains = (state?.painPoints ?? []).slice(0, 20)
  const system = `你是给补课老师排选题的编辑。老师要做短视频（口播），你帮他列出 ${count} 个能直接拍成视频的选题。
${settingBlock(state)}${pains.length ? `\n家长常愁的（都要用上，别浪费）：${pains.join('、')}` : ''}

规则：
- 每个选题一句话，12 到 24 字，像家长会搜的词，不用「干货」「秘籍」「必看」
- 选题要圈住具体的人：偏科生、开学掉队、只差最后一章、艺考生、转学生……越具体越好
- 最好的选题来自家长的原话：私信里怎么说、评论区怎么问，就照着那个句子改
- 角度要散开：基础薄弱、分数焦虑、方法、时间形式、具体知识点、家长误区、老师视角，各占一部分
- 不重复、不换皮同一个意思${lessons}
- 不承诺提分、不报价

${STYLE_RULES.split('\n').slice(1, 5).join('\n')}

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
  '偏科的孩子，多半卡在{pain}',
  '只差{pain}这一块，别的都还行',
  '转学过来的孩子，最容易在{pain}上掉队',
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

export function scriptPrompt(state, topic, lessons = '') {
  const pains = (state?.painPoints ?? []).slice(0, 8)
  const system = `你是给补课老师写短视频口播的编辑。老师给了你一个选题，你写一条能直接拍的口播视频。
${settingBlock(state)}${pains.length ? `\n家长常愁的：${pains.join('、')}` : ''}

规则：
- 标题 1 个：具体、有钩子，不超过 24 字，用家长会说的话
- 口播稿 45 到 60 秒，一句话一行、按气口断句
- 标签 5 个，不带 # 号，中文，含科目、年级、家长关心的词
- 不承诺提分、不说包过、不报价格、不编造孩子的情况
${styleBlock()}
${SCRIPT_STRUCTURE.split('\n')[0]}: 严格按上面这个五段结构写，五段都要有。${lessons}

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

/** 没模型时的一条完整口播：严格按他讲的五段结构拼，短句、口语、具体动作。 */
export function localScript(state, topic) {
  const p = state?.positioning ?? {}
  const who = `${text(p.grade, 10)}${text(p.subject, 10)}`.trim()
  const lines = [
    // 1 场景提问
    tr('我不知道咱们家里边有没有这样的情况：'),
    `${topic}。`,
    // 2 破旧认知
    tr('很多家长第一反应是孩子不努力，或者天赋不行。'),
    tr('其实都不是。'),
    // 3 立一个能听懂的说法
    who ? tr('带{who}这些年，我发现掉队基本是同一件事：前面那一块没真正过。', { who }) : tr('这些年我发现掉队基本是同一件事：前面那一块没真正过。'),
    tr('就像盖房子，地基缺一块，上面越盖越歪。'),
    // 4 三条能落地的动作
    tr('所以别急着加量，先做三件事。'),
    tr('第一，把这次丢分的题找出来，看看是哪一章。'),
    tr('第二，让他在不看答案的情况下，把那一章的基础题重做一遍。'),
    tr('第三，做完让他讲给你听，讲得清楚才算会了。'),
    // 5 复述 + 一个动作
    tr('这三件事做完，你大概就知道孩子卡在哪了。'),
    tr('想知道具体卡在哪一章，私信我「诊断」两个字。'),
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
