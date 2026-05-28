import { Page } from "playwright-core";
import { CONFIG } from "./config";

/** 在已登录的浏览器上下文中调用 B站 API */
export async function apiCall<T>(page: Page, path: string, params: Record<string, string> = {}): Promise<{ code: number; message: string; data: T }> {
  const qs = new URLSearchParams(params).toString();
  const url = `${CONFIG.API_BASE}${path}?${qs}`;

  return page.evaluate(async (apiUrl) => {
    const res = await fetch(apiUrl, { credentials: "include" });
    return res.json();
  }, url);
}
