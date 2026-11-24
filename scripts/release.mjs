// 发版：改版本号 → 跑测试 → 构建 → 提交 → 打标签 → 推。标签和版本号永远一致。
// 用法：node scripts/release.mjs 0.11.35 "0.11.35：这次改了什么"
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const version = String(args[0] ?? '').trim().replace(/^v/, '')
const message = args.slice(1).join(' ').trim()
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('用法：node scripts/release.mjs <x.y.z> "提交说明"')
  process.exit(1)
}

const read = file => JSON.parse(readFileSync(file, 'utf8'))
const write = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)

const pkg = read('package.json')
const previous = pkg.version
if (version === previous) {
  console.error(`版本号还是 ${previous}，没有变`)
  process.exit(1)
}
pkg.version = version
write('package.json', pkg)

const lock = read('package-lock.json')
lock.version = version
if (lock.packages?.['']) lock.packages[''].version = version
write('package-lock.json', lock)

const node = process.execPath
const run = (file, argv) => execFileSync(file, argv, { stdio: 'inherit' })
run(node, ['--test', 'test/*.test.js'])
run(node, ['scripts/build.mjs'])

const tag = `v${version}`
const text = message || `${version}：发版`
run('git', ['add', '-A'])
run('git', ['commit', '-q', '-m', text])
run('git', ['tag', tag])
run('git', ['push', 'origin', 'main', '-q'])
run('git', ['push', 'origin', tag, '-q'])

// 推完再核一次：标签必须指向当前提交，版本号必须和标签一致
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const tagged = execFileSync('git', ['rev-list', '-n', '1', tag], { encoding: 'utf8' }).trim()
const built = read('package.json').version
if (head !== tagged || built !== version) {
  console.error(`发布自检失败：HEAD=${head} tag=${tagged} version=${built}`)
  process.exit(1)
}
console.log(`\n已发布 ${tag}（${previous} → ${version}），等 CI 发 npm。`)
