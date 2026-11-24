// 家长反馈：拿学生最近的课次记录，写成一条能直接发微信的话。
// 有模型走模型，没模型就本地按数据拼一条，绝不假装模型通了。
import { styleBlock } from './style-guide.js'

const clean = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function lessonLine(row) {
  const bits = [`第${row.no}次`, row.date]
  if (row.attend) bits.push(row.attend === '到' ? '到了' : '缺课')
  if (row.mastery) bits.push(`掌握${row.mastery}`)
  if (row.homework) bits.push(row.homework === '交' ? '作业交了' : '作业没交')
  if (row.note) bits.push(row.note)
  return bits.filter(Boolean).join('，')
}

/** 给家长反馈的提示词：只写一条微信，不要模板和承诺。 */
export function feedbackPrompt(state, student, lessons = [], samples = []) {
  const p = state?.positioning ?? {}
  const subject = clean(p.subject) || '这门课'
  const grade = clean(student.grade) || clean(p.grade) || '孩子'
  const system = `你是${grade}${subject}老师，正在给家长写一条微信反馈。${styleBlock(samples)}
要求：
- 120 到 200 字，直接用「家长您好」开头，不分点、不加标题；
- 先说一个具体的进步或课堂表现，再说一个还需要练的点；
- 给一条在家能做的具体建议（10 分钟以内能完成）；
- 最后问一个具体问题，方便家长回；
- 不承诺分数、不谈价格、不推销课程，不写「AI」「模型」；
- 只输出这条消息本身。`
  const detail = lessons.slice(0, 4).map(row => `- ${lessonLine(row)}`).join('\n') || '- 还没有课次记录'
  const user = `学生：${clean(student.name)}（${grade}${clean(student.school) ? ` · ${clean(student.school)}` : ''}）
卡点层：${clean(student.layer) || '还没标'}
老师备注：${clean(student.note) || '没有'}
最近课次：
${detail}

请写这条反馈。`
  return { system, user }
}

/** 没模型时的兜底：把记录说清楚，不编细节。 */
export function localFeedback(student, lessons = [], subject = '') {
  const name = clean(student.name) || '孩子'
  const teacher = clean(subject) ? `${clean(subject)}老师` : '老师'
  const last = lessons[0]
  const parts = [lessons.length
    ? `家长您好，我是${teacher}。${name}最近上了 ${lessons.length} 次课`
    : `家长您好，我是${teacher}。${name}还没开始正式上课`]
  if (last) {
    const bits = []
    if (last.attend) bits.push(last.attend === '到' ? '到了' : '缺课')
    if (last.mastery) bits.push(`这块内容现在${last.mastery === '会' ? '基本能自己讲出来' : last.mastery === '半会' ? '听懂了一半，还需要练' : '还有点卡'}`)
    if (last.homework) bits.push(last.homework === '交' ? '作业按时交了' : '作业还没交')
    if (bits.length) parts.push(`最近一次课${bits.join('，')}`)
  }
  if (student.layer) parts.push(`接下来先把他卡住的「${clean(student.layer)}」补上`)
  parts.push('在家可以每天花 10 分钟把错题重做一遍，不用多')
  parts.push('您看他这周作业最卡的是哪一步？')
  const out = parts.join('。').replace(/。。/g, '。')
  return /[。！？]$/.test(out) ? out : `${out}。`
}
