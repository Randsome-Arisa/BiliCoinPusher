import { Page } from "playwright";
import { apiCall } from "../api";
import { Collector, CollectorOptions, VideoInfo } from "./types";
import { CONFIG } from "../config";

interface SeriesArchive {
  aid: number;
  bvid: string;
  title: string;
  ctime: number;
  duration: number;
  pic: string;
}

interface SeasonsData {
  aids?: number[];
  archives?: SeriesArchive[];
  page?: { total: number; num: number; size: number };
  meta?: { total: number };
}

export class SeriesCollector implements Collector {
  constructor(private uid: string, private seriesId: string) {}

  async collect(page: Page, options?: CollectorOptions): Promise<VideoInfo[]> {
    const maxPages = options?.maxPages ?? Infinity;

    // 先尝试合集 API
    try {
      const apiResults = await this.collectViaApi(page, maxPages);
      if (apiResults.length > 0) return apiResults;
    } catch (e: any) {
      console.log(`  API 调用失败: ${e.message}`);
    }

    // 回退到 DOM 抓取
    console.log("  回退到页面抓取模式...");
    return this.collectViaPage(page, maxPages);
  }

  /** 使用 /x/polymer/web-space/seasons_archives_list 获取合集视频 */
  private async collectViaApi(page: Page, maxPages: number): Promise<VideoInfo[]> {
    const results: VideoInfo[] = [];
    let pageNum = 1;

    while (pageNum <= maxPages) {
      const resp = await apiCall<SeasonsData>(
        page,
        "/x/polymer/web-space/seasons_archives_list",
        {
          mid: this.uid,
          season_id: this.seriesId,
          page_num: String(pageNum),
          page_size: "30",
          web_location: "333.1387",
        },
      );

      if (resp.code !== 0) {
        throw new Error(`API code=${resp.code}: ${resp.message}`);
      }

      const archives = resp.data?.archives ?? [];
      if (archives.length === 0) {
        if (pageNum === 1) throw new Error("API 返回空数据，回退 DOM 抓取");
        break;
      }

      for (const a of archives) {
        results.push({
          url: `https://www.bilibili.com/video/${a.bvid}`,
          bvid: a.bvid,
          title: a.title,
        });
      }

      // 分页判断
      const meta = resp.data?.meta;
      const pageInfo = resp.data?.page;
      if (meta && results.length >= meta.total) break;
      if (pageInfo && pageInfo.num * pageInfo.size >= pageInfo.total) break;
      pageNum++;
    }

    return results;
  }

  /** DOM 回退：导航到合集页面，仅抓取当前合集的视频链接 */
  private async collectViaPage(page: Page, maxPages: number): Promise<VideoInfo[]> {
    const results: VideoInfo[] = [];
    const listUrl = `https://space.bilibili.com/${this.uid}/channel/collectiondetail?sid=${this.seriesId}`;

    await page.goto(listUrl, {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.PAGE_GOTO_TIMEOUT,
    });
    await page.waitForTimeout(5000);

    let pageNum = 1;
    while (pageNum <= maxPages) {
      // 仅在主内容区抓取（.seasons-list 或 .video-list），排除侧边栏推荐
      const videos = await page.evaluate(() => {
        const container = document.querySelector(".seasons-list, .video-list, .cube-list");
        const scope = container || document;
        const links = scope.querySelectorAll("a[href*='/video/BV']");
        const seen = new Set<string>();
        const items: { bvid: string; title: string }[] = [];
        for (const a of links) {
          const href = a.getAttribute("href") || "";
          const match = href.match(/BV[\w]+/);
          if (match && !seen.has(match[0])) {
            seen.add(match[0]);
            items.push({
              bvid: match[0],
              title: a.textContent?.trim() || a.getAttribute("title") || "",
            });
          }
        }
        return items;
      });

      if (videos.length === 0) break;

      for (const v of videos) {
        if (v.title && v.bvid) {
          results.push({ url: `https://www.bilibili.com/video/${v.bvid}`, bvid: v.bvid, title: v.title });
        }
      }

      const hasNext = await page.evaluate(() => {
        const nextBtn = document.querySelector(".be-pager-next:not(.be-pager-disabled)");
        return !!nextBtn;
      });

      if (!hasNext) break;

      try {
        await page.locator(".be-pager-next").first().click();
        await page.waitForTimeout(3000);
        pageNum++;
      } catch {
        break;
      }
    }

    return results;
  }
}
