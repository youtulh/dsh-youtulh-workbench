// 试听诊断：卷面规格、评分、结果码、课前课后对比。
// 纯函数，不碰文件；宿主和浏览器都能用。
const PREFIX = 'YT-DIAG1:'
const clean = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0

export const DIAG_BANDS = [
  { id: 'low', min: 0, max: 39 },
  { id: 'mid', min: 40, max: 74 },
  { id: 'high', min: 75, max: 89 },
  { id: 'top', min: 90, max: 100 },
]

export function bandOf(percent) {
  const value = Math.max(0, Math.min(100, Math.round(num(percent))))
  return DIAG_BANDS.find(row => value >= row.min && value <= row.max)?.id ?? 'low'
}

const DEFAULT_VERDICTS = {
  low: {
    title: '地基断层明确，先补这一层',
    body: '这次错得集中在前面的基础层，不是刷题量的问题。试听会从断掉的那一层开始补，先把地基接上。',
  },
  mid: {
    title: '关键断层清楚，试听能针对补',
    body: '基础不是完全空白，但中间有一层没接上。试听就讲这一层，把卡住的地方当场打通。',
  },
  high: {
    title: '基础可用，试听用来拔高和查漏',
    body: '大部分已经掌握，剩下的一小块在试听里补；不用从头再来。',
  },
  top: {
    title: '基础扎实，试听挑战更高难度',
    body: '这套卷子已经难不住他。试听会换更综合的题，顺便找找别的断层。',
  },
}

/** 把模型输出/本地模板压成稳定的卷面规格。 */
export function normalizeDiagnostic(json = {}, input = {}) {
  const rawLayers = Array.isArray(json.layers) ? json.layers : []
  const layers = rawLayers.slice(0, 5).map((row, index) => ({
    id: clean(row.id, 8) || `L${index + 1}`,
    name: clean(row.name, 40) || `第 ${index + 1} 层`,
    desc: clean(row.desc, 80),
    promise: clean(row.promise, 160),
  }))
  if (layers.length < 3) throw new Error('诊断卷至少要有 3 层')
  const layerIds = new Set(layers.map(row => row.id))
  const questions = (Array.isArray(json.questions) ? json.questions : [])
    .map((row, index) => {
      const options = (Array.isArray(row.options) ? row.options : []).map(option => clean(option, 200)).filter(Boolean)
      const answer = Number(row.answer)
      const layer = clean(row.layer, 8)
      return {
        id: `q${index + 1}`,
        layer: layerIds.has(layer) ? layer : layers[0].id,
        stem: clean(row.stem, 300),
        formula: clean(row.formula, 200),
        options,
        answer: Number.isInteger(answer) && answer >= 0 && answer < options.length ? answer : -1,
        explain: clean(row.explain, 500),
        trialFocus: clean(row.trialFocus, 200),
      }
    })
    .filter(row => row.stem && row.options.length >= 2 && row.answer >= 0)
  if (questions.length < 5) throw new Error('诊断卷至少要有 5 道有效题')
  const verdicts = {}
  for (const band of DIAG_BANDS) {
    const row = json.verdicts?.[band.id] ?? {}
    verdicts[band.id] = {
      title: clean(row.title, 80) || DEFAULT_VERDICTS[band.id].title,
      body: clean(row.body, 400) || DEFAULT_VERDICTS[band.id].body,
    }
  }
  return {
    version: 1,
    id: clean(input.id, 60),
    title: clean(json.title, 80) || clean(input.title, 80) || '试听课诊断卷',
    brand: {
      name: clean(input.brand?.name, 60),
      teacher: clean(input.brand?.teacher, 40),
      logo: clean(input.brand?.logo, 500),
      mark: clean(input.brand?.mark, 8),
    },
    lesson: {
      title: clean(input.lesson?.title, 80),
      subject: clean(input.lesson?.subject, 20),
      grade: clean(input.lesson?.grade, 20),
      topic: clean(input.lesson?.topic, 80),
      at: clean(input.lesson?.at, 40),
      code: clean(input.lesson?.code, 40),
      duration: num(input.lesson?.duration) || 45,
    },
    student: {
      name: clean(input.student?.name, 40),
      grade: clean(input.student?.grade, 20),
      gender: clean(input.student?.gender, 10),
      level: clean(input.student?.level, 20),
      score: input.student?.score === '' || input.student?.score === undefined ? null : num(input.student.score),
      pain: clean(input.student?.pain, 200),
      resistances: (Array.isArray(input.student?.resistances) ? input.student.resistances : []).map(row => clean(row, 20)).filter(Boolean).slice(0, 6),
      goal: clean(input.student?.goal, 120),
    },
    layers,
    questions,
    verdicts,
    commitment: clean(json.commitment, 120) || '这次试听，你最想先解决哪一步？',
    createdAt: input.createdAt || new Date().toISOString(),
  }
}

/** 按题号对答案；返回总分、逐层分、卡点层和错题。 */
export function scoreDiagnostic(spec, answers = []) {
  const list = Array.isArray(answers) ? answers : []
  const layerMap = new Map(spec.layers.map(row => [row.id, { id: row.id, name: row.name, correct: 0, total: 0 }]))
  const wrong = []
  let correct = 0
  spec.questions.forEach((question, index) => {
    const layer = layerMap.get(question.layer)
    if (!layer) return
    layer.total += 1
    const chosen = Number(list[index])
    if (Number.isInteger(chosen) && chosen === question.answer) {
      layer.correct += 1
      correct += 1
    } else {
      wrong.push({ index, question, chosen: Number.isInteger(chosen) ? chosen : -1 })
    }
  })
  const layers = [...layerMap.values()].map(row => ({ ...row, percent: row.total ? Math.round(row.correct / row.total * 100) : 0 }))
  const total = spec.questions.length
  const percent = total ? Math.round(correct / total * 100) : 0
  const stuck = layers.find(row => row.total && row.percent < 60) || null
  return { correct, total, percent, layers, stuck, wrong, band: bandOf(percent) }
}

export function resultPayload(spec, kind, answers, extra = {}) {
  return {
    v: 1,
    id: spec.id,
    kind,
    answers: (Array.isArray(answers) ? answers : []).map(value => Number(value)),
    commitment: clean(extra.commitment, 120),
    selfEval: extra.selfEval ?? null,
    studentName: clean(spec.student?.name, 40),
    savedAt: extra.savedAt || new Date().toISOString(),
  }
}

export function encodeResult(payload) {
  const json = JSON.stringify(payload)
  return `${PREFIX}${Buffer.from(json, 'utf8').toString('base64url')}`
}

export function decodeResult(text) {
  const raw = String(text ?? '').trim()
  if (!raw) throw new Error('结果还是空的')
  if (raw.startsWith('{')) return JSON.parse(raw)
  if (!raw.startsWith(PREFIX)) throw new Error('结果码格式不对，要以 YT-DIAG1: 开头')
  try {
    return JSON.parse(Buffer.from(raw.slice(PREFIX.length), 'base64url').toString('utf8'))
  } catch {
    throw new Error('结果码损坏了，让对方重新复制一次')
  }
}

export function compareScores(pre, post) {
  const before = new Map((pre?.layers ?? []).map(row => [row.id, row]))
  const layers = (post?.layers ?? []).map(row => {
    const old = before.get(row.id)
    return {
      id: row.id,
      name: row.name,
      from: old?.correct ?? 0,
      to: row.correct,
      total: row.total,
      delta: row.correct - (old?.correct ?? 0),
    }
  })
  return {
    from: pre?.percent ?? 0,
    to: post?.percent ?? 0,
    delta: (post?.percent ?? 0) - (pre?.percent ?? 0),
    layers,
    improved: layers.filter(row => row.delta > 0),
    flat: layers.filter(row => row.delta === 0),
    dropped: layers.filter(row => row.delta < 0),
  }
}

/** 没模型时的化学氧化还原模板卷：只作为兜底，界面会标注模板。 */
export function localDiagnostic(input = {}) {
  const questions = [
    ['L1', 'Fe₂O₃ 中铁元素的化合价是？', ['+2', '+3', '0', '−3'], 1, 'O 是 −2，3 个 O 共 −6，所以 2 个 Fe 共 +6，每个 Fe 是 +3。'],
    ['L1', 'KMnO₄ 中锰元素的化合价是？', ['+2', '+4', '+6', '+7'], 3, 'K 是 +1，4 个 O 共 −8，Mn = +7。'],
    ['L2', '硝酸根离子的符号是？', ['NO₂⁻', 'NO₃⁻', 'NO⁻', 'NO₃'], 1, '硝酸根是 NO₃⁻，整体带 1 个负电荷。'],
    ['L2', '氯化铁的化学式是？', ['FeCl₂', 'FeCl₃', 'Fe₂Cl₃', 'FeCl'], 1, '氯化「铁」指 +3 价的铁，所以是 FeCl₃。'],
    ['L3', '配平 H₂ + O₂ → H₂O，系数依次是？', ['1,1,1', '2,1,2', '1,2,2', '2,2,2'], 1, '2H₂ + O₂ = 2H₂O。'],
    ['L3', '配平 Fe + O₂ → Fe₃O₄，系数依次是？', ['3,2,1', '1,2,1', '2,3,1', '3,4,1'], 0, '3Fe + 2O₂ = Fe₃O₄。'],
    ['L4', '铜从 Cu 变成 Cu²⁺，铜发生了什么？', ['得 2 个电子、被还原', '失 2 个电子、被氧化', '得 2 个电子、被氧化', '失 2 个电子、被还原'], 1, '0 → +2 升价，失电子，被氧化。'],
    ['L4', '氧化还原配平「找升降」的依据是？', ['两边原子个数相等', '失电子总数 = 得电子总数', '系数都是整数', '质量守恒'], 1, '电子守恒，用最小公倍数凑系数。'],
    ['L5', '配平 Cu + HNO₃(稀) → Cu(NO₃)₂ + NO↑ + H₂O，系数依次是？', ['1,2,1,1,1', '3,8,3,2,4', '3,2,3,2,4', '1,8,1,2,4'], 1, '3Cu + 8HNO₃ = 3Cu(NO₃)₂ + 2NO↑ + 4H₂O。'],
    ['L5', '配平 C + HNO₃(浓) → CO₂ + NO₂ + H₂O，系数依次是？', ['1,4,1,4,2', '1,2,1,2,1', '2,4,2,4,2', '1,4,1,2,2'], 0, 'C + 4HNO₃ = CO₂ + 4NO₂ + 2H₂O。'],
  ]
  const layers = [
    { id: 'L1', name: '① 化合价', desc: '初三地基', promise: '先能标对价，后面的升降才有意义。' },
    { id: 'L2', name: '② 化学式/原子团', desc: '写对产物', promise: '高频原子团一次记牢。' },
    { id: 'L3', name: '③ 普通配平', desc: '观察法/最小公倍数', promise: '把配平方法串成一条线。' },
    { id: 'L4', name: '④ 氧化还原概念', desc: '升失氧、降得还', promise: '分清谁被氧化、谁被还原。' },
    { id: 'L5', name: '⑤ 氧化还原配平', desc: '三步法', promise: '从标价一路配平到底。' },
  ]
  return normalizeDiagnostic({
    title: '试听课诊断卷 · 氧化还原配平',
    layers,
    questions: questions.map(([layer, stem, options, answer, explain]) => ({ layer, stem, options, answer, explain })),
    commitment: '这次试听，你最想先解决哪一步？',
  }, {
    ...input,
    title: input.lesson?.title || '试听课诊断卷 · 氧化还原配平',
    lesson: { title: '氧化还原配平', subject: '化学', grade: '高一', ...(input.lesson ?? {}) },
  })
}
