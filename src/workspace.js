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

const LEAD_COLUMNS = ['日期', '姓名', '年级', '学校', '卡点', '来源', '下一步', '类型', '分类', '原文']

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
    dayStamp(new Date(lead.createdAt ?? Date.now())), lead.name, lead.grade, lead.school, lead.painPoint, lead.source, lead.next, lead.type, lead.category, lead.raw,
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
  const rows = lines.slice(1).map(line => {
    const cells = parseCsvLine(line)
    const at = name => cells[index(name)] ?? ''
    return {
      date: at('日期'), name: at('姓名'), grade: at('年级'), school: at('学校'), painPoint: at('卡点'),
      source: at('来源'), next: at('下一步'), type: at('类型'), category: at('分类'), raw: at('原文'),
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
