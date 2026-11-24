// 目标客户建议与定位体检。规则来自牟老师的课：
// IP1 账号定位（我是谁、我为谁、解决什么问题；做人群生意；定位等于取舍；越窄越容易赚钱；人群画像四问），
// IP4 内容配比（3:3:3:1，考情最容易获客，讲 why 比讲 how 获客），
// IP7 成为同城唯一（99% 的老师做同城更容易），IP8 获客链路（选题先选人群；差生低转正率）。
//
// 纯函数：浏览器和宿主都能用，所以不许 import node 内置模块或 i18n。

const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const list = (value, max = 5) => (Array.isArray(value) ? value.map(row => text(row, 40)).filter(Boolean).slice(0, max) : [])

/** 家长原话：数组或逗号/分号/顿号/换行分隔的字符串，都切成清单。 */
export function parsePains(value) {
  if (Array.isArray(value)) return value.map(row => text(row, 40)).filter(Boolean).slice(0, 12)
  return String(value ?? '')
    .split(/[，,；;、\n]+/)
    .map(row => row.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 12)
}

/** 城市标签：「北京；线上」取「北京」，「线上」取空。 */
const cityLabel = (city) => {
  const row = text(city, 20)
  if (!row) return ''
  return row.split(/[；;、,，/\s]+/).find(part => part && !/线上|全国|网课/.test(part)) || ''
}
const isLocal = city => Boolean(cityLabel(city))

/** 年级 + 科目，比如「高二物理」；都没有就给个兜底。 */
function who(subject, grade) {
  return `${text(grade, 10)}${text(subject, 10)}`.trim() || '你带的这门课'
}

function shorten(value, max) {
  const row = text(value)
  return row.length > max ? `${row.slice(0, max)}…` : row
}

const ARCHETYPES = [
  {
    key: 'middle',
    match: ['期中掉队'],
    title: ({ subject, grade }) => `${who(subject, grade)}，卡在及格线上下、补了也没起色的家长`,
    value: ({ subject, grade, city }) => `${cityLabel(city)}${who(subject, grade)} 40–60 分、已经补过课但没起色、家长急但不知道问题在哪`,
    why: '中等生是沉默的大多数，人数最多，转化也稳；她们不缺补课，缺的是判断',
    fear: '怕补了一学期还是原地踏步，钱和时间都搭进去',
    entry: '期中卷里丢分最集中的那一块',
    hook: '补了一学期还在 60 分，问题多半不在刷题量',
  },
  {
    key: 'subject',
    match: ['偏科'],
    title: ({ subject }) => `别的科都还行，就${text(subject, 10) || '这一科'}拖后腿的家长`,
    value: ({ subject, grade, city }) => `${cityLabel(city)}${text(grade, 10)}其他科都不错、就${text(subject, 10) || '这一科'}拖后腿、家长怕这一科把总分拽下来`,
    why: '家长已经确定要补，只是在挑老师；决策快，聊两句就知道你是不是她要的人',
    fear: '怕这一科把总分拽下来',
    entry: ({ subject }) => `${text(subject, 10) || '这门课'}里最容易被跳过的那一章`,
    hook: ({ subject }) => `其他科都不错，就${text(subject, 10) || '这门课'}拖后腿，先补哪一块`,
  },
  {
    key: 'top',
    match: ['想冲高分'],
    title: ({ subject, grade }) => `${who(subject, grade)}班里前十、想稳住冲重点的家长`,
    value: ({ subject, grade, city }) => `${cityLabel(city)}${who(subject, grade)}成绩靠前、想冲重点或稳住名次、家长对结果要求高`,
    why: '转化率最高；但交付要求也高，没把握先别主抓',
    fear: '怕关键时刻掉链子',
    entry: '压轴题和新题型怎么拿分',
    hook: ({ subject, grade }) => `班里前十的${text(grade, 10)}孩子，${text(subject, 10) || '这科'}最容易在哪个题型丢分`,
  },
  {
    key: 'weak',
    match: ['基础差、听不懂', '开学后跟不上'],
    title: ({ subject, grade }) => `${who(subject, grade)}基础差、但家里还在到处找办法的家长`,
    value: ({ subject, grade, city }) => `${cityLabel(city)}${who(subject, grade)}基础差、上课听不懂、家长还没放弃，正在到处问怎么补`,
    why: '家长还在想办法，说明愿意投入；比已经放弃的差生好带得多',
    fear: '怕花了钱也没用，也怕孩子自己不想学',
    entry: '上学期欠下的那一章',
    hook: ({ subject, grade }) => `${who(subject, grade)}基础差，先补哪一块，别急着刷题`,
  },
  {
    key: 'exam',
    match: ['艺考补基础'],
    title: ({ subject, grade }) => `艺考回来/转学/复读，${who(subject, grade)}底子空的家长`,
    value: ({ subject, grade, city }) => `${cityLabel(city)}${who(subject, grade)}艺考回来或刚转学、时间只剩几个月、家长最怕来不及`,
    why: '时间紧、目标明确，付费意愿强；但先算清还剩多少周，别接了自己也交付不了',
    fear: '怕来不及',
    entry: '考前剩下这几周怎么排',
    hook: ({ subject }) => `艺考回来${text(subject, 10) || '这门课'}底子空，先算清还剩几周再安排`,
  },
]

// 默认按「转化率 + 好交付」排：中等生 > 偏科 > 尖子 > 基础差 > 艺考
const DEFAULT_ORDER = ['middle', 'subject', 'top', 'weak', 'exam']
const resolve = (value, input) => (typeof value === 'function' ? value(input) : value)
const byKey = new Map(ARCHETYPES.map(row => [row.key, row]))

/**
 * 按问卷里选的学生情况，给 4 张「先抓哪类家长」的卡。
 * @returns {{key:string,title:string,value:string,why:string,fear:string,entry:string,hook:string,match:boolean}[]}
 */
export function suggestTargets(input = {}) {
  const situations = list(input.situations, 6)
  const scored = DEFAULT_ORDER.map((key, index) => {
    const archetype = byKey.get(key)
    const match = archetype.match.some(row => situations.includes(row))
    return { archetype, index, match, score: match ? 2 : 0 }
  })
  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index))
  return scored.slice(0, 4).map(({ archetype, match }) => ({
    key: archetype.key,
    match,
    title: archetype.title(input),
    value: archetype.value(input),
    why: archetype.why,
    fear: archetype.fear,
    entry: resolve(archetype.entry, input),
    hook: resolve(archetype.hook, input),
  }))
}

/** 切入点建议：四个可以直接用、也可以自己写。 */
export function entrySuggestions(input = {}) {
  const pains = parsePains(input.pains)
  const subject = text(input.subject, 10)
  const grade = text(input.grade, 10)
  const city = text(input.city, 12)
  const rows = [
    pains[0] ? `从「${pains[0]}」切进去` : '',
    `${who(subject, grade)}期中卷丢分最多的题型`,
    isLocal(city) ? `${cityLabel(city)}本地考情和进度` : '考前 2 周怎么复习',
    `${subject || '这门课'}里最容易被跳过的那一章`,
  ].filter(Boolean)
  return [...new Set(rows)].slice(0, 4)
}

/** 定位一句话：我是谁 + 我为谁 + 解决什么问题。 */
export function positioningSentence(input = {}) {
  const self = [cityLabel(input.city), text(input.grade, 10), text(input.subject, 10)].filter(Boolean).join('')
  const target = text(input.target)
  const entry = text(input.entry)
  if (!self && !target) return ''
  const head = self ? `我是${self}老师` : '我'
  const help = target ? `，帮${shorten(target, 24)}` : ''
  const solve = entry ? `，解决「${shorten(entry, 18)}」的问题` : ''
  return `${head}${help}${solve}。`
}

const BROAD = /所有|全部|各种|各类|都行|不限|任何/

function firstVideos({ subject, grade, city, entry, fear, local }) {
  const s = text(subject, 10) || '这门课'
  const g = text(grade, 10)
  const e = entry ? shorten(entry, 24) : '基础那一块'
  const fearText = text(fear).replace(/^(最?怕|担心)+/, '').replace(/[。.]$/, '') || '补了很久没起色'
  const rows = [
    { angle: '考情', text: `${local ? `${cityLabel(city)}的家长，` : ''}${g}${s}这次考完，${e}到底难在哪` },
    { angle: '科目', text: `${e}，为什么比多刷题更重要` },
    { angle: '家庭', text: `${shorten(fearText, 20)}，先别急着换老师` },
  ]
  if (local) rows.push({ angle: '本地', text: `${cityLabel(city)}的家长，${g}${s}这学期讲到哪了` })
  else rows.push({ angle: '科目', text: `${g}${s}补了很久没起色，问题多半在${e}` })
  return rows
}

/**
 * 定位体检：缺什么、先拍什么、别踩什么坑。
 * @returns {{ready:boolean,gaps:{key:string,label:string,fix:string}[],headline:string,
 *   firstVideos:{angle:string,text:string}[],pitfalls:string[],targetShort:string}}
 */
export function diagnosePositioning(input = {}) {
  const subject = text(input.subject, 20)
  const grade = text(input.grade, 20)
  const city = text(input.city, 20)
  const target = text(input.target)
  const entry = text(input.entry)
  const fear = text(input.fear)
  const notDo = text(input.notDo)
  const pains = parsePains(input.pains)
  const local = isLocal(city)

  const gaps = []
  if (!subject || !grade) gaps.push({ key: 'who', label: '科目和年级', fix: '写清你教什么、带几年级，选题才知道说给谁' })
  if (!city) gaps.push({ key: 'city', label: '在哪个城市', fix: '做同城更容易被家长信；只做线上就写「线上」' })
  if (!target) gaps.push({ key: 'target', label: '目标客户', fix: '先定一类家长：不是所有家长，是某一类具体的人' })
  else if (BROAD.test(target) || target.length > 60) gaps.push({ key: 'target', label: '目标客户太宽', fix: '把城市、年级、分数段、场景写进去，越具体越好' })
  if (!entry) gaps.push({ key: 'entry', label: '切入点', fix: '写你从科目里的哪一块切进去，别只写「补物理」' })
  if (!fear) gaps.push({ key: 'fear', label: '她最怕什么', fix: '写她夜里最担心的那句话，钩子都从这里长出来' })
  if (!pains.length) gaps.push({ key: 'pains', label: '家长原话', fix: '写一句她最常说的抱怨，标题和开头都从这里来' })
  else if (pains.length === 1) gaps.push({ key: 'pains', label: '家长原话只有一条', fix: '再补一两句，不然每条视频的钩子都一样' })
  if (!notDo) gaps.push({ key: 'notDo', label: '不接谁', fix: '写清什么人一定不是你的客户，省得被外地和同行拖住' })

  const targetShort = shorten(target, 18)
  const headline = target
    ? `先只抓「${targetShort}」这一类${entry ? `，用「${shorten(entry, 14)}」切进去` : ''}；跑通了再加第二类`
    : '先把目标客户定成一类人：不是所有家长，是某一类具体的人'

  const pitfalls = [
    '一个账号只面向一个人群：同时抓几类，平台和内容都会乱',
    '已经放弃的差生别主抓，转正率最低；要抓「家长还在想办法」的那批',
    '讲 why 多于 how：短视频里别讲题，讲清楚为什么会这样',
    '一条视频只说一件事，先给这一类拍够 10 条，再考虑扩人群',
    local ? '同城优先：开头带上城市名，用本地区统考、学校当钩子' : '没写同城就少一个钩子：99% 的老师做同城更容易',
    '别指望「精准流量」：人群是靠内容一条一条洗出来的',
  ]

  return {
    ready: gaps.length === 0,
    gaps,
    headline,
    firstVideos: firstVideos({ subject, grade, city, entry, fear, local }),
    pitfalls,
    targetShort,
  }
}
