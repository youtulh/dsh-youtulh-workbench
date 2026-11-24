// 浏览器侧的状态：Host 状态的本地镜像，加上只属于界面的选中、视图等。
import React from 'react'
import { lang, plural, setLanguagePreference, t } from './i18n.js'

const BASE = 'media-desk/'

// 做内容页面的中间结果：选题、勾选、口播几组、采用标记。
// 放在全局快照里，切到别的页面再回来不会丢；再存一份 sessionStorage，刷新也能捡回来。
export const EMPTY_CREATE = { topics: [], angles: {}, picked: {}, groups: [], adopted: {}, dirs: {}, batch: '', lessons: '', source: '', examples: [], brief: '', notes: {} }
const CREATE_DRAFT_KEY = 'youtulh:create:v1'

let snapshot = {
  state: null, model: null, modelOk: null, modelError: null, canUndo: false, error: null,
  view: 'home', mode: 'scatter', focusId: null, dmPerson: '', dmFilter: '', studentFocus: '', dmCases: false, sheetOrigin: null, dockOpen: true, studioDock: false, chatQuote: null, query: '', kindFilter: 'all', related: null,
  live: {}, settings: null, settingsOpen: false, modelPickOpen: false, thinking: false, toast: null, capture: null, dialog: null,
  create: { ...EMPTY_CREATE },
}
const listeners = new Set()

export function getDesk() {
  return snapshot
}

export function setDesk(patch) {
  snapshot = { ...snapshot, ...(typeof patch === 'function' ? patch(snapshot) : patch) }
  listeners.forEach(fn => fn())
}

/** 改做内容页的中间结果，并顺手存一份，供刷新后恢复。 */
export function patchCreate(patch) {
  const next = { ...snapshot.create, ...(typeof patch === 'function' ? patch(snapshot.create) : patch) }
  setDesk({ create: next })
  try {
    const { topics, angles, picked, groups, adopted, dirs, batch, lessons, source, examples, brief, notes } = next
    sessionStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify({ topics, angles, picked, groups, adopted, dirs, batch, lessons, source, examples, brief, notes }))
  } catch { /* 隐私模式下写不进去就算了 */ }
}

export function resetCreate() {
  patchCreate({ ...EMPTY_CREATE })
}

/** 把一条选题带到「做内容」：只保留这一条并勾好，直接生成 3 版口播。 */
export function startFromTopic(topic) {
  const value = String(topic ?? '').trim()
  if (!value) return
  patchCreate(state => ({
    topics: [value],
    angles: {},
    picked: { [value]: true },
    groups: [],
    adopted: {},
    dirs: {},
    batch: '',
    lessons: '',
    source: '',
    examples: state.examples,
    brief: '',
    notes: {},
  }))
  setDesk({ view: 'content', focusId: null })
}

/** 页面刷新后把上一次的选题和口播捡回来；已经有内容就不动。 */
export function restoreCreateDraft() {
  if (snapshot.create.topics.length || snapshot.create.groups.length) return
  try {
    const data = JSON.parse(sessionStorage.getItem(CREATE_DRAFT_KEY) || 'null')
    if (!data) return
    if (!data.topics?.length && !data.groups?.length) return
    setDesk({ create: { ...snapshot.create, ...data } })
  } catch { /* 存的东西坏了就当没有 */ }
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useDesk(selector) {
  return React.useSyncExternalStore(subscribe, () => selector(snapshot))
}

async function request(path, body) {
  const res = await fetch(BASE + path, body === undefined ? { headers: { 'x-media-desk-lang': lang() } } : {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-media-desk-lang': lang() }, body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || t('请求失败（{status}）', { status: res.status }))
  return data
}

let toastTimer = null
export function toast(text, { undo = false, error = false } = {}) {
  clearTimeout(toastTimer)
  setDesk({ toast: { text, undo, error, key: Date.now() } })
  toastTimer = setTimeout(() => setDesk({ toast: null }), undo || text.length > 24 ? 6000 : 3200)
}

export function report(err) {
  toast(err.message || String(err), { error: true })
}

export async function loadDesk() {
  try {
    // 先读设置拿到语言偏好，示例数据按这个语言返回
    const settings = await request('settings')
    setLanguagePreference(settings.language)
    const data = await request('state')
    setDesk({ settings, state: data.state, model: data.model, modelOk: data.modelOk, modelError: data.modelError, canUndo: data.canUndo, error: null })
  } catch (err) {
    setDesk({ error: err.message })
  }
}

export async function dispatchOps(ops, { label = t('操作'), undoable = true, silent = false } = {}) {
  try {
    const data = await request('ops', { ops, label, undoable })
    setDesk({ state: data.state, canUndo: undoable || snapshot.canUndo })
    if (data.errors?.length) toast(data.errors[0], { error: true })
    else if (!silent && data.receipts?.[0]) toast(data.receipts[0].text, { undo: undoable })
    return data
  } catch (err) {
    report(err)
    return null
  }
}

export async function undo() {
  try {
    const data = await request('undo', {})
    setDesk({ state: data.state, canUndo: data.canUndo, toast: null })
    if (data.label) toast(t('已撤销：{label}', { label: data.label }))
  } catch (err) {
    report(err)
  }
}

/** 读工作区里的一个文本文件（预览正文用）。 */
export async function fetchWorkspaceFile(dir, name) {
  const query = `?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(name)}`
  const res = await fetch(BASE + 'workspace/file' + query, { headers: { 'x-media-desk-lang': lang() } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || t('请求失败（{status}）', { status: res.status }))
  return data.text ?? ''
}

/** 工作区路径信息（根目录、设定文件、线索表）。 */
export async function fetchWorkspace() {
  return request('workspace/info')
}

/** 做内容页的案例提示词：按人设想几条家长会问的问题。 */
export async function fetchSuggestions() {
  const data = await request('suggest')
  return { prompts: data.prompts ?? [], source: data.source }
}

/** 内容库：每条口播和它的结果。 */
export async function fetchContent() {
  return request('content')
}

/** 内容库：改某一条的采用/状态/平台/播放/私信等。key 是目录，没有目录的行用创建时间。 */
export async function updateContentRow(key, patch) {
  return request('content/update', { key, patch })
}

/** 内容库：手动补录一条（以前发过的视频也能进库）。 */
export async function createContent(payload) {
  return request('content/create', payload)
}

/** 内容库：删掉一条记录，文件留在文件夹里。 */
export async function removeContent(key) {
  return request('content/remove', { key })
}

/** 粘平台数据，按标题匹配内容库。 */
export async function importData(text) {
  return request('data/import', { text })
}

/** 记录这一批里勾了哪些选题。 */
export async function pickTopics(batch, picked) {
  return request('topics/pick', { batch, picked })
}

/** 人设摘要：科目 · 年级 · 城市（+ 前两条家长痛点），给页面和提示词用。 */
export function profileSummary(state) {
  const p = state?.positioning ?? {}
  const who = [p.subject, p.grade, p.city].filter(Boolean).join(' · ')
  const pains = (state?.painPoints ?? []).slice(0, 2).join('、')
  const tail = pains ? `家长愁：${pains}` : ''
  return [who, tail].filter(Boolean).join('；')
}

/** 读工作区里的线索表（CSV）和成功经验。 */
export async function fetchLeads() {
  const data = await request('workspace/leads')
  return data.leads ?? []
}

/** 连经验一起读：{ leads, lessons }。 */
export async function fetchLeadsWithLessons() {
  const data = await request('workspace/leads')
  return { leads: data.leads ?? [], lessons: data.lessons ?? [] }
}

/** 页内聊天台：按渠道（平台私信 / 微信）给判断 + 两条下一句 + 台账字段。 */
export async function draftDm(raw, channel = '平台私信', history = '') {
  return request('dm/draft', { raw, channel, history })
}

/** 这句发出去了：记进 对话记录.csv。 */
export async function logChat(payload) {
  return request('chat/log', payload)
}

/** 人工聊天案例，聊成的会进提示词。 */
export async function addChatCase(payload) {
  return request('chat/cases', payload)
}

export async function removeChatCase(index) {
  return request('chat/cases/remove', { index })
}

export async function updateChatCase(index, patch) {
  return request('chat/cases/update', { index, patch })
}

/** 聊天台的「再给一版」：按一句要求改上一版的两句话。 */
export async function reviseDm(payload) {
  return request('dm/revise', payload)
}

/** 平台话术词表（可以出现 / 不要出现）。 */
export async function fetchPlatformWords() {
  return request('platform-words')
}

export async function savePlatformWords(payload) {
  return request('platform-words', payload)
}

/** 读最近对话和案例。 */
export async function fetchChatRecords() {
  return request('chat/records')
}

/** 给某一轮对话标结果（成交 / 流失 / 约试听）。 */
export async function updateChatLog(index, patch) {
  return request('chat/update', { index, patch })
}

/** 话术定了，连同台账一起写进线索表。 */
export async function appendLeadRow(payload) {
  return request('lead/append', payload)
}

export async function removeLead(index) {
  return request('lead/remove', { index })
}

/** 用学生最近几次课，写一条给家长的反馈。 */
export async function fetchStudentFeedback({ name, grade = '', className = '' }) {
  return request('student/feedback', { name, grade, className })
}

/** 家长有反应了：按行号更新那条线索。 */
export async function updateLead(index, patch) {
  return request('workspace/lead/update', { index, patch })
}

/** 漏斗上把一条线索挪到另一个阶段。 */
export async function setLeadStage(index, stage) {
  return request('workspace/lead/stage', { index, stage })
}

/** 报课了：一条线索转成学生档案。 */
export async function convertLead(index) {
  return request('students/from-lead', { index })
}

/** 学生档案 + 班课。 */
export async function fetchStudents() {
  return request('students')
}

export async function saveStudentRow(student, original = null) {
  return request('students/save', { student, original })
}

export async function removeStudentRow(name, grade) {
  return request('students/remove', { name, grade })
}

export async function saveClassRow(klass, original = null) {
  return request('classes/save', { klass, original })
}

export async function removeClassRow(name) {
  return request('classes/remove', { name })
}

/** 我的原话样本（说话样本.md 里的「原话样本」）。 */
export async function fetchVoice() {
  return request('voice')
}

export async function saveVoice(samples) {
  return request('voice', { samples })
}

/** 某个班的全部课次记录。 */
export async function fetchLessons(className) {
  const data = await request(`lessons?class=${encodeURIComponent(String(className ?? ''))}`)
  return data.rows ?? []
}

/** 保存某一次课：一个学生一行。 */
export async function saveLessons(payload) {
  return request('lessons/save', payload)
}

/** 在 Finder 里打开工作区里的某个目录。 */
export async function revealDir(dir) {
  return request('workspace/reveal', { dir })
}

/** 读工作区目录树（内容/私信/数据）。 */
export async function fetchTree() {
  const data = await request('workspace/tree')
  return data.tree ?? []
}

export async function regenAsset(id, target) {
  try {
    const data = await request('produce/regen', { id, target })
    setDesk({ state: data.state })
  } catch (err) {
    report(err)
  }
}

function mergeProduction(id, production, status) {
  setDesk(s => ({ state: { ...s.state, items: s.state.items.map(item => (item.id === id ? { ...item, production, ...(status ? { status } : {}) } : item)) } }))
}

/** 轮询进度，返回停止函数。 */
export function watchProduction(id) {
  let stopped = false
  const tick = async () => {
    while (!stopped) {
      try {
        const data = await request(`production?id=${encodeURIComponent(id)}`)
        if (stopped) return
        setDesk(s => ({ live: { ...s.live, [id]: data.live } }))
        if (data.production) mergeProduction(id, data.production, data.status)
      } catch {
        // 连接抖动时下一轮再试
      }
      await new Promise(r => setTimeout(r, 700))
    }
  }
  tick()
  return () => { stopped = true }
}

export async function saveSettings(payload) {
  try {
    const settings = await request('settings', payload)
    setLanguagePreference(settings.language)
    setDesk({ settings })
    toast(t('设置已保存'))
    return true
  } catch (err) {
    report(err)
    return false
  }
}

export async function fetchModels() {
  return request('models')
}

/** 切换助手模型；两个字段都空表示跟随默认。 */
export async function saveAssistant(assistant) {
  try {
    const settings = await request('settings', { assistant })
    setDesk({ settings, model: settings.assistantEffective ?? snapshot.model })
    toast(t('助手模型已切换'))
    return true
  } catch (err) {
    report(err)
    return false
  }
}

export async function testImage(payload) {
  try {
    const settings = await request('settings', payload)
    setLanguagePreference(settings.language)
    setDesk({ settings })
    const { src } = await request('settings/test', {})
    return src
  } catch (err) {
    report(err)
    return null
  }
}

function runActions(actions) {
  for (const action of actions) {
    if (action.type === 'produce' && action.id) {
      openItem(action.id)
      runProduce(action.id)
    }
    if (action.type === 'open' && action.id) openItem(action.id)
    if (action.type === 'nav' && action.view) setDesk({ view: action.view })
  }
}

export async function sendChat(text) {
  const { chatQuote: quote, focusId } = snapshot
  // 选中的段落或某一镜，随消息一起交给模型
  const message = quote ? (quote.text ? t('关于{label}「{quote}」：{text}', { label: quote.label, quote: quote.text, text }) : t('关于{label}：{text}', { label: quote.label, text })) : text
  setDesk(s => ({
    thinking: true,
    chatQuote: null,
    state: { ...s.state, chat: [...s.state.chat, { id: `tmp_${Date.now()}`, role: 'user', text: message, itemId: focusId ?? undefined }] },
  }))
  try {
    const data = await request('chat', { message, focusId: focusId ?? undefined })
    setDesk({ state: data.state, canUndo: true, modelOk: data.modelOk, modelError: data.modelError })
    runActions(data.actions || [])
  } catch (err) {
    report(err)
    await loadDesk()
  } finally {
    setDesk({ thinking: false })
  }
}

export async function revealSaved(id) {
  try {
    await request('produce/reveal', { id })
  } catch (err) {
    report(err)
  }
}

export async function clearChat() {
  try {
    const data = await request('chat/clear', {})
    setDesk({ state: data.state })
  } catch (err) {
    report(err)
  }
}

export async function captureUrl(url, extra = {}) {
  try {
    const data = await request('capture-url', { url, ...extra })
    setDesk({ state: data.state, canUndo: true })
    toast(t('已收藏到灵感墙'), { undo: true })
    return data.id
  } catch (err) {
    report(err)
    return null
  }
}

export async function uploadFile(file) {
  const res = await fetch(`${BASE}upload`, { method: 'POST', headers: { 'content-type': file.type, 'x-media-desk-lang': lang() }, body: file })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || t('上传失败'))
  return data
}

export async function captureFiles(files) {
  for (const file of files) {
    try {
      const { src, kind } = await uploadFile(file)
      const title = file.name.replace(/\.[^.]+$/, '')
      await dispatchOps([{ op: 'add_item', kind, title, media: { src } }], { label: t('收藏 {title}', { title }), silent: true })
      toast(t('已放到灵感墙'), { undo: true })
    } catch (err) {
      report(err)
    }
  }
}

export async function refreshAccount(payload) {
  try {
    const data = await request('account/refresh', payload)
    setDesk({ state: data.state, canUndo: true })
    if (data.fetchError) toast(t('读取主页失败：{error}', { error: data.fetchError }), { error: true })
    else toast(t('已更新账号档案'))
    return data
  } catch (err) {
    report(err)
    return null
  }
}

export async function extractStyle(payload) {
  try {
    const data = await request('style/extract', payload)
    setDesk({ state: data.state, canUndo: true })
    const missed = data.failures?.length ?? 0
    toast(missed ? t(plural(missed, '风格提炼好了，有 1 个链接没抓到', '风格提炼好了，有 {n} 个链接没抓到'), { n: missed }) : t('风格提炼好了，之后就按它写'), { undo: true })
    return true
  } catch (err) {
    report(err)
    return false
  }
}

export async function monidStatus() {
  try {
    return await request('monid/status')
  } catch (err) {
    return { state: 'error', message: err.message }
  }
}

let monidReadyCache = null
/** Monid 是不是真的能用（装了、而且配了密钥）。只问一次，之后用缓存。 */
export function useMonidReady() {
  const [ready, setReady] = React.useState(Boolean(monidReadyCache))
  React.useEffect(() => {
    if (monidReadyCache !== null) return
    monidStatus()
      .then(status => { monidReadyCache = status?.state === 'ready'; setReady(monidReadyCache) })
      .catch(() => { monidReadyCache = false })
  }, [])
  return ready
}

export async function importAccount(payload) {
  try {
    const data = await request('monid/import', payload)
    setDesk({ state: data.state, canUndo: true })
    const spent = data.cost ? t('，花费 ${cost}', { cost: data.cost.toFixed(3) }) : ''
    const what = t(plural(data.count, '读到 {name} 的 1 条内容，新增 {added} 条', '读到 {name} 的 {count} 条内容，新增 {added} 条'), { name: data.nickname, count: data.count, added: data.added })
    toast(data.styleError ? t('{what}{spent}。风格没提炼成：{error}', { what, spent, error: data.styleError }) : t('{what}，已提炼成风格{spent}', { what, spent }), { error: Boolean(data.styleError), undo: !data.styleError })
    return true
  } catch (err) {
    report(err)
    return false
  }
}

export async function learnSkills() {
  try {
    const data = await request('skills/learn', {})
    setDesk({ state: data.state, canUndo: true })
    toast(data.added ? t(plural(data.added, '从数据里提炼出 1 条新规则，等你确认', '从数据里提炼出 {n} 条新规则，等你确认'), { n: data.added }) : t('目前的数据还提炼不出新规则'))
  } catch (err) {
    report(err)
  }
}

export async function exportSkills() {
  try {
    const data = await request('skills/export', {})
    setDesk({ state: data.state })
    toast(t(plural(data.rules, '已导出 Skill：{name}（1 条规则）', '已导出 Skill：{name}（{n} 条规则）'), { name: data.name, n: data.rules }))
  } catch (err) {
    report(err)
  }
}

export function fetchInsights() {
  return request('insights')
}

