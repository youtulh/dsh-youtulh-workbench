// dsh-youtulh-workbench host 半片：/media-desk/* 接口、文件服务和模型调用。
import { createReadStream, existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve as path_resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assistantModelOverride, callModel, defaultSelection, extractJson, modelInfo, modelStatus, setAssistantModel } from './ai.js'
import { defaultExportDir, savePiece } from './export.js'
import { createTools } from './tools.js'
import { localSuggestions, normalizeSuggestions, suggestPrompts } from './suggest.js'
import { creativeText, localScript, localTopics, normalizeScript, normalizeTopics, scriptPrompt, topicsPrompt } from './topics.js'
import { LAYOUT, appendLead, dayStamp, ensureLayout, folderName, leadLessons, listTree, readAccounts, readLeads, readSettingsMarkdown, resolveRoot, updateLeadRow, writeAccounts, writeSettingsMarkdown } from './workspace.js'
import { applyOps, newId } from './ops.js'
import { publicSettings, Settings } from './settings.js'
import { Store } from './store.js'
import { currentLang, platformName, tr, withLang } from './i18n.js'
import { localizeSamples, samplesNeedLocale } from './seed.js'
import { createVersionCheck } from './version.js'

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const MAX_JSON = 4_000_000
const MAX_UPLOAD = 250_000_000
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' }
const UPLOAD_EXT = Object.fromEntries(Object.entries(MIME).filter(([ext]) => ext !== '.jpeg').map(([ext, type]) => [type, ext]))

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBuffer(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error(tr('内容太大')), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson(req) {
  const raw = await readBuffer(req, MAX_JSON)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw Object.assign(new Error(tr('请求不是有效的 JSON')), { status: 400 })
  }
}

/** 支持 Range，视频才能正常拖动和循环。 */
async function sendFile(req, res, file) {
  const type = MIME[extname(file).toLowerCase()]
  if (!type) return json(res, 404, { error: tr('不支持的文件类型') })
  let info
  try {
    info = await stat(file)
  } catch {
    return json(res, 404, { error: tr('文件不存在') })
  }
  res.setHeader('content-type', type)
  res.setHeader('accept-ranges', 'bytes')
  res.setHeader('cache-control', 'private, max-age=3600')
  res.setHeader('x-content-type-options', 'nosniff')
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1
    if (start >= info.size || start > end) {
      res.statusCode = 416
      res.setHeader('content-range', `bytes */${info.size}`)
      return res.end()
    }
    res.statusCode = 206
    res.setHeader('content-range', `bytes ${start}-${end}/${info.size}`)
    res.setHeader('content-length', end - start + 1)
    return createReadStream(file, { start, end }).pipe(res)
  }
  res.statusCode = 200
  res.setHeader('content-length', info.size)
  if (req.method === 'HEAD') return res.end()
  return createReadStream(file).pipe(res)
}

function engineLabel(ctx) {
  const info = modelInfo(ctx)
  return info ? info.label : null
}

/** 同一次故障只提醒一次，用人话说。原始错误放在模型状态的提示里。 */
function outageNotice(ctx, wasDown, fallback) {
  if (wasDown) return null
  return modelInfo(ctx) ? tr('模型暂时用不了，{fallback}。可以到设置里检查账号或密钥。', { fallback }) : tr('当前没有连接模型，{fallback}。', { fallback })
}

async function handleUpload(req, store, res) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  const ext = UPLOAD_EXT[type]
  if (!ext) return json(res, 415, { error: tr('不支持这种文件：{type}', { type: type || tr('未知') }) })
  const buffer = await readBuffer(req, MAX_UPLOAD)
  await store.read()
  const name = `${newId('f')}${ext}`
  await writeFile(join(store.filesDir, name), buffer)
  return json(res, 200, { src: `media-desk/files/${name}`, kind: type.startsWith('video/') ? 'video' : 'image' })
}

async function route(ctx, store, desk, req, res) {
  const url = new URL(req.url || '/', 'http://local')
  const path = url.pathname.replace(/^\/media-desk\/?/, '')
  const method = req.method || 'GET'

  if ((method === 'GET' || method === 'HEAD') && path.startsWith('assets/')) {
    const name = path.slice('assets/'.length)
    if (!/^[\w.-]+$/.test(name)) return json(res, 400, { error: tr('路径无效') })
    return sendFile(req, res, join(ASSETS_DIR, name))
  }
  if ((method === 'GET' || method === 'HEAD') && path.startsWith('files/')) {
    const name = path.slice('files/'.length)
    if (!/^[\w.-]+$/.test(name)) return json(res, 400, { error: tr('路径无效') })
    await store.read()
    return sendFile(req, res, join(store.filesDir, name))
  }
  if (method === 'GET') {
    if (path === 'state') {
      let state = await store.read()
      // 用户可能在编辑器里直接改了「我的设定.md」：文件优先，读进来盖掉状态
      try {
        const root = resolveRoot((await desk.settings.read()).saveRoot)
        // 老用户升级上来时 md 可能还不存在：先补写一份，agent 读到才有依据
        if (!existsSync(join(root, LAYOUT.settings))) writeSettingsMarkdown(root, state.positioning ?? {}, state.painPoints ?? [])
        const fromFile = readSettingsMarkdown(root)
        if (fromFile) {
          const same = JSON.stringify(fromFile.positioning) === JSON.stringify(state.positioning)
            && JSON.stringify(fromFile.painPoints) === JSON.stringify(state.painPoints)
          if (!same && (fromFile.positioning.subject || fromFile.painPoints.length)) {
            const merged = await store.mutate('从文件读取设定', (draft) => {
              draft.positioning = { ...(draft.positioning ?? {}), ...fromFile.positioning }
              draft.painPoints = fromFile.painPoints
              return draft
            }, { undoable: false })
            state = merged
          }
        }
        // 账号数据同样以工作区文件为准（有文件才覆盖，避免把空表写回去）
        const accounts = readAccounts(resolveRoot((await desk.settings.read()).saveRoot))
        if (accounts?.length && JSON.stringify(accounts.map(a => [a.platform, a.handle, a.followers])) !== JSON.stringify((state.accounts ?? []).map(a => [a.platform, a.handle, a.followers]))) {
          const merged = await store.mutate('从文件读取账号', (draft) => {
            draft.accounts = accounts.map(row => ({ ...row, id: `file_${row.platform}_${row.handle}` }))
            return draft
          }, { undoable: false })
          state = merged
        }
      } catch { /* 读不到就按状态里的来 */ }
      // 示例数据跟着界面语言走；用户自己的内容不动
      if (samplesNeedLocale(state, currentLang())) state = await store.mutate('', draft => (localizeSamples(draft, currentLang()), draft), { undoable: false })
      return json(res, 200, { state, model: engineLabel(ctx), modelOk: modelStatus.ok, modelError: modelStatus.error, canUndo: store.undo.length > 0 })
    }
    if (path === 'settings') return json(res, 200, { ...publicSettings(await desk.settings.read(), false), defaultExportDir: defaultExportDir() })
    if (path === 'models') {
      // 列出 Harness 里已接的提供方和它们公布的模型，给工作台的助手模型选择器用
      const llm = ctx.get('llm')
      const providers = llm ? await llm.listProviders() : []
      const settled = await Promise.allSettled(providers.map(async p => ({
        provider: p.id, name: p.name,
        models: (await llm.listModels(p.id)).map(m => ({ id: m.id, name: m.name || m.id })),
      })))
      return json(res, 200, {
        providers: settled.filter(r => r.status === 'fulfilled').map(r => r.value).filter(p => p.models.length),
        default: defaultSelection(ctx),
        current: assistantModelOverride(),
      })
    }
    if (path === 'workspace/leads') {
      const settings = await desk.settings.read()
      const root = resolveRoot(settings.saveRoot)
      return json(res, 200, { leads: readLeads(root), lessons: leadLessons(root) })
    }
    if (path === 'workspace/file') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const dir = path_resolve(String(url.searchParams.get('dir') ?? root))
      const name = String(url.searchParams.get('name') ?? '')
      if (!dir.startsWith(root) || !/^[\w\u4e00-\u9fa5. -]{1,80}$/.test(name)) return json(res, 400, { error: tr('路径无效') })
      try {
        const text = await readFile(join(dir, name), 'utf8')
        return json(res, 200, { text: text.slice(0, 60000) })
      } catch {
        return json(res, 404, { error: tr('读不到这个文件') })
      }
    }
    if (path === 'workspace/tree') {
      const settings = await desk.settings.read()
      const root = resolveRoot(settings.saveRoot)
      ensureLayout(root)
      return json(res, 200, { tree: listTree(root) })
    }
    if (path === 'suggest') {
      const state = await store.read()
      const key = JSON.stringify([state.positioning ?? {}, state.painPoints ?? []])
      if (suggestCache.key === key && Date.now() - suggestCache.at < 5 * 60 * 1000) {
        return json(res, 200, { prompts: suggestCache.list, source: 'cache' })
      }
      let list = []
      let source = 'local'
      try {
        const { text: raw } = await callModel(ctx, { system: suggestPrompts(state), user: '请给出这 5 个问题。', maxTokens: 600, light: true })
        list = normalizeSuggestions(extractJson(raw))
        if (list.length) source = 'model'
      } catch { /* 没有模型就用本地拼的 */ }
      if (!list.length) list = localSuggestions(state)
      suggestCache = { key, at: Date.now(), list }
      return json(res, 200, { prompts: list, source })
    }
    if (path === 'workspace/info') {
      const settings = await desk.settings.read()
      const root = resolveRoot(settings.saveRoot)
      ensureLayout(root)
      return json(res, 200, { root, settingsFile: join(root, LAYOUT.settings), leadsFile: join(root, LAYOUT.leads), contentDir: join(root, LAYOUT.content), dmDir: join(root, LAYOUT.dm) })
    }
    if (path === 'version') return json(res, 200, await desk.versionCheck.read())
    return json(res, 404, { error: tr('接口不存在') })
  }
  if (method !== 'POST') return json(res, 405, { error: tr('不支持的方法') })

  // 所有写操作都拒绝跨站请求
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return json(res, 403, { error: tr('拒绝跨站请求') })

  if (path === 'upload') return handleUpload(req, store, res)
  const body = await readJson(req)
  switch (path) {
    case 'ops': {
      const label = typeof body.label === 'string' ? body.label : tr('操作')
      const ops = Array.isArray(body.ops) ? body.ops : []
      // 用户在编辑器里手改过 我的设定.md 时，保存前先把他改过的字段捞回来，
      // 只搬「文件里有、状态里空」的字段，本次要改的字段仍以本次为准。
      if (ops.some(op => ['update_positioning', 'set_pain_points'].includes(op?.op))) {
        try {
          const fromFile = readSettingsMarkdown(resolveRoot((await desk.settings.read()).saveRoot))
          const current = await store.read()
          if (fromFile) {
            const touched = new Set(ops.flatMap(op => Object.keys(op ?? {}).filter(key => key !== 'op' && key !== 'points')))
            const merge = {}
            for (const [key, value] of Object.entries(fromFile.positioning ?? {})) {
              if (!touched.has(key) && value && !current.positioning?.[key]) merge[key] = value
            }
            if (Object.keys(merge).length) {
              await store.mutate('同步文件里的设定', (draft) => {
                draft.positioning = { ...(draft.positioning ?? {}), ...merge }
                return draft
              }, { undoable: false })
            }
            if (!touched.has('points') && fromFile.painPoints?.length && !(current.painPoints?.length)) {
              await store.mutate('同步文件里的痛点', (draft) => {
                draft.painPoints = fromFile.painPoints
                return draft
              }, { undoable: false })
            }
          }
        } catch { /* 读文件失败就用现有状态，不挡这次保存 */ }
      }
      const result = await store.mutate(label, (draft) => {
        const applied = applyOps(draft, ops)
        return { ...applied, state: draft }
      }, { undoable: body.undoable !== false })
      // 数据和本地文件是同一份真相：改了设定就写回 md，加了线索就追加 CSV
      const names = (Array.isArray(body.ops) ? body.ops : []).map(op => op?.op)
      try {
        const root = resolveRoot((await desk.settings.read()).saveRoot)
        if (names.includes('update_positioning') || names.includes('set_pain_points')) {
          const state = await store.read()
          writeSettingsMarkdown(root, state.positioning ?? {}, state.painPoints ?? [])
        }
        if (names.some(name => /account/.test(String(name)))) {
          const state = await store.read()
          writeAccounts(root, state.accounts ?? [])
        }
        if (names.includes('add_lead')) {
          const state = await store.read()
          const lead = state.leads?.[state.leads.length - 1]
          if (lead) appendLead(root, lead)
        }
      } catch { /* 文件写失败不影响这次操作本身 */ }
      return json(res, 200, result)
    }
    case 'undo': {
      const label = await store.undoLast()
      return json(res, 200, { label, state: await store.read(), canUndo: store.undo.length > 0 })
    }
    case 'topics': {
      // 一次给 30 个选题草稿，页面里直接勾选，不跳对话
      const count = Math.min(40, Math.max(5, Number(body.count) || 30))
      const state = await store.read()
      let topics = []
      let source = 'local'
      try {
        const { text: raw } = await callModel(ctx, { ...topicsPrompt(state, count), maxTokens: 1600, light: true })
        topics = normalizeTopics(extractJson(raw), count)
        if (topics.length) source = 'model'
      } catch { /* 没模型就用本地模板 */ }
      if (!topics.length) topics = localTopics(state, count)
      return json(res, 200, { topics, source })
    }
    case 'scripts': {
      // 给勾中的选题逐条生成口播：标题 + 稿子 + 标签
      const topics = (Array.isArray(body.topics) ? body.topics : []).map(row => String(row ?? '').trim()).filter(Boolean).slice(0, 40)
      if (!topics.length) return json(res, 400, { error: tr('先选几个选题') })
      const state = await store.read()
      const results = []
      let usedModel = false
      for (let i = 0; i < topics.length; i += 3) {
        const chunk = topics.slice(i, i + 3)
        const rows = await Promise.all(chunk.map(async (topic) => {
          try {
            const { text: raw } = await callModel(ctx, { ...scriptPrompt(state, topic), maxTokens: 1200, light: true })
            const one = normalizeScript(extractJson(raw))
            if (one.title && one.script) {
              usedModel = true
              return { topic, ...one }
            }
          } catch { /* 单条失败就退回本地模板，不影响其它条 */ }
          return { topic, ...localScript(state, topic) }
        }))
        results.push(...rows)
      }
      return json(res, 200, { scripts: results, source: usedModel ? 'model' : 'local' })
    }
    case 'output/save': {
      // 写成本地文件（Word + Markdown）再登记进产出库，用户能看见、能打开
      const rawTitle = String(body.title ?? '').trim() || tr('未命名的一篇')
      const content = String(body.content ?? '')
      if (!content.trim()) return json(res, 400, { error: tr('还没有可以保存的内容') })
      const settings = await desk.settings.read()
      const root = resolveRoot(settings.saveRoot)
      ensureLayout(root)
      const kind = String(body.kind ?? 'script')
      const sub = kind === 'dm' ? LAYOUT.dm : kind === 'data' ? LAYOUT.data : LAYOUT.content
      const title = `${dayStamp()} ${folderName(rawTitle)}`
      const formats = Array.isArray(body.formats) && body.formats.length ? body.formats : (kind === 'data' ? ['csv'] : ['docx', 'md'])
      const saved = await savePiece({ dir: join(root, sub), title, text: content, formats })
      return json(res, 200, { dir: saved.dir, files: saved.files, summary: String(body.summary ?? '').slice(0, 120) })
    }
    case 'workspace/lead/update': {
      // 家长有反应了：按行号改这一条的「反应 / 结果 / 下一步 / 话术」
      const index = Number(body.index)
      if (!Number.isInteger(index) || index < 0) return json(res, 400, { error: tr('行号不对') })
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const leads = updateLeadRow(root, index, body.patch ?? {})
      if (!leads) return json(res, 404, { error: tr('没找到这一行') })
      return json(res, 200, { leads, lessons: leadLessons(root) })
    }
    case 'workspace/reveal': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const dir = path_resolve(String(body.dir ?? root))
      if (!dir.startsWith(root)) return json(res, 400, { error: tr('只能打开工作区里的目录') })
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
      execFile(command, [dir], () => {})
      return json(res, 200, { path: dir })
    }
    case 'settings': {
      const before = modelInfo(ctx)
      const updated = await desk.settings.update(body)
      setAssistantModel(updated.assistant)
      const after = modelInfo(ctx)
      // 换了模型，上一个模型的失败状态不再算数
      if (before?.provider !== after?.provider || before?.model !== after?.model) Object.assign(modelStatus, { ok: null, error: null })
      return json(res, 200, { ...publicSettings(updated, false), defaultExportDir: defaultExportDir(), assistantEffective: modelInfo(ctx)?.label ?? null })
    }
    default: return json(res, 404, { error: tr('接口不存在') })
  }
}

/**
 * Web 服务不会替插件路由鉴权，所以每个请求都要自己走一遍 Host/Origin 和登录凭证检查。
 * 拿不到鉴权服务时一律拒绝。
 * @param {object} ctx - Cordis 上下文。
 * @param {{headers: object}} req - HTTP 请求。
 * @returns {number|undefined} 拒绝时的状态码；可以继续时为 undefined。
 */
export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return 403
  return connection.requestRejection({ headers: req.headers })
}

export const name = 'dsh-youtulh-workbench'

export default {
  inject: ['webServer', 'connection', 'tools'],
  apply(ctx) {
    const store = new Store()
    const settings = new Settings(store.root)
    const desk = { settings, versionCheck: createVersionCheck() }
    // 案例提示词的缓存：设定没变就直接给上次那五条
    let suggestCache = { key: '', at: 0, list: [] }
    // 对话里的 agent 用这两个工具把产出写进工作区
    ctx.effect(() => {
      // 工具只在有 tools 服务的宿主里注册；单元测试的假 ctx 没有它
      if (typeof ctx.tools?.register !== 'function') return () => {}
      const offs = createTools({ settings }).map(tool => ctx.tools.register(tool))
      return () => offs.forEach(off => off?.())
    }, 'dsh-youtulh-workbench: workspace tools')
    // 启动时恢复用户在工作台里选过的助手模型
    settings.read().then(saved => setAssistantModel(saved.assistant)).catch(() => {})
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/media-desk',
      handler: async (req, res) => {
        try {
          const rejection = requestRejection(ctx, req)
          if (rejection) {
            json(res, rejection, { error: tr('未授权') })
            return
          }
          await withLang(req.headers['x-media-desk-lang'], () => route(ctx, store, desk, req, res))
        } catch (err) {
          if (res.headersSent) {
            res.end()
            return
          }
          json(res, err.status || 500, { error: err.message })
        }
      },
    }), 'dsh-youtulh-workbench: /media-desk routes')
  },
}
