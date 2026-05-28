import { Page } from "playwright-core";

export interface VideoInfo {
  url: string;
  bvid: string;
  title: string;
}

export interface CollectorOptions {
  /** 最多爬取页数 */
  maxPages?: number;
}

export interface Collector {
  collect(page: Page, options?: CollectorOptions): Promise<VideoInfo[]>;
}
