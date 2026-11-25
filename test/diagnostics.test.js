import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bandOf, compareScores, decodeResult, encodeResult, localDiagnostic, normalizeDiagnostic, resultPayload, scoreDiagnostic } from '../src/diagnostics.js'
import { renderDiagnosticHtml } from '../src/diagnostics-render.js'

const input = {
  id: 'DIAG_test',
  brand: { name: '姜老师化学', teacher: '姜老师', mark: '姜' },
  lesson: { title: '氧化还原配平', subject: '化学', grade: '高一', at: '2026-11-30 19:00', code: 'TRIAL-1' },
  student: { name: '小雪', grade: '高一', level: '基础薄弱' },
  count: 10,
}

test('诊断卷：本地模板卷结构完整，答案索引有效', () => {
  const spec = localDiagnostic(input)
  assert.equal(spec.layers.length, 5)
  assert.equal(spec.questions.length, 10)
  assert.ok(spec.questions.every(row => row.options.length >= 2 && row.answer >= 0 && row.answer < row.options.length))
  assert.equal(spec.id, 'DIAG_test')
  assert.equal(spec.lesson.at, '2026-11-30 19:00')
})

test('诊断卷：评分、分层、卡点与分数段', () => {
  const spec = localDiagnostic(input)
  const allRight = scoreDiagnostic(spec, spec.questions.map(row => row.answer))
  assert.equal(allRight.percent, 100)
  assert.equal(allRight.band, 'top')
  assert.equal(allRight.wrong.length, 0)
  const allWrong = scoreDiagnostic(spec, spec.questions.map(row => (row.answer + 1) % row.options.length))
  assert.equal(allWrong.percent, 0)
  assert.equal(allWrong.band, 'low')
  assert.equal(allWrong.stuck.id, 'L1')
  assert.equal(bandOf(39), 'low')
  assert.equal(bandOf(40), 'mid')
  assert.equal(bandOf(75), 'high')
  assert.equal(bandOf(90), 'top')
})

test('结果码：往返编码解码，损坏码拒绝', () => {
  const spec = localDiagnostic(input)
  const payload = resultPayload(spec, 'pre', spec.questions.map(row => row.answer), { commitment: '先补基础' })
  const code = encodeResult(payload)
  assert.ok(code.startsWith('YT-DIAG1:'))
  const back = decodeResult(code)
  assert.equal(back.id, 'DIAG_test')
  assert.equal(back.answers.length, 10)
  assert.equal(back.commitment, '先补基础')
  assert.throws(() => decodeResult('bad-code'), /格式/)
})

test('课前课后对比：逐层算进步', () => {
  const spec = localDiagnostic(input)
  const pre = scoreDiagnostic(spec, spec.questions.map(() => 0))
  const post = scoreDiagnostic(spec, spec.questions.map(row => row.answer))
  const diff = compareScores(pre, post)
  assert.ok(diff.delta > 0)
  assert.ok(diff.improved.length > 0)
  assert.equal(diff.layers.length, 5)
})

test('诊断卷 HTML：带品牌、上课时间、课次编码，且不依赖外链', () => {
  const spec = localDiagnostic(input)
  const html = renderDiagnosticHtml(spec)
  assert.match(html, /姜老师化学/)
  assert.match(html, /2026-11-30 19:00/)
  assert.match(html, /TRIAL-1/)
  assert.match(html, /保存答案/)
  assert.match(html, /复制结果给老师/)
  assert.doesNotMatch(html, /https?:\/\//)
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1]
  assert.doesNotThrow(() => new Function(script))
})

test('正常化：缺答案/缺层的模型输出会被拒绝', () => {
  assert.throws(() => normalizeDiagnostic({ layers: [{ id: 'L1', name: 'A' }], questions: [] }, input), /至少/)
  assert.throws(() => normalizeDiagnostic({ layers: localDiagnostic(input).layers, questions: [{ stem: '题', options: ['A', 'B'], answer: 5 }] }, input), /至少/)
})

test('课后卷 prompt 沿用同一套层，并要求不重复原题', async () => {
  const { postDiagnosticPrompt } = await import('../src/diagnostics-prompt.js')
  const spec = localDiagnostic(input)
  const prompt = postDiagnosticPrompt({ positioning: { subject: '化学' } }, spec, null, '讲了标价和配平')
  assert.match(prompt.system, /沿用课前的 5 层/)
  assert.match(prompt.system, /不能照抄课前原题/)
  assert.match(prompt.user, /氧化还原配平/)
  assert.match(prompt.user, /讲了标价和配平/)
})
