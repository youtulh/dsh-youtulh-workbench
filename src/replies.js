// 家长回复的规则和兜底。诊断话术不是报告，是一条能约到人的微信。
// 这里的规则同时给模型提示词、兜底和测试用；改这里，三处一起变。
const clean = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export const REPLY_RULES = `家长回复规则（按这个写，不按这个就是报告，不是微信）：
- 一条消息只做三件事：说一个具体观察 → 翻译这个观察 → 给一个轻动作；不要同时做诊断、课程介绍、价格铺垫和逼单
- 开头先叫「某某家长」，再说孩子在卷子上的具体动作，例如「前面标化合价那几步停得比较久」；不要用「诊断结果出来了」开头
- 不要报分数比、正确率、百分比，不要写「2/10」「20%」；家长问再单独说
- 不要写「① 化合价」「这一层 0/2」这种内部评分；改成「化合价这一步」
- 不要说「这不是孩子笨」「最需要先补的是」，这两句是销售话术，不是老师说话
- 先讲机制，再给动作：不是不会，是前面哪一步没接上；这次试听具体带他做哪一步
- 时间只给一个动作：有具体时间就说「这次先按周日晚 7 点排，你看行吗」；有两个就说「周六上午 10 点，或周日晚 7 点，你哪个方便」；都没有就问「这周哪天晚上方便」；不要出现完整年月日
- 全篇最多一个问号；不堆感叹号；不用「首先/其次/总之/综上所述/赋能/闭环/底层逻辑」
- 不报价、不承诺提分、不包过；家长不问价格就不提
- 课后先说课前目标/家长原话，再说这次具体哪一步变了；没进步就说哪一步没稳住，给回看安排，不指责孩子`

/** 把内部时间改成家长能看懂的说法；绝不把 2026-11-30 19:00 原样发出去。 */
export function formatParentSlot({ at = '', talkAt = '', altAt = '' } = {}) {
  const custom = clean(talkAt, 40)
  const alt = clean(altAt, 40)
  if (custom) return { main: toHumanSlot(custom), alt: alt ? toHumanSlot(alt) : '', source: 'custom' }
  const parsed = parseSlot(at)
  return { main: parsed, alt: alt ? toHumanSlot(alt) : '', source: parsed ? 'parsed' : 'none' }
}

function toHumanSlot(value) {
  const stripped = clean(value, 40)
    .replace(/^20\d{2}[-年./]\d{1,2}[-月./]\d{1,2}日?\s*/, '')
    .replace(/^20\d{2}\s*/, '')
    .replace(/\s+/g, '')
    .replace(/[（(].*?[)）]/g, '')
  if (/\d{1,2}\s*[:：]\s*\d{0,2}/.test(stripped)) return parseSlot(stripped)
  return stripped
}

function parseSlot(text) {
  const raw = clean(text, 80)
  if (!raw) return ''
  const weekday = /(周[一二三四五六日天])/.exec(raw)?.[1] ?? ''
  const time = /(\d{1,2})\s*[:：点时]\s*(\d{1,2})?/.exec(raw)
  if (!time) return weekday
  let hour = Number(time[1])
  const minute = Number(time[2] ?? 0)
  let period = ''
  if (hour >= 18) period = '晚上'
  else if (hour >= 12) period = '下午'
  else if (hour >= 5) period = '上午'
  else period = '凌晨'
  if (hour > 12) hour -= 12
  if (hour === 12) period = '中午'
  const mm = minute === 30 ? '半' : minute ? `${minute}分` : ''
  return `${weekday}${period}${hour}点${mm}`
}

/** 给家长的时间问句；temperature=A2 时更轻。 */
export function parentTimeQuestion(slots, temperature = '') {
  const main = slots?.main || ''
  const alt = slots?.alt || ''
  if (main && alt) return temperature === 'A2' ? `${main}，或${alt}，你要是想先试试，哪个都行。` : `${main}，或${alt}，你哪个方便？`
  if (main) return temperature === 'A2' ? `这次先按${main}排，你要是觉得不合适再跟我说。` : `这次先按${main}排，你看行吗？`
  return '这周哪天晚上方便？我看看能不能排。'
}

const BANNED = [
  { re: /家长您好[，,].{0,20}(结果|报告).{0,6}(出来|生成)/, why: '系统通知式开头' },
  { re: /诊断结果(出来|生成)了/, why: '系统通知式开头' },
  { re: /最需要先补的是/, why: '报告式判断' },
  { re: /这不是孩子笨/, why: '销售话术' },
  { re: /这一层\s*\d+\s*[/／]\s*\d+/, why: '内部评分' },
  { re: /[①②③④⑤]/, why: '内部层号' },
  { re: /\d+\s*[/／]\s*\d+\s*(题|道)?/, why: '分数比' },
  { re: /\d+\s*%|百分之\s*\d+/, why: '百分比' },
  { re: /20\d{2}\s*[-年./]\s*\d{1,2}/, why: '完整日期' },
  { re: /\d{1,2}\s*月\s*\d{1,2}\s*日/, why: '完整日期' },
  { re: /首先|其次|再次|总之|综上所述|值得注意的是|赋能|闭环|底层逻辑|抓手|颗粒度/, why: '书面/黑话' },
  { re: /AI|模型|诊断系统|评估报告/, why: '技术词' },
  { re: /您看\s*20\d{2}/, why: '拿完整日期问方便' },
]

export function validateParentReply(text, { kind = 'pre' } = {}) {
  const value = String(text ?? '').trim()
  const issues = []
  if (value.length < 40) issues.push('太短，像没说完')
  if (value.length > 260) issues.push('太长，家长不会看完')
  for (const item of BANNED) if (item.re.test(value)) issues.push(item.why)
  const questions = (value.match(/[？?]/g) || []).length
  if (questions > 1) issues.push('问号超过一个，动作不明确')
  if ((value.match(/[！!]/g) || []).length > 2) issues.push('感叹号太多')
  if (kind === 'post' && /进步\s*\d+|提升\s*\d+/.test(value)) issues.push('课后不要写空泛的进步数字')
  return { ok: issues.length === 0, issues: [...new Set(issues)] }
}

const LAYER_PREFIX = /^[①②③④⑤\s]+/
const stripLayer = value => clean(value, 40).replace(LAYER_PREFIX, '').replace(/[。；;，,]$/, '')

function pointOf(spec, result) {
  const stuck = (result?.layers ?? []).find(row => row.total && row.percent < 60)
  if (stuck) return stripLayer(stuck.name)
  const wrong = (result?.wrong ?? [])[0]?.question
  return clean(wrong?.trialFocus, 30) || stripLayer(spec?.layers?.[0]?.name) || '前面那一步'
}

function observationOf(result) {
  const wrong = result?.wrong?.[0]?.question
  const focus = clean(wrong?.trialFocus, 30)
  if (focus) return `在「${focus}」这一步停了比较久`
  return '前面几步做得还不稳'
}

function addressOf(spec) {
  const name = clean(spec?.student?.name, 20)
  return name ? `${name}家长` : '家长'
}

function lessonWording(spec) {
  const title = clean(spec?.lesson?.title, 30) || '这次试听'
  return title
}

/** 不依赖模型的兜底：按分数段和家长状态生成两段能直接发的话。 */
export function buildParentScripts(spec, result, { kind = 'pre', pre = null, temperature = '', slots = null } = {}) {
  const name = addressOf(spec)
  const point = pointOf(spec, result)
  const observation = observationOf(result)
  const time = parentTimeQuestion(slots ?? formatParentSlot({ at: spec?.lesson?.at, talkAt: spec?.lesson?.talkAt, altAt: spec?.lesson?.altAt }), temperature)
  const percent = Number(result?.percent ?? 0)
  const title = lessonWording(spec)

  let first
  let second
  if (kind === 'post') {
    const improved = (result?.layers ?? []).filter(row => row.percent >= 60)
    const changed = improved.length ? stripLayer(improved[0].name) : point
    if (pre && Number(pre.percent) > 0 && percent > Number(pre.percent)) {
      first = `${name}，这次课后检测他「${changed}」已经能自己做了。课前还要想一下，这次明显稳了，说明课上那一步他接住了。接下来就按这个节奏，把还不稳的「${point}」再带他练两次。`
    } else {
      first = `${name}，这次检测暴露的是「${point}」还没稳住，不是他不会。课上讲的时候他能跟上，自己做还差一点。下一步我会把这一步拆小，再带他做一遍，主讲和助教都会盯到他会为止。`
    }
    second = `不催你。${name}这次先不用加量，把「${point}」这一小步默一遍，10 分钟就够。这周哪天方便，我再把下一步安排发你。`
  } else if (percent < 40) {
    first = `${name}，我看他${observation}，后面做题的时候一直在试。不是不认真，是「${point}」这一步还没稳住，所以每一步都像在猜。这次试听我先带他把这一步走一遍，当场再做一道同型题。${time}`
    second = `不催你。先让${name}把「${point}」这一小步默一遍，10 分钟就够，不用刷题。这周哪天晚上方便，我再给他排。`
  } else if (percent < 75) {
    first = `${name}，我看他前面基础题能拿住，卡在「${point}」这一步，不是完全不会，是中间断了一下。这次试听我先把这个断点接上，再让他自己做一道同型题。${time}`
    second = `不催你。${name}现在不用从头补，先把「${point}」这一小步捋顺就行。这周哪天晚上方便，我再给他排。`
  } else {
    first = `${name}，这次他大部分都能做出来，基础是够用的，主要是「${point}」还有一点没稳。试听我不从头讲，直接带他把这一点补上，剩下的课内再跟。${time}`
    second = `不催你。${name}这个水平不用焦虑，先把「${point}」这一点练稳，比多刷一套卷子有用。这周哪天晚上方便，我再给他排。`
  }
  return {
    scripts: [{ tag: kind === 'post' ? '课后首条' : '首条', text: first.trim() }, { tag: kind === 'post' ? '没回再发' : '没回再发', text: second.trim() }],
    parentScript: first.trim(),
    point,
    title,
  }
}

/** 旧 localAnalysis 的替代：输出完整分析对象，话术由 buildParentScripts 生成。 */
export function localParentAnalysis(spec, result, { kind = 'pre', pre = null, temperature = '' } = {}) {
  const built = buildParentScripts(spec, result, { kind, pre, temperature })
  const stuck = (result?.layers ?? []).find(row => row.total && row.percent < 60)
  const summary = `${built.point}还没稳住${stuck ? `（${stuck.correct}/${stuck.total}）` : ''}，这次先补这一步。`
  return {
    summary,
    findings: [summary],
    scripts: built.scripts,
    parentScript: built.parentScript,
    trialFocus: [built.point, '当场重做一道同型题'],
    nextStep: kind === 'post' ? '根据课后结果安排补漏，并确认下次时间' : '把观察发给家长，约试听时间',
    riskNote: '不承诺提分；不报价；先确认孩子是否愿意来。',
  }
}
