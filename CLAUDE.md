# BiliCoinPusher

B站自动投币工具。支持单视频、收藏夹、UP主全部视频、系列合集的批量投币。

## 项目架构

```
src/
├── config.ts          # 共享配置（选择器、延迟、路径常量）
├── browser.ts         # 浏览器上下文管理（自动检测 Chrome，自动判断登录态）
├── coin.ts            # 核心投币逻辑 donateCoin()
├── api.ts             # B站 API 调用（page.evaluate fetch，复用 cookie）
├── progress.ts        # coined.json 进度追踪（断点续投）
├── main.ts            # CLI 入口 + 批量编排
└── collectors/
    ├── types.ts       # Collector 接口
    ├── favorites.ts   # 收藏夹 → API /x/v3/fav/resource/list
    ├── uploader.ts    # UP主视频 → API + DOM 抓取回退（WBI 签名问题）
    └── series.ts      # 合集 → API /x/polymer/web-space/seasons_archives_list
```

## 关键设计决策

- **浏览器自动检测**：不再硬编码 Chromium 路径，`browser.ts:detectBrowser()` 遍历常见路径
- **playwright-core**：不捆绑浏览器，依赖系统 Chrome/Edge，减小包体积
- **登录态自动管理**：`setup()` 内部判断 → 有 cookie 就 headless，没有就弹窗登录后切回 headless
- **API → DOM 回退**：B站 API 可能因 WBI 签名失败（-403/-352），uploader 和 series 自动回退到页面 DOM 抓取
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

- (无，暂时没有待解决的需求)

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
