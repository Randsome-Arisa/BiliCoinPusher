# BiliCoinPusher

B站自动投币工具。支持单视频、收藏夹、UP主全部视频、系列合集的批量投币。

## 项目架构

```
src/
├── config.ts          # 共享配置（选择器、延迟、路径常量）
├── browser.ts         # 浏览器上下文管理（自动检测 Chrome，自动判断登录态，stdin 防泄漏）
├── coin.ts            # 核心投币逻辑 donateCoin()
├── api.ts             # B站 API 调用（apiCall + wbiApiCall WBI 签名）
├── progress.ts        # coined.json 进度追踪（断点续投）
├── main.ts            # CLI 入口 + 批量编排（runBatch / runBatchPaged）
└── collectors/
    ├── types.ts       # Collector 接口（VideoInfo 含 pageNumber）
    ├── favorites.ts   # 收藏夹 → API /x/v3/fav/resource/list
    ├── uploader.ts    # UP主视频 → WBI 签名 API + DOM 点击翻页回退
    └── series.ts      # 合集 → API /x/polymer/web-space/seasons_archives_list
```

## 关键设计决策

- **浏览器自动检测**：不再硬编码 Chromium 路径，`browser.ts:detectBrowser()` 遍历常见路径
- **playwright-core**：不捆绑浏览器，依赖系统 Chrome/Edge，减小包体积
- **登录态自动管理**：`setup()` 内部判断 → 有 cookie 就 headless，没有就弹窗登录后切回 headless
- **WBI 签名**：`api.ts:wbiApiCall()` 完整实现 B站 WBI 签名（mixin key 派生 + MD5 签名）。首次调用时从 `/x/web-interface/nav` 获取 `img_key`/`sub_key`，派生 mixin key 并模块级缓存。UP主采集器的 API 路径优先使用 WBI 签名调用。
- **API → DOM 回退**：WBI 签名可能因 key 过期等原因失败，uploader 自动回退到页面 DOM 抓取。API 在第 N 页失败时，保留前 N-1 页已收集的视频，DOM 从第 N 页续抓（不丢弃已有数据）
- **DOM 点击翻页**：回退 DOM 抓取时，点击 B站空间页的「下一页」按钮（`.vui_pagenation--btn-side:last-child`）触发翻页，比 URL 参数 `?pn=N` 更可靠（后者不会触发 SPA 重新加载视频列表）
- **按页分组投币**：UP主投币前先将视频按 `pageNumber` 分组，每投完一页的视频后回到对应空间页「重置上下文」，再投下一页。避免浏览器长期停留导致投币弹窗不出现。`main.ts:runBatchPaged()` 实现
- **进程退出**：`browser.ts` 登录交互后 `process.stdin.pause()` 释放事件循环；`main.ts` 成功后显式 `process.exit(0)`，避免 stdin / Playwright 内部资源阻止进程退出
- **付费视频检测**：`.geetest_panel` 遮罩检测（导航后 + 点击前两道防线），遇到付费视频自动跳过不阻塞批量任务
- **转载视频处理**：copyright=2 只投 1 枚硬币（原创投 2 枚），不跳过
- **无每日投币上限**：B站不限制每天投币次数，"今日 20/50" 只是经验值上限

## 常用命令

```bash
npm run build                           # 编译 TypeScript
node dist/main.js coin <url>            # 单视频投币
node dist/main.js fav <fid>             # 收藏夹批量
node dist/main.js up <uid>              # UP主全部视频
node dist/main.js series <uid> <sid>    # 系列合集
```

选项：`--dry-run`（预览）、`--resume`（断点续投）、`--max <n>`（数量限制）、`--delay <ms>`（间隔）

## 发布流程

GitHub Actions（`.github/workflows/release.yml`）：push tag `v*` → 自动构建 Linux + Windows 便携 zip → 发布 Release

```bash
git tag v1.2.0 && git push origin v1.2.0
```

## 已知问题 / 待办

- 收藏夹采集器（favorites.ts）无 DOM 回退方案，API 彻底失败时无法降级
- 合集采集器（series.ts）DOM 回退仍使用 URL 参数翻页 `&pn=N`，与 uploader 一样可能无法触发 SPA 重载，应改用点击翻页
- WBI 签名密钥每天轮换，`MIXIN_KEY_ENC_TAB` 排列表如被 B站更新需同步修改 `api.ts`

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
- GitHub/git operations → invoke /github
