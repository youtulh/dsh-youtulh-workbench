import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readCases, readChats } from '../src/chat.js'
import { readFeedback } from '../src/feedback.js'
import { readClasses, readLessons, readStudents } from '../src/students.js'
import { ensureLayout, readLeads } from '../src/workspace.js'

test('空工作区：各读取函数返回空，不报错（新用户第一次打开）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-empty-'))
  try {
    ensureLayout(root)
    assert.deepEqual(readLeads(root), [])
    assert.deepEqual(readStudents(root), [])
    assert.deepEqual(readClasses(root), [])
    assert.deepEqual(readLessons(root), [])
    assert.deepEqual(readChats(root), [])
    assert.deepEqual(readCases(root), [])
    assert.deepEqual(readFeedback(root), [])
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})
