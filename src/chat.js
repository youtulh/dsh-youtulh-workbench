// 线索表：平台私信（引流）和微信（成交）两个阶段；界面只做记录，不再生成回复。
// 记录落在 对话记录.csv；人工案例落在 案例库.csv，聊成的案例会进提示词当参考。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LAYOUT, dayStamp, ensureLayout, nowStamp, readTable, writeTable } from './workspace.js'
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
  rowIndex: row.rowIndex, date: row['日期'] ?? '', channel: row['渠道'] ?? '', name: row['姓名'] ?? '',
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

/** 给某一轮对话补结果 / 阶段 / 备注（成交、流失、约试听）。 */
export function updateChatRow(root, index, patch = {}) {
  const rows = readTable(root, LAYOUT.chats).rows
  const at = Number(index)
  if (!Number.isInteger(at) || at < 0 || at >= rows.length) return null
  const row = { ...rows[at] }
  if (CHAT_STAGES.includes(patch.stage)) row['阶段'] = patch.stage
  if (CHAT_RESULTS.includes(patch.result)) row['结果'] = patch.result
  if (typeof patch.note === 'string') row['备注'] = text(patch.note, 200)
  row['更新时间'] = nowStamp()
  rows[at] = row
  writeTable(root, LAYOUT.chats, CHAT_COLUMNS, rows)
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

/** 改一条案例的场景 / 结果（导入了但标签写错了）。 */
export function updateCase(root, index, patch = {}) {
  const rows = readTable(root, LAYOUT.cases).rows
  const at = Number(index)
  if (!Number.isInteger(at) || at < 0 || at >= rows.length) return null
  const row = { ...rows[at] }
  if (CHANNELS.includes(patch.channel)) row['渠道'] = patch.channel
  if (typeof patch.scene === 'string') row['场景'] = text(patch.scene, 60)
  if (CHAT_RESULTS.includes(patch.result)) row['结果'] = patch.result
  if (typeof patch.text === 'string' && patch.text.trim()) row['对话'] = text(patch.text, 6000)
  rows[at] = row
  writeTable(root, LAYOUT.cases, CASE_COLUMNS, rows)
  return readCases(root)
}

/** 删掉一轮对话记录（测试数据、重复录入）。 */
export function removeChat(root, index) {
  const rows = readTable(root, LAYOUT.chats).rows
  const at = Number(index)
  if (!Number.isInteger(at) || at < 0 || at >= rows.length) return null
  rows.splice(at, 1)
  writeTable(root, LAYOUT.chats, CHAT_COLUMNS, rows)
  return readChats(root)
}

/** 删掉一条导入的案例（导错了、不适用了）。 */
export function removeCase(root, index) {
  const rows = readTable(root, LAYOUT.cases).rows
  const at = Number(index)
  if (!Number.isInteger(at) || at < 0 || at >= rows.length) return null
  rows.splice(at, 1)
  writeTable(root, LAYOUT.cases, CASE_COLUMNS, rows)
  return readCases(root)
}

/** 聊成的案例，按渠道取最近的几条，拼给模型当口气参考。 */
export function chatLessons(root, channel, limit = 3) {
  const won = new Set(['加微', '约试听', '成交'])
  const cases = readCases(root).filter(row => row.result === '' || won.has(row.result))
  const chats = readChats(root).filter(row => row.channel === channel && won.has(row.result))
  const own = cases.filter(row => row.channel === channel)
  const fromCases = (own.length ? own : cases).map(row => `- ${row.scene || row.channel}（${row.result || '聊成了'}）：${oneLine(row.text).slice(0, 180)}`)
  const fromChats = chats.map(row => `- 真实对话（${row.result}）：对方「${oneLine(row.incoming).slice(0, 50)}」→ 我们「${oneLine(row.outgoing).slice(0, 120)}」`)
  return [...fromChats.slice(-limit), ...fromCases].slice(-limit).reverse().join('\n')
}

// ---- 平台话术词表 ----

export const DEFAULT_PLATFORM_WORDS = {
  allow: ['vx', '威信', '绿泡泡', '私信', '主页', '我发你'],
  ban: ['加微信', '微信号', '手机号', '二维码', '价格', '多少钱', '包过', '保证'],
}

const cleanWords = list => (Array.isArray(list) ? list : [])
  .map(value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 16))
  .filter(Boolean)
  .slice(0, 16)

/** 平台词表：一行一个词，分「可以出现 / 不要出现」两节。 */
export function platformWordsMarkdown(words = DEFAULT_PLATFORM_WORDS) {
  const allow = cleanWords(words.allow)
  const ban = cleanWords(words.ban)
  return `# 平台话术词表

> 平台私信阶段（小红书 / 抖音 / B站）的下一句建议会照着它来。一行一个词，直接改这个文件也生效。

## 可以出现

${(allow.length ? allow : DEFAULT_PLATFORM_WORDS.allow).map(word => `- ${word}`).join('\n')}

## 不要出现

${(ban.length ? ban : DEFAULT_PLATFORM_WORDS.ban).map(word => `- ${word}`).join('\n')}
`
}

export function parsePlatformWords(markdown) {
  const text = String(markdown ?? '')
  const section = title => {
    const at = text.search(new RegExp(`^##\\s*${title}\\s*$`, 'm'))
    if (at < 0) return []
    return text.slice(at).split(/\n##\s+/)[0].split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim())
      .filter(line => line && !line.startsWith('>') && !line.startsWith('#'))
  }
  const allow = cleanWords(section('可以出现'))
  const ban = cleanWords(section('不要出现'))
  return { allow: allow.length ? allow : DEFAULT_PLATFORM_WORDS.allow, ban: ban.length ? ban : DEFAULT_PLATFORM_WORDS.ban }
}

export function readPlatformWords(root) {
  const file = join(root, LAYOUT.words)
  if (!existsSync(file)) return { ...DEFAULT_PLATFORM_WORDS }
  try { return parsePlatformWords(readFileSync(file, 'utf8')) } catch { return { ...DEFAULT_PLATFORM_WORDS } }
}

export function writePlatformWords(root, words = {}) {
  ensureLayout(root)
  const file = join(root, LAYOUT.words)
  const next = { allow: cleanWords(words.allow), ban: cleanWords(words.ban) }
  writeFileSync(file, platformWordsMarkdown(next))
  return readPlatformWords(root)
}

const channelName = channel => (channel === '微信' ? '微信私聊' : '平台私信（小红书 / 抖音 / B站）')

/**
 * 下一句建议。平台阶段只做「把对话挪到更私密的地方」，微信阶段才谈诊断和试听。
 * cases 是人工聊成的案例（chatLessons 拼好的），越用越像本人。
 */
export function chatPrompt(state, { channel = '平台私信', raw = '', history = '', cases = '', words = DEFAULT_PLATFORM_WORDS } = {}) {
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
- 他要是继续追问，就把话题往「我私信你」「主页有」「我发你」上带
- 可以出现：${(words.allow ?? []).join('、') || 'vx、威信、私信、主页'}
- 不要出现：${(words.ban ?? []).join('、') || '加微信、微信号、手机号、二维码、价格、包过'}`
  const system = `你是给补课老师做聊天的助手。${head}
${settingBlock(state)}${pains.length ? `\n家长常愁的：${pains.join('、')}` : ''}

${rules}
- 口气照老师本人：不用书面词，不喊口号
${cases ? `\n以前聊成的真实例子（照着这种感觉写，别照抄内容）：\n${cases}` : ''}

只输出 JSON：
{"type":"家长","category":"C 怎么补","judge":"他现在卡在哪 / 在问什么","stage":"引流","drafts":[{"tag":"先接住","text":"…"},{"tag":"往下推一步","text":"…"}],"fields":{"name":"","grade":"","school":"","painPoint":"","source":""}}`
  return { system, user: `${history.trim() ? `前面聊过的（接着这个上下文）：\n${history.trim()}\n\n` : ''}对方最近的消息：\n${raw}` }
}

/**
 * 已经给过一版，老师想再改：保留上一版能用的句子，只按他这句要求调。
 * 这是旧版回私信用的「再给一版」，界面已不再调用。
 */
export function chatRevisePrompt(state, { channel = '平台私信', raw = '', history = '', drafts = [], note = '', cases = '', words = DEFAULT_PLATFORM_WORDS } = {}) {
  const base = chatPrompt(state, { channel, raw, history, cases, words })
  const previous = (Array.isArray(drafts) ? drafts : []).slice(0, 2)
    .map((text, index) => `${index + 1}. ${text}`)
    .join('\n')
  return {
    system: `${base.system}

老师已经看过上一版，现在按他的一句要求改：不要推翻重写，能用的句子留着，只改他不满意的地方。`,
    user: `${base.user}

上一版：
${previous}

老师的要求：${note}`,
  }
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
