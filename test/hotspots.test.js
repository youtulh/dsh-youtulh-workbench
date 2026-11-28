import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hotspotBlock, hotspotQueries, summarizeHotspots } from '../src/hotspots.js'

test('热点查询：带城市、年级、节点和学校', () => {
  const queries = hotspotQueries({ district: '海淀', school: '人大附中', timeNode: '期中' }, { city: '北京', grade: '高一', subject: '化学' })
  assert.ok(queries.some(q => q.includes('北京') && q.includes('高一')))
  assert.ok(queries.some(q => q.includes('人大附中')))
})

test('热点筛选：保留本地期中安排，丢掉无关百科', () => {
  const items = [
    { title: '北京市_百度百科', summary: '北京是首都', url: 'https://baike.baidu.com/x' },
    { title: '北京海淀高一期中考试时间安排', summary: '海淀区高一期中安排在 11 月 12 日', url: 'https://www.bjeea.cn/x', publishedAt: '2026-11-20' },
  ]
  const list = summarizeHotspots(items, { city: '北京', grade: '高一' })
  assert.equal(list.length, 1)
  assert.match(list[0].title, /期中/)
  assert.match(hotspotBlock(list[0]), /北京海淀/)
})

test('不填节点也能自动推断', async () => {
  const { inferTimeNode } = await import('../src/hotspots.js')
  assert.match(inferTimeNode(new Date('2026-11-28T00:00:00+08:00')), /期中/)
  assert.match(inferTimeNode(new Date('2026-06-10T00:00:00+08:00')), /期末|高考/)
})

test('单条稿记录是否用了热点', async () => {
  const { normalizeSingle, localSingle } = await import('../src/topics.js')
  assert.equal(normalizeSingle({ title: 'x', script: 'y', hotspotUsed: true }).hotspotUsed, true)
  assert.equal(localSingle({ positioning: {} }, 'x').hotspotUsed, false)
})
