// 一句话描述 → 出卷参数。只做有限解析，不猜学生、不编知识点。
const text = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const GRADES = ['初一', '初二', '初三', '高一', '高二', '高三', '小学一年级', '小学二年级', '小学三年级', '小学四年级', '小学五年级', '小学六年级']

const MIX = {
  和期中差不多: [['基础', 3], ['中档', 6], ['期中', 4], ['压轴', 2]],
  稍难: [['基础', 2], ['中档', 5], ['期中', 5], ['压轴', 3]],
  基础: [['基础', 5], ['中档', 5], ['期中', 3], ['压轴', 2]],
}

export function parseBrief(brief, questions = [], state = {}) {
  const raw = text(brief, 500)
  const p = state?.positioning ?? {}
  const grade = GRADES.find(row => raw.includes(row)) || text(p.grade, 20)
  const subject = (raw.match(/(数学|语文|英语|物理|化学|生物|历史|地理|政治)/)?.[1]) || text(p.subject, 20)
  const count = /10\s*题|十题/.test(raw) ? 10 : 15
  const difficulty = /压轴|拔高/.test(raw) ? '稍难' : /稍难|难一点|比期中难/.test(raw) ? '稍难' : /基础|简单/.test(raw) ? '基础' : '和期中差不多'
  const knowledgePoints = [...new Set((questions ?? []).map(row => row.knowledge).filter(name => name && raw.includes(String(name).split(/[—\-－]/)[0])))]
  // 描述里没写具体知识点，但写了「氧化还原」这类词：用包含匹配
  const words = raw.split(/[，,。；;、\s]+/).filter(word => word.length >= 2)
  for (const question of questions ?? []) {
    const name = String(question.knowledge ?? '')
    if (name && words.some(word => name.includes(word))) knowledgePoints.push(name)
  }
  return {
    brief: raw,
    subject,
    grade,
    count,
    difficulty,
    knowledgePoints: [...new Set(knowledgePoints)].slice(0, 8),
    mix: MIX[difficulty],
  }
}
