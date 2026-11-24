// 新用户问卷：六个问题，问完拼成一份「我的设定」，让人不用懂术语也能填好定位。
// 只问「你教什么、带谁、在哪儿、家长愁什么」，剩下的（只做/不做/说法/红线）由规则拼出来，用户之后能改。
// 这个文件同时给宿主和浏览器用，所以不许 import 任何 node 内置模块或 i18n。
import { parsePains } from './targets.js'

export const SUBJECTS = ['化学', '数学', '物理', '英语', '语文', '生物']
export const GRADES = ['六年级', '初三', '高一', '高二', '高三']
export const SITUATIONS = ['开学后跟不上', '期中掉队', '基础差、听不懂', '偏科', '想冲高分', '艺考补基础']
export const EXCLUDES = ['外地线上', '高二高三', '竞赛', '只求押题', '大班课']

const text = (value, max = 60) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const list = (value, max = 5) => (Array.isArray(value) ? value.map(row => text(row, 40)).filter(Boolean).slice(0, max) : [])

/**
 * 把问卷答案拼成设定。
 * @param {{subject?:string, subjectOther?:string, grade?:string, city?:string, situations?:string[], excludes?:string[], pains?:string}} answers
 */
export function buildProfile(answers = {}) {
  const subject = text(answers.subject) === '其他' ? text(answers.subjectOther) : text(answers.subject)
  const grade = text(answers.grade)
  const city = text(answers.city)
  const situations = list(answers.situations, 3)
  const excludes = list(answers.excludes, 5)

  const only = [city, grade, subject, ...situations].filter(Boolean).join('、')
  // 一个都不排斥就别写「不做」，免得模型把普通家长也筛掉
  const notDo = excludes.includes('都不排斥') ? '' : excludes.join('、')

  // 家长最常说的那句话按逗号、分号、顿号拆开，就是痛点清单
  const pains = parsePains(answers.pains)

  return {
    positioning: {
      subject,
      grade,
      city,
      target: text(answers.target),
      entry: text(answers.entry),
      fear: text(answers.fear),
      only,
      notDo,
      voice: '先接住家长的焦虑，再用一个具体数字说清楚，不喊口号',
      redline: '不承诺提分、不说包过、不报价格、不编造孩子的情况',
    },
    painPoints: pains,
  }
}

/** 问卷是否填够了：科目、年级、城市至少要有两样，否则拼出来的设定没意义。 */
export function profileReady(answers = {}) {
  const filled = [answers.subject, answers.grade, answers.city].filter(row => text(row)).length
  return filled >= 2
}
