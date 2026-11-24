// 发版前手动跑一遍：读真实工作区，确认表头和条数正常（不写任何文件）。
// 用法：node scripts/check-workspace.mjs [工作区路径]
import { existsSync } from 'node:fs'
import { readCases, readChats } from '../src/chat.js'
import { readFeedback } from '../src/feedback.js'
import { readClasses, readLessons, readStudents } from '../src/students.js'
import { defaultRoot, readContent, readLeads } from '../src/workspace.js'

const root = process.argv[2] || defaultRoot()
if (!existsSync(root)) {
  console.log(`没有找到工作区：${root}`)
  process.exit(0)
}
const count = { leads: readLeads(root).length, students: readStudents(root).length, classes: readClasses(root).length, lessons: readLessons(root).length, chats: readChats(root).length, cases: readCases(root).length, feedback: readFeedback(root).length, content: readContent(root).length }
console.log(root)
console.log(count)
const bad = Object.entries(count).filter(([, n]) => Number.isNaN(n))
if (bad.length) {
  console.error('读取异常：', bad.map(([key]) => key).join(', '))
  process.exit(1)
}
