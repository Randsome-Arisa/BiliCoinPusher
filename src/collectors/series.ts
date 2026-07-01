import { Page } from "playwright-core";
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

/** 自定义错误：携带 API 已收集的部分数据，供 DOM 回退时续传 */
class ApiPartialError extends Error {
  partialResults: VideoInfo[];
  failedPage: number;

  constructor(message: string, partialResults: VideoInfo[], failedPage: number) {
    super(message);
    this.name = "ApiPartialError";
    this.partialResults = partialResults;
    this.failedPage = failedPage;
  }
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

      // 如果 API 已收集部分数据，保留并从失败页继续 DOM 抓取
      if (e instanceof ApiPartialError && e.partialResults.length > 0) {
        console.log(
          `  API 已收集 ${e.partialResults.length} 个视频（前 ${e.failedPage - 1} 页），` +
            `从第 ${e.failedPage} 页继续 DOM 抓取...`,
        );
        const domResults = await this.collectViaPage(page, maxPages, e.failedPage);
        return [...e.partialResults, ...domResults];
      }
    }

    // API 完全失败（首页即失败），全部使用 DOM 抓取
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
        throw new ApiPartialError(
          `API code=${resp.code}: ${resp.message}`,
          results,
          pageNum,
        );
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

  /**
   * DOM 回退：使用 URL 参数分页，比按钮点击更可靠
   * @param startPage 从第几页开始抓取（API 失败续传时使用）
   */
  private async collectViaPage(
    page: Page,
    maxPages: number,
    startPage: number = 1,
  ): Promise<VideoInfo[]> {
    const results: VideoInfo[] = [];
    const seen = new Set<string>(); // 跨页去重

    for (let pn = startPage; pn <= maxPages; pn++) {
      // 使用 URL 参数直接跳转到指定页
      const pageUrl = `https://space.bilibili.com/${this.uid}/channel/collectiondetail?sid=${this.seriesId}&pn=${pn}`;

      console.log(`  正在抓取第 ${pn} 页...`);

      try {
        await page.goto(pageUrl, {
          waitUntil: "domcontentloaded",
          timeout: CONFIG.PAGE_GOTO_TIMEOUT,
        });
      } catch (navErr: any) {
        console.log(`  第 ${pn} 页导航失败: ${navErr.message}`);
        break;
      }

      // 等待页面渲染
      await page.waitForTimeout(3000);

      // 仅在主内容区抓取（.seasons-list 或 .video-list），排除侧边栏推荐
      const videos = await page.evaluate(() => {
        const container = document.querySelector(".seasons-list, .video-list, .cube-list");
        const scope = container || document;
        const links = scope.querySelectorAll("a[href*='/video/BV']");
        const localSeen = new Set<string>();
        const items: { bvid: string; title: string }[] = [];
        for (const a of links) {
          const href = a.getAttribute("href") || "";
          const match = href.match(/BV[\w]+/);
          if (match && !localSeen.has(match[0])) {
            localSeen.add(match[0]);
            items.push({
              bvid: match[0],
              title: a.textContent?.trim() || a.getAttribute("title") || "",
            });
          }
        }
        return items;
      });

      if (videos.length === 0) {
        console.log(`  第 ${pn} 页无视频，停止翻页`);
        break;
      }

      let newCount = 0;
      for (const v of videos) {
        if (v.title && v.bvid && !seen.has(v.bvid)) {
          seen.add(v.bvid);
          results.push({
            url: `https://www.bilibili.com/video/${v.bvid}`,
            bvid: v.bvid,
            title: v.title,
          });
          newCount++;
        }
      }

      console.log(`  第 ${pn} 页提取 ${newCount} 个新视频（共 ${videos.length} 个链接）`);

      // 如果本页没有新视频（全部重复），说明到底了
      if (newCount === 0) break;

      // 如果视频数明显少于一页（30个），通常是最后一页
      if (videos.length < 20) break;
    }

    return results;
  }
}
