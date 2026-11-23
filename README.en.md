# Youtulh workbench

A DeepSeek Harness plugin. Capture an idea in one sentence, then generate the script, title, cover, images, and storyboard from it.

## Install

Requires DeepSeek Harness 0.2.x (`engines.dsh` is `>=0.2.1-rc.5 <0.3.0`).

Either of these, from the DSH **Plugins** page → install a plugin:

- npm: `dsh-youtulh-workbench`
- GitHub: `github:youtulh/dsh-youtulh-workbench`

## What it does

Five pages: **ideas**, **content**, **schedule**, **insights**, **styles**. An idea wall on the left; open any card to generate a spoken script, title, video cover, illustrations, and a six-panel line-art storyboard at once. Ask for a change in the dock and the page updates in place, with undo. Drag finished drafts onto the calendar, and check the numbers after publishing.

The interface is available in Chinese and English, following the DSH language by default.

Data lives on this machine at `~/.dsh/media-desk/state.json`; saved drafts are written to `~/Documents/Youtulh Workbench/`.

## Where it comes from

Built on [woniuniuniu/dsh-media-desk](https://github.com/woniuniuniu/dsh-media-desk) 2.7.2 (MIT, by 蜗牛的科技笔记). This fork renames the plugin, changes the palette, and drops the upstream marketplace index and promo pages. The interface design and the draft pipeline come from the original author; the original copyright notice stays in [LICENSE](LICENSE).

## License

MIT. See [LICENSE](LICENSE), which retains the upstream notice.
