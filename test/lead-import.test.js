import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseLeadTable } from '../src/host.js'

test('线索导入：认表头别名，带引号的原文不拆列', () => {
  const { cols, rows } = parseLeadTable('家长,年级,痛点,来源,阶段,下次跟进,原文\n王,高二,配平,小红书,已加微信,2026-11-26,"老师，58 分, 还能补吗"\n,高一,,抖音,私信,,没写名字但有原文\n')
  assert.ok(cols.includes('name'))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].painPoint, '配平')
  assert.equal(rows[0].raw, '老师，58 分, 还能补吗')
  assert.equal(rows[0].nextAt, '2026-11-26')
  assert.equal(rows[1].name, '')
  assert.equal(rows[1].raw, '没写名字但有原文')
})
