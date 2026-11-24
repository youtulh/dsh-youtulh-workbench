import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendTopics, markTopicsPicked, recordContent } from '../src/workspace.js'
import { buildLessonBlock, rescore, scoreOf, topContent, writeLessonMarkdown } from '../src/lessons.js'

const rowOf = (root, title, dms, follows, views) => ({
  '日期': '2026-11-24', '批次': 'B', '选题': title, '标题': title, '标签': '#化学',
  '采用': '采用', '平台': '抖音', '发布日': '2026-11-24', '播放': String(views), '涨粉': String(follows),
  '私信': String(dms), '加微': '', '爆款': '', '分数': '', '目录': join(root, '内容', title), '备注': '',
})

test('学习：分数、爆款、经验块、经验库.md 一条链路', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-lessons-'))
  try {
    recordContent(root, rowOf(root, '偏科的孩子卡在哪', 6, 30, 8000))
    recordContent(root, rowOf(root, '期中掉队先补什么', 1, 2, 500))
    recordContent(root, rowOf(root, '物质的是啥', 0, 0, 300))
    recordContent(root, rowOf(root, '上课听懂做题废', 2, 5, 1200))

    assert.equal(scoreOf({ '私信': '1', '涨粉': '2', '播放': '1000' }), 3 + 2 + 1)

    const { rows } = rescore(root)
    assert.equal(rows.filter(row => row['爆款'] === '是').length >= 1, true)
    assert.equal(rows.find(row => row['标题'] === '偏科的孩子卡在哪')['爆款'], '是')

    const top = topContent(root, 2)
    assert.equal(top[0].row['标题'], '偏科的孩子卡在哪')

    // 勾选信号 → 选题方向
    appendTopics(root, 'B1', ['偏科的化学怎么补', '期中掉队来得及吗', '先预习还是先刷题'])
    markTopicsPicked(root, 'B1', ['偏科的化学怎么补', '期中掉队来得及吗'])

    const block = buildLessonBlock(root)
    assert.match(block, /偏科的孩子卡在哪/)
    assert.match(block, /被采纳最多的选题方向/)
    assert.match(block, /偏科/)

    const file = writeLessonMarkdown(root)
    assert.equal(existsSync(file), true)
    const md = await readFile(file, 'utf8')
    assert.match(md, /# 经验库/)
    assert.match(md, /偏科的孩子卡在哪/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('学习：没有数据时经验块为空，不污染 prompt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-lessons-empty-'))
  try {
    assert.equal(buildLessonBlock(root), '')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
