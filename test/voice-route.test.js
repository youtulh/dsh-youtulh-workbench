import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import plugin from '../src/host.js'
import { readVoiceSamples } from '../src/workspace.js'

const boot = async () => {
  const home = await mkdtemp(join(tmpdir(), 'workbench-voice-'))
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
  return { workspace, call, cleanup }
}

test('原话样本：读、存、再读回来；写的是规范模板，不是整段覆盖', async () => {
  const { workspace, call, cleanup } = await boot()
  try {
    const before = await call('GET', 'voice')
    assert.equal(before.status, 200)
    assert.deepEqual(before.body.samples, [])

    const saved = await call('POST', 'voice', { samples: ['我跟家长说话不绕：孩子哪块不会就补哪块。', '  多余的空格 会被压成一行  ', ''] })
    assert.equal(saved.status, 200)
    assert.deepEqual(saved.body.samples, ['我跟家长说话不绕：孩子哪块不会就补哪块。', '多余的空格 会被压成一行'])

    const after = await call('GET', 'voice')
    assert.deepEqual(after.body.samples, saved.body.samples)
    assert.deepEqual(readVoiceSamples(workspace), saved.body.samples)

    const text = await readFile(join(workspace, '说话样本.md'), 'utf8')
    assert.match(text, /^<!-- v3 -->/)
    assert.match(text, /## 原话样本/)
    assert.match(text, /我跟家长说话不绕/)
    assert.match(text, /## 规则/) // 规则和结构没被覆盖掉
  } finally {
    await cleanup()
  }
})

test('原话样本：最多 8 条，单条截断，空数组写回占位句', async () => {
  const { workspace, call, cleanup } = await boot()
  try {
    const many = Array.from({ length: 12 }, (_, index) => `第 ${index + 1} 句`)
    const saved = await call('POST', 'voice', { samples: many })
    assert.equal(saved.body.samples.length, 8)
    await call('POST', 'voice', { samples: [] })
    assert.deepEqual(readVoiceSamples(workspace), [])
    const text = await readFile(join(workspace, '说话样本.md'), 'utf8')
    assert.match(text, /把你的原话放这里/)
  } finally {
    await cleanup()
  }
})
