import { Page } from "playwright-core";

export interface VideoInfo {
  url: string;
  bvid: string;
  title: string;
  /** 所属页码（UP主空间页分页），用于按页投币时重置浏览器上下文 */
  pageNumber?: number;
}

export interface CollectorOptions {
  /** 最多爬取页数 */
  maxPages?: number;
}

export interface Collector {
  collect(page: Page, options?: CollectorOptions): Promise<VideoInfo[]>;
}
