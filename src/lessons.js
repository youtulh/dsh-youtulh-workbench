// 学习层：把「哪条爆了、哪类选题被采纳、哪句话术加到了微信」变成下一次生成时的参考。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONTENT_COLUMNS, leadLessons, readContent, readTable, writeTable } from './workspace.js'

// 分数权重：私信最值钱，涨粉次之，播放只当分母
export const SCORE_WEIGHTS = { dms: 3, follows: 1, views: 0.001 }
// 至少 3 条数据才自动判爆款，避免第一条就「爆」
export const MIN_SAMPLES = 3
export const HIT_QUANTILE = 0.75

const num = value => {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function scoreOf(row) {
  return num(row['私信']) * SCORE_WEIGHTS.dms + num(row['涨粉']) * SCORE_WEIGHTS.follows + num(row['播放']) * SCORE_WEIGHTS.views
}

export function quantile(values, q) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const low = Math.floor(pos)
  const high = Math.ceil(pos)
  if (low === high) return sorted[low]
  return sorted[low] + (sorted[high] - sorted[low]) * (pos - low)
}

/** 给所有内容重算分数和爆款；手动标「否」的不动。返回是否有变化。 */
export function scoreRows(rows) {
  const scores = rows.map(row => scoreOf(row))
  const threshold = rows.length >= MIN_SAMPLES ? quantile(scores, HIT_QUANTILE) : Infinity
  let changed = false
  const next = rows.map((row, index) => {
    const score = Math.round(scores[index] * 10) / 10
    let hit = row['爆款']
    if (hit !== '否') {
      const should = scores[index] > 0 && scores[index] >= threshold
      hit = should ? '是' : ''
    }
    if (String(score) !== String(row['分数']) || hit !== row['爆款']) changed = true
    return { ...row, '分数': String(score), '爆款': hit }
  })
  return { rows: next, changed, threshold }
}

/** 重算并写回内容库。 */
export function rescore(root) {
  const rows = readContent(root)
  const result = scoreRows(rows)
  if (result.changed) writeTable(root, '内容库.csv', CONTENT_COLUMNS, result.rows)
  return result
}

const KEYWORDS = ['分数', '掉队', '偏科', '补', '听不懂', '来得及', '一章', '基础', '刷题', '预习', '转学', '艺考', '时间', '家长']

/** 被采纳选题里出现最多的三类方向。 */
export function topicThemes(root, limit = 3) {
  const { rows } = readTable(root, '选题库.csv')
  const picked = rows.filter(row => row['勾选'] === '是')
  if (!picked.length) return []
  const counts = new Map()
  for (const keyword of KEYWORDS) {
    const n = picked.filter(row => String(row['选题'] ?? '').includes(keyword)).length
    if (n) counts.set(keyword, n)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word, n]) => ({ word, n }))
}

function firstLine(root, dir) {
  try {
    if (!dir) return ''
    const file = join(dir, `${dir.split('/').pop()}.md`)
    if (!existsSync(file)) return ''
    const text = readFileSync(file, 'utf8').split('\n').map(line => line.trim()).filter(Boolean)
    return text.find(line => !line.startsWith('#') && !line.startsWith('【'))?.slice(0, 40) ?? ''
  } catch { return '' }
}

/** 表现最好的几条（有数据才算）。 */
export function topContent(root, limit = 3) {
  return readContent(root)
    .map(row => ({ row, score: scoreOf(row) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** 注入 prompt 的经验块，控制在 900 字以内；没数据返回空串。 */
export function buildLessonBlock(root, limit = 3) {
  const top = topContent(root, limit)
  const themes = topicThemes(root)
  const dms = leadLessons(root, 2)
  if (!top.length && !themes.length && !dms.length) return ''
  const lines = ['\n经验（照这个来，别重复踩过的坑）：']
  if (top.length) {
    lines.push('表现最好的内容：')
    for (const { row } of top) {
      const bits = [`「${row['标题']}」`]
      if (num(row['私信'])) bits.push(`私信 ${num(row['私信'])}`)
      if (num(row['涨粉'])) bits.push(`涨粉 ${num(row['涨粉'])}`)
      const opening = firstLine(root, row['目录'])
      if (opening) bits.push(`开头：${opening}`)
      lines.push(`- ${bits.join('，')}`)
    }
  }
  // 你自己标了「采用」的内容，比任何规则都准
  const adopted = readContent(root).filter(row => row['采用'] === '采用').slice(0, 3).map(row => `「${row['标题']}」`)
  if (adopted.length) lines.push(`你标过「采用」的：${adopted.join('、')}`)
  if (themes.length) lines.push(`被采纳最多的选题方向：${themes.map(item => item.word).join('、')}`)
  if (dms.length) lines.push(`加到微信的话术：${dms.map(row => row.slice(0, 60)).join('；')}`)
  return lines.join('\n').slice(0, 900)
}

/** 重写 经验库.md（人也能打开看）。 */
export function writeLessonMarkdown(root) {
  const top = topContent(root, 8)
  const themes = topicThemes(root)
  const dms = leadLessons(root, 5)
  const rows = readContent(root)
  const hits = rows.filter(row => row['爆款'] === '是').length
  const lines = [
    '# 经验库',
    '',
    '> 插件自动写这个文件，不用手改。内容库填了数据以后，这里会自己更新。',
    '',
    `- 内容一共 ${rows.length} 条，其中标记爆款 ${hits} 条`,
    '',
    '## 表现最好的内容',
    '',
  ]
  if (top.length) {
    for (const { row } of top) {
      lines.push(`- 「${row['标题']}」｜私信 ${num(row['私信'])}｜涨粉 ${num(row['涨粉'])}｜播放 ${num(row['播放'])}${row['爆款'] === '是' ? '｜**爆款**' : ''}`)
    }
  } else lines.push('- 还没有数据。先在「内容库」里填播放、涨粉、私信。')
  lines.push('', '## 被采纳最多的选题方向', '')
  lines.push(themes.length ? `- ${themes.map(item => `${item.word}（${item.n} 次）`).join('、')}` : '- 还没有勾选记录。')
  lines.push('', '## 加到微信的话术', '')
  lines.push(dms.length ? dms.map(row => `- ${row}`).join('\n') : '- 还没有成功案例。在「回私信」里把线索标成「已加微」。')
  lines.push('')
  const file = join(root, '经验库.md')
  writeFileSync(file, lines.join('\n'))
  return file
}
