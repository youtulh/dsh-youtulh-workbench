// 生成后的红线兜底：不靠提示词，命中就改；改不掉的返回问题，交给界面标出来。
const RULES = [
  [/(保证|承诺)[^。！？\n]{0,12}(提分|提升|涨分|上\d+分)/g, '通常会有提升'],
  [/(包过|保过|必过|一定能上)/g, '跟着练'],
  [/(提分|提高)\s*\d+\s*分/g, '提升'],
  [/最(好|强|快|有效|专业)/g, '比较'],
  [/(第一|唯一|绝对|百分百|100%|百分之百)/g, '通常'],
  [/(多少钱|价格|报价|课时费)/g, '费用'],
  [/(微信号|手机号|电话|二维码)/g, '联系方式'],
]

export function scanRedlines(text) {
  const value = String(text ?? '')
  const issues = []
  for (const [re, why] of RULES) {
    re.lastIndex = 0
    if (re.test(value)) issues.push(why)
  }
  return [...new Set(issues)]
}

export function fixRedlines(text) {
  let value = String(text ?? '')
  for (const [re, replacement] of RULES) value = value.replace(re, replacement)
  return { text: value, warnings: scanRedlines(value) }
}

export function fixScript(script = {}) {
  const out = { ...script }
  const warnings = []
  for (const key of ['title', 'script', 'comment', 'dm']) {
    if (!out[key]) continue
    const fixed = fixRedlines(out[key])
    out[key] = fixed.text
    warnings.push(...fixed.warnings)
  }
  out.warnings = [...new Set(warnings)]
  return out
}
