// 把任务派给对话里的 agent：切到对话页面，把提示词填进输入框。
// 用的是 DSH 自己的 uiWorkspace.startSession —— 和「新建插件」按钮同一套 API。
import { t } from './i18n.js'

let appCtx = null
export function setAppCtx(ctx) {
  appCtx = ctx
}

const WORKSPACE_NOTE = '工作区根目录是 ~/Documents/Youtulh 工作台。动手之前先读里面的 我的设定.md（科目、年级、城市、只做、不做、说话方式、红线、家长痛点），所有内容都要符合它。做完把结果写成文件放回工作区。'

const RED_LINE = '红线：不承诺提分、不说包过、不报价格、不编造学生的情况。'

/** 三种任务的提示词。都在这里拼，页面只负责把用户填的东西传进来。 */
export function buildPrompt(kind, payload = {}) {
  if (kind === 'content') {
    return [
      WORKSPACE_NOTE,
      '',
      `帮我做一条口播视频的内容，主题：${payload.hint || '（还没写，请先问我一句）'}`,
      '',
      '要三样：',
      '1. 3 个标题，每个不超过 24 字，用家长会说的话，不用「干货」「秘籍」「必看」这类词',
      '2. 2 版口播：直给版 45 秒左右、上来就给判断；故事版 60 秒左右、从一个具体的孩子或一次考试讲起。都是一句话一行、按气口断句，开头 3 秒要抓人，结尾只留一个动作',
      '3. 2 组标签，每组 5 个，不带 # 号，中文',
      '',
      RED_LINE,
      '',
      '写完后在 内容/ 下建一个「日期 标题」的文件夹，把稿子存成 Markdown；能生成 Word 就再存一份 .docx。',
    ].join('\n')
  }
  if (kind === 'dm') {
    return [
      WORKSPACE_NOTE,
      '',
      '这是一条家长私信，帮我分诊：',
      '',
      '1. 判断是谁：家长 / 学生本人 / 同行 / 广告',
      '2. 判断问什么：A 价格 / B 能不能提分 / C 怎么补 / D 时间形式',
      '3. 给两条话术：第一条接住对方最急的那句话（不评价、不承诺）；第二条落到一个具体动作，优先引导加微信',
      '4. 抽出台账七个字段：姓名、年级、学校、卡点、来源、下一步（私信没说过的一律留空，不许编）',
      '',
      '私信原文：',
      payload.raw || '（还没粘，请先问我）',
      '',
      RED_LINE,
      '',
      '做完以后：稿子存到 私信/日期 姓名/ 下，并在 线索表.csv 里追加一行。',
    ].join('\n')
  }
  if (kind === 'data') {
    return [
      WORKSPACE_NOTE,
      '',
      '这是我的后台数据，帮我按下面几件事分析：',
      '1. 哪条内容真带人（看私信、加微、约试听，不只是播放）',
      '2. 哪条白拍了（播放高但不带人）',
      '3. 下一步该改什么，只给一条最值得改的',
      '',
      '数据：',
      payload.text || '（还没粘，请先问我）',
      '',
      '分析完写到 数据/复盘 <日期>.md，并给一份 .csv。',
    ].join('\n')
  }
  return String(payload.text ?? '')
}

/**
 * 切到对话并把提示词填进输入框。
 * @returns {boolean} 环境不支持时返回 false，调用方应提示用户。
 */
export function startChat(kind, payload) {
  const ui = appCtx?.get?.('uiWorkspace')
  if (!ui?.startSession) return false
  try {
    ui.startSession(undefined, { prompt: buildPrompt(kind, payload), whenDraftExists: 'replace' })
    return true
  } catch {
    return false
  }
}

/** 按钮被点了但环境不支持时的统一提示。 */
export function launchFailedToast(toast) {
  toast(t('当前环境不支持跳到对话，请用下面的内嵌生成'), { error: true })
}
