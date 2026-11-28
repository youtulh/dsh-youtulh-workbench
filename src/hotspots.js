// 地区热点：用 Bing RSS 搜公开结果，过滤出跟本地考情/政策/学校安排有关的条目。
// 抓不到就返回空，让口播回到原逻辑；不编“内部消息”。
const clean = (value, max = 300) => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

const decode = value => String(value ?? '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

export function hotspotQueries(settings = {}, positioning = {}) {
  const city = clean(positioning.city, 12)
  const district = clean(settings.district, 20)
  const school = clean(settings.school, 30)
  const grade = clean(positioning.grade, 10)
  const subject = clean(positioning.subject, 10)
  const node = clean(settings.timeNode, 20)
  const year = new Date().getFullYear()
  const place = [city, district].filter(Boolean).join(' ')
  const list = [
    `${place} ${grade} ${node || '期中 期末'} 考试 时间 ${year}`,
    `${place} ${year} 高考 政策 变化`,
    `${place} ${grade} ${subject} 考情 命题`,
    school ? `${school} 月考 期中 安排` : '',
  ].filter(Boolean)
  return [...new Set(list)].slice(0, 4)
}

export async function searchBing(query, fetchImpl = fetch) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`
  const res = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0 YoutulhWorkbench/1.0' }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`搜索失败：${res.status}`)
  const xml = await res.text()
  const items = []
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(match => match[1]).slice(0, 8)
  for (const block of blocks) {
    const title = decode(clean(/<title>([\s\S]*?)<\/title>/.exec(block)?.[1], 120))
    const link = decode(clean(/<link>([\s\S]*?)<\/link>/.exec(block)?.[1], 500))
    const desc = decode(clean(/<description>([\s\S]*?)<\/description>/.exec(block)?.[1], 300))
    const date = clean(/<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1], 60)
    if (title && link) items.push({ title, summary: desc, url: link, publishedAt: date, query })
  }
  return items
}

const KIND = [
  ['考试安排', /期中|期末|月考|考试时间|一模|二模|统考/],
  ['政策', /高考|中考|政策|改革|选科|报名|录取|分数线/],
  ['学校安排', /学校|中学|附中|家长会|校历/],
  ['考情', /命题|难度|试卷|考情|平均分|排名/],
]

export function summarizeHotspots(items = [], { city = '', grade = '' } = {}) {
  const out = []
  const seen = new Set()
  for (const item of items) {
    const title = clean(item.title, 100)
    if (!title || seen.has(title)) continue
    const hay = `${title} ${item.summary}`
    if (city && !/线上|全国/.test(city) && !hay.includes(city) && !/高考|中考|教育部|北京|上海/.test(hay)) continue
    if (grade && !hay.includes(grade) && !/高考|中考|期中|期末|月考/.test(hay)) continue
    const kind = KIND.find(([, re]) => re.test(hay))?.[0] ?? '考情'
    const anxiety = kind === '考试安排'
      ? '家长怕时间提前、复习节奏被打乱'
      : kind === '政策'
        ? '家长怕政策变了、孩子白学'
        : kind === '学校安排'
          ? '家长怕学校安排和补课撞车'
          : '家长怕这次考难、名次掉下来'
    seen.add(title)
    out.push({
      id: `hot-${Buffer.from(title).toString('base64url').slice(0, 12)}`,
      title, summary: clean(item.summary, 220), kind, anxiety,
      region: city, grade, source: /\.gov\.cn|\.edu\.cn|bjeea|beijing/.test(item.url) ? '官方/学校' : '公开搜索结果',
      url: item.url, publishedAt: item.publishedAt,
    })
    if (out.length >= 5) break
  }
  return out
}

export function hotspotBlock(hotspot) {
  if (!hotspot) return ''
  return `今日可用背景（只在相关时用，不要编）：${hotspot.title}（${hotspot.source}${hotspot.publishedAt ? `，${hotspot.publishedAt}` : ''}）。家长焦虑点：${hotspot.anxiety}`
}
