// 试听诊断的文件落盘：一份 manifest、若干 HTML、结果 JSON 和话术 Markdown。
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LAYOUT, ensureLayout, folderName, nowStamp, readTable, writeTable } from './workspace.js'

export const DIAG_COLUMNS = [
  '编号', '创建时间', '状态', '学生', '年级', '科目', '课程', '上课时间', '课次编码',
  '品牌', '课前得分', '课后得分', '进步', '目录', '备注',
]

const text = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export function listDiagnostics(root) {
  const rows = readTable(root, LAYOUT.diagnosticsTable).rows.map((row, rowIndex) => ({
    rowIndex,
    id: row['编号'] ?? '', createdAt: row['创建时间'] ?? '', status: row['状态'] ?? '待作答',
    student: row['学生'] ?? '', grade: row['年级'] ?? '', subject: row['科目'] ?? '',
    lesson: row['课程'] ?? '', at: row['上课时间'] ?? '', code: row['课次编码'] ?? '',
    brand: row['品牌'] ?? '', preScore: row['课前得分'] ?? '', postScore: row['课后得分'] ?? '',
    progress: row['进步'] ?? '', dir: row['目录'] ?? '', note: row['备注'] ?? '',
  }))
  return rows
}

export function saveDiagnosticRow(root, input = {}) {
  ensureLayout(root)
  const rows = listDiagnostics(root)
  const id = text(input.id, 60)
  if (!id) throw new Error('诊断编号为空')
  const next = {
    '编号': id,
    '创建时间': text(input.createdAt, 40) || nowStamp(),
    '状态': text(input.status, 20) || '待作答',
    '学生': text(input.student, 40),
    '年级': text(input.grade, 20),
    '科目': text(input.subject, 20),
    '课程': text(input.lesson, 80),
    '上课时间': text(input.at, 40),
    '课次编码': text(input.code, 40),
    '品牌': text(input.brand, 60),
    '课前得分': text(input.preScore, 20),
    '课后得分': text(input.postScore, 20),
    '进步': text(input.progress, 20),
    '目录': text(input.dir, 500),
    '备注': text(input.note, 500),
  }
  const at = rows.findIndex(row => row.id === id)
  if (at >= 0) {
    rows[at] = {
      ...rows[at],
      id,
      createdAt: next['创建时间'], status: next['状态'], student: next['学生'],
      grade: next['年级'], subject: next['科目'], lesson: next['课程'], at: next['上课时间'],
      code: next['课次编码'], brand: next['品牌'], preScore: next['课前得分'],
      postScore: next['课后得分'], progress: next['进步'], dir: next['目录'], note: next['备注'],
    }
  } else {
    rows.push({
      id, createdAt: next['创建时间'], status: next['状态'], student: next['学生'],
      grade: next['年级'], subject: next['科目'], lesson: next['课程'], at: next['上课时间'],
      code: next['课次编码'], brand: next['品牌'], preScore: next['课前得分'],
      postScore: next['课后得分'], progress: next['进步'], dir: next['目录'], note: next['备注'],
    })
  }
  const out = rows.map(row => ({
    '编号': row.id ?? row['编号'] ?? '',
    '创建时间': row.createdAt ?? row['创建时间'] ?? '',
    '状态': row.status ?? row['状态'] ?? '',
    '学生': row.student ?? row['学生'] ?? '',
    '年级': row.grade ?? row['年级'] ?? '',
    '科目': row.subject ?? row['科目'] ?? '',
    '课程': row.lesson ?? row['课程'] ?? '',
    '上课时间': row.at ?? row['上课时间'] ?? '',
    '课次编码': row.code ?? row['课次编码'] ?? '',
    '品牌': row.brand ?? row['品牌'] ?? '',
    '课前得分': row.preScore ?? row['课前得分'] ?? '',
    '课后得分': row.postScore ?? row['课后得分'] ?? '',
    '进步': row.progress ?? row['进步'] ?? '',
    '目录': row.dir ?? row['目录'] ?? '',
    '备注': row.note ?? row['备注'] ?? '',
  }))
  writeTable(root, LAYOUT.diagnosticsTable, DIAG_COLUMNS, out)
  return listDiagnostics(root).find(row => row.id === id) ?? null
}

export function diagnosticDir(root, id) {
  const safe = text(id, 60).replace(/[^A-Za-z0-9_-]/g, '')
  return join(root, LAYOUT.diagnostics, safe)
}

export function ensureDiagnosticDir(root, id) {
  const dir = diagnosticDir(root, id)
  mkdirSync(dir, { recursive: true })
  return dir
}

const pathOf = (root, dir, file) => join(dir || diagnosticDir(root, ''), file)

export function readManifest(root, row) {
  const dir = row?.dir ? join(root, row.dir) : diagnosticDir(root, row?.id ?? '')
  const file = join(dir, 'manifest.json')
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function writeManifest(root, id, manifest) {
  const dir = ensureDiagnosticDir(root, id)
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return dir
}

export function writeDiagnosticHtml(root, id, name, html) {
  const dir = ensureDiagnosticDir(root, id)
  writeFileSync(join(dir, name), html)
  return join(dir, name)
}

export function readDiagnosticFile(root, row, name) {
  const dir = row?.dir ? join(root, row.dir) : diagnosticDir(root, row?.id ?? '')
  const file = join(dir, name)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

export function writeDiagnosticFile(root, id, name, text) {
  const dir = ensureDiagnosticDir(root, id)
  writeFileSync(join(dir, name), text)
  return join(dir, name)
}

export function readDiagnosticResult(root, row, kind = 'pre') {
  const raw = readDiagnosticFile(root, row, kind === 'post' ? '课后结果.json' : '课前结果.json')
  return raw ? JSON.parse(raw) : null
}

export function writeDiagnosticResult(root, id, kind, payload) {
  return writeDiagnosticFile(root, id, kind === 'post' ? '课后结果.json' : '课前结果.json', JSON.stringify(payload, null, 2))
}

export function diagnosticFolderName(title, id) {
  return `${folderName(title, 40)}-${id.replace(/^DIAG-/, '')}`
}

export function readPostSpec(root, row) {
  const raw = readDiagnosticFile(root, row, '课后卷.json')
  return raw ? JSON.parse(raw) : null
}

export function writePostSpec(root, id, spec) {
  return writeDiagnosticFile(root, id, '课后卷.json', JSON.stringify(spec, null, 2))
}
