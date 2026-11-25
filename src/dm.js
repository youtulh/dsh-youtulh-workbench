// 回私信：判断是谁、问什么，给两条话术（第二条落到加微信），再抽出台账字段。
// 提示词和归一化放在这里，Host 路由和「去对话里深聊」都从这里取。
import { tr } from './i18n.js'
import { RED_LINES } from './style-guide.js'

export const DM_TYPES = ['家长', '学生本人', '同行', '广告']
export const DM_CATEGORIES = ['A 价格', 'B 能不能提分', 'C 怎么补', 'D 时间形式']

const text = (value, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

export function settingBlock(state) {
  const p = state?.positioning ?? {}
  const rows = [
    ['他教什么', [p.subject, p.grade, p.city].filter(Boolean).join(' · ')],
    ['先抓哪类家长', p.target],
    ['从哪切进去', p.entry],
    ['她最怕什么', p.fear],
    ['凭什么信他', p.proof],
    ['只做', p.only],
    ['不做', p.notDo],
    ['说话的样子', p.voice],
    ['他的红线', p.redline],
  ].filter(([, value]) => typeof value === 'string' && value.trim())
  if (!rows.length) return ''
  return `\n老师自己的边界：\n${rows.map(([label, value]) => `- ${label}：${value}`).join('\n')}\n`
}

/** 分诊一条私信的提示词。lessons 是加到过微信的历史例子，contentLessons 是内容库的经验块。 */
export function dmPrompt(state, raw, { lessons = '', contentLessons = '', samples = [] } = {}) {
  const pains = (state?.painPoints ?? []).slice(0, 6)
  const system = `你是给补课老师回家长私信的助手。先判断，再写话术，最后抽台账。
${settingBlock(state)}${pains.length ? `\n家长常愁的：${pains.join('、')}` : ''}

先判断三件事：
1. 这条私信是谁发的：家长 / 学生本人 / 同行 / 广告
2. 他真正在问什么：A 价格 / B 能不能提分 / C 怎么补 / D 时间形式
3. 是不是我们这一阶段要接的家长${state?.positioning?.target ? `（${state.positioning.target}）` : ''}：不是就礼貌收住，别硬接

再写两条话术，都是能直接复制发出去的成品：
- 第一条：接住他最急的那句话。不评价、不承诺、不报价，用「您」，一句一个意思，平均 20 到 25 字
- 第二条：落到一个具体动作，优先引导加微信。还是不报价、不说课程安排、不给完整方案
- 两条都要像人说话：不用「首先/其次/总之/综上所述」，不用「赋能/闭环/底层逻辑」，不堆排比、不喊口号
- 碰到「不做」的范围，礼貌收住，别硬接
${samples.length ? `- 口气参考他本人说话的样子（别照抄内容）：\n${samples.slice(0, 3).map(row => `  · ${row}`).join('\n')}` : ''}

最后抽台账，私信里没提到的一律留空，一个字都不许编：
name 姓名 / grade 年级 / school 学校 / painPoint 卡点 / source 来源
卡点要具体到「哪一章、什么症状」，不要写「成绩差」。

平台红线（一条都不能碰）：${RED_LINES.slice(0, 4).join('；')}
${lessons ? `\n以前成功加到微信的例子（照着这种感觉写，不要照抄内容）：\n${lessons}` : ''}${contentLessons ? `\n${contentLessons}` : ''}

只输出 JSON：
{"type":"家长","category":"C 怎么补","drafts":[{"tag":"先接住","text":"…"},{"tag":"引导加微信","text":"…"}],"fields":{"name":"","grade":"","school":"","painPoint":"","source":""}}`
  return { system, user: `私信原文：\n${raw}` }
}

/** 收拾模型输出：只留两条话术、四类判断、五个台账字段。 */
export function normalizeDm(json) {
  const drafts = (Array.isArray(json?.drafts) ? json.drafts : [])
    .map(row => ({ tag: text(row?.tag, 20), text: text(row?.text, 500) }))
    .filter(row => row.text)
    .slice(0, 2)
  const source = json?.fields ?? {}
  const fields = {}
  for (const key of ['name', 'grade', 'school', 'painPoint', 'source']) fields[key] = text(source[key], 80)
  return {
    type: DM_TYPES.includes(json?.type) ? json.type : '',
    category: DM_CATEGORIES.includes(json?.category) ? json.category : '',
    drafts,
    fields,
  }
}

/** 没有模型时的兜底：两句人话，不编造孩子的情况。 */
export function localDm(state, raw) {
  const p = state?.positioning ?? {}
  const subject = text(p.subject, 12)
  const grade = text(p.grade, 12)
  const snippet = text(raw, 26).replace(/[，。！？!?,.]+$/, '')
  const who = `${grade}${subject}`.trim()
  return {
    type: '家长',
    category: 'C 怎么补',
    drafts: [
      { tag: tr('先接住'), text: tr('您说的这个情况我看到了，{snippet}。这事不怪孩子，也不怪您。', { snippet }) },
      { tag: tr('引导加微信'), text: who
        ? tr('我平时主要带{who}，先别急着报班。您把孩子最近一次卷子拍给我，我看完丢分集中在哪一章，再跟您说要不要补。方便的话加个微信，我把结论直接发您。', { who })
        : tr('先别急着报班。您把孩子最近一次卷子拍给我，我看完丢分集中在哪一章，再跟您说要不要补。方便的话加个微信，我把结论直接发您。') },
    ],
    fields: { name: '', grade, school: '', painPoint: snippet, source: '' },
    fallback: true,
  }
}
