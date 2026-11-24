import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePastedTable } from '../src/host.js'

test('粘进来的学生名单：Tab 和逗号都认，带引号的备注不拆列', () => {
  const tab = parsePastedTable('姓名\t年级\t卡点层\n王小明\t高二\t动量\n李雷\t高一\t受力')
  assert.equal(tab.length, 3)
  assert.equal(tab[1][0], '王小明')
  const csv = parsePastedTable('\uFEFF姓名,年级,备注\n"王, 小明",高二,"做题慢, 但很认真"')
  assert.equal(csv[1][0], '王, 小明')
  assert.equal(csv[1][2], '做题慢, 但很认真')
})
