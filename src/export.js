// 一键保存：把成稿写成一个普通文件夹，脚本、封面、配图和分镜都在里面。
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import { currentLang, tr } from './i18n.js'
import { buildDocx } from './word.js'

export function defaultExportDir() {
  // 已经有中文文件夹的老用户切到英文后继续用原来的文件夹
  const zh = join(homedir(), 'Documents', 'Youtulh 工作台')
  if (currentLang() !== 'en' || existsSync(zh)) return zh
  return join(homedir(), 'Documents', 'Youtulh Workbench')
}

export function resolveExportDir(value) {
  const dir = String(value ?? '').trim()
  if (!dir) return defaultExportDir()
  return dir.startsWith('~/') ? join(homedir(), dir.slice(2)) : dir
}

function folderName(title) {
  const clean = String(title ?? '').replace(/[\\/:*?"<>|\n\r\t]/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 60)
  return clean || tr('未命名')
}

/** 第一次保存时找一个还没人用的文件夹，标题相同的两篇不会写到一起。 */
function freeFolder(exportDir, title) {
  const base = folderName(title)
  for (let n = 1; ; n++) {
    const dir = join(exportDir, n === 1 ? base : `${base} ${n}`)
    if (!existsSync(dir)) return dir
  }
}

function digest(text) {
  return createHash('sha256').update(text).digest('hex')
}

function stamp(date) {
  const two = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
}

function cell(text) {
  return String(text ?? '').replace(/\|/g, '｜').replace(/\n/g, ' ')
}

/**
 * 把一份产出写成本地文件：同名文件夹里一份 Word、一份 Markdown。
 * 口播稿、私信话术、复盘结论都走这一条，保证用户拿到的是能打开的文件。
 * @returns {Promise<{dir: string, files: string[]}>}
 */
export async function savePiece({ dir, title, text, formats = ['docx', 'md'] }) {
  const root = resolveExportDir(dir)
  const base = folderName(title)
  const target = join(root, base)
  await mkdir(target, { recursive: true })
  const files = []
  const lines = String(text ?? '').split(/\r?\n/)
  if (formats.includes('docx')) {
    const name = `${base}.docx`
    await writeFile(join(target, name), buildDocx({ title, lines }))
    files.push(name)
  }
  if (formats.includes('md')) {
    const name = `${base}.md`
    await writeFile(join(target, name), `# ${title}\n\n${String(text ?? '').trim()}\n`)
    files.push(name)
  }
  if (formats.includes('txt')) {
    const name = `${base}.txt`
    await writeFile(join(target, name), `${String(text ?? '').trim()}\n`)
    files.push(name)
  }
  if (formats.includes('csv')) {
    const name = `${base}.csv`
    await writeFile(join(target, name), `${String(text ?? '').trim()}\n`)
    files.push(name)
  }
  return { dir: target, files }
}

/**
 * 发布包：一条内容交给助理就能直接发。标题、短标题、标签、说明文案和发布顺序都在一张纸上，
 * 助理不用回头问任何问题。
 */
export function publishPackage(production, en = currentLang() === 'en') {
  const tags = (production.tags ?? []).filter(Boolean)
  const hashtags = tags.length ? tags.map(tag => `#${tag}`).join(' ') : en ? '(none yet)' : '（还没生成）'
  const caption = production.caption?.trim() || (en ? '(not written yet — ask the assistant for a caption)' : '（还没生成，到成稿里让助手写一版说明文案）')
  const lines = en
    ? [
      `[Publish package] ${production.title}`,
      '',
      'Video: (put the finished video in this folder)',
      '',
      'Title (TikTok / Channels):',
      production.title,
      '',
      'Rednote title (within 20 characters):',
      production.xhsTitle?.trim() || production.title,
      '',
      'Hashtags:',
      hashtags,
      '',
      'Caption (paste as-is on every platform):',
      caption,
      '',
      'Publish order: TikTok → Channels → Rednote (one version, no rewrites)',
    ]
    : [
      `【发布包】${production.title}`,
      '',
      '视频：（成片放本文件夹）',
      '',
      '标题（抖音/视频号通用）：',
      production.title,
      '',
      '小红书标题备选（20 字内）：',
      production.xhsTitle?.trim() || production.title,
      '',
      '话题标签：',
      hashtags,
      '',
      '说明文案（三个平台正文，直接粘）：',
      caption,
      '',
      '发布顺序：抖音 → 视频号 → 小红书（同一版，不改编）',
    ]
  return `${lines.join('\n')}\n`
}

/**
 * @param {{filesDir: string, exportDir: string, videoCover?: Buffer}} options - 素材目录、保存位置和合成好的视频封面。
 * @returns {Promise<{path: string, files: string[], hashes: Record<string, string>, backups: string[]}>} 文件夹路径、写入的文件名、稿子的指纹，以及这次留下的备份。
 */
export async function saveProduction(production, { filesDir, exportDir, videoCover }) {
  // 英文界面用纯 ASCII 文件名，方便在别的系统和工具里打开
  const en = currentLang() === 'en'
  const names = en
    ? { cover: 'cover-original', videoCover: 'video-cover.jpg', figure: i => `figure-${i}`, shot: n => `shot-${n}`, script: 'script.md', board: 'storyboard.md', publish: 'publish-package.txt' }
    : { cover: '封面原图', videoCover: '视频封面.jpg', figure: i => `配图${i}`, shot: n => `分镜${n}`, script: '脚本.md', board: '分镜脚本.md', publish: '发布包.txt' }
  const target = production.savedPath || freeFolder(exportDir, production.title)
  await mkdir(target, { recursive: true })
  const files = []
  const hashes = {}
  const backups = []

  // 文件夹里的稿子和上次保存的不一样，说明在外面改过：先另存一份，再写新的
  const writeText = async (file, text) => {
    const path = join(target, file)
    const old = await readFile(path, 'utf8').catch(() => null)
    if (old !== null && old !== text && digest(old) !== production.savedHashes?.[file]) {
      const backup = `${file.slice(0, -extname(file).length)}.${en ? 'edited' : '手改备份'}-${stamp(new Date())}${extname(file)}`
      await rename(path, join(target, backup))
      backups.push(backup)
    }
    await writeFile(path, text)
    hashes[file] = digest(text)
    files.push(file)
  }

  const copy = async (asset, name) => {
    const match = /^media-desk\/files\/([\w.-]+)$/.exec(asset?.src ?? '')
    if (!match) return null
    const file = `${name}${extname(match[1])}`
    await copyFile(join(filesDir, match[1]), join(target, file))
    files.push(file)
    return file
  }

  const cover = await copy(production.cover, names.cover)
  if (videoCover) {
    await writeFile(join(target, names.videoCover), videoCover)
    files.push(names.videoCover)
  }
  const figures = []
  for (const [i, image] of (production.images ?? []).entries()) {
    figures.push({ image, file: await copy(image, names.figure(i + 1)) })
  }
  const shots = []
  for (const [i, shot] of (production.shots ?? []).entries()) {
    shots.push({ shot, file: await copy(shot, names.shot(String(i + 1).padStart(2, '0'))) })
  }

  // 配图放回对应小标题那一节的末尾
  const sections = String(production.article ?? '').split(/\n(?=##\s)/)
  const unplaced = []
  for (const { image, file } of figures) {
    if (!file) continue
    const line = `\n\n![${image.caption ?? ''}](${file})`
    const at = sections.findIndex(part => image.anchor && part.startsWith(`## ${image.anchor}`))
    if (at >= 0) sections[at] = `${sections[at].trimEnd()}${line}\n`
    else unplaced.push(line)
  }
  const article = `# ${production.title}\n\n${sections.join('\n')}${unplaced.join('')}\n`
  await writeText(names.script, article)

  if (shots.length) {
    const seconds = value => (value === undefined || value === null ? '' : en ? `${value}s` : `${value} 秒`)
    const rows = shots.map(({ shot, file }, i) => `| ${i + 1} | ${cell(shot.shot)} | ${seconds(shot.seconds)} | ${cell(shot.visual)} | ${cell(shot.voice)} | ${file ? `![](${file})` : ''} |`)
    const heading = en ? `# ${production.title}: storyboard\n\n| Shot | Size | Length | Visual | Voice-over | Frame |` : `# ${production.title}：分镜头脚本\n\n| 镜号 | 景别 | 时长 | 画面 | 口播 | 分镜图 |`
    await writeText(names.board, `${heading}\n| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`)
  }
  await writeText(names.publish, publishPackage(production, en))
  return { path: target, files, hashes, backups }
}
