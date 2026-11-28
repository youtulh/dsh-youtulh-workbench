// 题库：卷子与题目都存成工作区 CSV；诊断卷只从「已确认」的题里选。
import { createHash } from 'node:crypto'
const clean = (value, max = 2000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export const BANK_COLUMNS = [
  '编号', '学科', '年级', '学期', '地区', '来源卷', '年份', '题型', '知识点', '难度',
  '题干', '选项A', '选项B', '选项C', '选项D', '答案', '解析', '分值', '状态', '图片', '创建时间',
]
export const PAPER_COLUMNS = ['编号', '名称', '学科', '年级', '学期', '地区', '年份', '文件', '文本', '题目数', '状态', '创建时间']
export const DIFFICULTIES = ['基础', '中档', '期中', '压轴']

const DIFFICULTY_MAP = {
  基础: '基础', 容易: '基础', 简单: '基础', 易: '基础',
  中档: '中档', 中等: '中档', 中: '中档',
  期中: '期中', 较难: '期中', 难: '期中',
  压轴: '压轴', 拔高: '压轴', 最难: '压轴',
}

export const normalizeDifficulty = value => {
  const text = clean(value, 20)
  if (DIFFICULTY_MAP[text]) return DIFFICULTY_MAP[text]
  for (const [word, label] of Object.entries(DIFFICULTY_MAP)) if (text.includes(word)) return label
  return '中档'
}

export const normalizeStatus = value => {
  const text = clean(value, 20)
  if (/确认|已入库/.test(text)) return '已确认'
  if (/停用|删除/.test(text)) return '停用'
  return '待确认'
}

export function questionHash(stem, options = []) {
  return createHash('sha1').update(`${clean(stem)}\n${options.map(row => clean(row)).join('|')}`).digest('hex').slice(0, 16)
}

export function normalizeQuestion(row = {}, paper = {}) {
  const options = [row.options?.[0], row.options?.[1], row.options?.[2], row.options?.[3]].map((value, index) => clean(value ?? row[`选项${'ABCD'[index]}`], 500))
  const answerRaw = clean(row.answer ?? row['答案'], 20)
  const answerLetter = /^[A-Da-d]$/.test(answerRaw) ? answerRaw.toUpperCase() : ''
  const answerIndex = answerLetter ? 'ABCD'.indexOf(answerLetter) : Number.isInteger(row.answerIndex) ? row.answerIndex : -1
  const status = normalizeStatus(row.status ?? row['状态'])
  const stem = clean(row.stem ?? row['题干'], 3000)
  return {
    id: clean(row.id ?? row['编号'], 60) || `Q-${questionHash(stem, options)}`,
    paperId: clean(row.paperId ?? row['来源卷'], 60) || clean(paper.id, 60),
    paperName: clean(paper.name, 120),
    subject: clean(row.subject ?? row['学科'] ?? paper.subject, 30),
    grade: clean(row.grade ?? row['年级'] ?? paper.grade, 30),
    term: clean(row.term ?? row['学期'] ?? paper.term, 30),
    region: clean(row.region ?? row['地区'] ?? paper.region, 30),
    year: clean(row.year ?? row['年份'] ?? paper.year, 10),
    type: clean(row.type ?? row['题型'], 20) || '选择',
    knowledge: clean(row.knowledge ?? row['知识点'], 80) || '未分类',
    difficulty: normalizeDifficulty(row.difficulty ?? row['难度']),
    stem,
    options,
    answer: answerIndex,
    explain: clean(row.explain ?? row['解析'], 2000),
    score: clean(row.score ?? row['分值'], 20),
    status,
    image: clean(row.image ?? row['图片'], 500),
    createdAt: new Date().toISOString(),
    ...(row.id || row['编号'] ? { id: clean(row.id ?? row['编号'], 60) } : {}),
  }
}

export function validateQuestion(question) {
  const issues = []
  if (!question.stem) issues.push('没有题干')
  if (question.type === '选择' && question.options.filter(Boolean).length < 4) issues.push('选择题不足四个选项')
  if (question.type === '选择' && question.answer < 0) issues.push('没有正确答案')
  if (!question.knowledge || question.knowledge === '未分类') issues.push('没有知识点')
  return issues
}

export function normalizeExtractedQuestions(parsed, paper) {
  const list = Array.isArray(parsed) ? parsed : parsed?.questions
  if (!Array.isArray(list)) throw new Error('拆题结果不是题目数组')
  const out = []
  const seen = new Set()
  for (const row of list) {
    const question = normalizeQuestion(row, paper)
    if (!question.stem) continue
    const hash = questionHash(question.stem, question.options)
    if (seen.has(hash)) continue
    seen.add(hash)
    const issues = validateQuestion(question)
    if (issues.length) question.status = '待确认'
    out.push(question)
  }
  return out
}

const optionLetter = index => 'ABCD'[index] ?? ''

export function questionToRow(question) {
  return {
    '编号': question.id,
    '学科': question.subject,
    '年级': question.grade,
    '学期': question.term,
    '地区': question.region,
    '来源卷': question.paperId,
    '年份': question.year,
    '题型': question.type,
    '知识点': question.knowledge,
    '难度': question.difficulty,
    '题干': question.stem,
    '选项A': question.options?.[0] ?? '',
    '选项B': question.options?.[1] ?? '',
    '选项C': question.options?.[2] ?? '',
    '选项D': question.options?.[3] ?? '',
    '答案': optionLetter(question.answer),
    '解析': question.explain,
    '分值': question.score,
    '状态': question.status,
    '图片': question.image,
    '创建时间': question.createdAt,
  }
}

export function rowToQuestion(row, paper = {}) {
  return normalizeQuestion({
    ...row,
    options: [row['选项A'], row['选项B'], row['选项C'], row['选项D']],
    answer: row['答案'],
    id: row['编号'],
  }, paper)
}

export const DEFAULT_MIX = {
  15: [['基础', 3], ['中档', 6], ['期中', 4], ['压轴', 2]],
  10: [['基础', 2], ['中档', 4], ['期中', 3], ['压轴', 1]],
}

/**
 * 从已确认题库选题。返回 {questions, layers}；不够时抛错并带 shortage。
 */
export function selectBankQuestions(questions, {
  subject = '', grade = '', term = '', paperIds = [], knowledgePoints = [], count = 15, mix = null, exclude = [],
} = {}) {
  const total = Number(count) === 10 ? 10 : 15
  const target = mix ?? DEFAULT_MIX[total]
  const wanted = new Set(knowledgePoints.filter(Boolean))
  const excluded = new Set(exclude)
  const pool = (questions ?? []).filter(row =>
    row.status === '已确认'
    && (!subject || !row.subject || row.subject === subject)
    && (!grade || !row.grade || row.grade === grade)
    && (!term || !row.term || row.term === term)
    && (!paperIds.length || paperIds.includes(row.paperId))
    && (!wanted.size || wanted.has(row.knowledge))
    && !excluded.has(row.id)
  )
  const groups = new Map()
  for (const row of pool) {
    if (!groups.has(row.knowledge)) groups.set(row.knowledge, [])
    groups.get(row.knowledge).push(row)
  }
  const names = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length)
  if (!names.length) {
    throw Object.assign(new Error('题库不够：没有符合条件的已确认题'), { shortage: [{ knowledge: '全部', difficulty: '任意', need: 1, have: 0 }] })
  }
  const layers = names.slice(0, 5).map((name, index) => ({ id: `L${index + 1}`, name, desc: '', promise: '' }))
  const used = new Set()
  const picked = []
  const slots = []
  for (const [difficulty, need] of target) for (let i = 0; i < need; i += 1) slots.push(difficulty)
  const pick = (name, difficulty) => {
    const row = (groups.get(name) ?? []).find(item => item.difficulty === difficulty && !used.has(item.id))
    if (!row) return false
    used.add(row.id)
    picked.push({ ...row, layer: layers.find(layer => layer.name === name)?.id ?? 'L1' })
    return true
  }
  // 先保证每层有一题：从当前槽位里挑一个该层有的难度
  for (const layer of layers) {
    const at = slots.findIndex(difficulty => pick(layer.name, difficulty))
    if (at >= 0) slots.splice(at, 1)
  }
  // 再按目标难度把剩余槽位填满；目标难度没有时，优先用更难的真题顶上，
  // 不回头用「基础题」把卷子做简单。
  const fallback = {
    '基础': ['基础', '中档', '期中', '压轴'],
    '中档': ['中档', '期中', '压轴', '基础'],
    '期中': ['期中', '压轴', '中档', '基础'],
    '压轴': ['压轴', '期中', '中档', '基础'],
  }
  for (const difficulty of [...slots]) {
    let ok = false
    for (const targetDiff of fallback[difficulty] ?? [difficulty]) {
      for (const layer of layers) {
        if (pick(layer.name, targetDiff)) { ok = true; break }
      }
      if (ok) break
    }
    if (!ok) {
      throw Object.assign(new Error(`题库不够：还差 ${total - picked.length} 道题。请再上传同类真题。`), {
        shortage: [{ knowledge: names.slice(0, 5).join('、'), difficulty, need: 1, have: 0 }],
      })
    }
  }
  if (picked.length < total) {
    throw Object.assign(new Error(`题库不够：还差 ${total - picked.length} 道`), {
      shortage: [{ knowledge: '全部', difficulty: '任意', need: total, have: picked.length }],
    })
  }
  return { questions: picked.slice(0, total), layers }
}

/** 把题库题目组装成现有诊断卷 spec。 */
export function specFromBank({ questions, layers }, { title = '诊断卷', brand = {}, lesson = {}, student = {} } = {}) {
  const answers = questions.map(row => row.answer)
  return {
    version: 1,
    id: '',
    title,
    brand,
    lesson,
    student,
    layers,
    questions: questions.map((row, index) => ({
      id: `q${index + 1}`,
      layer: row.layer,
      stem: row.stem,
      formula: row.image ? '' : '',
      options: row.options,
      answer: row.answer,
      explain: row.explain,
      trialFocus: row.knowledge,
      source: row.paperName,
      difficulty: row.difficulty,
    })),
    verdicts: {
      low: { title: '地基断层明确，先补这一层', body: '这次错得集中在前面的基础层，不是刷题量的问题。试听会从断掉的那一层开始补。' },
      mid: { title: '关键断层清楚，试听能针对补', body: '基础不是空白，但中间有一层没接上。试听就讲这一层。' },
      high: { title: '基础可用，试听用来拔高和查漏', body: '大部分已经掌握，剩下的一小块在试听里补。' },
      top: { title: '基础扎实，试听挑战更高难度', body: '这套卷子已经难不住他，试听会换更综合的题。' },
    },
    commitment: '这次试听，你最想先解决哪一步？',
    createdAt: new Date().toISOString(),
    bank: true,
  }
}
