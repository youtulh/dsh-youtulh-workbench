import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { listDiagnostics, readManifest, saveDiagnosticRow, writeManifest } from '../src/diagnostics-store.js'

test('试听诊断索引：新增后能读到完整字段，更新状态不会清空字段', async () => {
  const root = await mkdtemp(join(tmpdir(), 'diag-store-'))
  try {
    saveDiagnosticRow(root, { id: 'D1', student: '小雪', grade: '高一', subject: '化学', lesson: '氧化还原', at: '2026-11-30', code: 'C1', brand: '姜老师化学', dir: '试听诊断/D1' })
    let rows = listDiagnostics(root)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].at, '2026-11-30')
    saveDiagnosticRow(root, { ...rows[0], status: '课前已回', preScore: '10/10' })
    rows = listDiagnostics(root)
    assert.equal(rows[0].status, '课前已回')
    assert.equal(rows[0].student, '小雪')
    assert.equal(rows[0].preScore, '10/10')
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})
