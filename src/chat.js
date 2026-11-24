// 聊天台：平台私信（引流）和微信（成交）两个阶段。
// 记录落在 对话记录.csv；人工案例落在 案例库.csv，聊成的案例会进提示词当参考。
import { LAYOUT, dayStamp, nowStamp, readTable, writeTable } from './workspace.js'
import { DM_CATEGORIES, DM_TYPES, settingBlock } from './dm.js'

export const CHANNELS = ['平台私信', '微信']
export const CHAT_STAGES = ['引流', '破冰', '问需求', '给方案', '约试听', '成交', '流失']
export const CHAT_RESULTS = ['未定', '加微', '约试听', '成交', '流失']

export const CHAT_COLUMNS = ['日期', '渠道', '姓名', '对方说', '我方回', '阶段', '结果', '备注', '更新时间']
export const CASE_COLUMNS = ['日期', '渠道', '场景', '结果', '对话']

const CHAT_FIELDS = { date: '日期', channel: '渠道', name: '姓名', incoming: '对方说', outgoing: '我方回', stage: '阶段', result: '结果', note: '备注', updatedAt: '更新时间' }
const CASE_FIELDS = { date: '日期', channel: '渠道', scene: '场景', result: '结果', text: '对话' }

const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max)
const oneLine = value => text(value).replace(/\s+/g, ' ')

const toChat = row => ({
  date: row['日期'] ?? '', channel: row['渠道'] ?? '', name: row['姓名'] ?? '',
  incoming: row['对方说'] ?? '', outgoing: row['我方回'] ?? '', stage: row['阶段'] ?? '',
  result: row['结果'] ?? '', note: row['备注'] ?? '', updatedAt: row['更新时间'] ?? '',
})
const toCase = row => ({ date: row['日期'] ?? '', channel: row['渠道'] ?? '', scene: row['场景'] ?? '', result: row['结果'] ?? '', text: row['对话'] ?? '' })

export function readChats(root) {
  return readTable(root, LAYOUT.chats).rows.map(toChat).filter(row => row.incoming || row.outgoing)
}

export function appendChat(root, input = {}) {
  const rows = readTable(root, LAYOUT.chats).rows.map(toChat)
  const channel = CHANNELS.includes(input.channel) ? input.channel : CHANNELS[0]
  const stage = CHAT_STAGES.includes(input.stage) ? input.stage : '引流'
  const result = CHAT_RESULTS.includes(input.result) ? input.result : '未定'
  rows.push({
    date: text(input.date, 20) || dayStamp(), channel,
    name: text(input.name, 40), incoming: text(input.incoming, 2000), outgoing: text(input.outgoing, 2000),
    stage, result, note: text(input.note, 200), updatedAt: nowStamp(),
  })
  writeTable(root, LAYOUT.chats, CHAT_COLUMNS, rows.map(row => Object.fromEntries(Object.entries(CHAT_FIELDS).map(([key, col]) => [col, row[key] ?? '']))))
  return readChats(root)
}

export function readCases(root) {
  return readTable(root, LAYOUT.cases).rows.map(toCase).filter(row => row.text)
}

export function appendCase(root, input = {}) {
  const rows = readTable(root, LAYOUT.cases).rows.map(toCase)
  const channel = CHANNELS.includes(input.channel) ? input.channel : CHANNELS[0]
  const result = CHAT_RESULTS.includes(input.result) ? input.result : '成交'
  rows.push({ date: dayStamp(), channel, scene: text(input.scene, 60), result, text: text(input.text, 6000) })
  writeTable(root, LAYOUT.cases, CASE_COLUMNS, rows.map(row => Object.fromEntries(Object.entries(CASE_FIELDS).map(([key, col]) => [col, row[key] ?? '']))))
  return readCases(root)
}

/** 聊成的案例，按渠道取最近的几条，拼给模型当口气参考。 */
export function chatLessons(root, channel, limit = 3) {
  const won = new Set(['加微', '约试听', '成交'])
  const all = readCases(root).filter(row => row.result === '' || won.has(row.result))
  const pick = all.filter(row => row.channel === channel)
  return (pick.length ? pick : all).slice(-limit).reverse()
    .map(row => `- ${row.scene || row.channel}（${row.result || '聊成了'}）：${oneLine(row.text).slice(0, 180)}`)
    .join('\n')
}

const channelName = channel => (channel === '微信' ? '微信私聊' : '平台私信（小红书 / 抖音 / B站）')

/**
 * 下一句建议。平台阶段只做「把对话挪到更私密的地方」，微信阶段才谈诊断和试听。
 * cases 是人工聊成的案例（chatLessons 拼好的），越用越像本人。
 */
export function chatPrompt(state, { channel = '平台私信', raw = '', cases = '' } = {}) {
  const pains = (state?.painPoints ?? []).slice(0, 6)
  const wechat = channel === '微信'
  const head = wechat
    ? `你在帮老师回微信私聊。微信阶段的目标不是把人推走，是把话聊到「愿意发诊断、愿意来试听」。`
    : `你在帮老师回平台私信（小红书 / 抖音 / B站）。平台阶段的目标只有一件：用一两句话把对话挪到私信 / 主页 / 更私密的地方，别在平台里展开讲。`
  const rules = wechat
    ? `规则：
- 第一条：接住他上一句最急的那句话，再给一个具体判断（哪一章、哪类题），不评价、不承诺提分、不报价
- 第二条：落到一个动作：拍最近一张卷子 / 约一次诊断 / 约试听；只给一半的方法，留一个钩子
- 像人说话：一句一个意思，平均 20 到 25 字，不用「首先/其次/总之」，不堆排比
- 他没问价格就不谈价格；问了也只说「得看孩子卡在哪，先诊断」，不报数字`
    : `规则：
- 两条都只写一两句话，不回答具体题目、不讲方法、不报价、不说课程和上课时间
- 第一条：接住他的问题，表示看到了
- 第二条：给一个极轻的动作，把对话挪走私信 / 主页 / 微信（可以自然地说「vx」「威信」「绿泡泡」，但不要直接写「加微信」三个字）
- 不要留电话、链接、二维码；不要承诺提分、不要说「包过」「最」「第一」
- 他要是继续追问，就把话题往「我私信你」「主页有」「我发你」上带`
  const system = `你是给补课老师做聊天的助手。${head}
${settingBlock(state)}${pains.length ? `\n家长常愁的：${pains.join('、')}` : ''}

${rules}
- 口气照老师本人：不用书面词，不喊口号
${cases ? `\n以前聊成的真实例子（照着这种感觉写，别照抄内容）：\n${cases}` : ''}

只输出 JSON：
{"type":"家长","category":"C 怎么补","judge":"他现在卡在哪 / 在问什么","stage":"引流","drafts":[{"tag":"先接住","text":"…"},{"tag":"往下推一步","text":"…"}],"fields":{"name":"","grade":"","school":"","painPoint":"","source":""}}`
  return { system, user: `对方最近的消息：\n${raw}` }
}

/** 只留两条能直接发的、一个判断和阶段；台账字段沿用 dm 的抽取。 */
export function normalizeChat(json) {
  const drafts = (Array.isArray(json?.drafts) ? json.drafts : [])
    .map(row => ({ tag: text(row?.tag, 20), text: text(row?.text, 500) }))
    .filter(row => row.text)
    .slice(0, 2)
  const stage = CHAT_STAGES.includes(json?.stage) ? json.stage : ''
  const type = DM_TYPES.includes(json?.type) ? json.type : ''
  const category = DM_CATEGORIES.includes(json?.category) ? json.category : ''
  const raw = json?.fields ?? {}
  const fields = {}
  for (const key of ['name', 'grade', 'school', 'painPoint', 'source']) fields[key] = typeof raw[key] === 'string' ? text(raw[key], 80) : ''
  return { type, category, judge: text(json?.judge, 200), stage, drafts, fields }
}

/** 没模型时的兜底：两句人话，平台阶段不报价，微信阶段先要卷子。 */
export function localChat(state, { channel = '平台私信', raw = '' } = {}) {
  const sniff = oneLine(raw).slice(0, 24)
  if (channel === '微信') {
    return {
      type: '家长', category: 'C 怎么补', judge: '他还在问情况，没到谈价格那一步。',
      stage: '问需求',
      drafts: [
        { tag: '先接住', text: `您说的「${sniff}」我看到了。这事不怪孩子，先看他卡在哪一章。` },
        { tag: '给个动作', text: '您把最近一张卷子拍给我，我看完丢分最集中的一块，再跟您说要不要补、先补哪。' },
      ],
      fields: { name: '', grade: '', school: '', painPoint: sniff, source: '' },
      fallback: true,
    }
  }
  return {
    type: '家长', category: 'C 怎么补', judge: '他在平台上问，先把人挪到私信里再说。',
    stage: '引流',
    drafts: [
      { tag: '先接住', text: `看到您说的「${sniff}」了，这个情况我这边挺常见。` },
      { tag: '挪一步', text: '平台里打字不方便，我私信您说，您看一下消息。' },
    ],
    fields: { name: '', grade: '', school: '', painPoint: sniff, source: '' },
    fallback: true,
  }
}
