// 定位复盘：不靠模型，用最近的内容和线索反过来检查「有没有跑偏」。
// 纯函数：给浏览器和宿主都能用。
const text = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const shorten = (value, max) => { const row = text(value, max * 2); return row.length > max ? `${row.slice(0, max)}…` : row }
const num = (value) => Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0
const tokens = value => String(value ?? '').split(/[，,、；;/\s]+/).map(row => row.trim()).filter(row => row.length >= 2)

function contentText(row) {
  return `${row['标题'] ?? ''} ${row['选题'] ?? ''}`
}

/** 复盘后直接给 3 个能拍的选题，不让用户自己再想。 */
export function suggestReviewTopics({ positioning = {}, painPoints = [], contentCount = 0, contentDrift = false, gradeDrift = false, topContent = null, existing = [] } = {}) {
  const p = positioning
  const subject = text(p.subject, 20)
  const grade = text(p.grade, 20)
  const who = `${grade}${subject}`.trim() || subject || '这门课'
  const entry = text(p.entry, 30)
  const pain = text(painPoints[0], 24)
  const list = []
  if (!contentCount || contentDrift) {
    if (entry) list.push(`${who}：${entry}，先补哪一步`)
    if (pain) list.push(`家长说「${pain}」，先怎么回`)
    list.push(`${who}：为什么先抓${grade || '这一类'}，不接所有人`)
    if (!entry && !pain) list.push(`${who}：孩子卡在及格线，先别急着刷题`)
  } else if (gradeDrift) {
    list.push(`${who}：为什么只带${grade || '这个年级'}，不接别的年级`)
    list.push(`${who}家长最常问的三件事`)
    if (entry) list.push(`${who}：${entry}，先补哪一步`)
  } else if (topContent?.title) {
    list.push(`再讲一条：${shorten(topContent.title, 18)}`)
    if (entry) list.push(`${who}：${entry}，家长最容易忽略哪一步`)
    list.push(`${who}：为什么我只带这一类家长`)
  } else {
    if (entry) list.push(`${who}：${entry}，先补哪一步`)
    if (pain) list.push(`家长说「${pain}」，先怎么回`)
    list.push(`${who}：为什么我只带这一类家长`)
  }
  list.push(`${who}：家长最容易误会的一件事`)
  list.push(`${who}：先补哪一章，钱才不白花`)
  const unique = [...new Set(list)].filter(Boolean)
  // 内容库里已经拍过的同题不再推，避免复盘来回复制旧选题
  const seen = existing.map(row => text(row, 80)).filter(Boolean)
  const fresh = unique.filter(topic => !/^再讲一条/.test(topic) && !seen.some(row => row === topic || row.includes(topic) || (row.length >= 6 && topic.includes(row))))
  return (fresh.length ? fresh : unique).slice(0, 3)
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

  const city = text(positioning.city, 20)
  const local = Boolean(city) && !/线上|全国|网课/.test(city)
  const cityMentions = recentContent.filter(row => contentText(row).includes(city)).length
  const angleNames = ['知识点', '家庭', '考情', '本地']
  const angleCounts = Object.fromEntries(angleNames.map(name => [name, 0]))
  for (const row of recentContent) {
    if (angleNames.includes(row['角度'])) angleCounts[row['角度']] += 1
  }
  const angled = angleNames.reduce((sum, name) => sum + angleCounts[name], 0)

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

  // 线索的「来源」如果能对上某条内容的标题，就知道哪条内容真的带来了家长
  const attributed = new Map()
  const attributedWon = new Map()
  let unattributed = 0
  for (const row of leads) {
    const source = text(row.source, 80)
    if (!source) continue
    const hit = recentContent.find(item => [text(item['标题'], 80), text(item['选题'], 80)]
      .some(word => word.length >= 4 && (source.includes(word) || word.includes(source))))
    if (hit) {
      const title = text(hit['标题'], 60)
      attributed.set(title, (attributed.get(title) ?? 0) + 1)
      if (row.result === '加微成功' || ['已加微信', '已进群', '约试听', '已报课'].includes(row.stage)) {
        attributedWon.set(title, (attributedWon.get(title) ?? 0) + 1)
      }
    } else {
      unattributed += 1
    }
  }
  const topLeadContent = [...attributed.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
  const topWonContent = [...attributedWon.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

  const notes = []
  if (!recentContent.length) notes.push({ key: 'review_no_content', params: {} })
  else if (recentContent.length >= 3 && matchedContent.length / recentContent.length < 0.6) {
    notes.push({ key: 'review_content_drift', params: { total: recentContent.length, matched: matchedContent.length } })
  }
  if (graded.length >= 3 && grade && gradeMatched.length / graded.length < 0.6) {
    notes.push({ key: 'review_grade_drift', params: { total: graded.length, matched: gradeMatched.length, grade } })
  }
  if (topContent) notes.push({ key: 'review_top_content', params: { title: text(topContent['标题'], 24), dms: num(topContent['私信']) } })
  if (topLeadContent) notes.push({ key: 'review_top_lead_content', params: { title: text(topLeadContent[0], 24), n: topLeadContent[1] } })
  if (topWonContent && topWonContent[1] >= 2) {
    notes.push({ key: 'review_top_won_content', params: { title: text(topWonContent[0], 24), n: topWonContent[1] } })
  } else if (topWonContent && topWonContent[1] === 1) {
    notes.push({ key: 'review_top_won_small', params: { title: text(topWonContent[0], 24) } })
  }
  if (topSource) notes.push({ key: 'review_top_source', params: { source: topSource[0], n: topSource[1] } })
  if (leads.length >= 3 && unattributed >= Math.max(2, Math.ceil(leads.length * 0.5))) {
    notes.push({ key: 'review_source_vague', params: { n: unattributed } })
  }
  if (local && recentContent.length >= 5 && cityMentions === 0) {
    notes.push({ key: 'review_local_missing', params: { city } })
  }
  if (local && angled >= 5 && angleCounts['本地'] === 0) {
    notes.push({ key: 'review_local_angle_missing', params: { city } })
  }
  if (angled >= 5) {
    const topAngle = Object.entries(angleCounts).sort((a, b) => b[1] - a[1])[0]
    if (topAngle[1] / angled >= 0.8) {
      notes.push({ key: 'review_angle_skew', params: { angle: topAngle[0], n: topAngle[1], total: angled } })
    }
  }
  if (!won.length) notes.push({ key: 'review_no_won', params: {} })

  const nextTopics = suggestReviewTopics({
    positioning,
    painPoints,
    contentCount: recentContent.length,
    contentDrift: recentContent.length >= 3 && matchedContent.length / recentContent.length < 0.6,
    gradeDrift: graded.length >= 3 && Boolean(grade) && gradeMatched.length / graded.length < 0.6,
    topContent: topContent ? { title: text(topContent['标题'], 40) } : null,
    existing: recentContent.map(contentText),
  })

  return {
    nextTopics,
    contentTotal: recentContent.length,
    contentMatched: matchedContent.length,
    leadTotal: leads.length,
    gradedLeads: graded.length,
    gradeMatched: gradeMatched.length,
    wonCount: won.length,
    unattributed,
    local,
    cityMentions,
    angled,
    angleCounts,
    topSource,
    topContent: topContent ? { title: text(topContent['标题'], 60), dms: num(topContent['私信']) } : null,
    topLeadContent: topLeadContent ? { title: text(topLeadContent[0], 60), n: topLeadContent[1] } : null,
    topWonContent: topWonContent ? { title: text(topWonContent[0], 60), n: topWonContent[1] } : null,
    notes: notes.slice(0, 6),
  }
}
