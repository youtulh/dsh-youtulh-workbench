// 产出库：做出来的东西落成本地文件，这里只记路径和元信息，不复制文件。
// 存在 $DSH_HOME/youtulh-workbench/works.json；文件被删了也能看出来（missing）。
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const dataDir = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'youtulh-workbench')
const libraryFile = () => join(dataDir(), 'works.json')

export function readWorks() {
  try {
    const data = JSON.parse(readFileSync(libraryFile(), 'utf8'))
    return Array.isArray(data.works) ? data.works : []
  } catch {
    return []
  }
}

function writeWorks(works) {
  mkdirSync(dataDir(), { recursive: true })
  const tmp = `${libraryFile()}.${process.pid}`
  writeFileSync(tmp, `${JSON.stringify({ works }, null, 2)}\n`)
  renameSync(tmp, libraryFile())
}

/**
 * 登记一份产出。同一个目录重复登记算同一份，只更新内容和时间。
 * @param {{kind: string, title: string, summary?: string, dir: string, files: string[], content?: string}} work
 */
export function addWork({ kind, title, summary = '', dir, files = [], content = '' }) {
  const works = readWorks()
  const old = works.find(row => row.dir === dir)
  const next = {
    id: old?.id || randomUUID().slice(0, 8),
    kind,
    title,
    summary,
    dir,
    files,
    // 页面上的预览用：只放纯文本，Word 文件不在浏览器里解析
    content: String(content ?? '').slice(0, 20000),
    createdAt: old?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  writeWorks([next, ...works.filter(row => row !== old)])
  return next
}

export function removeWork(id) {
  const works = readWorks()
  const next = works.filter(row => row.id !== id)
  if (next.length === works.length) return false
  writeWorks(next)
  return true
}

/** 展示用：标出文件是否还在。 */
export const listWorks = () => readWorks().map(work => ({
  ...work,
  missing: !work.files.some(name => existsSync(join(work.dir, name))),
}))
