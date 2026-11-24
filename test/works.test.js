import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { savePiece } from '../src/export.js'
import { buildDocx } from '../src/word.js'

test('docx 是合法 zip，正文和标题都在里面', () => {
  const buf = buildDocx({ title: '期中 58 分', lines: ['第一行', '第二行'] })
  assert.equal(buf.subarray(0, 2).toString(), 'PK')
  const text = buf.toString('utf8')
  assert.match(text, /word\/document\.xml/)
  assert.match(text, /期中 58 分/)
  assert.match(text, /第二行/)
})

test('savePiece 写出 Word 和 Markdown，文件名来自标题', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workbench-piece-'))
  try {
    const saved = await savePiece({ dir, title: '期中/58 分', text: '第一行\n第二行' })
    assert.deepEqual(saved.files.sort(), ['期中 58 分.docx', '期中 58 分.md'].sort())
    const names = await readdir(saved.dir)
    assert.equal(names.length, 2)
    const md = await readFile(join(saved.dir, '期中 58 分.md'), 'utf8')
    assert.match(md, /^# 期中\/58 分/)
    assert.match(md, /第一行/)
    const docx = await readFile(join(saved.dir, '期中 58 分.docx'))
    assert.equal(docx.subarray(0, 2).toString(), 'PK')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
