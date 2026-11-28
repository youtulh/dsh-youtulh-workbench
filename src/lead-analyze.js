// 聊天截图/聊天记录 → 线索字段。只抽家长说过的，没提的留空。
import { settingBlock } from './dm.js'

const clean = (value, max = 400) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export function leadAnalyzePrompt(state, text) {
  return {
    system: `你是给补课老师整理聊天记录的助手。把一段家长聊天整理成线索表的一行或多行。
${settingBlock(state)}
规则：
- 只抽聊天里真实出现的信息，没提的字段留空，不要猜；
- 一个家长一个对象；同一家长在多张截图/多段话里出现，必须合并成一条，不要重复；
- 先按姓名/称呼 + 年级归并；没有姓名时不要硬凑成同一个人；
- painPoint 要具体到「哪一章、什么症状」，不要写「成绩差」；
- stage 只能从：私信 / 已加微信 / 已进群 / 约试听 / 已报课 / 流失 里选；判断不了就留空；
- next 写具体下一步；nextAt 只在聊天里明确说了日期时填 YYYY-MM-DD；
- 不报价、不承诺、不编分数；
- 只输出 JSON：{"leads":[{"name":"","grade":"","school":"","painPoint":"","source":"","stage":"","next":"","nextAt":"","note":""}]}`,
    user: `聊天记录：\n${String(text ?? '').slice(0, 30000)}`,
  }
}

export function normalizeAnalyzedLeads(json) {
  const list = Array.isArray(json?.leads) ? json.leads : []
  return list.map(row => ({
    name: clean(row?.name, 40), grade: clean(row?.grade, 20), school: clean(row?.school, 40),
    painPoint: clean(row?.painPoint, 200), source: clean(row?.source, 60),
    stage: ['私信', '已加微信', '已进群', '约试听', '已报课', '流失'].includes(row?.stage) ? row.stage : '',
    next: clean(row?.next, 120), nextAt: /^\d{4}-\d{2}-\d{2}$/.test(String(row?.nextAt ?? '')) ? row.nextAt : '',
    note: clean(row?.note, 300),
  })).filter(row => row.name || row.painPoint || row.grade).slice(0, 5)
}

/** 没模型时的兜底：只做最保守的年级/阶段识别，其余原文进卡点。 */
export function localAnalyzedLead(text) {
  const raw = clean(text, 500)
  const grade = /(初一|初二|初三|高一|高二|高三|小学[一二三四五六])/.exec(raw)?.[1] ?? ''
  const stage = /已报课|报名了|缴费/.test(raw) ? '已报课' : /约了?试听|试听约/.test(raw) ? '约试听' : /加了?微信/.test(raw) ? '已加微信' : '私信'
  return [{ name: '', grade, school: '', painPoint: raw, source: '', stage, next: '', nextAt: '', note: '本地兜底，请核对' }]
}
