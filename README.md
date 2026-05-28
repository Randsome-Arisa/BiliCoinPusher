# BiliCoinPusher

B站自动投币工具。支持单视频、收藏夹、UP主全部视频、系列合集的批量投币。

## 快速开始

```bash
# 1. 安装依赖
npm install --registry=https://registry.npmmirror.com

# 2. 编译
npm run build

# 3. 运行（首次会自动打开浏览器供登录）
node dist/main.js coin https://www.bilibili.com/video/BV18W41197De/
```

程序会自动判断登录状态：首次运行打开浏览器供扫码登录，后续运行在后台静默执行。登录 cookie 保存在 `browser-profile/` 目录。

## 命令一览

| 命令 | 用途 | 示例 |
|------|------|------|
| `coin <url>` | 单个视频投币 | `node dist/main.js coin https://www.bilibili.com/video/BV18W41197De/` |
| `fav <media-id>` | 收藏夹全部视频 | `node dist/main.js fav 123456` |
| `up <uid>` | UP主全部视频 | `node dist/main.js up 325864133` |
| `series <uid> <sid>` | 指定合集视频 | `node dist/main.js series 110683415 1524815` |

## 常用选项

| 选项 | 作用 | 示例 |
|------|------|------|
| `--dry-run` | 预览模式，只列出视频不投币 | `--dry-run` |
| `--resume` | 断点续投，跳过已投过的视频 | `--resume` |
| `--max <n>` | 本次最多投 n 个币 | `--max 10` |
| `--delay <ms>` | 视频间延迟毫秒数（默认 3000） | `--delay 5000` |

## 使用示例

### 给收藏夹投币

```bash
# 先预览收藏夹中有哪些视频
node dist/main.js fav 123456 --dry-run

# 确认无误后正式投币，一次最多 10 个
node dist/main.js fav 123456 --max 10 --resume
```

**如何获取收藏夹 media_id？** 打开 B站收藏夹页面，URL 中的数字就是 `media_id`：
```
https://space.bilibili.com/123456/favlist?fid=789012
                                        ↑ 这个 789012 就是 media_id
```

### 给 UP主投币

```bash
# 预览 UP主 325864133 的视频列表
node dist/main.js up 325864133 --dry-run

# 正式投币
node dist/main.js up 325864133 --resume --max 5
```

**如何获取 UP主 UID？** 打开 UP主空间页，URL 中的数字就是 UID：
```
https://space.bilibili.com/325864133
                          ↑ 这个就是 UID
```

### 给系列合集投币

```bash
# 预览合集
node dist/main.js series 110683415 1524815 --dry-run

# 正式投币
node dist/main.js series 110683415 1524815 --resume
```

**如何获取 series_id？** 打开合集页面，URL 中 `sid=` 后面的数字：
```
https://space.bilibili.com/110683415/channel/collectiondetail?sid=1524815
                                                        ↑ 这个就是 series_id
```

## 进阶技巧

### 组合选项的典型用法

```bash
# 每天给 UP主最新 3 个视频投币，跳过已投过的
node dist/main.js up 325864133 --resume --max 3

# 给大型收藏夹分批投币，每次 10 个，间隔 5 秒
node dist/main.js fav 789012 --resume --max 10 --delay 5000
```

### 断点续投

`--resume` 选项使用 `coined.json` 文件记录已投币的视频。如果脚本中断（网络断开、电脑休眠等），再次运行同样的命令会自动跳过已投过的视频：

```bash
# 第一次运行：投了 5 个后中断
node dist/main.js up 325864133 --resume --max 50

# 再次运行：自动跳过头 5 个，从第 6 个继续
node dist/main.js up 325864133 --resume --max 50
```

## 目录结构

```
src/
├── config.ts          # 共享配置
├── browser.ts         # 浏览器上下文管理（自动判断登录态/headless）
├── coin.ts            # 核心投币逻辑
├── api.ts             # B站 API 调用
├── progress.ts        # 投币进度追踪
├── main.ts            # CLI 入口
└── collectors/
    ├── types.ts       # Collector 接口
    ├── favorites.ts   # 收藏夹采集器
    ├── uploader.ts    # UP主视频采集器
    └── series.ts      # 合集采集器
```

## 环境要求

- Node.js >= 18
- Chromium（snap 安装：`snap install chromium`）
- Linux（仅支持 Linux，`/snap/bin/chromium` 路径）

## 常见问题

**Q: 提示"未检测到登录状态"？**  
A: 程序会自动打开浏览器供登录，扫码登录后按 Enter 即可。cookie 会保存下来，后续运行无需再次登录。

**Q: 投币数量有限制吗？**  
A: 有。B站每天允许的投币数量取决于账号等级（通常 1-3 个/天）。脚本检测到"已达上限"后会自动停止。

**Q: 转载视频能投币吗？**  
A: 不能。B站只允许给原创视频投币，脚本会自动跳过转载视频。
