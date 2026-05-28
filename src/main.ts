import { Page } from "playwright";
import { CONFIG } from "./config";
import { setup, closeContext } from "./browser";
import { donateCoin, CoinResult } from "./coin";
import { isCoined, markCoined } from "./progress";
import { FavoritesCollector } from "./collectors/favorites";
import { UploaderCollector } from "./collectors/uploader";
import { SeriesCollector } from "./collectors/series";
import { VideoInfo } from "./collectors/types";

function printUsage(): void {
  console.log(`
BiliCoinPusher - B站自动投币工具

用法:
  node dist/main.js coin <video-url>            单视频投币
  node dist/main.js fav <media-id>              收藏夹批量投币
  node dist/main.js up <uid>                    UP主全部视频批量投币
  node dist/main.js series <uid> <series-id>    系列合集批量投币

选项:
  --dry-run        只收集视频列表，不实际投币
  --delay <ms>     视频间延迟毫秒数（默认 ${CONFIG.BETWEEN_VIDEOS_DELAY}）
  --max <n>        本次最多投币数量
  --resume         跳过 coined.json 中已投币的视频
`);
}

interface CliOptions {
  dryRun: boolean;
  delay: number;
  max: number;
  resume: boolean;
}

function parseOptions(args: string[]): CliOptions {
  const opts: CliOptions = {
    dryRun: false,
    delay: CONFIG.BETWEEN_VIDEOS_DELAY,
    max: Infinity,
    resume: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dry-run": opts.dryRun = true; break;
      case "--resume": opts.resume = true; break;
      case "--delay":
        if (args[i + 1]) opts.delay = parseInt(args[i + 1], 10);
        i++;
        break;
      case "--max":
        if (args[i + 1]) opts.max = parseInt(args[i + 1], 10);
        i++;
        break;
    }
  }

  return opts;
}

function formatCoinResult(r: CoinResult, index: number, total: number): string {
  const status = r.alreadyCoined ? "⏭ 已投过"
    : r.success ? "✅ 成功"
    : `❌ 失败: ${r.error || "未知"}`;
  const extra = r.isReposted ? " [转载·1硬币]" : "";
  return `  [${index}/${total}] ${status}${extra}  ${r.title || r.bvid || r.videoUrl}`;
}

async function runBatch(
  page: Page,
  videos: VideoInfo[],
  opts: CliOptions,
): Promise<{ succeeded: number; skipped: number; failed: number }> {
  const stats = { succeeded: 0, skipped: 0, failed: 0 };
  const total = videos.length;

  console.log(`\n开始批量投币 (共 ${total} 个视频)...\n`);

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];

    if (opts.resume && isCoined(v.bvid)) {
      console.log(`  [${i + 1}/${total}] ⏭ 跳过 (已投过)  ${v.title}`);
      stats.skipped++;
      continue;
    }

    const result = await donateCoin(page, v.url, { dryRun: opts.dryRun });

    console.log(formatCoinResult(result, i + 1, total));

    if (result.success && result.bvid) {
      markCoined(result.bvid);
      stats.succeeded++;
    } else if (result.alreadyCoined) {
      if (result.bvid) markCoined(result.bvid);
      stats.skipped++;
    } else {
      stats.failed++;
    }

    if (stats.succeeded >= opts.max) {
      console.log(`\n  已达到本次上限 (${opts.max} 个)，停止`);
      break;
    }

    if (i < videos.length - 1) {
      await page.waitForTimeout(opts.delay);
    }
  }

  return stats;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const opts = parseOptions(args);
  const command = args[0];

  const validCommands = ["coin", "fav", "up", "series"];
  if (!validCommands.includes(command)) {
    console.error(`未知命令: ${command}`);
    printUsage();
    process.exit(1);
  }

  const { context: ctx, page } = await setup();

  try {
    if (command === "coin") {
      const videoUrl = args[1];
      if (!videoUrl) {
        console.error("请提供视频 URL");
        return;
      }
      const result = await donateCoin(page, videoUrl, { dryRun: opts.dryRun });
      console.log(formatCoinResult(result, 1, 1));
      if (result.success && result.bvid) markCoined(result.bvid);
      return;
    }

    let videos: VideoInfo[] = [];

    if (command === "fav") {
      const mediaId = args[1];
      if (!mediaId) {
        console.error("请提供收藏夹 media_id");
        return;
      }
      console.log(`📂 正在获取收藏夹 ${mediaId} 的视频列表...`);
      const collector = new FavoritesCollector(mediaId);
      videos = await collector.collect(page, { maxPages: opts.dryRun ? 3 : undefined });
    } else if (command === "up") {
      const uid = args[1];
      if (!uid) {
        console.error("请提供 UP主 UID");
        return;
      }
      console.log(`📂 正在获取 UP主 ${uid} 的视频列表...`);
      const collector = new UploaderCollector(uid);
      videos = await collector.collect(page, { maxPages: opts.dryRun ? 2 : undefined });
    } else if (command === "series") {
      const uid = args[1];
      const sid = args[2];
      if (!uid || !sid) {
        console.error("请提供 UP主 UID 和系列 series_id");
        return;
      }
      console.log(`📂 正在获取系列合集 (mid=${uid}, sid=${sid}) 的视频列表...`);
      const collector = new SeriesCollector(uid, sid);
      videos = await collector.collect(page);
    }

    if (videos.length === 0) {
      console.log("没有找到视频");
      return;
    }

    console.log(`找到 ${videos.length} 个视频`);

    if (opts.resume) {
      const before = videos.length;
      videos = videos.filter((v) => !isCoined(v.bvid));
      console.log(`  过滤已投币后剩余: ${videos.length} 个 (跳过 ${before - videos.length})`);
    }

    if (opts.dryRun) {
      console.log("\n── dry-run 模式，以下视频将被投币 ──");
      for (let i = 0; i < videos.length; i++) {
        console.log(`  ${i + 1}. [${videos[i].bvid}] ${videos[i].title}`);
      }
      console.log(`\n共 ${videos.length} 个视频，不会实际投币`);
      return;
    }

    const stats = await runBatch(page, videos, opts);

    console.log("\n" + "=".repeat(50));
    console.log("投币完成");
    console.log("=".repeat(50));
    console.log(`  ✅ 成功: ${stats.succeeded}`);
    console.log(`  ⏭ 跳过: ${stats.skipped}`);
    console.log(`  ❌ 失败: ${stats.failed}`);
  } finally {
    await closeContext();
  }
}

main().catch((e) => {
  console.error("脚本错误:", e);
  process.exit(1);
});
