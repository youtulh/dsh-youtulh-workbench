// dsh-youtulh-workbench host 半片：/media-desk/* 接口、文件服务和模型调用。
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve as path_resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { assistantModelOverride, callModel, defaultSelection, extractJson, modelInfo, modelStatus, setAssistantModel } from './ai.js'
import { defaultExportDir, savePiece } from './export.js'
import { createTools } from './tools.js'
import { LEGACY_SAMPLES, STYLE_VERSION, styleMarkdown } from './style-guide.js'
import { buildLessonBlock, rescore, writeLessonMarkdown } from './lessons.js'
import { localSuggestions, normalizeSuggestions, suggestPrompts } from './suggest.js'
import { fillTopicAngles, guessTopicAngle, improvePrompt, leadPack, localSingle, localTodayTopics, localTopics, localVariants, normalizeBrief, normalizeImprove, normalizeSingle, normalizeTodayTopics, normalizeTopicEntries, normalizeVariants, singleScriptPrompt, todayTopicsPrompt, topicsPrompt, variantsPrompt } from './topics.js'
import { CHANNELS, appendCase, appendChat, chatLessons, chatPrompt, chatRevisePrompt, localChat, normalizeChat, readCases, readChats, readPlatformWords, removeCase, removeChat, updateCase, updateChatRow, writePlatformWords } from './chat.js'
import { appendFeedback, feedbackPrompt, localFeedback, readFeedback, removeFeedback } from './feedback.js'
import { decodeResult, localDiagnostic, normalizeDiagnostic, scoreDiagnostic, compareScores, encodeResult } from './diagnostics.js'
import { analysisPrompt, diagnosticPrompt, localAnalysis, postDiagnosticPrompt } from './diagnostics-prompt.js'
import { formatParentSlot, validateParentReply } from './replies.js'
import { DIAG_COLUMNS, diagnosticDir, ensureDiagnosticDir, listDiagnostics, readDiagnosticFile, readDiagnosticResult, readManifest, readPostSpec, saveDiagnosticRow, writeDiagnosticFile, writeDiagnosticHtml, writeDiagnosticResult, writeManifest, writePostSpec } from './diagnostics-store.js'
import { renderDiagnosticHtml } from './diagnostics-render.js'
import { PAPER_EXTS, extractPaperText, paperExtractPrompt } from './papers.js'
import { leadAnalyzePrompt, localAnalyzedLead, normalizeAnalyzedLeads } from './lead-analyze.js'
import { listPapers, listQuestions, removeQuestion, savePaper, savePaperFile, savePaperText, saveQuestions, updateQuestion } from './bank-store.js'
import { normalizeExtractedQuestions, selectBankQuestions, specFromBank } from './question-bank.js'
import { parseBrief } from './brief.js'
import { LAYOUT, backupWorkspace, contentKey, appendLead, archiveTopics, batchId, dayStamp, ensureLayout, folderName, leadLessons, listBackups, listTree, parseVoiceSamples, readAccounts, readContent, readLeads, readSettingsMarkdown, readTable, readVoiceSamples, recordContent, removeContent, removeLeadRow, resolveRoot, restoreWorkspace, updateContent, updateLeadRow, writeAccounts, writeSettingsMarkdown } from './workspace.js'
import { applyOps, newId } from './ops.js'
import { legacyTables, readClasses, readLessons, readStudents, removeClass, removeStudent, saveClass, saveLessonRows, saveStudent, upgradeTables } from './students.js'
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

// 平台后台导出的列名五花八门，先归一到内容库的叫法。顺序有讲究：
// 「视频发布时间」要落到 发布日，不能被「视频」两个字抢去当标题。
const IMPORT_KEYS = ['发布日', '播放', '涨粉', '私信', '加微', '平台', '标题']
const IMPORT_ALIAS = {
  '发布日': ['发布日', '发布日期', '发布时间', '发布日时间'],
  '播放': ['播放', '播放量', '播放数', '播放次数', '观看量'],
  '涨粉': ['涨粉', '新增粉丝', '涨粉数', '新增关注', '涨粉人数'],
  '私信': ['私信', '私信数', '咨询数', '私信咨询', '咨询人数'],
  '加微': ['加微', '加微信', '加微数', '加微信数'],
  '平台': ['平台', '渠道', '发布平台'],
  '标题': ['标题', '作品名称', '视频标题', '笔记标题', '作品', '笔记'],
}
export function canonImportColumn(cell) {
  const name = String(cell ?? '').trim().replace(/[\s*]/g, '')
  if (!name) return ''
  for (const key of IMPORT_KEYS) if (IMPORT_ALIAS[key].some(alias => name === alias)) return key
  for (const key of IMPORT_KEYS) if (IMPORT_ALIAS[key].some(alias => name.startsWith(alias) || name.endsWith(alias))) return key
  return name
}

/** 把粘贴进来的平台数据切成行：表头认得出就按列名对，认不出就按 标题,播放,涨粉,私信 的顺序。 */
export function parseImportTable(raw) {
  const lines = String(raw ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())
  if (!lines.length) return { hasHead: false, keys: ['标题', '播放', '涨粉', '私信'], data: [] }
  const cells = lines.map(line => line.split(/\t|,/).map(cell => cell.trim().replace(/^"|"$/g, '')))
  const head = cells[0].map(cell => cell.trim())
  const cols = head.map(canonImportColumn)
  const hasHead = cols.filter(col => IMPORT_KEYS.includes(col)).length >= 2
  const keys = hasHead ? cols : ['标题', '播放', '涨粉', '私信']
  const data = (hasHead ? cells.slice(1) : cells).map(row => Object.fromEntries(keys.map((col, i) => [col, row[i] ?? ''])))
  return { hasHead, keys, data }
}

/** 从 Excel / 表格里粘进来的名单：认表头、认逗号或 Tab、带引号的单元格不拆列。 */
export function parsePastedTable(raw) {
  const text = String(raw ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (!text) return []
  const lines = text.split('\n').filter(line => line.trim())
  const delimiter = lines[0].includes('\t') ? '\t' : ','
  return lines.map(line => parseDelimitedLine(line, delimiter))
}

function parseDelimitedLine(line, delimiter) {
  const cells = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { cell += '"'; i += 1 }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === delimiter) { cells.push(cell.trim()); cell = '' }
    else cell += char
  }
  cells.push(cell.trim())
  return cells
}

const STUDENT_IMPORT_ALIAS = {
  name: ['姓名', '学生', '学生姓名', '名字', '孩子'],
  grade: ['年级'],
  school: ['学校', '学校名称'],
  contact: ['微信', '手机', '电话', '联系方式', '微信手机', '手机号', '联系电话', '微信/手机'],
  layer: ['卡点层', '卡点', '薄弱点'],
  className: ['班', '班级', '所在班', '在哪个班'],
  source: ['来源'],
  note: ['备注', '情况', '说明'],
  status: ['状态', '学生状态'],
}
const STUDENT_IMPORT_KEYS = Object.keys(STUDENT_IMPORT_ALIAS)

const LEAD_IMPORT_ALIAS = {
  date: ['日期', '时间'],
  name: ['姓名', '家长', '家长姓名'],
  grade: ['年级'],
  school: ['学校'],
  painPoint: ['卡点', '痛点'],
  source: ['来源'],
  type: ['类型'],
  category: ['分类'],
  raw: ['原文', '私信原文', '对方说'],
  draft: ['话术', '我方回'],
  reaction: ['反应'],
  result: ['结果'],
  next: ['下一步', '下次做什么'],
  stage: ['阶段'],
  nextAt: ['下次跟进', '跟进日期'],
  followUps: ['跟进次数'],
}
const LEAD_IMPORT_KEYS = Object.keys(LEAD_IMPORT_ALIAS)

function leadImportColumn(cell) {
  const name = String(cell ?? '').trim().replace(/[\s*]/g, '')
  if (!name) return ''
  for (const key of LEAD_IMPORT_KEYS) {
    if (LEAD_IMPORT_ALIAS[key].includes(name)) return key
  }
  return ''
}

/** 导入的日期：认 2026-11-26 / 2026/11/26 / 11/26（当年），认不出就留空。 */
export function normalizeImportDate(value) {
  const raw = String(value ?? '').trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw)
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`
  m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(raw)
  if (m) return `${new Date().getFullYear()}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`
  return ''
}

export function parseLeadTable(raw) {
  const table = parsePastedTable(raw)
  if (table.length < 2) return { cols: [], rows: [] }
  const cols = table[0].map(leadImportColumn)
  const rows = table.slice(1).map(cells => {
    const row = {}
    for (let i = 0; i < cols.length; i += 1) if (cols[i]) row[cols[i]] = cells[i] ?? ''
    return row
  }).filter(row => String(row.name ?? '').trim() || String(row.raw ?? '').trim())
  return { cols, rows }
}

function studentImportColumn(cell) {
  const name = String(cell ?? '').trim().replace(/[\s*]/g, '')
  if (!name) return ''
  for (const key of STUDENT_IMPORT_KEYS) {
    if (STUDENT_IMPORT_ALIAS[key].includes(name)) return key
  }
  return ''
}

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

function sendHtml(res, html) {
  res.statusCode = 200
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(html)
}

async function withBrandLogo(store, brand = {}) {
  const out = { ...brand }
  const raw = String(brand.logo ?? '').trim()
  if (raw.startsWith('data:image/')) return out
  const hit = /^(?:media-desk\/)?files\/([\w.-]+)$/.exec(raw)
  if (!hit) return out
  const ext = extname(hit[1]).toLowerCase()
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext]
  if (!mime) return out
  try {
    const buffer = await readFile(join(store.filesDir, hit[1]))
    if (buffer.length > 2 * 1024 * 1024) return out
    out.logo = `data:${mime};base64,${buffer.toString('base64')}`
  } catch { /* 没传 logo 就用字标 */ }
  return out
}

async function ocrChatImage(file) {
  const out = join(tmpdir(), `youtulh-ocr-${Date.now()}.jsonl`)
  const run = command => new Promise((resolve, reject) => execFile(command[0], command.slice(1), { timeout: 60000 }, err => err ? reject(err) : resolve()))
  try {
    try { await run([join(ASSETS_DIR, 'ocr'), out, file]) }
    catch { await run(['swift', join(ASSETS_DIR, 'ocr.swift'), out, file]) }
    const raw = await readFile(out, 'utf8')
    return raw.split(/\r?\n/).map(line => { try { return JSON.parse(line).text } catch { return '' } }).filter(Boolean).join('\n')
  } catch (err) {
    throw new Error(`截图识别失败：${err.message}`)
  }
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
        // 说话样本也落成文件：用户想换成自己的口气，直接改这个 md
        const styleFile = join(root, LAYOUT.style)
        const styleText = existsSync(styleFile) ? readFileSync(styleFile, 'utf8') : ''
        const marked = /^<!--\s*v(\d+)\s*-->/.exec(styleText)
        if (!styleText) {
          // 第一次用：生成一份空的模板，让用户填自己的话
          ensureLayout(root)
          writeFile(styleFile, styleMarkdown()).catch(() => {})
        } else if (marked && Number(marked[1]) < Number(String(STYLE_VERSION).slice(1))) {
          // 旧版本生成的：规则升到新版，原话样本保留（只保留用户自己的，老硬编码的数学样本清掉）
          const old = parseVoiceSamples(styleText)
          const own = old.filter(row => !LEGACY_SAMPLES.some(legacy => legacy.includes(row) || row.includes(legacy)))
          ensureLayout(root)
          writeFile(styleFile, styleMarkdown(own)).catch(() => {})
        }
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
    if (path === 'students') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      return json(res, 200, { students: readStudents(root), classes: readClasses(root) })
    }
    if (path === 'lessons') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      return json(res, 200, { rows: readLessons(root, url.searchParams.get('class') ?? '') })
    }
    if (path === 'topics/history') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const rows = readTable(root, '选题库.csv').rows
      const map = new Map()
      for (const row of rows) {
        const batch = String(row['批次'] ?? '').trim() || String(row['日期'] ?? '').trim()
        const topic = String(row['选题'] ?? '').trim()
        if (!batch || !topic) continue
        const item = map.get(batch) ?? { batch, date: row['日期'] ?? '', topics: [], picked: 0 }
        item.topics.push({ topic, picked: String(row['勾选'] ?? '').trim() === '是' })
        map.set(batch, item)
      }
      const batches = [...map.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 20)
      return json(res, 200, { batches })
    }
    if (path === 'workspace/stats') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const legacy = legacyTables(root)
      return json(res, 200, { legacy,
        leads: readLeads(root).length,
        students: readStudents(root).length,
        classes: readClasses(root).length,
        lessons: readLessons(root).length,
        chats: readChats(root).length,
        content: readContent(root).length,
        feedback: readFeedback(root).length,
        backups: listBackups(root).length,
      })
    }
    if (path === 'workspace/backups') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      return json(res, 200, { backups: listBackups(root) })
    }
    if (path === 'feedback/list') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      return json(res, 200, { rows: readFeedback(root, url.searchParams.get('name') ?? '', url.searchParams.get('id') ?? '') })
    }
    if (path === 'workspace/leads') {
      const settings = await desk.settings.read()
      const root = resolveRoot(settings.saveRoot)
      return json(res, 200, { leads: readLeads(root), lessons: leadLessons(root), contentLessons: buildLessonBlock(root) })
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
    if (path === 'content') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const rows = readContent(root)
        .slice()
        .sort((a, b) => String(b['创建时间'] || b['日期']).localeCompare(String(a['创建时间'] || a['日期'])))
      const hits = rows.filter(row => row['爆款'] === '是').length
      const sum = key => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0)
      const views = sum('播放')
      const dms = sum('私信')
      const added = sum('加微')
      // 每万播能带来几条私信、私信里有多少能加到微信 —— 比单纯看播放有用
      const per10k = views ? Math.round((dms / views) * 10000 * 10) / 10 : 0
      const addRate = dms ? Math.round((added / dms) * 1000) / 10 : 0
      return json(res, 200, {
        rows, removed,
        stats: { count: rows.length, hits, views, follows: sum('涨粉'), dms, added, per10k, addRate },
        lessons: buildLessonBlock(root),
      })
    }
    if (path === 'platform-words') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      return json(res, 200, { ...readPlatformWords(root), file: join(root, LAYOUT.words) })
    }
    if (path === 'chat/records') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const all = readChats(root)
      // 记录会越攒越多，页面只要最近 300 轮；经验/案例还是读全量
      return json(res, 200, { rows: all.slice(-300), total: all.length, cases: readCases(root) })
    }
    if (path === 'voice') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      return json(res, 200, { samples: readVoiceSamples(root), file: join(root, LAYOUT.style) })
    }
    if (path === 'suggest') {
      const state = await store.read()
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const key = JSON.stringify([state.positioning ?? {}, state.painPoints ?? []])
      if (suggestCache.key === key && Date.now() - suggestCache.at < 5 * 60 * 1000) {
        return json(res, 200, { prompts: suggestCache.list, source: 'cache' })
      }
      let list = []
      let source = 'local'
      try {
        const { text: raw } = await callModel(ctx, { system: suggestPrompts(state, buildLessonBlock(root)), user: '请给出这 5 个问题。', maxTokens: 600, light: true })
        list = normalizeSuggestions(extractJson(raw))
        if (list.length) source = 'model'
      } catch { /* 没有模型就用本地拼的 */ }
      if (!list.length) list = localSuggestions(state)
      suggestCache = { key, at: Date.now(), list }
      return json(res, 200, { prompts: list, source })
    }
    if (path === 'papers') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      return json(res, 200, { papers: listPapers(root), questions: listQuestions(root) })
    }
    if (path === 'questions') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      return json(res, 200, { questions: listQuestions(root) })
    }
    if (path === 'diagnostics') {
      const settings = await desk.settings.read()
      const root = resolveRoot(settings.saveRoot)
      ensureLayout(root)
      return json(res, 200, {
        rows: listDiagnostics(root),
        brand: settings.brand ?? {},
        modelOk: modelStatus.ok,
        modelError: modelStatus.error,
      })
    }
    if (path === 'diagnostics/spec') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const id = String(url.searchParams.get('id') ?? '').trim()
      const row = listDiagnostics(root).find(item => item.id === id)
      if (!row) return json(res, 404, { error: tr('没找到这份诊断') })
      return json(res, 200, { row, spec: readManifest(root, row) })
    }
    if (path === 'diagnostics/download') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const id = String(url.searchParams.get('id') ?? '').trim()
      const kind = String(url.searchParams.get('kind') ?? 'pre') === 'post' ? 'post' : 'pre'
      const row = listDiagnostics(root).find(item => item.id === id)
      if (!row) return json(res, 404, { error: tr('没找到这份诊断') })
      const spec = kind === 'post' ? readPostSpec(root, row) : readManifest(root, row)
      if (!spec) return json(res, 404, { error: tr('这份卷子还没生成') })
      const preResult = kind === 'post' ? readDiagnosticResult(root, row, 'pre') : null
      const preSpec = kind === 'post' ? readManifest(root, row) : null
      const pre = preResult && preSpec ? scoreDiagnostic(preSpec, preResult.answers) : null
      const html = renderDiagnosticHtml(spec, { kind, pre })
      const name = `${row.student || '学生'}-${row.lesson || '试听'}-${kind === 'post' ? '课后检测' : '诊断卷'}.html`
      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
      res.setHeader('cache-control', 'no-store')
      return res.end(html)
    }
    if (path === 'diagnostics/preview') {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const id = String(url.searchParams.get('id') ?? '').trim()
      const kind = String(url.searchParams.get('kind') ?? 'pre') === 'post' ? 'post' : 'pre'
      const row = listDiagnostics(root).find(item => item.id === id)
      if (!row) return json(res, 404, { error: tr('没找到这份诊断') })
      const spec = kind === 'post' ? readPostSpec(root, row) : readManifest(root, row)
      if (!spec) return json(res, 404, { error: tr('这份卷子还没生成') })
      const preResult = kind === 'post' ? readDiagnosticResult(root, row, 'pre') : null
      const preSpec = kind === 'post' ? readManifest(root, row) : null
      const pre = preResult && preSpec ? scoreDiagnostic(preSpec, preResult.answers) : null
      return sendHtml(res, renderDiagnosticHtml(spec, { kind, pre }))
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
  if (path === 'papers/upload') {
    const root = resolveRoot((await desk.settings.read()).saveRoot)
    const name = decodeURIComponent(String(req.headers['x-filename'] ?? '卷子'))
    const ext = extname(name).toLowerCase()
    if (!PAPER_EXTS.includes(ext)) return json(res, 415, { error: tr('只支持 PDF、Word、txt、md 或图片') })
    const buffer = await readBuffer(req, 30 * 1024 * 1024)
    const file = savePaperFile(root, name, buffer)
    const id = newId('PAPER')
    const paper = savePaper(root, { id, name: basename(name, ext) || '未命名卷子', file, status: '待解析' })
    return json(res, 200, { paper })
  }
  const body = await readJson(req)
  switch (path) {
    case 'papers/extract': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const id = String(body.id ?? '').trim()
      const paper = listPapers(root).find(row => row.id === id)
      if (!paper) return json(res, 404, { error: tr('没找到这份卷子') })
      try {
        const meta = { ...paper, ...(body.meta ?? {}) }
        let text = String(body.text ?? '').trim()
        const file = join(root, paper.file)
        const ext = extname(paper.file).toLowerCase()
        if (!text) text = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? await ocrChatImage(file) : await extractPaperText(file, ext)
        if (!text) return json(res, 400, { error: tr('这份卷子没读到文字，可能是扫描件') })
        savePaper(root, { ...paper, text: savePaperText(root, meta.name || paper.name, text), status: '拆题中' })
        const { text: raw } = await callModel(ctx, { ...paperExtractPrompt(text, meta), maxTokens: 5000 })
        const questions = normalizeExtractedQuestions(extractJson(raw), meta)
        saveQuestions(root, questions)
        const next = savePaper(root, { ...paper, text: join(LAYOUT.bankRaw, `${folderName(meta.name || paper.name, 80)}.txt`), count: questions.length, status: '待确认' })
        return json(res, 200, { paper: next, questions })
      } catch (err) {
        savePaper(root, { ...paper, status: '解析失败' })
        return json(res, 400, { error: tr('拆题没成功：{msg}', { msg: err.message }) })
      }
    }
    case 'questions/update': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const question = updateQuestion(root, String(body.id ?? ''), body.patch ?? {})
      if (!question) return json(res, 404, { error: tr('没找到这道题') })
      return json(res, 200, { question })
    }
    case 'questions/confirm': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [String(body.id ?? '')]
      const questions = listQuestions(root).map(row => ids.includes(row.id) ? { ...row, status: '已确认' } : row)
      saveQuestions(root, questions)
      return json(res, 200, { questions })
    }
    case 'questions/remove': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      removeQuestion(root, String(body.id ?? ''))
      return json(res, 200, { questions: listQuestions(root) })
    }
    case 'diagnostics/from-brief': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const questions = listQuestions(root).filter(row => row.status === '已确认')
      if (!questions.length) return json(res, 400, { error: tr('题库还是空的：先上传卷子并确认入库'), code: 'EMPTY_BANK' })
      const state = await store.read()
      const parsed = parseBrief(String(body.brief ?? ''), questions, state)
      let selected
      try {
        selected = selectBankQuestions(questions, {
          subject: parsed.subject, grade: parsed.grade, knowledgePoints: parsed.knowledgePoints,
          count: Number(body.count) === 10 ? 10 : parsed.count, mix: parsed.mix,
        })
      } catch (err) {
        return json(res, 400, { error: err.message, shortage: err.shortage ?? [], code: 'SHORTAGE' })
      }
      const settings = await desk.settings.read()
      const brand = await withBrandLogo(store, settings.brand ?? {})
      const lesson = {
        title: [parsed.grade, parsed.subject, parsed.knowledgePoints[0] ? parsed.knowledgePoints[0].split(/[—\-－]/)[0] : '诊断'].filter(Boolean).join(' · '),
        subject: parsed.subject, grade: parsed.grade, at: '', code: '',
      }
      const student = { name: '', grade: parsed.grade }
      const id = newId('DIAG')
      const spec = specFromBank(selected, { title: `${lesson.title} 诊断卷`, brand, lesson, student })
      spec.id = id
      writeManifest(root, id, spec)
      writeDiagnosticHtml(root, id, '课前诊断.html', renderDiagnosticHtml(spec, { kind: 'pre' }))
      const row = saveDiagnosticRow(root, {
        id, createdAt: spec.createdAt, status: '待作答', student: '', grade: parsed.grade,
        subject: parsed.subject, lesson: lesson.title, at: '', code: '', brand: brand.name,
        dir: join(LAYOUT.diagnostics, id), note: `一句话出卷：${parsed.brief}`,
      })
      return json(res, 200, { row, spec, dir: join(LAYOUT.diagnostics, id), parsed })
    }
    case 'diagnostics/create': {
      const settings = await desk.settings.read()
      const root = resolveRoot(settings.saveRoot)
      ensureLayout(root)
      const brand = await withBrandLogo(store, { ...(settings.brand ?? {}), ...(body.brand ?? {}) })
      if (!brand.mark) brand.mark = String(brand.name ?? '').trim().slice(0, 1)
      const lesson = body.lesson ?? {}
      if (!String(lesson.title ?? '').trim()) return json(res, 400, { error: tr('先填课程名') })
      const id = newId('DIAG')
      const input = {
        id, brand,
        lesson,
        student: body.student ?? {},
        count: Number(body.count) === 10 ? 10 : 15,
        createdAt: new Date().toISOString(),
        method: String(body.method ?? '').trim(),
      }
      if (body.bank) {
        const config = body.bank ?? {}
        let selected
        try {
          selected = selectBankQuestions(listQuestions(root), {
            subject: config.subject || lesson.subject,
            grade: config.grade || lesson.grade,
            term: config.term,
            paperIds: config.paperIds,
            knowledgePoints: config.knowledgePoints,
            count: Number(config.count) === 10 ? 10 : 15,
            exclude: config.exclude,
          })
        } catch (err) {
          return json(res, 400, { error: err.message, shortage: err.shortage ?? [] })
        }
        const id = newId('DIAG')
        const spec = specFromBank(selected, {
          title: `${lesson.title} · 诊断卷`, brand, lesson, student: body.student ?? {},
        })
        spec.id = id
        writeManifest(root, id, spec)
        writeDiagnosticHtml(root, id, '课前诊断.html', renderDiagnosticHtml(spec, { kind: 'pre' }))
        const row = saveDiagnosticRow(root, {
          id, createdAt: spec.createdAt, status: '待作答', student: spec.student.name, grade: spec.student.grade,
          subject: spec.lesson.subject, lesson: spec.lesson.title, at: spec.lesson.at, code: spec.lesson.code,
          brand: spec.brand.name, dir: join(LAYOUT.diagnostics, id), note: '题库组卷',
        })
        return json(res, 200, { row, spec, source: 'bank', dir: join(LAYOUT.diagnostics, id) })
      }
      let spec = null
      let source = 'model'
      try {
        const { text: raw } = await callModel(ctx, { ...diagnosticPrompt(await store.read(), input), maxTokens: 3600 })
        spec = normalizeDiagnostic(extractJson(raw), input)
      } catch (err) {
        const subject = String(lesson.subject ?? settings.brand?.subject ?? '').trim()
        if (subject === '化学' || /氧化还原|配平/.test(`${lesson.title} ${lesson.topic}`)) {
          spec = localDiagnostic(input)
          source = 'template'
        } else {
          return json(res, 400, { error: tr('诊断卷没生成出来：{msg}', { msg: err.message }) })
        }
      }
      spec.id = id
      const dir = writeManifest(root, id, spec)
      const html = renderDiagnosticHtml(spec, { kind: 'pre' })
      writeDiagnosticHtml(root, id, '课前诊断.html', html)
      const row = saveDiagnosticRow(root, {
        id, createdAt: spec.createdAt, status: '待作答', student: spec.student.name, grade: spec.student.grade,
        subject: spec.lesson.subject, lesson: spec.lesson.title, at: spec.lesson.at, code: spec.lesson.code,
        brand: spec.brand.name, dir: join(LAYOUT.diagnostics, id),
        note: source === 'template' ? '模板卷（模型没通）' : '',
      })
      return json(res, 200, { row, spec, source, dir })
    }
    case 'diagnostics/update': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const id = String(body.id ?? '').trim()
      const row = listDiagnostics(root).find(item => item.id === id)
      if (!row) return json(res, 404, { error: tr('没找到这份诊断') })
      const spec = readManifest(root, row)
      if (!spec) return json(res, 404, { error: tr('诊断卷文件不见了') })
      const patch = body.patch ?? {}
      const student = { ...(spec.student ?? {}), ...(patch.student ?? {}) }
      const lesson = { ...(spec.lesson ?? {}), ...(patch.lesson ?? {}) }
      const brand = { ...(spec.brand ?? {}), ...(patch.brand ?? {}) }
      const next = { ...spec, student, lesson, brand }
      writeManifest(root, id, next)
      writeDiagnosticHtml(root, id, '课前诊断.html', renderDiagnosticHtml(next, { kind: 'pre' }))
      const postSpec = readPostSpec(root, row)
      const preResult = readDiagnosticResult(root, row, 'pre')
      if (postSpec) writeDiagnosticHtml(root, id, '课后检测.html', renderDiagnosticHtml(postSpec, { kind: 'post', pre: preResult ? scoreDiagnostic(next, preResult.answers) : null }))
      const rowNext = saveDiagnosticRow(root, {
        ...row, student: student.name, grade: student.grade, subject: lesson.subject, lesson: lesson.title,
        at: lesson.at, code: lesson.code, brand: brand.name, note: patch.note ?? row.note,
      })
      return json(res, 200, { row: rowNext, spec: next })
    }
    case 'diagnostics/duplicate': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const id = String(body.id ?? '').trim()
      const row = listDiagnostics(root).find(item => item.id === id)
      if (!row) return json(res, 404, { error: tr('没找到这份诊断') })
      const spec = readManifest(root, row)
      if (!spec) return json(res, 404, { error: tr('诊断卷文件不见了') })
      const next = JSON.parse(JSON.stringify(spec))
      const nextId = newId('DIAG')
      next.id = nextId
      next.createdAt = new Date().toISOString()
      if (body.student?.name) next.student.name = String(body.student.name).trim().slice(0, 40)
      if (body.student?.grade) next.student.grade = String(body.student.grade).trim().slice(0, 20)
      next.title = String(body.title ?? next.title ?? '').slice(0, 80)
      writeManifest(root, nextId, next)
      writeDiagnosticHtml(root, nextId, '课前诊断.html', renderDiagnosticHtml(next, { kind: 'pre' }))
      const rowNext = saveDiagnosticRow(root, {
        id: nextId, createdAt: next.createdAt, status: '待作答', student: next.student.name, grade: next.student.grade,
        subject: next.lesson.subject, lesson: next.lesson.title, at: next.lesson.at, code: next.lesson.code,
        brand: next.brand.name, dir: join(LAYOUT.diagnostics, nextId), note: '复制自 ' + id,
      })
      return json(res, 200, { row: rowNext, spec: next })
    }
    case 'diagnostics/archive': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const id = String(body.id ?? '').trim()
      const row = listDiagnostics(root).find(item => item.id === id)
      if (!row) return json(res, 404, { error: tr('没找到这份诊断') })
      const archived = body.archived !== false
      const rowNext = saveDiagnosticRow(root, {
        ...row,
        status: archived ? '已归档' : (row.postScore ? '已完成' : row.preScore ? '课前已回' : '待作答'),
      })
      return json(res, 200, { row: rowNext })
    }
    case 'diagnostics/reveal': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const id = String(body.id ?? '').trim()
      const row = listDiagnostics(root).find(item => item.id === id)
      if (!row) return json(res, 404, { error: tr('没找到这份诊断') })
      const dir = ensureDiagnosticDir(root, id)
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
      execFile(command, [dir], () => {})
      return json(res, 200, { path: dir })
    }
    case 'diagnostics/post/create': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const id = String(body.id ?? '').trim()
      const row = listDiagnostics(root).find(item => item.id === id)
      if (!row) return json(res, 404, { error: tr('没找到这份诊断') })
      const spec = readManifest(root, row)
      if (!spec) return json(res, 404, { error: tr('诊断卷文件不见了') })
      const preResult = readDiagnosticResult(root, row, 'pre')
      const pre = preResult ? scoreDiagnostic(spec, preResult.answers) : null
      let postSpec = null
      try {
        const { text: raw } = await callModel(ctx, { ...postDiagnosticPrompt(await store.read(), spec, pre, body.notes), maxTokens: 3200 })
        const parsed = extractJson(raw)
        postSpec = normalizeDiagnostic({ ...spec, questions: parsed.questions, verdicts: parsed.verdicts ?? spec.verdicts, title: spec.title }, { ...spec, id })
      } catch (err) {
        return json(res, 400, { error: tr('课后检测没生成出来：{msg}', { msg: err.message }) })
      }
      postSpec.id = id
      writePostSpec(root, id, postSpec)
      const html = renderDiagnosticHtml(postSpec, { kind: 'post', pre })
      writeDiagnosticHtml(root, id, '课后检测.html', html)
      const rowNext = saveDiagnosticRow(root, { ...row, status: '待课后', note: '课后检测已生成' })
      return json(res, 200, { row: rowNext, spec: postSpec })
    }
    case 'diagnostics/import': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      let payload = body.payload
      if (typeof payload === 'string') payload = decodeResult(payload)
      if (!payload || typeof payload !== 'object') return json(res, 400, { error: tr('没有可导入的结果') })
      const id = String(payload.id ?? '').trim()
      const row = listDiagnostics(root).find(item => item.id === id)
      if (!row) return json(res, 404, { error: tr('没找到这份诊断，先确认结果码') })
      const spec = payload.kind === 'post' ? (readPostSpec(root, row) || readManifest(root, row)) : readManifest(root, row)
      if (!spec) return json(res, 404, { error: tr('诊断卷文件不见了') })
      if (!Array.isArray(payload.answers) || payload.answers.length !== spec.questions.length) {
        return json(res, 400, { error: tr('答案数量和卷子对不上，让对方重新保存一次') })
      }
      const score = scoreDiagnostic(spec, payload.answers)
      const kind = payload.kind === 'post' ? 'post' : 'pre'
      writeDiagnosticResult(root, id, kind, { ...payload, score })
      let rowNext = null
      if (kind === 'post') {
        const pre = readDiagnosticResult(root, row, 'pre')
        const preSpec = readManifest(root, row)
        const preScore = pre && preSpec ? scoreDiagnostic(preSpec, pre.answers) : null
        const diff = preScore ? compareScores(preScore, score) : null
        rowNext = saveDiagnosticRow(root, {
          ...row, status: '已完成', postScore: `${score.correct}/${score.total}`,
          progress: diff ? `${diff.delta >= 0 ? '+' : ''}${diff.delta}%` : '',
        })
      } else {
        rowNext = saveDiagnosticRow(root, { ...row, status: '课前已回', preScore: `${score.correct}/${score.total}` })
      }
      return json(res, 200, { row: rowNext, score, kind })
    }
    case 'diagnostics/analyze': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const id = String(body.id ?? '').trim()
      const row = listDiagnostics(root).find(item => item.id === id)
      if (!row) return json(res, 404, { error: tr('没找到这份诊断') })
      const kind = body.kind === 'post' ? 'post' : 'pre'
      const spec = kind === 'post' ? (readPostSpec(root, row) || readManifest(root, row)) : readManifest(root, row)
      if (!spec) return json(res, 404, { error: tr('诊断卷文件不见了') })
      const result = readDiagnosticResult(root, row, kind)
      if (!result) return json(res, 400, { error: tr('先导入这份结果') })
      const pre = kind === 'post' ? readDiagnosticResult(root, row, 'pre') : null
      const preSpec = kind === 'post' ? readManifest(root, row) : null
      const preScore = pre && preSpec ? scoreDiagnostic(preSpec, pre.answers) : null
      let analysis = null
      let source = 'local'
      const score = { ...result, ...scoreDiagnostic(spec, result.answers) }
      const samples = readVoiceSamples(root)
      const temperature = spec.student?.temperature ?? ''
      const slots = formatParentSlot({ at: spec.lesson?.at, talkAt: spec.lesson?.talkAt, altAt: spec.lesson?.altAt })
      let retryNote = ''
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const prompt = analysisPrompt(await store.read(), spec, score, { kind, pre: preScore, samples, temperature, slots, note: [body.note, retryNote].filter(Boolean).join('\n') })
          const { text: raw } = await callModel(ctx, { ...prompt, maxTokens: 1600 })
          const parsed = extractJson(raw)
          const scripts = (Array.isArray(parsed.scripts) ? parsed.scripts : [{ tag: '首条', text: parsed.parentScript }])
            .map(row => ({ tag: String(row?.tag ?? '首条').trim().slice(0, 20), text: String(row?.text ?? '').trim() }))
            .filter(row => row.text)
          const issues = scripts.flatMap(row => validateParentReply(row.text, { kind }).issues.map(issue => `${row.tag}：${issue}`))
          if (scripts.length && !issues.length) {
            analysis = {
              summary: String(parsed.summary ?? '').trim(),
              findings: Array.isArray(parsed.findings) ? parsed.findings.map(row => String(row)).filter(Boolean).slice(0, 6) : [],
              scripts,
              parentScript: scripts[0].text,
              trialFocus: Array.isArray(parsed.trialFocus) ? parsed.trialFocus.map(row => String(row)).filter(Boolean).slice(0, 6) : [],
              nextStep: String(parsed.nextStep ?? '').trim(),
              riskNote: String(parsed.riskNote ?? '').trim(),
            }
            source = attempt ? 'model-retry' : 'model'
            break
          }
          retryNote = `上一版被规则拦下：${[...new Set(issues)].join('；')}。重写时避开这些。`
        } catch { /* 没模型就本地拼 */ }
      }
      if (!analysis) analysis = localAnalysis(spec, score, { kind, pre: preScore, temperature, slots })
      const md = `# 试听诊断解析

- 学生：${spec.student.name || '孩子'}（${spec.student.grade || ''}）
- 课程：${spec.lesson.title} · ${spec.lesson.at || ''}
- 类型：${kind === 'post' ? '课后复测' : '课前诊断'}

## 诊断摘要

${analysis.summary}

${analysis.findings.map(row => `- ${row}`).join('\n')}

## 家长话术

${(analysis.scripts ?? [{ tag: '首条', text: analysis.parentScript }]).map(row => `### ${row.tag}\n\n${row.text}`).join('\n\n')}

## 试听重点

${analysis.trialFocus.map(row => `- ${row}`).join('\n')}

## 下一步

${analysis.nextStep}

## 风险提醒

${analysis.riskNote}
`
      writeDiagnosticFile(root, id, '解析与话术.md', md)
      const rowNext = saveDiagnosticRow(root, { ...row, status: '已分析', note: analysis.summary })
      return json(res, 200, { row: rowNext, analysis, source })
    }
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
      const warnings = []
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
      } catch (err) {
        warnings.push(`文件没写进去：${err.message}`)
      }
      return json(res, 200, warnings.length ? { ...result, warnings } : result)
    }
    case 'undo': {
      const label = await store.undoLast()
      return json(res, 200, { label, state: await store.read(), canUndo: store.undo.length > 0 })
    }
    case 'topics/today': {
      const state = await store.read()
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const leads = readLeads(root)
      let topics = []
      let source = 'local'
      try {
        const { text: raw } = await callModel(ctx, { ...todayTopicsPrompt(state, leads, 3), maxTokens: 900, light: true })
        topics = normalizeTodayTopics(extractJson(raw), 3)
        if (topics.length) source = 'model'
      } catch { /* 没模型就本地拼 */ }
      if (!topics.length) topics = localTodayTopics(state, leads, 3)
      return json(res, 200, { topics, source })
    }
    case 'topics': {
      // 一次给 30 个选题草稿，页面里直接勾选，不跳对话
      const count = Math.min(40, Math.max(5, Number(body.count) || 30))
      const state = await store.read()
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      let entries = []
      let source = 'local'
      try {
        const lessons = buildLessonBlock(root)
        const voice = readVoiceSamples(root)
        const { text: raw } = await callModel(ctx, { ...topicsPrompt(state, count, lessons, voice), maxTokens: 1600, light: true })
        entries = normalizeTopicEntries(extractJson(raw), count)
        if (entries.length) source = 'model'
      } catch { /* 没模型就用本地模板 */ }
      if (!entries.length) entries = localTopics(state, count).map(text => ({ text, angle: guessTopicAngle(text) }))
      // 同一意思的去掉，缺哪一类补哪一类，保证四类都在
      entries = fillTopicAngles(entries, state, count)
      const topics = entries.map(entry => entry.text)
      const angles = Object.fromEntries(entries.map(entry => [entry.text, entry.angle]))
      // 这一批先不落库：等用户勾了再记，选题库只留真正用过的
      const batch = batchId()
      return json(res, 200, { topics, angles, source, batch, lessons: buildLessonBlock(root) })
    }
    case 'topics/pick': {
      // 记录勾了哪些选题：这是学习「哪类选题被采纳」的信号
      const batch = String(body.batch ?? '')
      const picked = (Array.isArray(body.picked) ? body.picked : []).map(row => String(row ?? '').trim()).filter(Boolean)
      if (!batch) return json(res, 400, { error: tr('缺少批次号') })
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const rows = recordPickedTopics(root, batch, picked)
      archiveTopics(root, 20)
      writeLessonMarkdown(root)
      return json(res, 200, { topics: rows })
    }
    case 'scripts/single': {
      const state = await store.read()
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const lessons = buildLessonBlock(root)
      const voice = readVoiceSamples(root)
      const topic = String(body.topic ?? body.brief ?? '').trim()
      if (!topic) return json(res, 400, { error: tr('先给一个选题') })
      let single = null
      let source = 'local'
      try {
        const { text: raw } = await callModel(ctx, { ...singleScriptPrompt(state, topic, lessons, voice), maxTokens: 2200, light: true })
        const parsed = normalizeSingle(extractJson(raw))
        if (parsed.title && parsed.script) { single = parsed; source = 'model' }
      } catch { /* 本地兜底 */ }
      if (!single) single = normalizeSingle(localSingle(state, topic))
      return json(res, 200, { single, source })
    }
    case 'scripts': {
      // 只生成、不落盘：用户点「采用这条」时才保存
      // 给了提示就按提示直接出草稿（一条，3 版），没给才看勾选的选题
      const brief = normalizeBrief(body.brief)
      const topics = brief
        ? [brief]
        : (Array.isArray(body.topics) ? body.topics : []).map(row => String(row ?? '').trim()).filter(Boolean).slice(0, 20)
      if (!topics.length) return json(res, 400, { error: tr('先选几个选题') })
      const state = await store.read()
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const lessons = buildLessonBlock(root)
      const voice = readVoiceSamples(root)
      const groups = []
      let usedModel = false
      for (let i = 0; i < topics.length; i += 3) {
        const chunk = topics.slice(i, i + 3)
        const rows = await Promise.all(chunk.map(async (topic) => {
          let variants = []
          try {
            const { text: raw } = await callModel(ctx, { ...variantsPrompt(state, topic, lessons, brief, voice), maxTokens: 2800, light: true })
            variants = normalizeVariants(extractJson(raw))
            if (variants.length) usedModel = true
          } catch { /* 单条失败就退回本地模板 */ }
          if (!variants.length) variants = localVariants(state, topic)
          variants = variants.map(row => ({ ...row, ...leadPack(state, topic, row) }))
          return { topic, variants, source: brief ? 'brief' : 'topic' }
        }))
        groups.push(...rows)
      }
      return json(res, 200, { groups, source: usedModel ? 'model' : 'local', lessons })
    }
    case 'scripts/improve': {
      // 已经出过稿子，按老师写的一句要求改；改不了就说改不了，不假装改过
      const { topic, note, variants: before } = normalizeImprove(body)
      if (!note) return json(res, 400, { error: tr('先写一句想怎么改') })
      if (!before.length) return json(res, 400, { error: tr('没有可改的稿子') })
      const state = await store.read()
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const lessons = buildLessonBlock(root)
      const voice = readVoiceSamples(root)
      let variants = []
      try {
        const { text: raw } = await callModel(ctx, { ...improvePrompt(state, topic, before, note, lessons, voice), maxTokens: 2800, light: true })
        variants = normalizeVariants(extractJson(raw))
      } catch { /* 没模型就保持原样，交给页面提示 */ }
      variants = variants.map(row => ({ ...row, ...leadPack(state, topic, row) }))
      return json(res, 200, { variants, source: variants.length ? 'model' : 'local' })
    }
    case 'content/adopt': {
      // 采用这条 → 现在才写文件、记进内容库
      const title = String(body.title ?? '').trim()
      const script = String(body.script ?? '')
      if (!title || !script.trim()) return json(res, 400, { error: tr('没有可保存的稿子') })
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      ensureLayout(root)
      const angle = String(body.angle ?? '').trim().slice(0, 10)
      const comment = String(body.comment ?? '').trim().slice(0, 300)
      const dm = String(body.dm ?? '').trim().slice(0, 400)
      const lead = [comment ? `\n\n【评论区第一条】\n${comment}` : '', dm ? `\n\n【私信第一句】\n${dm}` : ''].join('')
      const text = `【标题】${title}\n\n【口播文案】\n${script}\n\n【标签】${(Array.isArray(body.tags) ? body.tags : []).map(tag => `#${tag}`).join(' ')}${lead}`
      const saved = await savePiece({ dir: join(root, LAYOUT.content), title: `${dayStamp()} ${folderName(title)}`, text, formats: ['md', 'docx'] })
      const row = recordContent(root, {
        '日期': dayStamp(), '创建时间': new Date().toISOString(), '批次': String(body.batch ?? ''),
        '选题': String(body.topic ?? ''), '角度': angle, '标题': title,
        '标签': (Array.isArray(body.tags) ? body.tags : []).map(tag => `#${tag}`).join(' '),
        '评论区': comment, '私信引导': dm,
        '采用': '采用', '状态': String(body.status ?? '未发布'), '平台': '', '发布日': String(body.publishedAt ?? ''), '播放': '', '涨粉': '', '私信': '', '加微': '',
        '爆款': '', '分数': '', '目录': saved.dir, '备注': '采用的版本', '手感': String(body.feel ?? ''),
      })
      rescore(root)
      writeLessonMarkdown(root)
      return json(res, 200, { dir: saved.dir, row })
    }
    case 'content/revise': {
      // 采用之后又点了「改一下」：目录不变，覆盖 Word / Markdown，内容库跟着更新
      const rawDir = String(body.dir ?? '').trim()
      const script = String(body.script ?? '')
      if (!rawDir || !script.trim()) return json(res, 400, { error: tr('没有可保存的稿子') })
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const dir = path_resolve(rawDir)
      if (!dir.startsWith(root) || !existsSync(dir)) return json(res, 404, { error: tr('找不到这条稿子，重新采用一次') })
      const title = String(body.title ?? '').trim() || basename(dir)
      const tags = Array.isArray(body.tags) ? body.tags : []
      const angle = String(body.angle ?? '').trim().slice(0, 10)
      const comment = String(body.comment ?? '').trim().slice(0, 300)
      const dm = String(body.dm ?? '').trim().slice(0, 400)
      const lead = [comment ? `\n\n【评论区第一条】\n${comment}` : '', dm ? `\n\n【私信第一句】\n${dm}` : ''].join('')
      const text = `【标题】${title}\n\n【口播文案】\n${script}\n\n【标签】${tags.map(tag => `#${tag}`).join(' ')}${lead}`
      const saved = await savePiece({ dir: join(root, LAYOUT.content), title: basename(dir), text, formats: ['md', 'docx'] })
      updateContent(root, saved.dir, {
        '标题': title,
        '选题': String(body.topic ?? ''),
        ...(angle ? { '角度': angle } : {}),
        '标签': tags.map(tag => `#${tag}`).join(' '),
        ...(comment ? { '评论区': comment } : {}),
        ...(dm ? { '私信引导': dm } : {}),
        '备注': '采用后改过一版',
      })
      rescore(root)
      writeLessonMarkdown(root)
      return json(res, 200, { dir: saved.dir })
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
    case 'data/import': {
      // 平台后台导出的数据：按标题匹配内容库；对不上的直接补一条，别让老视频永远进不了库
      const raw = String(body.text ?? '').trim()
      if (!raw) return json(res, 400, { error: tr('还没有数据') })
      const { data } = parseImportTable(raw)
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const today = dayStamp()
      const content = readContent(root)
      // 先完全相同，再按包含关系取最长的那个标题，避免「期中 58 分」串到别的行
      const pickTitle = (title) => {
        const exact = content.find(row => row['标题'] === title)
        if (exact) return exact
        return content
          .filter(row => row['标题'] && (row['标题'].startsWith(title) || title.startsWith(row['标题']) || row['标题'].includes(title) || title.includes(row['标题'])))
          .sort((a, b) => String(b['标题']).length - String(a['标题']).length)[0]
      }
      let matched = 0
      let created = 0
      const createdTitles = []
      const unmatched = []
      for (const item of data) {
        const title = String(item['标题'] ?? '').trim()
        if (!title) continue
        const values = {}
        for (const key of ['播放', '涨粉', '私信', '加微', '平台', '发布日']) {
          const value = String(item[key] ?? '').trim()
          if (value) values[key] = value
        }
        const hit = pickTitle(title)
        if (hit) {
          const patch = { ...values, '状态': '已发布' }
          if (!hit['发布日'] && !patch['发布日']) patch['发布日'] = today
          updateContent(root, contentKey(hit), patch)
          Object.assign(hit, patch)
          matched++
          continue
        }
        const row = recordContent(root, {
          '日期': today, '创建时间': new Date().toISOString(), '批次': '', '选题': '', '标题': title, '标签': '',
          '采用': '未定', '状态': '已发布', '平台': values['平台'] ?? '', '发布日': values['发布日'] ?? today,
          '播放': values['播放'] ?? '', '涨粉': values['涨粉'] ?? '', '私信': values['私信'] ?? '', '加微': values['加微'] ?? '',
          '爆款': '', '分数': '', '目录': '', '备注': tr('从后台数据导入'),
        })
        content.push(row)
        createdTitles.push(title)
        created++
      }
      rescore(root)
      writeLessonMarkdown(root)
      return json(res, 200, { matched, created, createdTitles, unmatched, total: data.length })
    }
    case 'content/create': {
      // 手动补录：以前发过的视频也得能进内容库，不然数据永远只有插件里做的那几条
      const title = String(body.title ?? '').trim().slice(0, 120)
      if (!title) return json(res, 400, { error: tr('先写一个标题') })
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      ensureLayout(root)
      const now = new Date()
      const row = recordContent(root, {
        '日期': String(body.date ?? '').trim() || dayStamp(now), '创建时间': now.toISOString(), '批次': '',
        '选题': String(body.topic ?? '').trim(), '标题': title, '标签': '',
        '采用': String(body.adopt ?? '未定'), '状态': String(body.status ?? '已发布'),
        '平台': String(body.platform ?? '').trim(), '发布日': String(body.publishedAt ?? '').trim(),
        '播放': String(body.views ?? '').trim(), '涨粉': String(body.follows ?? '').trim(),
        '私信': String(body.dms ?? '').trim(), '加微': String(body.added ?? '').trim(),
        '爆款': '', '分数': '', '目录': '', '备注': String(body.note ?? '').trim() || tr('手动补录'),
      })
      rescore(root)
      writeLessonMarkdown(root)
      return json(res, 200, { row })
    }
    case 'content/remove': {
      // 只删表里的这一行，文件夹里的 Word / Markdown 留着
      const key = String(body.key ?? body.dir ?? '')
      if (!key) return json(res, 400, { error: tr('缺少目录') })
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const removed = removeContent(root, key)
      if (!removed) return json(res, 404, { error: tr('没找到这一条') })
      rescore(root)
      writeLessonMarkdown(root)
      return json(res, 200, { removed })
    }
    case 'content/update': {
      // 内容库：改采用/状态/平台/发布日/播放/涨粉/私信/加微/爆款
      const key = String(body.key ?? body.dir ?? '')
      if (!key) return json(res, 400, { error: tr('缺少目录') })
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const row = updateContent(root, key, body.patch ?? {})
      if (!row) return json(res, 404, { error: tr('没找到这一条') })
      rescore(root)
      writeLessonMarkdown(root)
      const fresh = readContent(root).find(item => contentKey(item) === key) ?? row
      return json(res, 200, { row: fresh })
    }
    case 'dm/draft': {
      // 线索表：原来的私信分诊入口，现在只保留记录用的台账数据
      const raw = String(body.raw ?? '').trim().slice(0, 2000)
      if (!raw) return json(res, 400, { error: tr('先粘一条消息') })
      const channel = CHANNELS.includes(body.channel) ? body.channel : CHANNELS[0]
      const history = String(body.history ?? '').trim().slice(0, 1200)
      const state = await store.read()
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const cases = chatLessons(root, channel)
      const words = readPlatformWords(root)
      let result = null
      let from = 'local'
      try {
        const { text: out } = await callModel(ctx, { ...chatPrompt(state, { channel, raw, history, cases, words }), maxTokens: 1200, light: true })
        const normalized = normalizeChat(extractJson(out))
        if (normalized.drafts.length) { result = normalized; from = 'model' }
      } catch { /* 没模型就本地兜底 */ }
      if (!result) result = localChat(state, { channel, raw })
      return json(res, 200, { ...result, source: from, channel })
    }
    case 'platform-words': {
      // 平台阶段能说什么、不能说什么：页面里能改，提示词直接读它
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const next = writePlatformWords(root, { allow: body.allow, ban: body.ban })
      return json(res, 200, next)
    }
    case 'dm/revise': {
      // 对上一版不满意：按老师的一句要求重写两条，不推翻已经能用的部分
      const raw = String(body.raw ?? '').trim().slice(0, 2000)
      const note = String(body.note ?? '').trim().slice(0, 200)
      const channel = CHANNELS.includes(body.channel) ? body.channel : CHANNELS[0]
      const drafts = (Array.isArray(body.drafts) ? body.drafts : []).map(value => String(value ?? '').slice(0, 500)).filter(Boolean).slice(0, 2)
      if (!raw) return json(res, 400, { error: tr('先粘一条消息') })
      if (!note) return json(res, 400, { error: tr('先写一句想怎么改') })
      if (!drafts.length) return json(res, 400, { error: tr('还没有上一版') })
      const state = await store.read()
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const cases = chatLessons(root, channel)
      const words = readPlatformWords(root)
      let variants = []
      let from = 'local'
      try {
        const { text: out } = await callModel(ctx, { ...chatRevisePrompt(state, { channel, raw, history: String(body.history ?? ''), drafts, note, cases, words }), maxTokens: 1200, light: true })
        const normalized = normalizeChat(extractJson(out))
        if (normalized.drafts.length) { variants = normalized.drafts; from = 'model' }
      } catch { /* 没模型就保持上一版，交给页面提示 */ }
      return json(res, 200, { drafts: variants, source: from })
    }
    case 'chat/update': {
      // 给一轮对话标结果：成交 / 流失 / 约试听，后面的建议会参考；顺手把线索阶段推上去
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const rows = updateChatRow(root, body.index, body.patch ?? {})
      if (!rows) return json(res, 404, { error: tr('没找到这一轮对话') })
      const row = rows.find(item => item.rowIndex === Number(body.index))
      const result = String(body.patch?.result ?? '')
      const toStage = { 加微: '已加微信', 约试听: '约试听', 成交: '已报课' }[result]
      let leads = null
      let studentCreated = false
      if (toStage && row?.name) {
        const sameName = readLeads(root).find(item => item.name === row.name)
        const match = sameName && !['已报课', '流失'].includes(sameName.stage) ? sameName : null
        if (match) leads = updateLeadRow(root, match.rowIndex, { stage: toStage })
        // 成交顺手建学生档案：年级/学校能从句索里拿到就一起带上，不填空
        if (result === '成交' && !readStudents(root).some(item => item.name === row.name)) {
          saveStudent(root, {
            name: row.name,
            grade: sameName?.grade || '',
            school: sameName?.school || '',
            source: '聊天成交',
            enrolledAt: dayStamp(),
            note: [sameName?.painPoint ? `卡点：${sameName.painPoint}` : '', '线索表标成交时自动建档'].filter(Boolean).join('；'),
          })
          studentCreated = true
        }
      }
      return json(res, 200, { rows, leads, studentCreated })
    }
    case 'chat/log': {
      // 这句我发出去了：记进 对话记录.csv，后面用来复盘和给建议
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const rows = appendChat(root, {
        channel: body.channel, name: body.name, incoming: body.incoming, outgoing: body.outgoing,
        stage: body.stage, result: body.result, note: body.note,
      })
      return json(res, 200, { rows })
    }
    case 'chat/remove': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const rows = removeChat(root, body.index)
      if (!rows) return json(res, 404, { error: tr('没找到这条对话') })
      return json(res, 200, { rows, total: rows.length })
    }
    case 'chat/cases/update': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const cases = updateCase(root, body.index, body.patch ?? {})
      if (!cases) return json(res, 404, { error: tr('没找到这条案例') })
      return json(res, 200, { cases })
    }
    case 'chat/cases/remove': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const cases = removeCase(root, body.index)
      if (!cases) return json(res, 404, { error: tr('没找到这条案例') })
      return json(res, 200, { cases })
    }
    case 'chat/cases': {
      // 人工聊天案例：平台引流 / 微信成交都可以，聊成的会进提示词
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      if (!String(body.text ?? '').trim()) return json(res, 400, { error: tr('先把对话粘进来') })
      const cases = appendCase(root, { channel: body.channel, scene: body.scene, result: body.result, text: body.text })
      return json(res, 200, { cases })
    }
    case 'lead/append': {
      // 话术定了：这一条线索连同话术一起写进 线索表.csv
      // 手动记线索可以没有私信原文，但姓名和卡点至少要有一个
      const raw = String(body.raw ?? '').trim().slice(0, 2000)
      const name = String(body.name ?? '').trim()
      const painPoint = String(body.painPoint ?? '').trim()
      if (!raw && !name && !painPoint) return json(res, 400, { error: tr('至少写一个姓名或卡点') })
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      appendLead(root, {
        raw,
        name, grade: body.grade, school: body.school, painPoint, source: body.source,
        type: body.type, category: body.category, draft: body.draft, reaction: body.reaction, result: body.result, next: body.next,
        stage: body.stage, createdAt: new Date().toISOString(),
      })
      return json(res, 200, { leads: readLeads(root), lessons: leadLessons(root) })
    }
    case 'workspace/lead/stage': {
      // 漏斗上把一张卡拖到另一列
      const index = Number(body.index)
      if (!Number.isInteger(index) || index < 0) return json(res, 400, { error: tr('行号不对') })
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const leads = updateLeadRow(root, index, { stage: body.stage })
      if (!leads) return json(res, 404, { error: tr('没找到这一行') })
      return json(res, 200, { leads, lessons: leadLessons(root) })
    }
    case 'students/from-lead': {
      // 报课了：线索转成学生档案；同名同年级已经在了就只补空字段
      const index = Number(body.index)
      if (!Number.isInteger(index) || index < 0) return json(res, 400, { error: tr('行号不对') })
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const lead = readLeads(root).find(row => row.rowIndex === index)
      if (!lead) return json(res, 404, { error: tr('没找到这条线索') })
      const name = String(lead.name ?? '').trim()
      const grade = String(lead.grade ?? '').trim()
      if (!name && !grade) return json(res, 400, { error: tr('先补上家长称呼或孩子年级，再转成学生') })
      const studentName = name || grade
      // 已经在档案里的同名同年级学生也要合并新信息，不能什么都不做
      const patch = { name: studentName, grade, enrolledAt: dayStamp() }
      if (String(lead.school ?? '').trim()) patch.school = lead.school
      if (String(lead.source ?? '').trim()) patch.source = lead.source
      if (String(lead.painPoint ?? '').trim()) patch.note = `卡点：${lead.painPoint}`
      saveStudent(root, patch)
      if (lead.stage !== '流失' && lead.stage !== '已报课') updateLeadRow(root, index, { stage: '已报课' })
      return json(res, 200, { students: readStudents(root), classes: readClasses(root), leads: readLeads(root) })
    }
    case 'leads/analyze-chat': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      let text = String(body.text ?? '').trim()
      const src = String(body.src ?? '').trim()
      if (src) {
        const hit = /^(?:media-desk\/)?files\/([\w.-]+)$/.exec(src)
        if (!hit) return json(res, 400, { error: tr('截图地址不对') })
        text = await ocrChatImage(join(store.filesDir, hit[1]))
      }
      if (!text) return json(res, 400, { error: tr('没有读到聊天内容') })
      let leads = []
      let source = 'local'
      try {
        const { text: raw } = await callModel(ctx, { ...leadAnalyzePrompt(await store.read(), text), maxTokens: 1600, light: true })
        leads = normalizeAnalyzedLeads(extractJson(raw))
        if (leads.length) source = 'model'
      } catch { /* 本地兜底 */ }
      if (!leads.length) leads = localAnalyzedLead(text)
      return json(res, 200, { text, leads, source })
    }
    case 'leads/import': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const { cols, rows } = parseLeadTable(body.raw)
      if (!cols.includes('name')) return json(res, 400, { error: tr('第一行要有「姓名」列') })
      let imported = 0
      let skipped = 0
      let undated = 0
      const seen = new Set(readLeads(root).map(lead => `${lead.name ?? ''}\u0000${lead.raw ?? ''}`))
      for (const row of rows) {
        const key = `${row.name ?? ''}\u0000${row.raw ?? ''}`
        if (seen.has(key)) { skipped += 1; continue }
        seen.add(key)
        const date = normalizeImportDate(row.date)
        if (!date) undated += 1
        appendLead(root, {
          ...row,
          followUps: Number(row.followUps) || 0,
          createdAt: date ? `${date}T12:00:00` : undefined,
        })
        imported += 1
      }
      return json(res, 200, { leads: readLeads(root), imported, skipped, undated })
    }
    case 'students/import': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const table = parsePastedTable(body.raw)
      if (table.length < 2) return json(res, 400, { error: tr('至少要有表头和一行学生') })
      const cols = table[0].map(studentImportColumn)
      if (!cols.includes('name')) return json(res, 400, { error: tr('第一行要有「姓名」列') })
      const norm = value => String(value ?? '').replace(/\s+/g, '').toLowerCase()
      const classList = readClasses(root)
      // 「A班」和「A 班」当成同一个班，别因为空格多建一个
      const canonical = new Map(classList.map(row => [norm(row.name), row.name]))
      const pending = []
      let skipped = 0
      let adjusted = 0
      let invalidStatus = 0
      for (const row of table.slice(1)) {
        const input = {}
        for (let i = 0; i < cols.length; i += 1) {
          if (cols[i]) input[cols[i]] = row[i] ?? ''
        }
        if (!String(input.name ?? '').trim()) { skipped += 1; continue }
        const wantedStatus = String(input.status ?? '').trim()
        if (wantedStatus && !['在读', '结课', '流失'].includes(wantedStatus)) invalidStatus += 1
        const wanted = String(input.className ?? '').trim()
        if (wanted) {
          const key = norm(wanted)
          if (!canonical.has(key)) canonical.set(key, wanted)
          if (canonical.get(key) !== wanted) adjusted += 1
          input.className = canonical.get(key)
        }
        pending.push(input)
      }
      for (const input of pending) saveStudent(root, input)
      const imported = pending.length
      // 名单里提到但还没建过的班，顺手建一个空班，免得学生挂在「不存在的班」里
      const existing = new Set(readClasses(root).map(row => row.name))
      let createdClasses = 0
      for (const name of new Set(pending.map(row => String(row.className ?? '').trim()).filter(Boolean))) {
        if (existing.has(name)) continue
        saveClass(root, { name })
        createdClasses += 1
      }
      return json(res, 200, { students: readStudents(root), classes: readClasses(root), imported, skipped, createdClasses, adjusted, invalidStatus })
    }
    case 'students/save': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      try {
        saveStudent(root, body.student ?? {}, body.original ?? null)
      } catch (err) {
        return json(res, 400, { error: tr(err.message) })
      }
      return json(res, 200, { students: readStudents(root), classes: readClasses(root) })
    }
    case 'students/remove': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      removeStudent(root, { id: body.id, name: body.name, grade: body.grade })
      return json(res, 200, { students: readStudents(root), classes: readClasses(root) })
    }
    case 'classes/save': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      try {
        saveClass(root, body.klass ?? {}, body.original ?? null)
      } catch (err) {
        return json(res, 400, { error: tr(err.message) })
      }
      return json(res, 200, { classes: readClasses(root), students: readStudents(root) })
    }
    case 'classes/remove': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      try {
        removeClass(root, body.name)
      } catch (err) {
        return json(res, 400, { error: tr(err.message) })
      }
      return json(res, 200, { classes: readClasses(root), students: readStudents(root) })
    }
    case 'feedback/remove': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const rows = removeFeedback(root, body.index)
      if (!rows) return json(res, 404, { error: tr('没找到这条反馈') })
      return json(res, 200, { rows })
    }
    case 'feedback/append': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const rows = appendFeedback(root, body)
      return json(res, 200, { rows })
    }
    case 'student/feedback': {
      const name = String(body.name ?? '').trim()
      const id = String(body.id ?? '').trim()
      if (!name && !id) return json(res, 400, { error: tr('先选一个学生') })
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const student = readStudents(root).find(row => (id ? row.id === id : row.name === name && (!body.grade || row.grade === body.grade)))
      if (!student) return json(res, 404, { error: tr('没找到这个学生') })
      const byStudent = row => (id && row.studentId ? row.studentId === id : row.name === name)
      let rows = readLessons(root, body.className ?? '').filter(byStudent)
      if (!rows.length) rows = readLessons(root).filter(byStudent)
      rows.sort((a, b) => b.no - a.no || String(b.date).localeCompare(String(a.date)))
      const limit = Number(body.limit) === 2 ? 2 : 4
      const recent = rows.slice(0, limit)
      const state = await store.read()
      let text = ''
      let from = 'local'
      try {
        const { text: out } = await callModel(ctx, { ...feedbackPrompt(state, student, recent, readVoiceSamples(root)), maxTokens: 600, light: true })
        text = String(out ?? '').trim()
        if (text) from = 'model'
      } catch { /* 没模型就本地兜底 */ }
      if (!text) text = localFeedback(student, recent, state?.positioning?.subject)
      return json(res, 200, { text, source: from, student, lessons: recent.length })
    }
    case 'lessons/save': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      let rows = []
      try {
        rows = saveLessonRows(root, { className: body.class, no: body.no, date: body.date, rows: body.rows })
      } catch (err) {
        return json(res, 400, { error: tr(err.message) })
      }
      return json(res, 200, { rows })
    }
    case 'lead/remove': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const leads = removeLeadRow(root, body.index)
      if (!leads) return json(res, 404, { error: tr('没找到这条线索') })
      return json(res, 200, { leads })
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
    case 'workspace/upgrade': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const counts = () => ({
        leads: readLeads(root).length, students: readStudents(root).length,
        classes: readClasses(root).length, lessons: readLessons(root).length,
      })
      const before = counts()
      const hasLegacy = legacyTables(root).length > 0
      const backupDir = hasLegacy ? backupWorkspace(root) : null
      const upgraded = upgradeTables(root)
      let after = counts()
      let sameCounts = Object.keys(before).every(key => before[key] === after[key])
      let restored = false
      if (!sameCounts && backupDir) {
        restoreWorkspace(root, backupDir)
        after = counts()
        sameCounts = Object.keys(before).every(key => before[key] === after[key])
        restored = true
      }
      return json(res, 200, { upgraded, sameCounts, before, after, backupDir, restored })
    }
    case 'workspace/backup': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const dir = backupWorkspace(root)
      return json(res, 200, { dir })
    }
    case 'workspace/reveal': {
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const dir = path_resolve(String(body.dir ?? root))
      if (!dir.startsWith(root)) return json(res, 400, { error: tr('只能打开工作区里的目录') })
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
      execFile(command, [dir], () => {})
      return json(res, 200, { path: dir })
    }
    case 'voice': {
      // 原话样本只收「一行一句」，写回 说话样本.md 的规范模板里，规则和结构不会被改坏
      const root = resolveRoot((await desk.settings.read()).saveRoot)
      const samples = (Array.isArray(body.samples) ? body.samples : [])
        .map(value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, 8)
      ensureLayout(root)
      await writeFile(join(root, LAYOUT.style), styleMarkdown(samples))
      return json(res, 200, { samples })
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
