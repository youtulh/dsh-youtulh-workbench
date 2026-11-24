// 工作区：插件的数据就是用户目录里的文件，页面只是壳。
// 布局：
//   <根>/我的设定.md          定位卡，人能读能改
//   <根>/内容/<日期 标题>/    口播稿 .docx + .md
//   <根>/私信/<日期 某人>/    判断 + 两条话术
//   <根>/线索表.csv           台账（Excel 能开）
//   <根>/数据/<日期>.csv      复盘数据
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const LAYOUT = { settings: '我的设定.md', content: '内容', dm: '私信', data: '数据', leads: '线索表.csv' }

export const defaultRoot = () => join(homedir(), 'Documents', 'Youtulh 工作台')

export function resolveRoot(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return defaultRoot()
  return raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw
}

export function ensureLayout(root) {
  for (const dir of [root, join(root, LAYOUT.content), join(root, LAYOUT.dm), join(root, LAYOUT.data)]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
}

/** 文件夹名：去掉路径里不能用的字符，留中文。 */
export function folderName(text, max = 40) {
  return String(text ?? '').replace(/[\\/:*?"<>|\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || '未命名'
}

export function dayStamp(date = new Date()) {
  const two = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
}

// ---- 我的设定.md ----

const FIELD_LABEL = [
  ['subject', '我教什么科目'],
  ['grade', '带哪个年级'],
  ['city', '在哪个城市'],
  ['only', '只做'],
  ['notDo', '不做'],
  ['voice', '我平时怎么说话'],
  ['redline', '红线'],
]

export function settingsMarkdown(positioning = {}, pains = []) {
  const lines = ['# 我的设定', '', '> 这个文件就是插件读的设定。直接改字、保存，插件下次生成就按新的来。', '']
  for (const [key, label] of FIELD_LABEL) {
    lines.push(`- **${label}**：${String(positioning[key] ?? '').trim() || '（还没填）'}`)
  }
  lines.push('', '## 家长最愁什么', '')
  if (pains.length) for (const pain of pains) lines.push(`- ${pain}`)
  else lines.push('- （还没填）')
  lines.push('', '---', '', `> 更新于 ${new Date().toLocaleString('zh-CN')} · Youtulh 工作台`, '')
  return lines.join('\n')
}

export function writeSettingsMarkdown(root, positioning, pains) {
  ensureLayout(root)
  const file = join(root, LAYOUT.settings)
  writeFileSync(file, settingsMarkdown(positioning, pains))
  return file
}

/** 从 md 里读回设定：认「- **标签**：值」这种行，值还是「（还没填）」就当空。 */
export function readSettingsMarkdown(root) {
  const file = join(root, LAYOUT.settings)
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  const positioning = {}
  for (const [key, label] of FIELD_LABEL) {
    const hit = new RegExp(`- \\*\\*${label}\\*\\*：(.+)`).exec(text)
    const value = hit?.[1]?.trim() ?? ''
    positioning[key] = value === '（还没填）' ? '' : value
  }
  // 只取这一节，到分隔线为止；列表项去掉前导「- 」
  const section = (text.split('## 家长最愁什么')[1] ?? '').split(/\n-{3,}/)[0]
  const pains = section.split('\n')
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(line => line && line !== '（还没填）' && !line.startsWith('>') && !/^-+$/.test(line))
  return { positioning, painPoints: pains }
}

// ---- 线索表.csv ----

// 话术 = 实际发给家长的那段；反应 = 家长怎么回的；结果 = 加微成功 / 失败 / 待定
const LEAD_COLUMNS = ['日期', '姓名', '年级', '学校', '卡点', '来源', '类型', '分类', '原文', '话术', '反应', '结果', '下一步', '更新时间']

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

export function leadsCsvPath(root) {
  return join(root, LAYOUT.leads)
}

/** 追加一行线索；文件不存在就先写表头。 */
export function appendLead(root, lead) {
  ensureLayout(root)
  const file = leadsCsvPath(root)
  const exists = existsSync(file)
  const row = [
    dayStamp(new Date(lead.createdAt ?? Date.now())), lead.name, lead.grade, lead.school, lead.painPoint, lead.source,
    lead.type, lead.category, lead.raw, lead.draft, lead.reaction ?? '', lead.result ?? '待定', lead.next ?? '待加微',
    new Date().toISOString().slice(0, 16).replace('T', ' '),
  ].map(csvCell).join(',')
  if (exists) {
    const current = readFileSync(file, 'utf8')
    writeFileSync(file, `${current.replace(/\n*$/, '\n')}${row}\n`)
  } else {
    writeFileSync(file, `${LEAD_COLUMNS.map(csvCell).join(',')}\n${row}\n`)
  }
  return file
}

// ---- 读回来：线索表、目录树 ----

/** 解析一行 CSV（支持引号、引号内逗号、"" 转义）。 */
export function parseCsvLine(line) {
  const out = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { out.push(cell); cell = '' }
    else cell += ch
  }
  out.push(cell)
  return out
}

/** 读线索表，返回最近的在前。文件不存在就是空数组。 */
export function readLeads(root) {
  const file = leadsCsvPath(root)
  if (!existsSync(file)) return []
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.trim())
  if (!lines.length) return []
  const head = parseCsvLine(lines[0])
  const index = name => head.indexOf(name)
  const rows = lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line)
    const at = name => cells[index(name)] ?? ''
    return {
      date: at('日期'), name: at('姓名'), grade: at('年级'), school: at('学校'), painPoint: at('卡点'),
      source: at('来源'), type: at('类型'), category: at('分类'), raw: at('原文'), draft: at('话术'),
      reaction: at('反应'), result: at('结果') || '待定', next: at('下一步') || '待加微', updatedAt: at('更新时间'), rowIndex,
    }
  })
  return rows.reverse()
}

/** 工作区里有哪些产出：内容/私信/数据 三个目录下的文件夹和文件。 */
export function listTree(root) {
  const groups = []
  for (const [key, dir] of Object.entries({ content: LAYOUT.content, dm: LAYOUT.dm, data: LAYOUT.data })) {
    const abs = join(root, dir)
    if (!existsSync(abs)) continue
    const entries = readdirSync(abs, { withFileTypes: true })
    const items = []
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sub = join(abs, entry.name)
        const files = readdirSync(sub).map(name => {
          const stat = statSync(join(sub, name))
          return { name, size: stat.size, updatedAt: new Date(stat.mtimeMs).toISOString() }
        })
        items.push({ kind: key, name: entry.name, dir: sub, files })
      } else if (entry.isFile()) {
        const stat = statSync(join(abs, entry.name))
        items.push({ kind: key, name: entry.name, dir: abs, files: [{ name: entry.name, size: stat.size, updatedAt: new Date(stat.mtimeMs).toISOString() }] })
      }
    }
    items.sort((a, b) => (b.files[0]?.updatedAt ?? '').localeCompare(a.files[0]?.updatedAt ?? ''))
    groups.push(...items)
  }
  return groups
}

// ---- 账号数据 ----

export const accountsPath = root => join(root, '账号数据.csv')

const ACCOUNT_COLUMNS = ['平台', '账号', '粉丝数', '主页', '备注', '更新时间']

function csvCell2(value) {
  return `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

/** 把账号列表写成 CSV（Excel 能开），整表覆盖，不做增量。 */
export function writeAccounts(root, accounts = []) {
  ensureLayout(root)
  const file = accountsPath(root)
  const rows = accounts.map(account => [
    account.platform, account.handle, account.followers, account.url, account.note, account.fetchedAt ?? account.updatedAt,
  ].map(csvCell2).join(','))
  writeFileSync(file, [ACCOUNT_COLUMNS.map(csvCell2).join(','), ...rows].join('\n') + '\n')
  return file
}

/** 读账号表：认表头，缺列就当空。 */
export function readAccounts(root) {
  const file = accountsPath(root)
  if (!existsSync(file)) return null
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.trim())
  if (lines.length <= 1) return []
  const head = parseCsvLine(lines[0])
  const at = (cells, name) => cells[head.indexOf(name)] ?? ''
  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line)
    const rawFollowers = at(cells, '粉丝数').trim()
    const followers = rawFollowers === '' ? null : Number(rawFollowers)
    return {
      platform: at(cells, '平台'),
      handle: at(cells, '账号'),
      followers: Number.isFinite(followers) ? followers : null,
      url: at(cells, '主页') || null,
      note: at(cells, '备注'),
      fetchedAt: at(cells, '更新时间') || null,
    }
  }).filter(row => row.platform || row.handle)
}

/** 反应 → 建议的下一步。页面会用它给一个默认值，人还能改。 */
export const REACTION_NEXT = {
  '没回': '待跟进',
  '回了但没继续': '待跟进',
  '问价格': '待加微',
  '问细节': '待加微',
  '说要考虑': '待跟进',
  '已加微': '已加微',
  '约了试听': '约了试听',
  '拒绝': '待跟进',
  '同行/广告': '待跟进',
}

export const REACTIONS = Object.keys(REACTION_NEXT)
export const RESULTS = ['待定', '加微成功', '失败']

/** 按行号改一条线索（行号从 0 开始，按文件里的数据行算）。 */
export function updateLeadRow(root, index, patch = {}) {
  const file = leadsCsvPath(root)
  if (!existsSync(file)) return null
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const head = lines[0]
  const dataStart = 1
  const at = dataStart + index
  if (!lines[at]) return null
  const headCells = parseCsvLine(head)
  const cells = parseCsvLine(lines[at])
  const set = (name, value) => {
    const col = headCells.indexOf(name)
    if (col >= 0) cells[col] = value
  }
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'reaction') {
      set('反应', value)
      if (!patch.next) set('下一步', REACTION_NEXT[value] ?? '待跟进')
      if (value === '已加微' && !patch.result) set('结果', '加微成功')
    } else if (key === 'result') set('结果', value)
    else if (key === 'next') set('下一步', value)
    else if (key === 'draft') set('话术', value)
  }
  set('更新时间', new Date().toISOString().slice(0, 16).replace('T', ' '))
  lines[at] = cells.map(csvCell).join(',')
  writeFileSync(file, lines.join('\n'))
  return readLeads(root)
}

/** 成功经验：加微成功（或已加微）的线索摘要，给分诊 prompt 当参考。 */
export function leadLessons(root, limit = 3) {
  return readLeads(root)
    // 明确标了失败的就不算成功经验，哪怕下一步还写着已加微
    .filter(row => row.result !== '失败' && (row.result === '加微成功' || row.next === '已加微'))
    .slice(0, limit)
    .map(row => `${row.type || '家长'} · ${row.category || '未分类'}｜家长说「${(row.raw || '').slice(0, 24)}」｜我们回「${(row.draft || '').slice(0, 40)}」→ 加了微信`)
}

// ---- 内容库 / 选题库 ----
// 这两张表是「越用越好」的底账：内容库记每条口播的结果，选题库记哪些选题被勾中。

export const CONTENT_COLUMNS = ['日期', '创建时间', '批次', '选题', '标题', '标签', '采用', '状态', '平台', '发布日', '播放', '涨粉', '私信', '加微', '爆款', '分数', '目录', '备注']
export const TOPICS_COLUMNS = ['日期', '批次', '选题', '勾选', '生成条数']

export const contentPath = root => join(root, '内容库.csv')
export const topicsPath = root => join(root, '选题库.csv')

/** 读一张表：返回 { header, rows }，rows 是对象数组（按表头名取值），带 rowIndex。 */
export function readTable(root, file) {
  const abs = join(root, file)
  if (!existsSync(abs)) return { header: [], rows: [] }
  const lines = readFileSync(abs, 'utf8').split(/\r?\n/).filter(line => line.trim())
  if (!lines.length) return { header: [], rows: [] }
  const header = parseCsvLine(lines[0])
  const rows = lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line)
    const row = { rowIndex }
    header.forEach((name, i) => { row[name] = cells[i] ?? '' })
    return row
  })
  return { header, rows }
}

/** 写一张表：只重写已知列，表里多出来的列忽略（避免手改的列被抹掉）。 */
export function writeTable(root, file, columns, rows) {
  ensureLayout(root)
  const abs = join(root, file)
  const head = columns.map(csvCell).join(',')
  const body = rows.map(row => columns.map(name => csvCell(row[name])).join(',')).join('\n')
  writeFileSync(abs, `${head}\n${body}${body ? '\n' : ''}`)
  return abs
}

/** 追加若干行；文件不存在时先写表头。 */
export function appendRows(root, file, columns, rows) {
  ensureLayout(root)
  const abs = join(root, file)
  const exists = existsSync(abs)
  const body = rows.map(row => columns.map(name => csvCell(row[name])).join(',')).join('\n')
  if (exists) {
    const current = readFileSync(abs, 'utf8')
    if (current.trim()) writeFileSync(abs, `${current.replace(/\n*$/, '\n')}${body}\n`)
    else writeFileSync(abs, `${columns.map(csvCell).join(',')}\n${body}\n`)
  } else {
    writeFileSync(abs, `${columns.map(csvCell).join(',')}\n${body}\n`)
  }
  return abs
}

/** 按某一列的值改一行；找不到返回 false。 */
export function updateRowsByKey(root, file, columns, keyCol, key, patch) {
  const { rows } = readTable(root, file)
  let hit = false
  const next = rows.map(row => {
    if (row[keyCol] !== key) return { ...row }
    hit = true
    return { ...row, ...patch }
  })
  if (hit) writeTable(root, file, columns, next)
  return hit
}

const nowStamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ')
export const batchId = () => {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

export function readContent(root) {
  return readTable(root, '内容库.csv').rows
}

/** 记一条口播。目录相同的行会被更新，不会重复。 */
export function recordContent(root, row) {
  const { rows } = readTable(root, '内容库.csv')
  const clean = {}
  for (const name of CONTENT_COLUMNS) clean[name] = row[name] ?? ''
  const existing = rows.findIndex(item => item['目录'] && item['目录'] === clean['目录'])
  if (existing >= 0) {
    const merged = { ...rows[existing], ...clean }
    rows[existing] = merged
    writeTable(root, '内容库.csv', CONTENT_COLUMNS, rows)
    return merged
  }
  rows.push(clean)
  writeTable(root, '内容库.csv', CONTENT_COLUMNS, rows)
  return clean
}

/** 内容行的主键：有目录用目录，没有目录（手动补录 / 从数据导入）用创建时间。 */
export const contentKey = row => row['目录'] || row['创建时间'] || ''

export function updateContent(root, key, patch) {
  const { rows } = readTable(root, '内容库.csv')
  const index = rows.findIndex(row => contentKey(row) === key)
  if (index < 0) return null
  rows[index] = { ...rows[index], ...patch }
  writeTable(root, '内容库.csv', CONTENT_COLUMNS, rows)
  return rows[index]
}

/** 删掉一条内容记录（只删表里的行，文件夹和文件不动）。 */
export function removeContent(root, key) {
  const { rows } = readTable(root, '内容库.csv')
  const index = rows.findIndex(row => contentKey(row) === key)
  if (index < 0) return null
  const [removed] = rows.splice(index, 1)
  writeTable(root, '内容库.csv', CONTENT_COLUMNS, rows)
  return removed
}

export function appendTopics(root, batch, topics) {
  appendRows(root, '选题库.csv', TOPICS_COLUMNS, topics.map(topic => ({
    '日期': dayStamp(), '批次': batch, '选题': topic, '勾选': '否', '生成条数': 0,
  })))
  return batch
}

export function markTopicsPicked(root, batch, picked) {
  const { rows } = readTable(root, '选题库.csv')
  const set = new Set(picked)
  const next = rows.map(row => (row['批次'] === batch ? { ...row, '勾选': set.has(row['选题']) ? '是' : '否' } : row))
  writeTable(root, '选题库.csv', TOPICS_COLUMNS, next)
  return next.filter(row => row['批次'] === batch)
}

export { nowStamp }


/** 内容库对账：目录已经被用户删掉的条目，从库里清掉。返回被清掉的标题。 */
export function pruneMissingContent(root) {
  const { rows } = readTable(root, '内容库.csv')
  if (!rows.length) return []
  const alive = []
  const removed = []
  for (const row of rows) {
    const dir = row['目录']
    if (!dir || existsSync(dir)) alive.push(row)
    else removed.push(row['标题'] || dir)
  }
  if (removed.length) writeTable(root, '内容库.csv', CONTENT_COLUMNS, alive)
  return removed
}
