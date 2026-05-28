import { Page } from "playwright-core";
import { apiCall } from "../api";
import { Collector, CollectorOptions, VideoInfo } from "./types";
import { CONFIG } from "../config";

interface VItem {
  bvid: string;
  title: string;
}

interface UpListData {
  list?: { vlist?: VItem[] };
}

export class UploaderCollector implements Collector {
  constructor(private uid: string) {}

  async collect(page: Page, options?: CollectorOptions): Promise<VideoInfo[]> {
    const maxPages = options?.maxPages ?? Infinity;

    // 先尝试 API
    try {
      return await this.collectViaApi(page, maxPages);
    } catch (e: any) {
      console.log(`  API 调用失败: ${e.message}`);
    }

    // 回退到 DOM 抓取
    console.log("  回退到页面抓取模式...");
    return this.collectViaPage(page, maxPages);
  }

  private async collectViaApi(page: Page, maxPages: number): Promise<VideoInfo[]> {
    const results: VideoInfo[] = [];
    let pn = 1;

    while (pn <= maxPages) {
      const resp = await apiCall<UpListData>(page, "/x/space/wbi/arc/search", {
        mid: this.uid,
        pn: String(pn),
        ps: "30",
        order: "pubdate",
      });

      if (resp.code !== 0) {
        throw new Error(`API 返回 code=${resp.code} (${resp.message})，回退 DOM 抓取`);
      }

      const vlist = resp.data?.list?.vlist ?? [];
      if (vlist.length === 0) break;

      for (const v of vlist) {
        results.push({
          url: `https://www.bilibili.com/video/${v.bvid}`,
          bvid: v.bvid,
          title: v.title,
        });
      }

      if (vlist.length < 30) break; // 最后一页
      pn++;
    }

    return results;
  }

  private async collectViaPage(page: Page, maxPages: number): Promise<VideoInfo[]> {
    const results: VideoInfo[] = [];
    const spaceUrl = `https://space.bilibili.com/${this.uid}/video`;

    await page.goto(spaceUrl, {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.PAGE_GOTO_TIMEOUT,
    });
    await page.waitForTimeout(5000);

    let pageNum = 1;
    while (pageNum <= maxPages) {
      // 提取当前页视频链接
      const videos = await page.evaluate(() => {
        const items: { bvid: string; title: string }[] = [];
        const links = document.querySelectorAll("a[href*='/video/BV']");
        const seen = new Set<string>();
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
        if (v.title) {
          results.push({ url: `https://www.bilibili.com/video/${v.bvid}`, bvid: v.bvid, title: v.title });
        }
      }

      // 尝试翻页
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
