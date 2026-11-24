// 把任务派给对话里的 agent：切到对话页面，把提示词填进输入框。
// 用的是 DSH 自己的 uiWorkspace.startSession —— 和「新建插件」按钮同一套 API。
import { t } from './i18n.js'

let appCtx = null
export function setAppCtx(ctx) {
  appCtx = ctx
}

export const FALLBACK_ROOT = '~/Documents/Youtulh 工作台'

const RED_LINE = '红线：不承诺提分、不说包过、不报价格、不编造学生的情况。'

function workspaceNote(root, profile) {
  return [
    `工作区根目录是 ${root}。动手之前先读里面的 我的设定.md（科目、年级、城市、只做、不做、说话方式、红线、家长痛点），所有内容都要符合它。`,
    profile ? `我的设定摘要：${profile}。` : '',
    '做完把结果写成文件放回工作区。',
  ].filter(Boolean).join('\n')
}

/** 三种任务的提示词。都在这里拼，页面只负责把用户填的东西传进来。 */
export function buildPrompt(kind, payload = {}) {
  const root = payload.root || FALLBACK_ROOT
  const profile = payload.profile || ''

  if (kind === 'content') {
    return [
      workspaceNote(root, profile),
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
      '写完后调用 youtulh_save_output 工具（kind=content，title 用标题，text 放完整稿子），它会把 Word 和 Markdown 写进工作区。',
    ].join('\n')
  }

  if (kind === 'dm') {
    return [
      workspaceNote(root, profile),
      '',
      '这是一条家长私信，帮我分诊：',
      '',
      '1. 判断是谁：家长 / 学生本人 / 同行 / 广告',
      '2. 判断问什么：A 价格 / B 能不能提分 / C 怎么补 / D 时间形式',
      '3. 给两条话术：第一条接住对方最急的那句话（不评价、不承诺）；第二条落到一个具体动作，优先引导加微信',
      '4. 抽出台账七个字段：姓名、年级、学校、卡点、来源、下一步（私信没说过的一律留空，不许编）',
      '',
      '话术要贴着我的设定写：只说我在教的科目、年级、城市范围内的事，碰到「不做」的范围就礼貌收住。',
      '',
      '口气照「说话样本.md」来（先读它）：用「您」直接对家长说，一句一个意思、平均 20 到 25 字，多用「其实、所以、但是、你看」这类口语连接词；不喊口号、不堆排比、不用「首先其次总之」、不用「赋能闭环底层逻辑」。',
      payload.lessons?.length ? `\n以前成功加到微信的例子（照着这种感觉写）：\n${payload.lessons.map(row => `- ${row}`).join('\n')}` : '',
      '',
      '私信原文：',
      payload.raw || '（还没粘，请先问我）',
      '',
      RED_LINE,
      '',
      '做完以后调用 youtulh_save_output（kind=dm）把话术落盘，再调用 youtulh_append_lead 把台账追加进线索表。',
    ].join('\n')
  }

  if (kind === 'data') {
    const files = Array.isArray(payload.files) ? payload.files.slice(0, 12) : []
    return [
      workspaceNote(root, profile),
      '',
      `数据在 ${root}/数据/ 文件夹里${files.length ? `，现在是这些：${files.join('、')}` : ''}。先把里面的文件读一遍。`,
      '',
      '按下面三件事分析：',
      '1. 哪条内容真带人（看私信、加微、约试听，不只是播放）',
      '2. 哪条白拍了（播放高但不带人）',
      '3. 下一步该改什么，只给一条最值得改的',
      '',
      '分析完调用 youtulh_save_output（kind=data，formats 用 csv + md）把结论写回工作区，并在回复里直接讲结论。',
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
  toast(t('当前环境不支持跳到对话，请稍后再试'), { error: true })
}
