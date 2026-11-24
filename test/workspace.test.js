import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendLead, readAccounts, readSettingsMarkdown, settingsMarkdown, writeAccounts, writeSettingsMarkdown } from '../src/workspace.js'

test('我的设定.md：写完能原样读回来，空字段写「（还没填）」', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-ws-'))
  try {
    const positioning = { subject: '高中化学', grade: '高一', city: '北京', only: '开学后掉队', notDo: '', voice: '先接住焦虑', redline: '不承诺提分' }
    const file = writeSettingsMarkdown(root, positioning, ['期中 58 分还能补吗', '物质的量听不懂'])
    const text = await readFile(file, 'utf8')
    assert.match(text, /# 我的设定/)
    assert.match(text, /- \*\*我教什么科目\*\*：高中化学/)
    assert.match(text, /- \*\*不做\*\*：（还没填）/)
    const back = readSettingsMarkdown(root)
    assert.equal(back.positioning.subject, '高中化学')
    assert.equal(back.positioning.notDo, '')
    assert.deepEqual(back.painPoints, ['期中 58 分还能补吗', '物质的量听不懂'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('没有设定文件时读回 null，不会瞎编', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-ws2-'))
  try {
    assert.equal(readSettingsMarkdown(root), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('线索表.csv：第一次写表头，之后追加；带逗号和引号的值会被正确转义', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-ws3-'))
  try {
    const lead = { name: '王', grade: '高一', school: '某中学', painPoint: '58 分, 物质的量', source: '视频A', next: '待加微', type: '家长', category: 'C 怎么补', raw: '老师你好，"58 分"还能补吗' }
    const file = appendLead(root, lead)
    appendLead(root, { ...lead, name: '李', next: '已加微' })
    const text = await readFile(file, 'utf8')
    const lines = text.trim().split('\n')
    assert.equal(lines.length, 3)
    assert.match(lines[0], /^"日期","姓名"/)
    assert.match(lines[1], /"王"/)
    assert.match(lines[1], /"58 分, 物质的量"/)
    assert.match(lines[1], /""58 分""/)
    assert.match(lines[2], /"李"/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('settingsMarkdown 不带时间戳时内容稳定', () => {
  const a = settingsMarkdown({ subject: '化学' }, ['痛点']).replace(/> 更新于 .+/, '')
  const b = settingsMarkdown({ subject: '化学' }, ['痛点']).replace(/> 更新于 .+/, '')
  assert.equal(a, b)
})

test('账号数据.csv：写出来能读回来，带逗号的备注不会串列', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-acc-'))
  try {
    const file = writeAccounts(root, [
      { platform: '小红书', handle: '示例号', followers: 8620, url: 'https://example.com/x', note: '主号，带逗号, 和引号"', fetchedAt: '2026-11-24T00:00:00.000Z' },
      { platform: '抖音', handle: '另一个', followers: null, url: null, note: '', fetchedAt: null },
    ])
    assert.match(file, /账号数据\.csv$/)
    const back = readAccounts(root)
    assert.equal(back.length, 2)
    assert.equal(back[0].platform, '小红书')
    assert.equal(back[0].followers, 8620)
    assert.match(back[0].note, /带逗号/)
    assert.equal(back[1].followers, null)
    // 没有文件时读回 null，不会当成空表覆盖状态
    assert.equal(readAccounts(join(root, 'nope')), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
