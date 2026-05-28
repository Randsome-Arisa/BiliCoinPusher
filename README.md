# BiliCoinPusher 简介
作为一个长期 B 站用户，我经常用B站刷各种有趣的视频，但作为一个手头并不宽裕的学生，养成了在互联网上尽可能白嫖资源的习惯，因此即使看到很多优秀的 up 做出的十分优秀的视频，也经常忘记投币点赞鼓励他们。

每次回想起来都觉得不太好意思，想要补上硬币，但是一个个点开看过的视频，点击投币按钮却又实在是麻烦的不行，正值最近利用 agent 工具 vibe coding 十分火热，因此我尝试利用 claude code + deepseek V4 pro 开发了这个自动化投币脚本工具 BiliCoinPusher，可以消除白嫖的愧疚 -0- 如果你也有和我一样的想法，欢迎~~白嫖~~使用 BiliCoinPusher~

BiliCoinPusher 支持单视频、收藏夹、UP主全部视频、系列合集的批量投币。
这**不是**一个刷币黑产工具，而是一个**尊重平台规则的用户效率工具**。它不自动发现内容、不伪造身份、不突破限制——只是帮你把「手动点开 50 个视频逐个投币」这件事自动化了。核心理念：**慢就是安全**。为了不触发B站的检测规则，每次投币间隔 30-90 秒随机延迟，不抢速度，只省人工。

## 快速开始

1. 从 [Releases](https://github.com/Randsome-Arisa/BiliCoinPusher/releases) 下载最新版 zip 并解压
2. 进入解压目录，运行：

```bash
# Linux
./bilicoinpusher

# Windows
bilicoinpusher.bat
```

首次运行会自动打开浏览器供扫码登录，后续运行在后台静默执行。登录 cookie 保存在 `browser-profile/` 目录。
注意选择登陆选项的时候要选 *在安全的环境登陆，如办公室，家里*，这样才会保存cookie。

## 命令一览

| 命令 | 用途 |
|------|------|
| `coin <url>` | 单个视频投币 |
| `fav <media-id>` | 收藏夹全部视频 |
| `up <uid>` | UP主全部视频 |
| `series <uid> <sid>` | 指定合集视频 |

## 常用选项

| 选项 | 作用 | 示例 |
|------|------|------|
| `--dry-run` | 预览模式，只列出视频不投币 |
| `--resume` | 断点续投，跳过已投过的视频 |
| `--max <n>` | 本次最多投 n 个币 |
| `--delay <ms>` | 视频间延迟毫秒数（默认 3000） |

## 使用示例

### 给收藏夹投币

```bash
# 先预览收藏夹中有哪些视频
bilicoinpusher.bat fav <fid> --dry-run

# 确认无误后正式投币，一次最多 10 个
bilicoinpusher.bat fav <fid> --max 10 --resume
```

**如何获取收藏夹 <fid>？** 打开 B站收藏夹页面，URL 中`fid=xxx`的数字就是 `<fid>`：
```
https://space.bilibili.com/123456/favlist?fid=789012
                                        ↑ 这个 789012 就是 <fid>
```

### 给 UP主投币

```bash
# 预览 UP主 <uid> 的视频列表
bilicoinpusher.bat up <uid> --dry-run

# 正式投币
bilicoinpusher.bat up <uid> --resume --max 5
```

**如何获取 UP主 UID？** 打开 UP主空间页，URL 中的数字就是 UID：
```
https://space.bilibili.com/12345
                          ↑ 这个12345就是 UID
```

### 给系列合集投币

```bash
# 预览合集
bilicoinpusher.bat series <uid> <s> --dry-run

# 正式投币
bilicoinpusher.bat series <uid> 67890 --resume
```

**如何获取 series_id？** 打开合集页面，URL 中 `sid=` 后面的数字：
```
https://space.bilibili.com/12345/lists?sid=67890
                                                        ↑ 这个67890就是 series_id
```

## 进阶技巧

### 组合选项的典型用法

```bash
# 每天给 UP主最新 3 个视频投币，跳过已投过的
bilicoinpusher.bat up 12345 --resume --max 3

# 给大型收藏夹分批投币，每次 10 个，间隔 5 秒
bilicoinpusher.bat fav 12345 --resume --max 10 --delay 5000
```

### 断点续投

`--resume` 选项使用 `coined.json` 文件记录已投币的视频。如果脚本中断（网络断开、电脑休眠等），再次运行同样的命令会自动跳过已投过的视频：

```bash
# 第一次运行：投了 5 个后中断
bilicoinpusher.bat up 12345 --resume --max 50

# 再次运行：自动跳过头 5 个，从第 6 个继续
bilicoinpusher.bat up 325864133 --resume --max 50
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

## 安装

### 方式一：下载便携版（推荐，无需安装 Node.js）

从 [Releases](https://github.com/Randsome-Arisa/BiliCoinPusher/releases) 下载对应系统的 zip，解压即可使用：

```bash
# Linux
./bilicoinpusher coin https://www.bilibili.com/video/BV18W41197De/

# Windows（命令提示符或 PowerShell）
bilicoinpusher.bat coin https://www.bilibili.com/video/BV18W41197De/
```

系统需安装 Chrome 或 Edge 浏览器（通常已自带）。

### 方式二：开发者运行

```bash
npm install --registry=https://registry.npmmirror.com
npm run build
node dist/main.js coin <url>
```

## 环境要求

- Windows 10+ 或 Linux
- Google Chrome / Microsoft Edge / Chromium（自动检测）

## 常见问题

**Q: 提示"未找到 Chrome"？**  
A: 程序需要系统已安装 Chrome / Edge / Chromium 浏览器。Linux 执行 `sudo snap install chromium`，Windows 安装 Google Chrome 即可。

**Q: 提示"未检测到登录状态"？**  
A: 程序会自动打开浏览器供登录，扫码登录后按 Enter 即可。cookie 会保存下来，后续运行无需再次登录。

**Q: 每天能投多少个币？**  
A: 投币没有每日上限，你可以给任意数量的视频投币。弹窗中显示的"今日20/50"是经验值获取上限，不影响投币本身。
