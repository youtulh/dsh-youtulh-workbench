import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { normalizeExtractedQuestions, questionHash, rowToQuestion, selectBankQuestions, specFromBank } from '../src/question-bank.js'
import { extractPaperText } from '../src/papers.js'

const paper = { id: 'P1', name: '北京期中', subject: '化学', grade: '高一', term: '上学期', region: '北京', year: '2026' }

function makeQuestions() {
  const list = []
  const diffs = [['基础', 3], ['中档', 6], ['期中', 4], ['压轴', 2]]
  for (let i = 0; i < 5; i += 1) {
    for (const [difficulty, count] of diffs) {
      for (let n = 0; n < count; n += 1) {
        list.push({
          id: `Q-${i}-${difficulty}-${n}`, paperId: 'P1', paperName: paper.name, subject: '化学', grade: '高一', term: '上学期',
          knowledge: `知识点${i + 1}`, difficulty, type: '选择', stem: `第${i}-${difficulty}-${n}题`,
          options: ['A', 'B', 'C', 'D'], answer: 0, explain: '解析', status: '已确认', createdAt: '2026-01-01',
        })
      }
    }
  }
  return list
}

test('题库拆题：标准化、去重、缺答案标记待确认', () => {
  const parsed = [
    { type: '选择', stem: '题干一', options: ['A', 'B', 'C', 'D'], answer: 'A', knowledge: '化合价', difficulty: '中档' },
    { type: '选择', stem: '题干一', options: ['A', 'B', 'C', 'D'], answer: 'A', knowledge: '化合价', difficulty: '中档' },
    { type: '选择', stem: '题干二', options: ['A', 'B'], answer: '', knowledge: '化合价', difficulty: '中档' },
  ]
  const rows = normalizeExtractedQuestions(parsed, paper)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].status, '待确认')
  assert.equal(rows[1].status, '待确认')
  assert.equal(questionHash('题干一', ['A', 'B', 'C', 'D']), questionHash('题干一', ['A', 'B', 'C', 'D']))
})

test('题库组卷：按知识点覆盖和难度配比选满 15 题', () => {
  const { questions, layers } = selectBankQuestions(makeQuestions(), { subject: '化学', grade: '高一', count: 15 })
  assert.equal(questions.length, 15)
  assert.equal(layers.length, 5)
  assert.equal(new Set(questions.map(row => row.id)).size, 15)
  assert.equal(questions.filter(row => row.difficulty === '基础').length, 3)
  assert.equal(questions.filter(row => row.difficulty === '期中').length, 4)
})

test('题库不够：报缺口，不拿简单题补', () => {
  const few = makeQuestions().slice(0, 4)
  assert.throws(() => selectBankQuestions(few, { count: 15 }), /题库不够/)
})

test('题库组卷：spec 里每题都来自题库，可追溯来源', () => {
  const selected = selectBankQuestions(makeQuestions(), { count: 10 })
  const spec = specFromBank(selected, { title: '诊断卷', brand: { name: '测试' }, lesson: { title: '氧化还原', subject: '化学' }, student: { name: '小雪' } })
  assert.equal(spec.questions.length, 10)
  assert.ok(spec.questions.every(row => row.stem && row.options.length === 4 && Number.isInteger(row.answer)))
  assert.ok(spec.questions.every(row => row.source === paper.name))
})

test('文本卷可以直接提取', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'paper-'))
  try {
    const file = join(dir, '卷子.txt')
    await writeFile(file, '1. 题干\nA. 选项')
    assert.match(await extractPaperText(file), /题干/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('CSV 行读成题目', () => {
  const row = { '编号': 'Q1', '题干': '题干', '选项A': 'A', '选项B': 'B', '选项C': 'C', '选项D': 'D', '答案': 'A', '知识点': '化合价', '难度': '期中', '状态': '已确认' }
  const question = rowToQuestion(row, paper)
  assert.equal(question.answer, 0)
  assert.equal(question.difficulty, '期中')
  assert.equal(question.status, '已确认')
})
