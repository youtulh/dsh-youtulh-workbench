import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createTools } from '../src/tools.js'

test('工具：save_output 把稿子写进工作区，append_lead 往线索表追加一行', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-tools-'))
  try {
    const settings = { read: async () => ({ saveRoot: root }) }
    const [save, lead] = createTools({ settings })

    const saved = await save.execute({ kind: 'content', title: '期中 58 分', text: '第一行\n第二行' })
    assert.match(saved.dir, /内容/)
    assert.equal(saved.files.length, 2)
    const mdName = saved.files.find(name => name.endsWith('.md'))
    assert.match(mdName, /^\d{4}-\d{2}-\d{2} 期中 58 分\.md$/)
    const md = await readFile(join(saved.dir, mdName), 'utf8')
    assert.match(md, /第一行/)

    const appended = await lead.execute({ raw: '老师你好，还能补吗', name: '王', grade: '高一', next: '待加微' })
    assert.match(appended.path, /线索表\.csv$/)
    const csv = await readFile(appended.path, 'utf8')
    assert.match(csv, /"王"/)
    assert.match(csv, /"高一"/)

    // 空正文要拒绝，不能写一个空文件
    await assert.rejects(() => save.execute({ kind: 'content', title: '空', text: '   ' }), /text/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
