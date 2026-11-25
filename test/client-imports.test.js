import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const dir = new URL('../client/', import.meta.url).pathname
const files = readdirSync(dir).filter(name => name.endsWith('.jsx'))

test('客户端组件用到的 useDesk / useLang / t 必须真的导入（防上次那种崩页）', () => {
  for (const name of files) {
    const src = readFileSync(join(dir, name), 'utf8')
    // 多行 import 也要认：先把所有 import 块拼起来
    const imports = [...src.matchAll(/import[\s\S]*?from\s+['"][^'"]+['"]/g)].map(match => match[0]).join('\n')
    const checks = [
      [/\buseDesk\s*\(/, 'useDesk'],
      [/\buseLang\s*\(/, 'useLang'],
      [/\bt\s*\(/, 't'],
    ]
    for (const [used, symbol] of checks) {
      if (!used.test(src)) continue
      assert.match(imports, new RegExp(`\\b${symbol}\\b`), `${name} 用了 ${symbol} 但没导入`)
    }
  }
})
