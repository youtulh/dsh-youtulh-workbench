import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  groupByLayer, parseLayers, progressOf, readClasses, readLessons, readStudents,
  removeClass, removeStudent, saveClass, saveLessonRows, saveStudent,
} from '../src/students.js'
import { appendLead, readLeads, stageOfLead, updateLeadRow } from '../src/workspace.js'

const temp = async () => mkdtemp(join(tmpdir(), 'workbench-students-'))

test('阶段推导：失败优先，老字段折成新阶段，显式的阶段最准', () => {
  assert.equal(stageOfLead({ result: '失败', stage: '已加微信' }), '流失')
  assert.equal(stageOfLead({ next: '约了试听' }), '约试听')
  assert.equal(stageOfLead({ next: '已进群' }), '已进群')
  assert.equal(stageOfLead({ next: '已加微' }), '已加微信')
  assert.equal(stageOfLead({ next: '待跟进' }), '私信')
  assert.equal(stageOfLead({}), '私信')
  assert.equal(stageOfLead({ stage: '已报课' }), '已报课')
  assert.equal(stageOfLead({ stage: '瞎写的' }), '私信')
})

test('老线索表没有「阶段」列：读的时候推导，写的时候补列且不错位', async () => {
  const root = await temp()
  try {
    const file = join(root, '线索表.csv')
    await writeFile(file, [
      '"日期","姓名","年级","学校","卡点","来源","类型","分类","原文","话术","反应","结果","下一步","更新时间"',
      '"2026-11-01","王","高一","","物质的量","视频A","家长","C 怎么补","老师你好","","已加微","加微成功","已加微","2026-11-01 10:00"',
      '"2026-11-02","李","高一","","配平","视频B","家长","B 能不能提分","老师你好","","","待定","约了试听","2026-11-02 10:00"',
    ].join('\n') + '\n')
    const before = readLeads(root)
    assert.deepEqual(before.map(row => row.stage), ['约试听', '已加微信'])

    const after = updateLeadRow(root, 0, { stage: '已报课' })
    assert.equal(after.find(row => row.name === '王').stage, '已报课')
    const head = (await readFile(file, 'utf8')).split('\n')[0]
    assert.match(head, /"阶段","下次跟进","跟进次数"$/)

    // 跟进：下次跟进时间 + 跟进次数
    const followed = updateLeadRow(root, 0, { nextAt: '2026-11-30', followUps: 2 })
    const wangRow = followed.find(row => row.name === '王')
    assert.equal(wangRow.nextAt, '2026-11-30')
    assert.equal(wangRow.followUps, 2)

    // 补过列以后再追加一行，必须按表头对齐
    appendLead(root, { name: '赵', painPoint: '氧化还原', stage: '私信' })
    const rows = readLeads(root)
    const zhao = rows.find(row => row.name === '赵')
    assert.equal(zhao.stage, '私信')
    assert.equal(zhao.painPoint, '氧化还原')
    assert.equal(zhao.followUps, 0)

    // 只给老的「下一步」时，阶段要折过去，不能一律写「私信」
    appendLead(root, { name: '钱', next: '已加微' })
    assert.equal(readLeads(root).find(row => row.name === '钱').stage, '已加微信')
    assert.equal(rows.length, 3)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('学生档案：同姓名同年级是同一个学生，改名连课次记录一起改', async () => {
  const root = await temp()
  try {
    saveClass(root, { name: '高一 11 月班', total: 8, layers: '化合价，配平' })
    assert.equal(readClasses(root)[0].status, '在读')
    let students = saveStudent(root, { name: '王小明', grade: '高一', school: '某中学', className: '高一 11 月班', layer: '配平' })
    assert.equal(students.length, 1)
    assert.equal(students[0].className, '高一 11 月班')

    // 同名同年级再存一次 → 更新，不是新增
    students = saveStudent(root, { name: '王小明', grade: '高一', school: '另一所', className: '高一 11 月班', layer: '化合价' })
    assert.equal(students.length, 1)
    assert.equal(students[0].school, '另一所')
    assert.equal(students[0].layer, '化合价')

    saveLessonRows(root, { className: '高一 11 月班', no: 1, date: '2026-11-08', rows: [{ name: '王小明', attend: '到', mastery: '半会', homework: '未交' }] })
    saveStudent(root, { name: '王大明', grade: '高一', className: '高一 11 月班', layer: '配平' }, { name: '王小明', grade: '高一' })
    students = readStudents(root)
    assert.deepEqual(students.map(row => row.name), ['王大明'])
    const lessons = readLessons(root, '高一 11 月班')
    assert.equal(lessons[0].name, '王大明')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('学生档案：家长微信/手机能存能读，老表没有这一列读成空', async () => {
  const root = await temp()
  try {
    saveStudent(root, { name: '王', grade: '高一', contact: 'wx-wang' })
    assert.equal(readStudents(root)[0].contact, 'wx-wang')
    // 老版本的学生档案.csv 没有「微信」列，不能报错
    await writeFile(join(root, '学生档案.csv'), '姓名,年级,学校\n李,高二,某中学\n')
    assert.equal(readStudents(root)[0].contact, '')
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})

test('班课：同名班不能重复，改班名带上学生和课次，名册没清空不能删班', async () => {
  const root = await temp()
  try {
    saveClass(root, { name: 'A 班', total: 8, layers: '化合价,配平' })
    assert.throws(() => saveClass(root, { name: 'A 班' }), /同名/)
    saveStudent(root, { name: '王', grade: '高一', className: 'A 班' })
    saveLessonRows(root, { className: 'A 班', no: 1, rows: [{ name: '王', attend: '到' }] })

    saveClass(root, { name: 'B 班', total: 8, status: '结课' }, 'A 班')
    assert.equal(readClasses(root)[0].status, '结课')
    assert.equal(readClasses(root)[0].name, 'B 班')
    assert.equal(readStudents(root)[0].className, 'B 班')
    assert.equal(readLessons(root, 'B 班')[0].className, 'B 班')

    assert.throws(() => removeClass(root, 'B 班'), /先把他们移出班/)
    removeStudent(root, { name: '王', grade: '高一' })
    assert.equal(readStudents(root).length, 0)
    assert.equal(readLessons(root, 'B 班').length, 0)
    removeClass(root, 'B 班')
    assert.equal(readClasses(root).length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('课次：同班同课次同姓名是覆盖；非法课次拒绝；三态非法值归一', async () => {
  const root = await temp()
  try {
    saveClass(root, { name: 'A 班', total: 2 })
    saveStudent(root, { name: '王', grade: '高一', className: 'A 班' })
    saveStudent(root, { name: '李', grade: '高一', className: 'A 班' })

    saveLessonRows(root, { className: 'A 班', no: 1, rows: [{ name: '王', attend: '到' }, { name: '李', attend: '缺' }] })
    const again = saveLessonRows(root, { className: 'A 班', no: 1, rows: [{ name: '王', attend: '缺', mastery: '瞎写', homework: '瞎写' }] })
    assert.equal(again.length, 2)
    const wang = again.find(row => row.name === '王')
    assert.equal(wang.attend, '缺')
    assert.equal(wang.mastery, '会')
    assert.equal(wang.homework, '交')

    // 只点了一半：没点的那个字段留空，不替他记成「会 / 交」
    const partial = saveLessonRows(root, { className: 'A 班', no: 2, rows: [{ name: '李', attend: '到' }] })
    const li = partial.find(row => row.name === '李' && row.no === 2)
    assert.equal(li.attend, '到')
    assert.equal(li.mastery, '')
    assert.equal(li.homework, '')

    // 三个都没点 = 还没记：保存时把这条记录清掉，不写假数据
    const cleared = saveLessonRows(root, { className: 'A 班', no: 2, rows: [{ name: '李' }] })
    assert.equal(cleared.some(row => row.name === '李' && row.no === 2), false)

    assert.throws(() => saveLessonRows(root, { className: 'A 班', no: 3, rows: [] }), /1 到 2/)
    assert.throws(() => saveLessonRows(root, { className: '没这个班', no: 1, rows: [] }), /先建班/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('聚合：进度、按卡点层分组、分层解析', () => {
  const klass = { name: 'A', total: 8 }
  const student = { name: '王', className: 'A', layer: '配平' }
  const rows = [
    { className: 'A', no: 1, name: '王', attend: '到', homework: '未交' },
    { className: 'A', no: 2, name: '王', attend: '缺', homework: '交' },
    { className: 'A', no: 2, name: '李', attend: '到', homework: '交' },
  ]
  assert.deepEqual(progressOf(student, klass, rows), { total: 8, done: 2, present: 1, missed: 1, homeworkMissing: 1 })
  const roster = [student, { name: '李', className: 'A', layer: '化合价' }, { name: '赵', className: 'A', layer: '' }]
  const groups = groupByLayer(roster, ['化合价', '配平'])
  assert.deepEqual(groups.map(row => [row.layer, row.students.length]), [['化合价', 1], ['配平', 1], ['', 1]])
  assert.deepEqual(parseLayers('化合价，配平、化合价;  '), ['化合价', '配平'])
})


test('老版本表格兼容：班课的班名列叫「期次」，课次的列叫「第几次」', async () => {
  const root = await temp()
  try {
    await writeFile(join(root, '班课.csv'), '期次,上课时间,总次数,分层,备注\n高一补漏一期,周日 17:15,10,,腾讯会议\n')
    await writeFile(join(root, '课次记录.csv'), '日期,班,姓名,出勤,掌握,作业,备注\n2026-11-22,高一补漏一期,赵培源,到,半会,交,\n')
    const classes = readClasses(root)
    assert.equal(classes[0].name, '高一补漏一期')
    assert.equal(classes[0].status, '在读')
    const lessons = readLessons(root, '高一补漏一期')
    assert.equal(lessons[0].no, 0) // 老表没有课次列，先读成 0，不丢记录
    assert.equal(lessons[0].name, '赵培源')
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})


test('Excel CSV 带 BOM：学生和班仍能读出来', async () => {
  const root = await temp()
  try {
    await writeFile(join(root, '班课.csv'), '\uFEFF"期次","上课时间","总次数"\n"高一补漏一期","周日",10\n')
    await writeFile(join(root, '学生档案.csv'), '\uFEFF"姓名","年级","班"\n"赵培源","高一","高一补漏一期"\n')
    assert.equal(readClasses(root)[0].name, '高一补漏一期')
    assert.equal(readStudents(root)[0].name, '赵培源')
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})
