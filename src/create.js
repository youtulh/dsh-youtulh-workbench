// 做内容：老师只给一句话，返回「标题 / 口播文案 / 标签」三组候选，让人挑。
// 只做口播视频，所以没有封面、配图和分镜这几件事。
import { currentLang, tr } from './i18n.js'

const MAX_TITLES = 3

function settingBlock(state) {
  const p = state?.positioning ?? {}
  const who = [p.subject, p.grade, p.city].filter(Boolean).join(' · ')
  const rows = [['教什么', who], ['只做', p.only], ['不做', p.notDo], ['说法', p.voice], ['红线', p.redline]]
    .filter(([, value]) => typeof value === 'string' && value.trim())
  return rows.length ? `\n我的设定（违反就得重写）：\n${rows.map(([key, value]) => `- ${key}：${value.trim()}`).join('\n')}` : ''
}

export function createPrompts(state, hint) {
  const pains = (state?.painPoints ?? []).slice(0, 12)
  const system = `你是给补课老师写短视频口播的编辑。老师只给一句话，你要给出能直接拍、直接发的东西。
${settingBlock(state)}${pains.length ? `\n家长常愁的（挑一个当钩子，不要全塞进去）：${pains.join('、')}` : ''}

规则：
- 标题 ${MAX_TITLES} 个：具体、有钩子，不超过 24 字；用家长会说的话，不用「干货」「秘籍」「必看」这类词；不要承诺效果
- 口播文案 2 版：第一版「直给版」45 秒左右，一上来就给判断；第二版「故事版」60 秒左右，从一个具体的孩子或一次考试讲起；都是一句话一行、按气口断句，开头 3 秒就要抓人
- 标签 2 组：每组 5 个，不带 # 号，中文，包含科目、年级和家长关心的词；不要堆生僻词
- 不承诺提分、不说包过、不报价格、不编造孩子的情况；老师没说的事实不许补

只输出一个 JSON 对象，不要别的内容：
{"titles":["标题1","标题2","标题3"],"scripts":[{"label":"直给版","text":"一句话一行"},{"label":"故事版","text":"一句话一行"}],"tags":[["标签1","标签2","标签3","标签4","标签5"],["标签1","标签2","标签3","标签4","标签5"]]}`
  return { system, user: `<老师给的提示>${String(hint ?? '').slice(0, 600)}</老师给的提示>` }
}

const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/** 模型输出不可信：只认三组字段，数量按上限截断，缺的给空数组。 */
export function normalizeCreative(json) {
  const titles = (Array.isArray(json?.titles) ? json.titles : []).map(row => text(row, 60)).filter(Boolean).slice(0, MAX_TITLES)
  const scripts = (Array.isArray(json?.scripts) ? json.scripts : [])
    .map((row, index) => ({ label: text(row?.label, 12) || (index === 0 ? tr('直给版') : tr('故事版')), text: text(row?.text, 1200) }))
    .filter(row => row.text)
    .slice(0, 2)
  const tags = (Array.isArray(json?.tags) ? json.tags : [])
    .map(group => (Array.isArray(group) ? group : []).map(row => text(row, 20).replace(/^#+/, '').trim()).filter(Boolean).slice(0, 6))
    .filter(group => group.length)
    .slice(0, 2)
  return { titles, scripts, tags }
}

/**
 * 没有模型时的兜底：用提示当标题、用提示写一段结构化的口播，标签从设定和痛点里拼。
 * 宁可给一份朴素能改的稿子，也不要卡在转圈上。
 */
export function fallbackCreative(state, hint) {
  const tip = text(hint, 40) || tr('这一条还没想好讲什么')
  const p = state?.positioning ?? {}
  const pains = (state?.painPoints ?? []).slice(0, 4)
  const word = [p.subject, p.grade].filter(Boolean).join('') || tr('这门课')
  const titles = [
    `${tip}——先说清楚一件事`,
    `${p.grade ?? ''}${p.subject ?? ''}的家长，最容易被这件事绕进去`.trim(),
    `孩子${tip}，问题多半不在刷题上`,
  ].map(row => text(row, 60)).filter(Boolean)
  const script = [
    tr('先说一个很多家长都会遇到的情况。'),
    `${tip}`,
    tr('大多数人第一反应是让孩子多刷题。'),
    tr('但在{word}上，掉队往往不是练得少，是前面那一块没真正过。', { word }),
    tr('所以第一步不是加量，是先弄清楚卡在哪一章。'),
    tr('想知道孩子卡在哪，私信「诊断」两个字。'),
  ].join('\n')
  const tags = [
    [p.subject, p.grade, p.city, ...pains].filter(Boolean).slice(0, 5),
    ['家长必看', '期中', '学习方法', '高中', '诊断'].slice(0, 5),
  ]
  return normalizeCreative({
    titles,
    scripts: [{ label: tr('直给版'), text: script }, { label: tr('故事版'), text: `${script}\n${tr('每一句都对应一个具体的场景，拍的时候照着一句一句念。')}` }],
    tags,
  })
}

export function creativePlan(creative, pick) {
  const lines = []
  const title = creative.titles[pick?.title ?? 0]
  const script = creative.scripts[pick?.script ?? 0]
  const tags = creative.tags[pick?.tags ?? 0] ?? []
  if (title) lines.push(`【标题】${title}`)
  if (script) lines.push(`【口播文案 · ${script.label}】\n${script.text}`)
  if (tags.length) lines.push(`【标签】${tags.map(tag => `#${tag}`).join(' ')}`)
  return `${lines.join('\n\n')}\n`
}

export function creativeSummary(creative) {
  return currentLang() === 'en'
    ? `${creative.titles.length} titles · ${creative.scripts.length} scripts · ${creative.tags.length} tag sets`
    : `${creative.titles.length} 个标题 · ${creative.scripts.length} 版口播 · ${creative.tags.length} 组标签`
}
