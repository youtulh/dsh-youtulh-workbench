# Youtulh workbench

A DeepSeek Harness plugin: one workbench for people who publish. Capture a topic in one sentence, generate the whole draft, triage a parent's DM, and check what actually brought people in.

## Install

Requires DeepSeek Harness 0.2.x (`engines.dsh` is `>=0.2.1-rc.5 <0.3.0`).

Either of these, from the DSH **Plugins** page → install a plugin:

- npm: `dsh-youtulh-workbench`
- GitHub: `github:youtulh/dsh-youtulh-workbench`

## Six pages

| Page | What it does |
|---|---|
| Ideas | Notes, links, images, videos, and quotes, one card each. Record a pain point and a shooting stage (not shot / shot / published); click the chip to move on |
| DMs | Paste a parent's message → decide who they are and what they ask → two replies (one that catches them, one that moves them to the next step) → seven ledger fields extracted → saved to the lead list |
| Content | The draft workspace: title, script, cover, illustrations, and a six-panel storyboard fill in together. Ask for a change on the left, the right side updates, with undo |
| Schedule | Drag finished drafts onto the calendar |
| Insights | Record views, DMs, WeChat adds, and trial bookings; two rankings — what travels, and what actually brings people in |
| Styles | A **positioning card** on top (only do / never do / wording / red lines), then the writing styles and rules learned from your own account |

## Three things you will notice

**Positioning card** — fill it once and it governs three places: topics must come from "only do", drafts follow the wording, DM replies never cross the red lines.

**Publish package** — a finished draft shows three publishing fields under the title (Rednote short title, hashtags, a three-platform caption), with one button to copy the whole sheet. Saving also writes `publish-package.txt` with title, short title, hashtags, caption, and publishing order.

**Lead list** — each triaged DM becomes a row: name, grade, school, pain point, source, next step. Click the next step to move it along, and copy the whole list as CSV.

The interface is available in Chinese and English, following the DSH language by default. Data lives at `~/.dsh/media-desk/state.json`; saved drafts go to `~/Documents/Youtulh Workbench/`.

## Development

```bash
node scripts/build.mjs          # bundle client/ into dist/client.js
node scripts/build.mjs --watch  # keep rebuilding while editing the UI
node --test test/*.test.js      # tests
```

`client/` is the UI (JSX), `src/` is the host half (Node ESM), and `dist/client.js` is build output, not committed.

Rebuild and refresh the page for UI changes. Host changes need the plugin reinstalled or toggled once to reload.

## License

MIT. See [LICENSE](LICENSE).
