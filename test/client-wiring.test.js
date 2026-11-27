// 客户端接线：用到的版本 API 必须真的 import 进来。
// esbuild 不会对未定义变量报错（它按全局变量处理），少了 import 只会在渲染时 ReferenceError。
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const DIR = new URL('../client/', import.meta.url)

for (const file of readdirSync(DIR)) {
  if (!file.endsWith('.jsx')) continue
  const source = readFileSync(new URL(file, DIR), 'utf8')
  const imported = /import\s*\{([^}]*)\}\s*from\s*'\.\/version\.js'/.exec(source)?.[1] ?? ''
  for (const name of ['useVersionInfo', 'updateUrl']) {
    if (!source.includes(`${name}(`)) continue
    test(`${file}：用 ${name}() 之前先从 ./version.js import`, () => {
      assert.ok(imported.includes(name), `${file} 用了 ${name}()，却没从 ./version.js import`)
    })
  }
}

// 定位复盘：逻辑有、页面没有，曾经真的发生过；这里把「卡片必须接上」钉死。
const WIRING = {
  'setup.jsx': [
    ['reviewPositioning', '复盘逻辑'],
    ['<div className="md-review"', '复盘卡片'],
    ['fetchContent()', '读取内容库'],
    ['fetchLeads()', '读取线索'],
  ],
}
for (const [file, checks] of Object.entries(WIRING)) {
  const source = readFileSync(new URL(file, DIR), 'utf8')
  for (const [needle, label] of checks) {
    test(`${file}：${label}已接上`, () => {
      assert.ok(source.includes(needle), `${file} 缺少 ${label}（${needle}）`)
    })
  }
}

// 看数据要用的筛选/分页变量：清理旁支区块时误删过，钉一下
for (const needle of ['const q =', 'const list =', 'const pageRows =']) {
  test(`data.jsx：${needle} 已定义`, () => {
    const source = readFileSync(new URL('data.jsx', DIR), 'utf8')
    assert.ok(source.includes(needle), `data.jsx 缺少 ${needle}`)
  })
}

// 回私信收敛：不再给 AI 候选矩阵，只留人工台账和标准开头
test('dm.jsx：AI 回私信候选已移除，只留人工台账', () => {
  const source = readFileSync(new URL('dm.jsx', DIR), 'utf8')
  for (const needle of ['判断一下', '用这条', '再给一版', 'draftDm(', 'reviseDm(']) {
    assert.ok(!source.includes(needle), `dm.jsx 不应再出现 ${needle}`)
  }
  assert.ok(source.includes('记一条新线索'), 'dm.jsx 缺少人工台账入口')
  assert.ok(!source.includes('标准开头'), 'dm.jsx 不应再出现回复用的标准开头')
})

// 聊天台已经下线：页面里不应再出现「聊天台」或跳转入口
test('UI 里不再出现聊天台入口', () => {
  for (const file of ['index.jsx', 'students.jsx', 'funnel.jsx', 'welcome.jsx', 'setup.jsx', 'dm.jsx']) {
    const source = readFileSync(new URL(file, DIR), 'utf8')
    assert.ok(!source.includes('聊天台'), `${file} 里还有聊天台`)
    assert.ok(!source.includes('去聊天台'), `${file} 里还有去聊天台`)
  }
})
