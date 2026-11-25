// 诊断卷与家长话术的提示词。输出必须是 JSON，宿主再校验。
import { settingBlock } from './dm.js'
import { styleBlock } from './style-guide.js'
import { REPLY_RULES, formatParentSlot, localParentAnalysis } from './replies.js'

const clean = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const line = (value, max = 120) => clean(value, max)

const SCHEMA = `{
  "title": "卷面标题，不超过 30 字",
  "layers": [
    {"id": "L1", "name": "第 1 层名称，如 ① 化合价", "desc": "这一层查什么", "promise": "试听会怎么补这一层"}
  ],
  "questions": [
    {
      "layer": "L1",
      "stem": "题干，具体到知识点，不用「综合」「谈谈」",
      "formula": "需要单独展示的化学式/方程式，没有就留空",
      "options": ["A 选项", "B 选项", "C 选项", "D 选项"],
      "answer": 0,
      "explain": "为什么这个答案对，指出错项错在哪",
      "trialFocus": "这题对应试听里要讲的那一步"
    }
  ],
  "verdicts": {
    "low": {"title": "0-39% 的结论", "body": "对应建议，指向试听"},
    "mid": {"title": "40-74% 的结论", "body": "对应建议，指向试听"},
    "high": {"title": "75-89% 的结论", "body": "肯定 + 剩余部分课内补"},
    "top": {"title": "90-100% 的结论", "body": "拔高/找别的断层"}
  },
  "commitment": "课前让学生选的目标问题，一句话"
}`

/**
 * 生成课前诊断卷。
 * @param {object} state - 工作台状态（定位/痛点）。
 * @param {object} input - { brand, lesson, student, count, method }
 */
export function diagnosticPrompt(state, input = {}) {
  const p = state?.positioning ?? {}
  const brand = input.brand ?? {}
  const lesson = input.lesson ?? {}
  const student = input.student ?? {}
  const count = Number(input.count) === 10 ? 10 : 15
  const method = clean(input.method, 2000)
  const system = `你是给补课老师出「试听课诊断卷」的教研老师。诊断的目的不是考倒学生，是让家长看见孩子具体断在哪一层，并自然指向试听。
${styleBlock([])}
${method ? `\n课程方法论（优先遵守）：\n${method}\n` : ''}
规则：
- 正好 5 层，从最基础的地基到本节试听的核心；每层 ${Math.max(2, Math.round(count / 5))} 题左右，总共 ${count} 题；
- 题目必须具体到知识点、公式或题型，四选一，只有一个正确答案；不要「综合题」「请谈谈」；
- 难度按学生当前水平：基础题占一半，中档题三成，拔高题两成；不要为了难而难；
- 每题都要有解析，解析要指出错项错在哪；每题标出对应试听的哪一步；
- 性别只影响举例措辞，不改变难度、不写刻板印象；
- 不写价格、不承诺提分、不写包过、不出现联系方式；
- 结论要诚实：低分指出断层并要求先补，高分要肯定并说清剩余部分在课内补，不制造假焦虑；
- 只输出 JSON，不要 Markdown 代码块。`
  const context = `品牌：${line(brand.name) || line(p.subject) + '试听'}（${line(brand.teacher) || '老师'}）
课程：${line(lesson.title) || '试听课'} · ${line(lesson.subject) || line(p.subject)} · ${line(lesson.grade) || line(p.grade)}
上课时间：${line(lesson.at) || '待定'}
课次编码：${line(lesson.code) || '待定'}
试听重点：${line(lesson.topic) || line(p.entry) || '按诊断结果定'}

学生：${line(student.name) || '孩子'}（${line(student.grade) || line(p.grade) || '年级未知'}${student.gender ? ` · ${line(student.gender)}` : ''}）
当前水平：${line(student.level) || '未说明'}，分数：${student.score ?? '未填'}
卡点：${line(student.pain) || line(p.entry) || '未说明'}
学习阻力：${(student.resistances ?? []).join('、') || '未说明'}
本次目标：${line(student.goal) || '先找出卡点'}

请按下面的 JSON 结构出卷：
${SCHEMA}`
  return { system, user: context }
}

/** 课前/课后的家长话术与诊断说明。 */
export function analysisPrompt(state, spec, result, { kind = 'pre', pre = null, note = '', samples = [], temperature = '', slots = null } = {}) {
  const brand = spec.brand ?? {}
  const student = spec.student ?? {}
  const layers = (result?.layers ?? []).map(row => `${row.name} ${row.correct}/${row.total}`).join('；')
  const wrong = (result?.wrong ?? []).slice(0, 5).map(row => `第${row.index + 1}题：${row.question.stem}${row.question.trialFocus ? `（对应：${row.question.trialFocus}）` : ''}`).join('\n') || '没有错题'
  const point = (result?.layers ?? []).find(row => row.total && row.percent < 60)?.name || spec.layers?.[0]?.name || '前面那一步'
  const slot = slots ?? formatParentSlot({ at: spec.lesson?.at, talkAt: spec.lesson?.talkAt, altAt: spec.lesson?.altAt })
  const timeLine = [slot.main && `说的出口的时间：${slot.main}`, slot.alt && `备选：${slot.alt}`].filter(Boolean).join('；') || '老师没填具体时间'
  const system = `你是给补课老师写家长微信的顾问。你写的不是诊断报告，是一条能约到人的微信。
${settingBlock(state)}${styleBlock(samples)}
${REPLY_RULES}

反面例子（绝对不要这样写，也不要把它的句式换个词再用）：
「家长您好，小雪的试听诊断结果出来了：这次诊断 2/10 题，正确率 20%。最需要先补的是「① 化合价」，这一层 0/2。这不是孩子笨，是这一层没接上。试听我会从「① 化合价」开始讲，讲完再让他自己做一遍，您能看到他到底卡在哪。您看2026-11-30 周日 19:00的时间方便吗？」
它的问题：系统通知开头、先报分数、把内部层号给家长、销售式否定、拿完整日期问方便、一条消息做四件事。

正面示例（只学结构，不要照抄内容）：
「小雪家长，我看他前面标化合价那几步停得比较久，配平的时候一直在试系数。不是不会，是这一步没稳住，后面就只能猜。这次试听我先带他把「标价→找升降→配平」走一遍，当场再做一道同型题。周日晚 7 点先按这个排，你看行吗？」

输出 JSON，不要 Markdown：
{"summary":"给老师看的一句话诊断","findings":["具体发现，最多4条"],"scripts":[{"tag":"首条","text":"可直接发家长的微信，120-180字"},{"tag":"没回再发","text":"更短，给一个有用的小动作，不逼单"}],"parentScript":"首条的兼容字段","trialFocus":["试听先讲哪2-3步"],"nextStep":"老师下一步动作","riskNote":"一句风险提醒"}

写的时候再检查一遍：
- 首条不要报分数、百分比、层号；不要写「诊断结果出来了」「这不是孩子笨」「最需要先补的是」；
- 时间只用老师给的口语时间；没有就只问「这周哪天晚上方便」，绝不出现完整年月日；
- 全篇最多一个问号；
- 先具体观察，再讲机制，再给试听动作，最后才约时间；
- A3 直接给时间，A2 轻一点、不逼单；但都只留一个动作；
- 课后话术先说课前目标/家长原话，再说这次哪一步变了；没进步就说哪一步没稳住，不指责。`
  const user = `品牌：${line(brand.name)}（${line(brand.teacher)}）
学生：${line(student.name) || '孩子'}（${line(student.grade) || '年级未知'}）
家长原话/卡点：${line(student.pain) || '未说明'}
本次目标：${line(student.goal) || line(spec.commitment) || '先找出卡点'}
家长状态：${temperature || '未说明（默认按 A3 处理）'}
课程：${line(spec.lesson?.title)} · 家长能听懂的时间：${timeLine}
本次类型：${kind === 'post' ? '课后复测' : '课前诊断'}
内部数据（只给你判断用，不要原样写给家长）：
总分：${result?.correct}/${result?.total}（${result?.percent}%）
分层：${layers}
最卡的一层：${point}
错题/卡点：
${wrong}
${pre ? `课前：${pre.correct}/${pre.total}（${pre.percent}%）` : ''}
${note ? `老师补充：${clean(note, 600)}` : ''}
${kind === 'post' ? `学生自评：${JSON.stringify(result?.selfEval ?? {})}` : ''}

请写首条和没回再发两段。`
  return { system, user }
}

/** 没模型时的本地话术：只根据分数和分层说，不编细节。 */
export function localAnalysis(spec, result, { kind = 'pre', pre = null, temperature = '', slots = null } = {}) {
  return localParentAnalysis(spec, result, { kind, pre, temperature, slots: slots ?? formatParentSlot({ at: spec.lesson?.at, talkAt: spec.lesson?.talkAt, altAt: spec.lesson?.altAt }) })
}

/** 生成课后检测：同一套层，换题，不重复原题。 */
export function postDiagnosticPrompt(state, spec, pre = null, notes = '') {
  const p = state?.positioning ?? {}
  const brand = spec.brand ?? {}
  const layers = (spec.layers ?? []).map(row => `${row.id}：${row.name}（${row.desc || ''}）`).join('\n')
  const preQuestions = (spec.questions ?? []).map(row => `[${row.layer}] ${row.stem}`).join('\n')
  const system = `你是给补课老师出「试听课课后检测」的教研老师。学生刚上完这节课，检测只做一件事：看课前卡住的那几层，课后有没有真的动。
${styleBlock([])}
规则：
- 沿用课前的 5 层，不新增层；
- 每层出 ${Math.max(1, Math.round((spec.questions?.length ?? 10) / 5))} 题，总共 ${spec.questions?.length ?? 10} 题；
- 必须换数字、换方程式、换情境，不能照抄课前原题；
- 每题四选一，只有一个正确答案，解析要具体；
- 题目难度与课前同一层持平，不要故意出更难来证明「没学会」；
- 不写价格、不承诺提分、不写包过、不出现联系方式；
- 只输出 JSON：{"questions":[{"layer":"L1","stem":"","formula":"","options":["","","",""],"answer":0,"explain":"","trialFocus":""}],"verdicts":{"low":{},"mid":{},"high":{},"top":{}}}
- verdicts 是课后四个分数段的结论，要区分「有进步」「没稳住」，不羞辱孩子。`
  const user = `品牌：${line(brand.name)}（${line(brand.teacher)}）
学生：${line(spec.student?.name) || '孩子'}（${line(spec.student?.grade) || ''}）
课程：${line(spec.lesson?.title)} · ${line(spec.lesson?.at)}
课前得分：${pre ? `${pre.correct}/${pre.total}（${pre.percent}%）` : '未导入'}
分层：
${layers}
课前题目（只用来避免重复）：
${preQuestions}
老师记录的课堂情况：${clean(notes, 800) || '按课程正常讲完'}
请出课后检测卷。`
  return { system, user }
}
