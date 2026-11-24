import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

test('产出库：登记、重复登记只更新、删除、文件丢了标 missing', async () => {
  const home = await mkdtemp(join(tmpdir(), 'workbench-home-'))
  const dir = await mkdtemp(join(tmpdir(), 'workbench-out-'))
  const before = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const lib = await import('../src/works.js')
    const first = lib.addWork({ kind: 'script', title: '第一条', dir, files: ['a.docx'], content: '正文' })
    assert.equal(lib.listWorks().length, 1)
    assert.equal(first.missing, undefined)
    // 同一个目录再登记：只更新，不新增
    const again = lib.addWork({ kind: 'script', title: '改过的标题', dir, files: ['a.docx'], content: '新正文' })
    assert.equal(again.id, first.id)
    assert.equal(lib.listWorks().length, 1)
    assert.equal(lib.listWorks()[0].title, '改过的标题')
    // 文件不存在了要标出来
    assert.equal(lib.listWorks()[0].missing, true)
    await writeFile(join(dir, 'a.docx'), 'x')
    assert.equal(lib.listWorks()[0].missing, false)
    assert.equal(lib.removeWork(first.id), true)
    assert.equal(lib.listWorks().length, 0)
    assert.equal(lib.removeWork('不存在'), false)
  } finally {
    if (before === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = before
    await rm(home, { recursive: true, force: true })
    await rm(dir, { recursive: true, force: true })
  }
})
