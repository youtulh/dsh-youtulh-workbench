// 学生管理：学生档案 / 班课 / 课次记录三张表，和线索表一样是工作区里的 CSV。
// 页面只是壳；Excel 能直接改这三张表，改完页面刷新就跟着变。
import { LAYOUT, dayStamp, nowStamp, readTable, writeTable } from './workspace.js'

export const ATTEND_OPTIONS = ['到', '缺']
export const MASTERY_OPTIONS = ['会', '半会', '不会']
export const HOMEWORK_OPTIONS = ['交', '未交']
export const DEFAULT_TOTAL = 8
export const MAX_TOTAL = 30

export const STUDENT_COLUMNS = ['姓名', '年级', '学校', '卡点层', '班', '来源', '报课日期', '备注', '创建时间', '更新时间']
export const CLASS_COLUMNS = ['班名', '上课时间', '总次数', '分层', '备注', '创建时间', '更新时间']
export const LESSON_COLUMNS = ['班', '课次', '日期', '姓名', '出勤', '掌握', '作业', '备注', '更新时间']

const STUDENT_FIELDS = {
  name: '姓名', grade: '年级', school: '学校', layer: '卡点层', className: '班',
  source: '来源', enrolledAt: '报课日期', note: '备注', createdAt: '创建时间', updatedAt: '更新时间',
}
const CLASS_FIELDS = { name: '班名', time: '上课时间', total: '总次数', layers: '分层', note: '备注', createdAt: '创建时间', updatedAt: '更新时间' }
const LESSON_FIELDS = { className: '班', no: '课次', date: '日期', name: '姓名', attend: '出勤', mastery: '掌握', homework: '作业', note: '备注', updatedAt: '更新时间' }

const text = (value, max = 80) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
// 空值表示「还没记」：不归一成第一个选项，保存时按「清掉这条记录」处理
const pick = (row, allowed) => {
  if (row === '' || row === null || row === undefined) return ''
  return allowed.includes(row) ? row : allowed[0]
}

/** 分层存成逗号分隔的一行；空项去掉，去重。 */
export function parseLayers(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,，、;；|]/)
  return [...new Set(list.map(row => text(row, 20)).filter(Boolean))].slice(0, 20)
}

export function layersText(value) {
  return parseLayers(value).join('，')
}

const toStudent = (row) => ({
  name: row['姓名'] ?? '', grade: row['年级'] ?? '', school: row['学校'] ?? '', layer: row['卡点层'] ?? '',
  className: row['班'] ?? '', source: row['来源'] ?? '', enrolledAt: row['报课日期'] ?? '',
  note: row['备注'] ?? '', createdAt: row['创建时间'] ?? '', updatedAt: row['更新时间'] ?? '',
})
const toStudentRow = (student) => Object.fromEntries(Object.entries(STUDENT_FIELDS).map(([key, col]) => [col, student[key] ?? '']))

const toClass = (row) => ({
  name: row['班名'] ?? '', time: row['上课时间'] ?? '', total: Number(row['总次数']) || DEFAULT_TOTAL,
  layers: parseLayers(row['分层']), layerText: row['分层'] ?? '', note: row['备注'] ?? '',
  createdAt: row['创建时间'] ?? '', updatedAt: row['更新时间'] ?? '',
})
const toClassRow = (klass) => ({
  '班名': klass.name, '上课时间': klass.time ?? '', '总次数': String(klass.total ?? DEFAULT_TOTAL),
  '分层': layersText(klass.layers), '备注': klass.note ?? '', '创建时间': klass.createdAt ?? '', '更新时间': klass.updatedAt ?? '',
})

const toLesson = (row) => ({
  className: row['班'] ?? '', no: Number(row['课次']) || 0, date: row['日期'] ?? '', name: row['姓名'] ?? '',
  attend: row['出勤'] ?? '', mastery: row['掌握'] ?? '', homework: row['作业'] ?? '', note: row['备注'] ?? '', updatedAt: row['更新时间'] ?? '',
})
const toLessonRow = (lesson) => Object.fromEntries(Object.entries(LESSON_FIELDS).map(([key, col]) => [col, lesson[key] ?? '']))

const sameStudent = (a, b) => text(a.name, 40) === text(b.name, 40) && text(a.grade, 20) === text(b.grade, 20)

// ---- 学生档案 ----

export function readStudents(root) {
  return readTable(root, LAYOUT.students).rows.map(toStudent).filter(row => row.name)
}

/** 新建或更新一个学生（键 = 姓名 + 年级）；改名时把课次记录里的名字一起改掉。 */
export function saveStudent(root, input = {}, original = null) {
  const students = readStudents(root)
  const student = {
    name: text(input.name, 40), grade: text(input.grade, 20), school: text(input.school, 40),
    layer: text(input.layer, 30), className: text(input.className, 60), source: text(input.source, 60),
    enrolledAt: text(input.enrolledAt, 20) || dayStamp(), note: text(input.note, 200),
  }
  if (!student.name) throw new Error('学生姓名不能为空')
  const from = original ? { name: text(original.name, 40), grade: text(original.grade, 20) } : null
  const at = students.findIndex(row => (from ? sameStudent(row, from) : sameStudent(row, student)))
  if (at >= 0) {
    const old = students[at]
    students[at] = { ...old, ...student, createdAt: old.createdAt || nowStamp(), updatedAt: nowStamp() }
    if (from && (from.name !== student.name || from.grade !== student.grade)) renameLessonRows(root, from, student.name)
  } else {
    students.push({ ...student, createdAt: nowStamp(), updatedAt: nowStamp() })
  }
  writeTable(root, LAYOUT.students, STUDENT_COLUMNS, students.map(toStudentRow))
  return readStudents(root)
}

/** 改名：同班的课次记录跟着换姓名，历史不丢。 */
function renameLessonRows(root, from, nextName) {
  if (!from.name || !nextName || from.name === nextName) return
  const rows = readTable(root, LAYOUT.lessons).rows.map(toLesson)
  if (!rows.some(row => row.name === from.name)) return
  writeTable(root, LAYOUT.lessons, LESSON_COLUMNS, rows.map(row => toLessonRow(row.name === from.name ? { ...row, name: nextName } : row)))
}

export function removeStudent(root, { name, grade } = {}) {
  const students = readStudents(root)
  const target = students.find(row => text(row.name, 40) === text(name, 40) && (!grade || row.grade === text(grade, 20)))
  if (!target) return students
  const left = students.filter(row => row !== target)
  writeTable(root, LAYOUT.students, STUDENT_COLUMNS, left.map(toStudentRow))
  const lessons = readTable(root, LAYOUT.lessons).rows.map(toLesson)
  const kept = lessons.filter(row => row.name !== target.name)
  if (kept.length !== lessons.length) writeTable(root, LAYOUT.lessons, LESSON_COLUMNS, kept.map(toLessonRow))
  return readStudents(root)
}

// ---- 班课 ----

export function readClasses(root) {
  return readTable(root, LAYOUT.classes).rows.map(toClass).filter(row => row.name)
}

export function saveClass(root, input = {}, original = null) {
  const classes = readClasses(root)
  const name = text(input.name, 60)
  if (!name) throw new Error('班名不能为空')
  const total = Math.min(MAX_TOTAL, Math.max(1, Number(input.total) || DEFAULT_TOTAL))
  const klass = { name, time: text(input.time, 60), total, layers: parseLayers(input.layers), note: text(input.note, 200) }
  const from = original ? text(original, 60) : name
  const at = classes.findIndex(row => row.name === from)
  if (original == null && at >= 0) throw new Error('已经有一个同名的班')
  if (at < 0 && classes.some(row => row.name === name)) throw new Error('已经有一个同名的班')
  if (at >= 0) {
    const old = classes[at]
    classes[at] = { ...old, ...klass, createdAt: old.createdAt || nowStamp(), updatedAt: nowStamp() }
    if (from !== name) renameClassInFiles(root, from, name)
  } else {
    classes.push({ ...klass, createdAt: nowStamp(), updatedAt: nowStamp() })
  }
  writeTable(root, LAYOUT.classes, CLASS_COLUMNS, classes.map(toClassRow))
  return readClasses(root)
}

/** 改班名：学生档案和课次记录里引用的班名一起改。 */
function renameClassInFiles(root, from, nextName) {
  const students = readStudents(root).map(row => (row.className === from ? { ...row, className: nextName } : row))
  writeTable(root, LAYOUT.students, STUDENT_COLUMNS, students.map(toStudentRow))
  const lessons = readTable(root, LAYOUT.lessons).rows.map(toLesson).map(row => (row.className === from ? { ...row, className: nextName } : row))
  writeTable(root, LAYOUT.lessons, LESSON_COLUMNS, lessons.map(toLessonRow))
}

export function removeClass(root, name) {
  const target = text(name, 60)
  const classes = readClasses(root)
  if (!classes.some(row => row.name === target)) return classes
  const roster = readStudents(root).filter(row => row.className === target)
  if (roster.length) throw new Error('这个班还有学生，先把他们移出班再删')
  const lessons = readTable(root, LAYOUT.lessons).rows.map(toLesson).filter(row => row.className !== target)
  writeTable(root, LAYOUT.lessons, LESSON_COLUMNS, lessons.map(toLessonRow))
  const left = classes.filter(row => row.name !== target)
  writeTable(root, LAYOUT.classes, CLASS_COLUMNS, left.map(toClassRow))
  return readClasses(root)
}

/** 班级名册：学生档案里「班」等于班名的那些人。 */
export function rosterOf(students, className) {
  const target = text(className, 60)
  if (!target) return []
  return students.filter(row => row.className === target)
}

// ---- 课次记录 ----

export function readLessons(root, className) {
  const target = text(className, 60)
  const rows = readTable(root, LAYOUT.lessons).rows.map(toLesson)
  return target ? rows.filter(row => row.className === target) : rows
}

/**
 * 保存某一次课：一个学生一行，按「班 + 课次 + 姓名」覆盖更新。
 * 出勤 / 掌握 / 作业 非法值会被归一成第一个选项，不写脏数据。
 */
export function saveLessonRows(root, { className, no, date, rows = [] } = {}) {
  const target = text(className, 60)
  const klass = readClasses(root).find(row => row.name === target)
  if (!klass) throw new Error('先建班，再记课次')
  const at = Number(no)
  if (!Number.isInteger(at) || at < 1 || at > klass.total) throw new Error(`课次要在 1 到 ${klass.total} 之间`)
  const roster = new Set(rosterOf(readStudents(root), target).map(row => row.name))
  const all = readTable(root, LAYOUT.lessons).rows.map(toLesson)
  const stamp = nowStamp()
  const day = text(date, 20) || dayStamp()
  for (const row of rows) {
    const name = text(row?.name, 40)
    if (!name || !roster.has(name)) continue
    const attend = pick(row.attend, ATTEND_OPTIONS)
    const mastery = pick(row.mastery, MASTERY_OPTIONS)
    const homework = pick(row.homework, HOMEWORK_OPTIONS)
    const found = all.findIndex(item => item.className === target && item.no === at && item.name === name)
    // 三个都没点 = 还没记：已存在的记录清掉，不落一条假数据
    if (!attend && !mastery && !homework) {
      if (found >= 0) all.splice(found, 1)
      continue
    }
    const next = { className: target, no: at, date: day, name, attend, mastery, homework, note: text(row.note, 100), updatedAt: stamp }
    if (found >= 0) all[found] = next
    else all.push(next)
  }
  writeTable(root, LAYOUT.lessons, LESSON_COLUMNS, all.map(toLessonRow))
  return readLessons(root, target)
}

// ---- 聚合（页面直接用，不进 prompt） ----

/** 一个学生在这个班的大致进度：上到第几节、缺了几次、几次作业没交。 */
export function progressOf(student, klass, rows = []) {
  const mine = rows.filter(row => row.className === student.className && row.name === student.name)
  const done = [...new Set(mine.map(row => row.no))].length
  return {
    total: klass?.total ?? DEFAULT_TOTAL,
    done,
    present: mine.filter(row => row.attend === '到').length,
    missed: mine.filter(row => row.attend === '缺').length,
    homeworkMissing: mine.filter(row => row.homework === '未交').length,
  }
}

/** 按卡点层把名册分组：每个分层一组，没标层的单独一组。 */
export function groupByLayer(roster, layers = []) {
  const list = parseLayers(layers)
  const groups = list.map(layer => ({ layer, students: roster.filter(row => row.layer === layer) }))
  const rest = roster.filter(row => !list.includes(row.layer))
  if (rest.length) groups.push({ layer: '', students: rest })
  return groups
}

/** 一个学生的课次记录，按课次排好。 */
export function studentRecords(name, className, rows = []) {
  return rows
    .filter(row => row.name === text(name, 40) && (!className || row.className === className))
    .slice()
    .sort((a, b) => a.no - b.no)
}

