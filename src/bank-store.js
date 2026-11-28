// 题库落盘：卷子索引、题目索引、原始卷文件。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LAYOUT, ensureLayout, folderName, nowStamp, readTable, writeTable } from './workspace.js'
import { BANK_COLUMNS, PAPER_COLUMNS, questionToRow, rowToQuestion } from './question-bank.js'

const text = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export function listPapers(root) {
  return readTable(root, LAYOUT.bankPapers).rows.map((row, rowIndex) => ({
    rowIndex,
    id: row['编号'] ?? '',
    name: row['名称'] ?? '',
    subject: row['学科'] ?? '',
    grade: row['年级'] ?? '',
    term: row['学期'] ?? '',
    region: row['地区'] ?? '',
    year: row['年份'] ?? '',
    file: row['文件'] ?? '',
    text: row['文本'] ?? '',
    count: Number(row['题目数'] ?? 0),
    status: row['状态'] ?? '待解析',
    createdAt: row['创建时间'] ?? '',
  }))
}

export function savePaper(root, input = {}) {
  ensureLayout(root)
  const rows = listPapers(root)
  const id = text(input.id, 60)
  if (!id) throw new Error('卷子编号为空')
  const next = {
    '编号': id, '名称': text(input.name, 120), '学科': text(input.subject, 30), '年级': text(input.grade, 30),
    '学期': text(input.term, 30), '地区': text(input.region, 30), '年份': text(input.year, 10),
    '文件': text(input.file, 500), '文本': text(input.text, 500), '题目数': Number(input.count ?? 0),
    '状态': text(input.status, 20) || '待解析', '创建时间': text(input.createdAt, 40) || nowStamp(),
  }
  const at = rows.findIndex(row => row.id === id)
  const patch = {
    id, name: next['名称'], subject: next['学科'], grade: next['年级'], term: next['学期'],
    region: next['地区'], year: next['年份'], file: next['文件'], text: next['文本'], count: next['题目数'],
    status: next['状态'], createdAt: next['创建时间'],
  }
  if (at >= 0) rows[at] = { ...rows[at], ...patch }
  else rows.push({ id, name: next['名称'], subject: next['学科'], grade: next['年级'], term: next['学期'], region: next['地区'], year: next['年份'], file: next['文件'], text: next['文本'], count: next['题目数'], status: next['状态'], createdAt: next['创建时间'] })
  writeTable(root, LAYOUT.bankPapers, PAPER_COLUMNS, rows.map(row => ({
    '编号': row.id, '名称': row.name, '学科': row.subject, '年级': row.grade, '学期': row.term,
    '地区': row.region, '年份': row.year, '文件': row.file, '文本': row.text, '题目数': row.count,
    '状态': row.status, '创建时间': row.createdAt,
  })))
  return listPapers(root).find(row => row.id === id) ?? null
}

export function paperDir(root) {
  const dir = join(root, LAYOUT.bankRaw)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function savePaperFile(root, name, buffer) {
  const dir = paperDir(root)
  const safe = folderName(name, 80)
  const file = join(dir, safe)
  writeFileSync(file, buffer)
  return join(LAYOUT.bankRaw, safe)
}

export function readPaperText(root, paper) {
  if (!paper?.text) return ''
  const file = join(root, paper.text)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

export function listQuestions(root) {
  return readTable(root, LAYOUT.bankTable).rows.map(row => rowToQuestion(row)).filter(row => row.stem)
}

export function saveQuestions(root, questions) {
  ensureLayout(root)
  const existing = listQuestions(root)
  const map = new Map(existing.map(row => [row.id, row]))
  for (const row of questions) map.set(row.id, row)
  writeTable(root, LAYOUT.bankTable, BANK_COLUMNS, [...map.values()].map(questionToRow))
  return listQuestions(root)
}

export function updateQuestion(root, id, patch = {}) {
  const rows = listQuestions(root)
  const at = rows.findIndex(row => row.id === id)
  if (at < 0) return null
  rows[at] = { ...rows[at], ...patch, id }
  writeTable(root, LAYOUT.bankTable, BANK_COLUMNS, rows.map(questionToRow))
  return rows[at]
}

export function removeQuestion(root, id) {
  const rows = listQuestions(root).filter(row => row.id !== id)
  writeTable(root, LAYOUT.bankTable, BANK_COLUMNS, rows.map(questionToRow))
  return rows
}

export function savePaperText(root, name, content) {
  const dir = paperDir(root)
  const safe = `${folderName(name, 80)}.txt`
  writeFileSync(join(dir, safe), String(content ?? ''))
  return join(LAYOUT.bankRaw, safe)
}
