import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import plugin from '../src/host.js'

const boot = async () => {
  const home = await mkdtemp(join(tmpdir(), 'workbench-chat-route-'))
  const workspace = join(home, '工作区')
  await mkdir(workspace, { recursive: true })
  await mkdir(join(home, 'media-desk'), { recursive: true })
  await writeFile(join(home, 'media-desk', 'settings.json'), JSON.stringify({ saveRoot: workspace }))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  let handler = null
  plugin.apply({
    get: name => (name === 'connection' ? { requestRejection: () => undefined } : undefined),
    effect: fn => fn(),
    webServer: { register: options => { handler = options.handler } },
  })
  const call = (method, path, body) => new Promise((resolve) => {
    const payload = body === undefined ? '' : JSON.stringify(body)
    const req = {
      url: `/media-desk/${path}`, method,
      headers: { 'content-type': 'application/json', 'x-media-desk-lang': 'zh', 'sec-fetch-site': 'same-origin' },
      async *[Symbol.asyncIterator]() { if (payload) yield Buffer.from(payload) },
    }
    const res = { statusCode: 0, headersSent: false, setHeader() {}, end: text => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : {} }) }
    handler(req, res)
  })
  const cleanup = async () => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
  return { call, cleanup }
}

test('dm/draft 按渠道给不同建议（没模型时本地兜底也要分渠道）', async () => {
  const { call, cleanup } = await boot()
  try {
    const platform = await call('POST', 'dm/draft', { raw: '高一物理 58 分还能补吗', channel: '平台私信' })
    assert.equal(platform.status, 200)
    assert.equal(platform.body.channel, '平台私信')
    assert.equal(platform.body.source, 'local')
    assert.equal(platform.body.drafts.length, 2)
    assert.match(platform.body.drafts.map(row => row.text).join(''), /私信/)

    const wechat = await call('POST', 'dm/draft', { raw: '一节课多少钱', channel: '微信' })
    assert.equal(wechat.status, 200)
    assert.equal(wechat.body.channel, '微信')
    assert.match(wechat.body.drafts.map(row => row.text).join(''), /卷子/)
  } finally {
    await cleanup()
  }
})

test('chat/log 记一笔；chat/cases 存案例并回读', async () => {
  const { call, cleanup } = await boot()
  try {
    assert.equal((await call('POST', 'chat/log', { channel: '微信', incoming: '多少钱', outgoing: '先看孩子卡在哪' })).status, 200)
    const records = await call('GET', 'chat/records')
    assert.equal(records.body.rows.length, 1)
    assert.equal(records.body.rows[0].channel, '微信')

    // 标结果：成交 / 流失
    const updated = await call('POST', 'chat/update', { index: 0, patch: { result: '成交' } })
    assert.equal(updated.status, 200)
    assert.equal(updated.body.rows[0].result, '成交')
    assert.equal((await call('POST', 'chat/update', { index: 9, patch: { result: '成交' } })).status, 404)

    // 结果是成交时，同名线索的阶段一起推到「已报课」
    const lead = await call('POST', 'lead/append', { name: '王', grade: '高二', painPoint: '配平不会', stage: '已加微信' })
    assert.equal(lead.status, 200)
    await call('POST', 'chat/log', { channel: '微信', name: '王', incoming: '怎么报', outgoing: '先约个诊断' })
    const rows = (await call('GET', 'chat/records')).body.rows
    const last = rows[rows.length - 1]
    const synced = await call('POST', 'chat/update', { index: last.rowIndex, patch: { result: '成交' } })
    assert.equal(synced.status, 200)
    assert.equal(synced.body.leads[0].stage, '已报课')

    assert.equal((await call('POST', 'chat/cases', { channel: '微信', scene: '问价格', result: '成交', text: '家长：多少钱？老师：先别报数字。' })).status, 200)
    assert.equal((await call('POST', 'chat/cases', { channel: '微信', text: '   ' })).status, 400)
    const after = await call('GET', 'chat/records')
    assert.equal(after.body.cases.length, 1)
    assert.match(after.body.cases[0].text, /先别报数字/)
  } finally {
    await cleanup()
  }
})
