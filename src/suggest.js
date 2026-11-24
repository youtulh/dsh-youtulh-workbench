// 做内容页的「案例提示词」：先读人设，想几条家长真会问的问题，让人照着改写。
// 先本地拼（快、不花钱、断网也能用），接上模型时换成更像人话的一版。
import { currentLang } from './i18n.js'

const text = (value, max = 60) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/** 本地拼的示例：完全按设定和痛点拼，不猜。 */
export function localSuggestions(state) {
  const p = state?.positioning ?? {}
  const pains = (state?.painPoints ?? []).filter(Boolean)
  const subject = text(p.subject) || '这门课'
  const grade = text(p.grade)
  const where = text(p.city)
  const who = `${grade}${subject}`.trim()
  const pool = [
    pains[0] ? `${pains[0]}，先补什么` : '',
    `${who}第一次月考垮了，第一步该做什么`,
    pains[1] ? `孩子${pains[1]}，是刷题还是先补基础` : '',
    `${who}上课听懂了，一做题就废，问题在哪`,
    where ? `${where}的${grade}家长，最常问我的三个问题` : `${who}零基础，两个月能补到哪`,
    pains[2] ? `${pains[2]}，到底难在哪` : '',
    `${who}期中掉了 30 分，还来得及吗`,
  ]
  return [...new Set(pool.filter(Boolean))].slice(0, 5)
}

export function suggestPrompts(state) {
  if (currentLang() === 'en') {
    return ['A student fell behind in the first month — where do I start?', 'They understand in class but fail the homework, why?', 'What do parents in this grade ask you most?']
  }
  const p = state?.positioning ?? {}
  const pains = (state?.painPoints ?? []).slice(0, 6)
  return `你是给补课老师写短视频口播的编辑。老师要做一条口播视频，但还不知道从哪儿开口。
请读他/她的设定，替老师想 5 个「家长真会问的问题」，让老师照着改。

设定：
- 教什么：${[p.subject, p.grade, p.city].filter(Boolean).join(' · ') || '（没填）'}
- 只做：${p.only || '（没填）'}
- 不做：${p.notDo || '（没填）'}
- 说法：${p.voice || '（没填）'}
${pains.length ? `- 家长常愁的：${pains.join('、')}` : ''}

要求：
- 每个不超过 20 字，像家长自己会说的话，不用「干货」「秘籍」这类词
- 5 个角度不要重复：一个讲基础薄弱、一个讲分数焦虑、一个讲方法、一个讲时间/形式、一个讲具体知识点
- 不承诺提分、不报价

只输出 JSON：{"prompts":["…","…","…","…","…"]}`
}

export function normalizeSuggestions(json) {
  const list = (Array.isArray(json?.prompts) ? json.prompts : []).map(row => text(row, 40)).filter(Boolean)
  return [...new Set(list)].slice(0, 6)
}
