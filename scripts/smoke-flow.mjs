// 用真实工作区的副本跑一遍主流程（导入/记课/反馈/备份/升级），不碰原数据。
// 用法：node scripts/smoke-flow.mjs
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultRoot } from '../src/workspace.js'

const home = await mkdtemp(join(tmpdir(), 'md-flow-'))
const workspace = join(home, '工作区')
await cp(defaultRoot(), workspace, { recursive: true })
await mkdir(join(home, 'media-desk'), { recursive: true })
await writeFile(join(home, 'media-desk', 'settings.json'), JSON.stringify({ saveRoot: workspace }))
process.env.DSH_HOME = home
const { default: plugin } = await import('../src/host.js')
let handler = null
plugin.apply({ get: n => (n === 'connection' ? { requestRejection: () => undefined } : undefined), effect: f => f(), webServer: { register: o => { handler = o.handler } } })
const call = (method, path, body) => new Promise(resolve => {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const req = { url: `/media-desk/${path}`, method, headers: { 'content-type': 'application/json', 'x-media-desk-lang': 'zh' }, async *[Symbol.asyncIterator]() { if (payload) yield Buffer.from(payload) } }
  const res = { statusCode: 0, setHeader() {}, end: text => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : {} }) }
  handler(req, res)
})
const step = (label, r, extra = '') => console.log(label, r.status, extra)
const stats = await call('GET', 'workspace/stats')
step('stats', stats, JSON.stringify(stats.body.legacy))
const students = (await call('GET', 'students')).body.students
const klass = (await call('GET', 'students')).body.classes[0]
if (klass) {
  const roster = students.filter(s => s.className === klass.name)
  step('lesson', await call('POST', 'lessons/save', { class: klass.name, no: 2, date: '2026-11-25', rows: roster.map(s => ({ name: s.name, attend: '到', mastery: '会', homework: '交' })) }), roster.length)
  if (roster[0]) {
    const fb = await call('POST', 'student/feedback', { name: roster[0].name, grade: roster[0].grade, className: klass.name, limit: 2 })
    step('feedback', fb, `${fb.body.source}/${fb.body.lessons}`)
  }
}
step('backup', await call('POST', 'workspace/backup', {}), '')
const up = await call('POST', 'workspace/upgrade', {})
step('upgrade', up, `${JSON.stringify(up.body.upgraded)} same=${up.body.sameCounts}`)
const raw = '姓名,年级,卡点,来源\n测试家长,高二,动量,小红书'
step('lead import', await call('POST', 'leads/import', { raw }), '')
step('lead dedupe', await call('POST', 'leads/import', { raw }), '')
step('stats after', await call('GET', 'workspace/stats'), JSON.stringify((await call('GET', 'workspace/stats')).body.legacy))
