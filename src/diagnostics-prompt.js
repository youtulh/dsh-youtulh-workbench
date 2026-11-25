// 诊断卷与家长话术的提示词。输出必须是 JSON，宿主再校验。
import { tr } from './i18n.js'
import { styleBlock } from './style-guide.js'
import { bandOf } from './diagnostics.js'

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
export function analysisPrompt(state, spec, result, { kind = 'pre', pre = null, note = '' } = {}) {
  const p = state?.positioning ?? {}
  const brand = spec.brand ?? {}
  const student = spec.student ?? {}
  const layers = (result?.layers ?? []).map(row => `${row.name} ${row.correct}/${row.total}`).join('；')
  const wrong = (result?.wrong ?? []).slice(0, 6).map(row => `第${row.index + 1}题：${row.question.stem}`).join('\n') || '没有错题'
  const system = `你是给补课老师写家长沟通话术的顾问。你要把诊断结果翻译成家长听得懂、愿意来试听/继续报课的话，但不夸大、不承诺、不制造假焦虑。
${styleBlock([])}
规则：
- 只输出 JSON：{"summary":"给老师看的一句话诊断","findings":["具体发现，最多4条"],"parentScript":"直接发家长的微信，120-220字，不分点","trialFocus":["试听先讲哪2-3步"],"nextStep":"老师下一步动作","riskNote":"一句风险提醒"}
- 先接住家长情绪，再说具体数据/断层，最后只给一个动作；
- 分数低：指出哪一层断，建议先补，不羞辱孩子；分数高：肯定，再说剩下的一块在课内补；
- 必须引用具体的层/题/学生原话，不能只写「基础薄弱」；
- 课后话术要引用课前结果和这次进步/未进步，体现「诊断—上课—复测」是一套方案；
- 不报价、不承诺提分、不写包过、不出现微信/手机号/价格；
- 家长话术里不要出现「AI」「模型」「诊断系统」这些词。`
  const user = `品牌：${line(brand.name)}（${line(brand.teacher)}）
学生：${line(student.name) || '孩子'}（${line(student.grade) || '年级未知'}）
课程：${line(spec.lesson?.title)} · ${line(spec.lesson?.at)}
本次类型：${kind === 'post' ? '课后复测' : '课前诊断'}
学生目标：${line(result?.commitment) || line(spec.commitment)}
总分：${result?.correct}/${result?.total}（${result?.percent}%）
分层：${layers}
错题/卡点：
${wrong}
${pre ? `课前：${pre.correct}/${pre.total}（${pre.percent}%）` : ''}
${note ? `老师补充：${clean(note, 600)}` : ''}
${kind === 'post' ? `学生自评：${JSON.stringify(result?.selfEval ?? {})}` : ''}

请写老师能直接用的诊断说明和家长话术。`
  return { system, user }
}

/** 没模型时的本地话术：只根据分数和分层说，不编细节。 */
export function localAnalysis(spec, result, { kind = 'pre', pre = null } = {}) {
  const band = bandOf(result?.percent ?? 0)
  const stuck = (result?.layers ?? []).find(row => row.total && row.percent < 60)
  const name = spec.student?.name || '孩子'
  const low = `这次诊断 ${result?.correct ?? 0}/${result?.total ?? 0} 题，正确率 ${result?.percent ?? 0}%。${stuck ? `最需要先补的是「${stuck.name}」，这一层 ${stuck.correct}/${stuck.total}。` : '各层都有一些漏洞，需要先稳住基础。'}`
  const high = `这次 ${result?.correct ?? 0}/${result?.total ?? 0} 题，正确率 ${result?.percent ?? 0}%，基础是够用的；剩下没稳的部分，正好在试听里补。`
  const summary = band === 'low' || band === 'mid' ? low : high
  const parentScript = kind === 'post'
    ? `家长您好，${name}今天的课后检测做完了。${pre ? `课前正确率 ${pre.percent}%，这次 ${result?.percent ?? 0}%，` : ''}${(result?.percent ?? 0) >= (pre?.percent ?? 0) ? '这一步是有进步的，说明课上讲的方法他接住了。' : '这次暴露的是还没稳住，不是不会。'}接下来我们会针对${stuck ? `「${stuck.name}」` : '还不稳的那一步'}再带他练，主讲和助教都会盯到他会为止。您看这周哪天方便，我把他下一步的安排发您。`
    : `家长您好，${name}的试听诊断结果出来了：${summary}这不是孩子笨，是这一层没接上。试听我会从${stuck ? `「${stuck.name}」` : '他最卡的那一步'}开始讲，讲完再让他自己做一遍，您能看到他到底卡在哪。您看${spec.lesson?.at || '这周'}的时间方便吗？`
  return {
    summary,
    findings: [summary],
    parentScript,
    trialFocus: stuck ? [stuck.name, '当场重做一道同型题'] : ['按诊断结果从最弱一层开始'],
    nextStep: kind === 'post' ? '根据课后结果安排补漏，并确认下次课时间' : '把诊断结果发给家长，约试听',
    riskNote: '不承诺提分；不报价；先确认孩子是否愿意来。',
  }
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
