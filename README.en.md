# Youtulh workbench

A DeepSeek Harness plugin: a traffic tool for teachers who run small online classes — **answer DMs, make content, read the numbers**. Nothing is hidden in a database: everything you make is written as files on your own machine, openable in Word and Excel.

## Install

Requires DeepSeek Harness 0.2.x (`engines.dsh` is `>=0.2.1-rc.5 <0.3.0`).

- npm: `dsh-youtulh-workbench` from the DSH **Plugins** page
- GitHub: `github:youtulh/dsh-youtulh-workbench`

## First run: a six-question survey

1. Six questions — subject, grade, city, what your students struggle with, who you do not take, what parents say most
2. A summary screen: this is your positioning
3. Then straight into your first spoken-video script

Afterwards the home page is a three-step workflow.

## Three things it does

| Feature | What it does | What it leaves behind |
|---|---|---|
| **Answer DMs** | Paste a parent's message → decide who they are and what they ask → two replies (one that catches them, one that moves them to WeChat) → seven ledger fields | A Word file under `私信/<date name>/`, plus a row in `线索表.csv` |
| **Make content** | Spoken video only. Write one line of your own → 3 drafts; or pick from 10 topics → 3 versions each; edit by hand or type one line to revise the set; keep the one you like | `.docx` + `.md` under `内容/<date title>/` |
| **Read the numbers** | Record views, DMs, WeChat adds, trial bookings → two rankings | `数据/复盘 <date>.csv` |

Plus **我的产出** (list the real files in your workspace, preview and reveal them) and **我的设定** (edit `我的设定.md` visually, or edit the file directly and refresh).

## Where your data lives

```
~/Documents/Youtulh 工作台/
├── 我的设定.md
├── 线索表.csv
├── 内容/<date title>/
├── 私信/<date name>/
└── 数据/复盘 <date>.csv
```

The folder is configurable. Files are the only source of truth.

## Red lines, applied to every generation

No promised score gains, no guarantees, no prices, no invented facts about a child.

## Development

```bash
node scripts/build.mjs
node scripts/build.mjs --watch
node --test test/*.test.js
```

Word export (`src/word.js`) has no third-party dependency: it writes the zip container and WordprocessingML by hand.

## License

MIT. See [LICENSE](LICENSE).
