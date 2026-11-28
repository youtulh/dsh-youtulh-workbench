import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixScript, scanRedlines } from '../src/redlines.js'

test('红线扫描：保证提分/包过/价格都能命中', () => {
  const issues = scanRedlines('保证提分，包过，价格多少钱')
  assert.ok(issues.length >= 3)
})

test('红线兜底：成稿自动改掉危险说法', () => {
  const fixed = fixScript({ title: '保证提分', script: '包过，最有效的办法', comment: '多少钱', dm: '加微信号' })
  assert.doesNotMatch(fixed.title, /保证提分|包过/)
  assert.doesNotMatch(fixed.script, /包过|最有效/)
  assert.deepEqual(fixed.warnings, [])
})
