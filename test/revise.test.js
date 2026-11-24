import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import plugin from '../src/host.js'

const boot = async () => {
  const home = await mkdtemp(join(tmpdir(), 'workbench-revise-'))
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
  const call = (path, body) => new Promise((resolve) => {
    const payload = JSON.stringify(body ?? {})
    const req = {
      url: `/media-desk/${path}`, method: 'POST',
      headers: { 'content-type': 'application/json', 'x-media-desk-lang': 'zh', 'sec-fetch-site': 'same-origin' },
      async *[Symbol.asyncIterator]() { yield Buffer.from(payload) },
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

test('采用之后改稿：本地 Word/Markdown 和内容库都更新成最新版本', async () => {
  const { workspace, call, cleanup } = await boot()
  try {
    const adopted = await call('content/adopt', {
      topic: '期中 58 分还能补吗', title: '期中 58 分，先补物质的量', script: '旧稿第一行\n旧稿第二行', tags: ['化学', '高一'],
    })
    assert.equal(adopted.status, 200)
    const dir = adopted.body.dir
    const names = await readdir(dir)
    assert.ok(names.some(name => name.endsWith('.docx')))
    const md = join(dir, names.find(name => name.endsWith('.md')))
    assert.match(await readFile(md, 'utf8'), /旧稿第一行/)

    const revised = await call('content/revise', {
      dir, topic: '期中 58 分还能补吗', title: '期中 58 分，先补物质的量',
      script: '改过的第一行\n改过的第二行', tags: ['化学', '高一'],
    })
    assert.equal(revised.status, 200)
    assert.equal(revised.body.dir, dir)
    const text = await readFile(md, 'utf8')
    assert.match(text, /改过的第一行/)
    assert.doesNotMatch(text, /旧稿第一行/)

    const csv = await readFile(join(workspace, '内容库.csv'), 'utf8')
    assert.match(csv, /采用后改过一版/)
  } finally {
    await cleanup()
  }
})

test('改稿只认工作区里的目录，别的路径和空稿都拒绝', async () => {
  const { call, cleanup } = await boot()
  try {
    assert.equal((await call('content/revise', { dir: '/etc', title: 'x', script: 'y' })).status, 404)
    assert.equal((await call('content/revise', { dir: '', title: 'x', script: 'y' })).status, 400)
    assert.equal((await call('content/revise', { dir: '/tmp/nope', title: 'x', script: '   ' })).status, 400)
  } finally {
    await cleanup()
  }
})
