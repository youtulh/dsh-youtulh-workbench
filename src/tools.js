// 注册给对话里 agent 的工具：产出落盘、线索入表。
// agent 在聊天里写好东西后调用这两个工具，文件就真的写到工作区，聊天里也留一份。
import { join } from 'node:path'
import { LAYOUT, LEAD_STAGES, appendLead, dayStamp, ensureLayout, folderName, recordContent, resolveRoot } from './workspace.js'
import { savePiece } from './export.js'

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const textResult = value => [{ type: 'text', text: value }]

const SUBDIR = { content: LAYOUT.content, dm: LAYOUT.dm, data: LAYOUT.data }

export function createTools({ settings }) {
  const root = async () => resolveRoot((await settings.read()).saveRoot)

  const save = {
    name: 'youtulh_save_output',
    description: '把做好的内容写到用户的工作区。口播稿、私信话术、复盘结论都走这个工具：它会在 内容/私信/数据 下建一个「日期 标题」的文件夹，写一份 Word（.docx）和一份 Markdown（.md），返回文件和路径。写完把路径告诉用户。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'title', 'text'],
      properties: {
        kind: str('产出类型', { enum: ['content', 'dm', 'data'] }),
        title: str('标题，会成为文件夹和文件名，不要带 / 等路径字符'),
        text: str('正文。一句话一行，直接是最终稿，不要放 Markdown 代码块'),
        formats: { type: 'array', items: { type: 'string', enum: ['docx', 'md', 'txt', 'csv'] }, description: '要写哪些格式，默认 docx + md；纯数据可以用 csv' },
      },
    },
    timeoutMs: 30_000,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['dir', 'files'],
        properties: { dir: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } },
      },
      render: (_args, value) => textResult(`已写入 ${value.dir}：${value.files.join('、')}`),
    },
    async execute(args) {
      const content = String(args.text ?? '').trim()
      if (!content) throw new Error('text 不能为空')
      const base = await root()
      ensureLayout(base)
      const title = `${dayStamp()} ${folderName(args.title)}`
      const saved = await savePiece({ dir: join(base, SUBDIR[args.kind] ?? LAYOUT.content), title, text: content, formats: args.formats?.length ? args.formats : ['docx', 'md'] })
      // 助手在对话里写的稿子也登记进内容库，别让数据断链
      if (args.kind === 'content') {
        try {
          recordContent(base, {
            '日期': dayStamp(), '批次': '', '选题': args.title, '标题': args.title,
            '标签': '', '采用': '未定', '平台': '', '发布日': '', '播放': '', '涨粉': '', '私信': '', '加微': '',
            '爆款': '', '分数': '', '目录': saved.dir, '备注': '',
          })
        } catch { /* 登记失败不影响写文件 */ }
      }
      return { dir: saved.dir, files: saved.files }
    },
  }

  const lead = {
    name: 'youtulh_append_lead',
    description: '往用户的线索表（线索表.csv）追加一行。分诊完一条私信就调用一次：私信里没说过的字段留空，不要编造。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['raw'],
      properties: {
        raw: str('私信原文'),
        name: str('家长姓名，没说就留空'),
        grade: str('孩子年级，没说就留空'),
        school: str('学校，没说就留空'),
        painPoint: str('卡点：哪一章、什么症状'),
        source: str('来源：哪条视频带来的'),
        stage: str('漏斗阶段：私信 / 已加微信 / 已进群 / 约试听 / 已报课 / 流失', { enum: LEAD_STAGES }),
        next: str('具体下一步：比如「周四晚 8 点试听」「发补漏清单」；没有就留空'),
        nextAt: str('下次跟进日期，YYYY-MM-DD；没定就留空'),
        followUps: { type: 'number', description: '已经跟进过几次；没跟过就不填' },
        draft: str('实际发给家长的那段话术（选中的那条），没有就留空'),
        type: str('类型：家长 / 学生本人 / 同行 / 广告'),
        category: str('分类：A 价格 / B 能不能提分 / C 怎么补 / D 时间形式'),
      },
    },
    timeoutMs: 15_000,
    output: {
      schema: { type: 'object', additionalProperties: false, required: ['path'], properties: { path: { type: 'string' } } },
      render: (_args, value) => textResult(`已追加到 ${value.path}`),
    },
    async execute(args) {
      const base = await root()
      const path = appendLead(base, { ...args, createdAt: new Date().toISOString() })
      return { path }
    },
  }

  return [save, lead]
}
