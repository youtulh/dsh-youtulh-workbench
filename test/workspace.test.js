import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendLead, appendTopics, leadLessons, markTopicsPicked, readAccounts, readContent, readLeads, readSettingsMarkdown, readTable, recordContent, recordPickedTopics, archiveTopics, backupWorkspace, listBackups, restoreWorkspace, removeContent, removeLeadRow, settingsMarkdown, updateContent, updateLeadRow, writeAccounts, writeSettingsMarkdown } from '../src/workspace.js'

test('我的设定.md：写完能原样读回来，空字段写「（还没填）」', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-ws-'))
  try {
    const positioning = {
      subject: '高中化学', grade: '高一', city: '北京',
      target: '北京高一化学 50–60 分、家长急但没方向', entry: '物质的量这一块', fear: '怕补了没起色',
      only: '开学后掉队', notDo: '', voice: '先接住焦虑', redline: '不承诺提分',
    }
    const file = writeSettingsMarkdown(root, positioning, ['期中 58 分还能补吗', '物质的量听不懂'])
    const text = await readFile(file, 'utf8')
    assert.match(text, /# 我的设定/)
    assert.match(text, /- \*\*我教什么科目\*\*：高中化学/)
    assert.match(text, /- \*\*不做\*\*：（还没填）/)
    assert.match(text, /- \*\*目标客户\*\*：北京高一化学 50–60 分/)
    const back = readSettingsMarkdown(root)
    assert.equal(back.positioning.subject, '高中化学')
    assert.equal(back.positioning.notDo, '')
    assert.equal(back.positioning.target, '北京高一化学 50–60 分、家长急但没方向')
    assert.equal(back.positioning.entry, '物质的量这一块')
    assert.equal(back.positioning.fear, '怕补了没起色')
    assert.deepEqual(back.painPoints, ['期中 58 分还能补吗', '物质的量听不懂'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('旧版我的设定.md（没有目标客户三行）读成空，不报错', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-ws-old-'))
  try {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(root, '我的设定.md'), '# 我的设定\n\n- **我教什么科目**：化学\n- **带哪个年级**：高一\n', 'utf8')
    const back = readSettingsMarkdown(root)
    assert.equal(back.positioning.subject, '化学')
    assert.equal(back.positioning.target, '')
    assert.equal(back.positioning.entry, '')
    assert.equal(back.positioning.fear, '')
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

test('线索表：记录话术、反应、结果；改了反应自动推下一步，加微即成功', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-leads-'))
  try {
    const base = { raw: '老师你好，我孩子高一 58 分', name: '王', grade: '高一', type: '家长', category: 'C 怎么补', draft: '家长您好，先别急着刷题…' }
    appendLead(root, base)
    appendLead(root, { ...base, name: '李' })
    let rows = readLeads(root)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].draft, '家长您好，先别急着刷题…')
    assert.equal(rows[0].result, '待定')
    assert.equal(rows[0].rowIndex, 1)  // 最新一行在文件里是第 2 条数据

    // 王（文件第一行）：家长加了微信 → 阶段和结果一起变，下一步留给具体动作
    rows = updateLeadRow(root, 0, { reaction: '已加微' })
    const wang = rows.find(row => row.name === '王')
    assert.equal(wang.stage, '已加微信')
    assert.equal(wang.result, '加微成功')
    assert.equal(wang.next, '')

    // 经验里能捞到这条
    const lessons = leadLessons(root)
    assert.equal(lessons.length, 1)
    assert.match(lessons[0], /加了微信/)
    assert.match(lessons[0], /王|高一 58 分|家长您好/)

    // 选回「还没回」不会把阶段改回去
    rows = updateLeadRow(root, 0, { reaction: '' })
    assert.equal(rows.find(row => row.name === '王').stage, '已加微信')

    // 手动改成失败 → 流失，不再算成功经验
    // 删一条：只删这一行
    appendLead(root, { name: '广告', raw: '加我赚钱' })
    assert.equal(readLeads(root).length, 3)
    const left = removeLeadRow(root, 2)
    assert.equal(left.length, 2)
    assert.equal(left.some(row => row.name === '广告'), false)
    assert.equal(removeLeadRow(root, 9), null)

    rows = updateLeadRow(root, 0, { result: '失败' })
    assert.equal(rows.find(row => row.name === '王').result, '失败')
    assert.equal(rows.find(row => row.name === '王').stage, '流失')
    assert.equal(leadLessons(root).length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('内容库：记录一条口播、按目录更新不重复、未知列不影响', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-content-'))
  try {
    const row = {
      '日期': '2026-11-24', '批次': '20261124-1800', '选题': '偏科的孩子卡在哪', '标题': '偏科的孩子，多半卡在物质的量',
      '标签': '#化学 #高一', '采用': '未定', '平台': '', '发布日': '', '播放': '', '涨粉': '', '私信': '', '加微': '',
      '爆款': '', '分数': '', '目录': join(root, '内容', '2026-11-24 偏科的孩子，多半卡在物质的量'), '备注': '',
    }
    recordContent(root, row)
    recordContent(root, row)                       // 同目录再记一次 → 仍然只有一行
    let rows = readContent(root)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]['标题'], '偏科的孩子，多半卡在物质的量')

    const updated = updateContent(root, row['目录'], { '私信': '6', '涨粉': '12' })
    assert.equal(updated['私信'], '6')
    rows = readContent(root)
    assert.equal(rows[0]['涨粉'], '12')
    assert.equal(updateContent(root, join(root, '不存在'), {}), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('内容库：没有目录的行（补录 / 导入）按创建时间更新和删除', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-content-manual-'))
  try {
    const stamp = '2026-11-24T10:00:00.000Z'
    recordContent(root, { '日期': '2026-11-24', '创建时间': stamp, '标题': '以前发过的视频', '状态': '已发布', '目录': '' })
    assert.equal(readContent(root).length, 1)
    assert.equal(updateContent(root, stamp, { '私信': '9' })['私信'], '9')
    assert.equal(readContent(root)[0]['私信'], '9')
    const removed = removeContent(root, stamp)
    assert.equal(removed['标题'], '以前发过的视频')
    assert.equal(readContent(root).length, 0)
    assert.equal(removeContent(root, 'nope'), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('选题库：只记勾中的，重复勾不重复追加，超过 20 批自动归档', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-topics-picked-'))
  try {
    recordPickedTopics(root, 'B1', ['甲', '乙'])
    let rows = readTable(root, '选题库.csv').rows
    assert.equal(rows.length, 2)
    assert.ok(rows.every(row => row['勾选'] === '是'))

    // 同一批再勾一条：只补新的，不重复
    recordPickedTopics(root, 'B1', ['甲', '丙'])
    rows = readTable(root, '选题库.csv').rows
    assert.equal(rows.length, 3)
    assert.deepEqual(rows.filter(row => row['勾选'] === '是').map(row => row['选题']).sort(), ['丙', '甲'])

    // 25 批只留最近 20 批
    for (let i = 0; i < 25; i++) recordPickedTopics(root, `P${String(i).padStart(2, '0')}`, [`题${i}`])
    archiveTopics(root, 20)
    const kept = new Set(readTable(root, '选题库.csv').rows.map(row => row['批次']))
    assert.equal(kept.size, 20)
    assert.ok(!kept.has('B1'))
    assert.ok(kept.has('P24'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('选题库：记一批、勾选回写，只影响这一批', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-topics-'))
  try {
    appendTopics(root, 'B1', ['选题甲', '选题乙', '选题丙'])
    appendTopics(root, 'B2', ['选题丁'])
    const after = markTopicsPicked(root, 'B1', ['选题甲', '选题丙'])
    assert.equal(after.length, 3)
    assert.deepEqual(after.filter(row => row['勾选'] === '是').map(row => row['选题']).sort(), ['选题甲', '选题丙'].sort())
    const { rows } = readTable(root, '选题库.csv')
    assert.equal(rows.find(row => row['批次'] === 'B2')['勾选'], '否')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('爆款：分数按 私信×3 + 涨粉×1 + 播放×0.001 算，够 3 条才自动判', async () => {
  const { scoreOf, scoreRows, quantile, topContent } = await import('../src/lessons.js')
  assert.equal(scoreOf({ '私信': '2', '涨粉': '10', '播放': '5000' }), 2 * 3 + 10 * 1 + 5000 * 0.001)
  assert.equal(quantile([1, 2, 3, 4], 0.75), 3.25)

  // 只有 2 条时不自动判「是」
  const two = scoreRows([{ '私信': '5', '爆款': '' }, { '私信': '0', '爆款': '' }])
  assert.equal(two.rows.some(row => row['爆款'] === '是'), false)

  // 4 条时，最高那条超过 p75 → 是；手动标「否」的不改
  const four = scoreRows([
    { '私信': '0', '爆款': '' }, { '私信': '1', '爆款': '' },
    { '私信': '2', '爆款': '' }, { '私信': '9', '爆款': '' },
  ])
  const hits = four.rows.filter(row => row['爆款'] === '是').length
  assert.equal(hits >= 1, true)
  const manual = scoreRows([{ '私信': '9', '爆款': '否' }, { '私信': '0', '爆款': '' }, { '私信': '0', '爆款': '' }])
  assert.equal(manual.rows[0]['爆款'], '否')
})

test('内容库对账：文件夹被删掉的条目自动清掉', async () => {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { pruneMissingContent } = await import('../src/workspace.js')
  const root = await mkdtemp(join(tmpdir(), 'workbench-prune-'))
  try {
    const aliveDir = join(root, '内容', '留着')
    await mkdir(aliveDir, { recursive: true })
    await writeFile(join(aliveDir, '留着.md'), 'x')
    recordContent(root, { '日期': '2026-11-24', '创建时间': '2026-11-24T18:00:00Z', '标题': '留着', '目录': aliveDir })
    recordContent(root, { '日期': '2026-11-23', '创建时间': '2026-11-23T18:00:00Z', '标题': '删掉的', '目录': join(root, '内容', '不存在') })

    const removed = pruneMissingContent(root)
    assert.deepEqual(removed, ['删掉的'])
    const rows = readContent(root)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]['标题'], '留着')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})


test('备份：整个工作区复制到旁边，原文件不动', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'workbench-backup-'))
  const root = join(parent, '工作区')
  try {
    await mkdir(root)
    await writeFile(join(root, '线索表.csv'), '姓名\n王\n')
    const dir = backupWorkspace(root)
    assert.ok(dir.includes('备份'))
    const copied = await readFile(join(dir, '线索表.csv'), 'utf8')
    assert.match(copied, /王/)
    const original = await readFile(join(root, '线索表.csv'), 'utf8')
    assert.match(original, /王/)
    // 只留最近 3 份：造 4 个更新的备份，最早的会被清掉
    for (let i = 0; i < 4; i += 1) backupWorkspace(root, { keep: 3, at: new Date(2026, 10, 25, 6, 0, i) })
    const { readdirSync } = await import('node:fs')
    const backups = listBackups(root)
    assert.equal(backups.length, 3)
    assert.ok(backups[0].name >= backups[2].name)
    assert.ok(backups[0].size > 0)
  } finally {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})


test('从备份还原：被改坏的文件能回到备份时的样子', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'workbench-restore-'))
  const root = join(parent, '工作区')
  try {
    await mkdir(root)
    await writeFile(join(root, '线索表.csv'), '\uFEFF"姓名"\n"王"\n')
    const dir = backupWorkspace(root)
    await writeFile(join(root, '线索表.csv'), '\uFEFF"姓名"\n"改坏了"\n')
    restoreWorkspace(root, dir)
    const raw = await readFile(join(root, '线索表.csv'), 'utf8')
    assert.match(raw, /王/)
    assert.doesNotMatch(raw, /改坏了/)
  } finally {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})


test('成功经验不收录空话术的线索，避免线索表出现空引号', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-ws-'))
  try {
    appendLead(root, { name: '空话术', raw: '家长问了一句', stage: '已加微信', result: '加微成功' })
    assert.equal(leadLessons(root).length, 0)
    appendLead(root, { name: '有话术', raw: '期中 58 分还能补吗', draft: '先发卷子我看看', stage: '已加微信', result: '加微成功' })
    assert.equal(leadLessons(root).length, 1)
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})
