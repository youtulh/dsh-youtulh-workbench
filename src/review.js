// 定位复盘：不靠模型，用最近的内容和线索反过来检查「有没有跑偏」。
// 纯函数：给浏览器和宿主都能用。
const text = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const num = (value) => Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0
const tokens = value => String(value ?? '').split(/[，,、；;/\s]+/).map(row => row.trim()).filter(row => row.length >= 2)

function contentText(row) {
  return `${row['标题'] ?? ''} ${row['选题'] ?? ''}`
}

/**
 * @param {{positioning?:object,painPoints?:string[],content?:object[],leads?:object[]}} input
 */
export function reviewPositioning({ positioning = {}, painPoints = [], content = [], leads = [] } = {}) {
  const subject = text(positioning.subject, 20)
  const grade = text(positioning.grade, 20)
  const entry = text(positioning.entry, 60)
  const target = text(positioning.target, 80)
  const keywords = [...new Set([subject, grade, ...painPoints, ...tokens(entry), ...tokens(target)].filter(Boolean))]
  const recentContent = content.slice(-30)
  const matchedContent = recentContent.filter(row => {
    if (!keywords.length) return false
    const body = contentText(row)
    return keywords.some(word => body.includes(word))
  })

  const graded = leads.filter(row => text(row.grade, 20))
  const gradeMatched = graded.filter(row => {
    if (!grade) return false
    const leadGrade = text(row.grade, 20)
    return leadGrade.includes(grade) || grade.includes(leadGrade)
  })

  const won = leads.filter(row => row.result === '加微成功' || ['已加微信', '已进群', '约试听', '已报课'].includes(row.stage))
  const sourceCount = new Map()
  for (const row of won) {
    const source = text(row.source, 40)
    if (source) sourceCount.set(source, (sourceCount.get(source) ?? 0) + 1)
  }
  const topSource = [...sourceCount.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

  const withDms = recentContent.filter(row => num(row['私信']) > 0)
  const topContent = withDms.slice().sort((a, b) => num(b['私信']) - num(a['私信']))[0] ?? null

  const notes = []
  if (!recentContent.length) notes.push({ key: 'review_no_content', params: {} })
  else if (recentContent.length >= 3 && matchedContent.length / recentContent.length < 0.6) {
    notes.push({ key: 'review_content_drift', params: { total: recentContent.length, matched: matchedContent.length } })
  }
  if (graded.length >= 3 && grade && gradeMatched.length / graded.length < 0.6) {
    notes.push({ key: 'review_grade_drift', params: { total: graded.length, matched: gradeMatched.length, grade } })
  }
  if (topContent) notes.push({ key: 'review_top_content', params: { title: text(topContent['标题'], 24), dms: num(topContent['私信']) } })
  if (topSource) notes.push({ key: 'review_top_source', params: { source: topSource[0], n: topSource[1] } })
  if (!won.length) notes.push({ key: 'review_no_won', params: {} })

  return {
    contentTotal: recentContent.length,
    contentMatched: matchedContent.length,
    leadTotal: leads.length,
    gradedLeads: graded.length,
    gradeMatched: gradeMatched.length,
    wonCount: won.length,
    topSource,
    topContent: topContent ? { title: text(topContent['标题'], 60), dms: num(topContent['私信']) } : null,
    notes: notes.slice(0, 4),
  }
}
