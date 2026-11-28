// 卷子文本提取与拆题提示词。图片/扫描件不假装能读：明确报错，交回人工或助手。
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'

export const PAPER_EXTS = ['.pdf', '.docx', '.txt', '.md', '.csv', '.jpg', '.jpeg', '.png', '.webp']

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 20 * 1024 * 1024, timeout: 120000 }, (error, stdout) => error ? reject(error) : resolve(String(stdout ?? '')))
  })
}

export async function extractPaperText(file, ext = extname(file).toLowerCase()) {
  if (['.txt', '.md', '.csv'].includes(ext)) return (await readFile(file, 'utf8')).trim()
  if (ext === '.docx') {
    // macOS 自带 textutil；其他平台再退到 mammoth（如果装了）
    try { return (await run('textutil', ['-convert', 'txt', '-stdout', file])).trim() } catch { /* 继续试 mammoth */ }
    try {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ path: file })
      return String(result.value ?? '').trim()
    } catch { throw new Error('Word 解析失败：先把卷子另存为 txt，或把文字粘进来') }
  }
  if (ext === '.pdf') {
    // 先用系统 pdftotext（如果装了）；mac 上再用 PDFKit 小脚本
    try { return (await run('pdftotext', ['-layout', file, '-'])).trim() } catch { /* 继续 */ }
    if (process.platform === 'darwin') {
      const script = join(tmpdir(), 'youtulh-pdf-text.swift')
      await writeFile(script, `import Foundation\nimport PDFKit\nlet url = URL(fileURLWithPath: CommandLine.arguments[1])\nif let doc = PDFDocument(url: url) { for i in 0..<doc.pageCount { if let page = doc.page(at: i), let text = page.string { print(text) } } }\n`)
      const text = await run('swift', [script, file])
      if (text.trim()) return text.trim()
    }
    throw new Error('这份 PDF 没读到文字（可能是扫描件）：请把 PDF 发到对话里由助手识别，或把文字粘进来')
  }
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    throw new Error('图片/扫描件暂不自动识别：请把图片发到对话里由助手识别，或上传 PDF / Word / 文本')
  }
  throw new Error('这份文件类型暂时不能拆题')
}

export function paperExtractPrompt(text, paper = {}) {
  const system = `你是教研助理，只做一件事：把一份真实试卷拆成题目，原样保留，不改编、不补题、不猜答案。
规则：
- 逐题输出，题干和选项照原文，不要改写成自己的话；
- 只拆试卷里真实存在的题，不要新增题目；
- 选择题给四个选项和正确答案（A/B/C/D）；答案或解析在原卷里没有就留空；
- 每道题给知识点（具体到「章—节」，如「氧化还原—化合价」）和难度（基础 / 中档 / 期中 / 压轴）；
- 公式、符号保留原文；不确定的题标 "unclear": true，不要猜；
- 只输出 JSON 数组，不要 Markdown：
[{"type":"选择","stem":"","options":["","","",""],"answer":"A","explain":"","knowledge":"","difficulty":"中档","unclear":false}]`
  const user = `卷子：${paper.name || ''}
学科：${paper.subject || ''} 年级：${paper.grade || ''} 学期：${paper.term || ''} 地区：${paper.region || ''} 年份：${paper.year || ''}

原文：
${String(text ?? '').slice(0, 60000)}

请拆题。`
  return { system, user }
}
