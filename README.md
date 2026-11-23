# Youtulh 工作台

DeepSeek Harness 的一个插件。一句话记灵感，一键做出脚本、封面、配图和分镜。

## 安装

需要 DeepSeek Harness 0.2.x（`engines.dsh` 要求 `>=0.2.1-rc.5 <0.3.0`）。

两种装法，任选一种：

- **从 npm**：打开 DSH 的 **插件** 页 → 安装插件 → 输入 `dsh-youtulh-workbench`
- **从 GitHub**：插件页 → 安装插件 → 输入 `github:youtulh/dsh-youtulh-workbench`

装完在侧栏会出现「Youtulh 工作台」。

## 它是什么

侧栏里的一个页面。打开是一面灵感墙，一句话记一个灵感；点开任何一条，一键生成口播脚本、标题、视频封面、配图和黑白线稿分镜；左边聊一句，右边就改。做好的稿子拖到日历上排期，发布之后回来看数据。

五个页面：

| 页面 | 做什么 |
|---|---|
| 灵感 | 文字、链接、图片、视频、金句，贴进来就是一张卡片；相关的灵感会自己凑到一起 |
| 内容 | 成稿工作区：标题、脚本、封面、配图、六格分镜，整页一起长出来，说一句就改，每一步能撤销 |
| 排期 | 拖到日历上排期 |
| 复盘 | 发布后回看数据 |
| 风格 | 风格库，按博主类型分板块；也可以抓自己的账号生成专属风格 |

界面有中文和英文，默认跟随 DSH 的语言，也可以在插件设置里固定。网页版在手机浏览器里也能打开。

数据存在本机 `~/.dsh/media-desk/state.json`，桌面端和网页端读同一份。保存成稿时写到 `~/Documents/Youtulh 工作台/`。

## 它从哪儿来

这个插件基于 [woniuniuniu/dsh-media-desk](https://github.com/woniuniuniu/dsh-media-desk) 2.7.2（MIT 许可，作者「蜗牛的科技笔记」）二次开发：改了名字、配色和发布信息，另外清理了上游的插件市场索引和宣传页。

界面的主要设计和成稿流水线来自上游，这部分功劳是原作者的。原始版权声明保留在 [LICENSE](LICENSE) 里，按 MIT 的要求不能移除。

## 开发

```bash
node scripts/build.mjs          # 把 client/ 打包成 dist/client.js
node scripts/build.mjs --watch  # 改界面时挂着跑，然后刷新页面
node --test test/*.test.js      # 测试
```

`client/` 是界面源码（JSX），`src/` 是宿主半边（Node ESM），`dist/client.js` 是构建产物、不入库。

改界面：构建 → 刷新页面即可。改 `src/`：需要重启 DSH 才生效。

## 许可证

MIT。见 [LICENSE](LICENSE)，其中包含上游的版权声明。
