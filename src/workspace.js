// 工作区：插件的数据就是用户目录里的文件，页面只是壳。
// 布局：
//   <根>/我的设定.md          定位卡，人能读能改
//   <根>/内容/<日期 标题>/    口播稿 .docx + .md
//   <根>/私信/<日期 某人>/    判断 + 两条话术
//   <根>/线索表.csv           台账（Excel 能开）
//   <根>/数据/<日期>.csv      复盘数据
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
