import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildParentScripts, formatParentSlot, localParentAnalysis, validateParentReply } from '../src/replies.js'
import { analysisPrompt } from '../src/diagnostics-prompt.js'

const spec = {
  student: { name: '小雪', grade: '高一' },
  lesson: { title: '氧化还原配平', at: '2026-11-30 周日 19:00' },
  layers: [{ id: 'L1', name: '① 化合价' }],
  questions: [],
}
const result = {
  percent: 20,
  layers: [{ id: 'L1', name: '① 化合价', correct: 0, total: 2, percent: 0 }],
  wrong: [{ index: 0, question: { stem: '标化合价', trialFocus: '标化合价' } }],
}

test('家长时间：完整日期转成口语，不出现年月日', () => {
  assert.equal(formatParentSlot({ at: '2026-11-30 周日 19:00' }).main, '周日晚上7点')
  assert.equal(formatParentSlot({ at: '2026-11-30 周日 19:00', altAt: '周六 10:00' }).alt, '周六上午10点')
  assert.equal(formatParentSlot({ talkAt: '周日晚 7 点' }).main, '周日晚7点')
})

test('家长话术校验：拦住旧坏模板里的所有问题', () => {
  const bad = '家长您好，小雪的试听诊断结果出来了：这次诊断 2/10 题，正确率 20%。最需要先补的是「① 化合价」，这一层 0/2。这不是孩子笨，是这一层没接上。您看2026-11-30 周日 19:00的时间方便吗？'
  const { ok, issues } = validateParentReply(bad)
  assert.equal(ok, false)
  for (const word of ['系统通知式开头', '分数比', '百分比', '内部层号', '销售话术', '完整日期']) {
    assert.ok(issues.includes(word), `${word} 没被拦住：${issues.join('、')}`)
  }
})

test('兜底话术：不报分数、不写层号、不拿完整日期问，最多一个问号', () => {
  const built = buildParentScripts(spec, result, { slots: formatParentSlot({ at: spec.lesson.at }) })
  assert.equal(built.scripts.length, 2)
  for (const script of built.scripts) {
    const check = validateParentReply(script.text)
    assert.equal(check.ok, true, `${script.tag} 不合格：${check.issues.join('、')}\n${script.text}`)
    assert.doesNotMatch(script.text, /2\/10|20%|①|2026-11-30/)
  }
  assert.equal((built.scripts[0].text.match(/[？?]/g) || []).length, 1)
})

test('兜底话术：不同分数段说法不同，课后没进步不编进步', () => {
  const low = localParentAnalysis(spec, result, {})
  const high = localParentAnalysis(spec, { ...result, percent: 85, layers: [{ id: 'L1', name: '① 化合价', correct: 2, total: 2, percent: 100 }] }, {})
  assert.notEqual(low.parentScript, high.parentScript)
  const post = localParentAnalysis(spec, { ...result, percent: 0, selfEval: {} }, { kind: 'post', pre: { percent: 50 } })
  assert.doesNotMatch(post.parentScript, /进步\s*\d+|提升\s*\d+/)
})

test('提示词：带坏案例和规则，要求两段话术', () => {
  const prompt = analysisPrompt({ positioning: { subject: '化学' } }, spec, result, { samples: ['孩子这块不是笨，是前面没接上。'] })
  assert.match(prompt.system, /反面例子/)
  assert.match(prompt.system, /2\/10/)
  assert.match(prompt.system, /不要报分数/)
  assert.match(prompt.system, /最多一个问号/)
  assert.match(prompt.user, /家长能听懂的时间/)
  assert.match(prompt.system, /"scripts"/)
})
