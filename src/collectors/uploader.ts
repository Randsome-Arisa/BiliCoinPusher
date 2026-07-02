import { Page } from "playwright-core";
import { wbiApiCall } from "../api";
import { Collector, CollectorOptions, VideoInfo } from "./types";
import { CONFIG } from "../config";

interface VItem {
  bvid: string;
  title: string;
}

interface UpListData {
  list?: { vlist?: VItem[] };
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

export class UploaderCollector implements Collector {
  constructor(private uid: string) {}

  async collect(page: Page, options?: CollectorOptions): Promise<VideoInfo[]> {
    const maxPages = options?.maxPages ?? Infinity;

    // 先尝试 API（WBI 签名）
    try {
      return await this.collectViaApi(page, maxPages);
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

  private async collectViaApi(page: Page, maxPages: number): Promise<VideoInfo[]> {
    const results: VideoInfo[] = [];
    let pn = 1;

    while (pn <= maxPages) {
      const resp = await wbiApiCall<UpListData>(page, "/x/space/wbi/arc/search", {
        mid: this.uid,
        pn: String(pn),
        ps: "30",
        order: "pubdate",
      });

      if (resp.code !== 0) {
        // 抛出携带部分结果的错误，供上层保留数据
        throw new ApiPartialError(
          `API 返回 code=${resp.code} (${resp.message})，回退 DOM 抓取`,
          results,
          pn,
        );
      }

      const vlist = resp.data?.list?.vlist ?? [];
      if (vlist.length === 0) break;

      for (const v of vlist) {
        results.push({
          url: `https://www.bilibili.com/video/${v.bvid}`,
          bvid: v.bvid,
          title: v.title,
          pageNumber: pn,
        });
      }

      if (vlist.length < 30) break; // 最后一页
      pn++;
    }

    return results;
  }

  /**
   * DOM 页面抓取：使用点击「下一页」按钮翻页，比 URL 参数更可靠
   * B站 SPA 通过 AJAX 加载视频列表，URL 参数 `?pn=N` 不会触发重新加载
   * @param startPage 从第几页开始抓取（API 失败续传时使用）
   */
  private async collectViaPage(
    page: Page,
    maxPages: number,
    startPage: number = 1,
  ): Promise<VideoInfo[]> {
    const results: VideoInfo[] = [];
    const seen = new Set<string>(); // 跨页去重

    // 1. 加载首页（B站 SPA 需要完整初始加载）
    const baseUrl = `https://space.bilibili.com/${this.uid}/video?tid=0&pn=1&keyword=&order=pubdate`;
    console.log(`  正在加载视频列表首页...`);
    try {
      await page.goto(baseUrl, {
        waitUntil: "domcontentloaded",
        timeout: CONFIG.PAGE_GOTO_TIMEOUT,
      });
    } catch (navErr: any) {
      console.log(`  首页导航失败: ${navErr.message}`);
      return results;
    }
    await page.waitForTimeout(3000);

    // 2. 如果 startPage > 1，逐页点击跳转到目标页
    let currentPage = 1;
    while (currentPage < startPage) {
      console.log(`  正在跳转到第 ${currentPage + 1} 页（目标起始页 ${startPage}）...`);
      const clicked = await this.clickNextPage(page);
      if (!clicked) {
        console.log(`  无法翻到第 ${currentPage + 1} 页，从第 ${currentPage} 页开始抓取`);
        break;
      }
      currentPage++;
    }

    // 3. 逐页抓取：提取视频 → 点击下一页 → 重复
    while (currentPage <= maxPages) {
      console.log(`  正在抓取第 ${currentPage} 页...`);

      const videos = await this.extractVideosFromPage(page);

      if (videos.length === 0) {
        console.log(`  第 ${currentPage} 页无视频，停止翻页`);
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
            pageNumber: currentPage,
          });
          newCount++;
        }
      }

      console.log(`  第 ${currentPage} 页提取 ${newCount} 个新视频（共 ${videos.length} 个链接）`);

      if (newCount === 0) break;
      if (videos.length < 20) break;
      if (currentPage >= maxPages) break;

      const clicked = await this.clickNextPage(page);
      if (!clicked) {
        console.log("  已到最后一页，停止翻页");
        break;
      }
      currentPage++;
    }

    return results;
  }

  /**
   * 点击「下一页」按钮
   * 选择器说明：B站空间页翻页组件中，`.vui_pagenation--btn-side` 有两个：
   * 第一个是「上一页」，最后一个是「下一页」
   * @returns true 点击成功，false 按钮不存在或被禁用（已到尾页）
   */
  private async clickNextPage(page: Page): Promise<boolean> {
    try {
      const clicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll(".vui_pagenation--btn-side");
        // 最后一个 .vui_pagenation--btn-side 是「下一页」
        const nextBtn = buttons[buttons.length - 1] as HTMLButtonElement | null;
        if (nextBtn && !nextBtn.disabled) {
          nextBtn.click();
          return true;
        }
        return false;
      });

      if (clicked) {
        // 等待 B站 SPA 通过 AJAX 更新视频列表
        await page.waitForTimeout(3000);
      }

      return clicked;
    } catch {
      return false;
    }
  }

  /** 从当前页面 DOM 提取视频 BV 号和标题 */
  private async extractVideosFromPage(
    page: Page,
  ): Promise<{ bvid: string; title: string }[]> {
    return page.evaluate(() => {
      const items: { bvid: string; title: string }[] = [];
      const links = document.querySelectorAll("a[href*='/video/BV']");
      const localSeen = new Set<string>();
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
  }
}
