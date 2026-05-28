import { Page } from "playwright-core";
import { apiCall } from "../api";
import { Collector, CollectorOptions, VideoInfo } from "./types";

interface FavItem {
  bvid: string;
  title: string;
}

interface FavListData {
  medias?: FavItem[];
  has_more: boolean;
}

export class FavoritesCollector implements Collector {
  constructor(private mediaId: string) {}

  async collect(page: Page, options?: CollectorOptions): Promise<VideoInfo[]> {
    const results: VideoInfo[] = [];
    const maxPages = options?.maxPages ?? Infinity;
    let pn = 1;

    while (pn <= maxPages) {
      const resp = await apiCall<FavListData>(page, "/x/v3/fav/resource/list", {
        media_id: this.mediaId,
        pn: String(pn),
        ps: "20",
        platform: "web",
      });

      if (resp.code !== 0) {
        if (resp.code === -403) {
          console.error("  ❌ 收藏夹无权访问（可能为私密）");
        } else if (resp.code === -404) {
          console.error("  ❌ 收藏夹不存在");
        } else {
          console.error(`  ❌ API 错误: code=${resp.code} message=${resp.message}`);
        }
        break;
      }

      const medias = resp.data?.medias ?? [];
      if (medias.length === 0) break;

      for (const m of medias) {
        results.push({
          url: `https://www.bilibili.com/video/${m.bvid}`,
          bvid: m.bvid,
          title: m.title,
        });
      }

      if (!resp.data?.has_more) break;
      pn++;
    }

    return results;
  }
}
