import { createHash } from "crypto";
import { Page } from "playwright-core";
import { CONFIG } from "./config";

// ============================================================
// WBI 签名相关
// ============================================================

/** WBI mixin key 排列表（B站前端 JS 提取，自 2023 年起未变） */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

/** 缓存的 mixin key（全局一致，无需 per-page 缓存） */
let _cachedMixinKey: string | null = null;

interface NavWbiData {
  wbi_img?: { img_url: string; sub_url: string };
}

/** 参数值的 WBI 编码：encodeURIComponent + 过滤 !'()* */
function wbiEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

/** 从 img_key + sub_key 派生 mixin key（取前 32 字符） */
function deriveMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  let result = "";
  for (const idx of MIXIN_KEY_ENC_TAB) {
    if (idx < raw.length) result += raw[idx];
  }
  return result.slice(0, 32);
}

/** 从 /x/web-interface/nav 获取 WBI 密钥对 */
async function fetchWbiKeys(page: Page): Promise<{ imgKey: string; subKey: string }> {
  const resp = await apiCall<NavWbiData>(page, "/x/web-interface/nav");

  if (resp.code !== 0) {
    throw new Error(`获取 WBI 密钥失败: nav API 返回 code=${resp.code} message=${resp.message}`);
  }

  const wbiImg = resp.data?.wbi_img;
  if (!wbiImg?.img_url || !wbiImg?.sub_url) {
    throw new Error("获取 WBI 密钥失败: nav API 未返回 wbi_img 数据");
  }

  // 从伪装成图片 URL 的路径中提取文件名（去掉扩展名）
  const imgKey = wbiImg.img_url.split("/").pop()!.split(".")[0];
  const subKey = wbiImg.sub_url.split("/").pop()!.split(".")[0];

  const ts = new Date().toISOString();
  console.log(`  [DEBUG] ${ts} fetchWbiKeys: img_key=${imgKey.slice(0, 8)}... sub_key=${subKey.slice(0, 8)}...`);

  return { imgKey, subKey };
}

/** 获取 mixin key（首次调用时从 API 获取并缓存） */
async function getMixinKey(page: Page): Promise<string> {
  if (_cachedMixinKey) return _cachedMixinKey;

  const ts = new Date().toISOString();
  console.log(`  [DEBUG] ${ts} getMixinKey: 缓存未命中，正在获取 WBI 密钥...`);

  const { imgKey, subKey } = await fetchWbiKeys(page);
  _cachedMixinKey = deriveMixinKey(imgKey, subKey);

  console.log(`  [DEBUG] ${ts} getMixinKey: mixin_key=${_cachedMixinKey.slice(0, 8)}...`);
  return _cachedMixinKey;
}

/** 对参数进行 WBI 签名，返回携带 w_rid + wts 的新参数对象 */
function signParams(
  params: Record<string, string>,
  mixinKey: string,
): Record<string, string> & { wts: string; w_rid: string } {
  // 添加时间戳
  const wts = String(Math.floor(Date.now() / 1000));
  const allParams = { ...params, wts };

  // 按 key 字母序排列
  const sortedKeys = Object.keys(allParams).sort();

  // 构建签名字符串（key=value&... 格式，值经过 wbiEncode）
  const queryString = sortedKeys
    .map((k) => `${wbiEncode(k)}=${wbiEncode((allParams as Record<string, string>)[k])}`)
    .join("&");

  // MD5(queryString + mixinKey) → w_rid
  const wRid = createHash("md5").update(queryString + mixinKey).digest("hex");

  return { ...allParams, w_rid: wRid };
}

// ============================================================
// 公开 API
// ============================================================

/** 在已登录的浏览器上下文中调用 B站 API */
export async function apiCall<T>(
  page: Page,
  path: string,
  params: Record<string, string> = {},
): Promise<{ code: number; message: string; data: T }> {
  const qs = new URLSearchParams(params).toString();
  const url = `${CONFIG.API_BASE}${path}?${qs}`;

  return page.evaluate(async (apiUrl) => {
    const res = await fetch(apiUrl, { credentials: "include" });
    return res.json();
  }, url);
}

/** 在已登录的浏览器上下文中调用 B站 WBI 签名 API */
export async function wbiApiCall<T>(
  page: Page,
  path: string,
  params: Record<string, string> = {},
): Promise<{ code: number; message: string; data: T }> {
  const mixinKey = await getMixinKey(page);
  const signed = signParams(params, mixinKey);

  // 按字母序构建最终 URL（排序仅用于一致性，签名已在上一步完成）
  const sortedKeys = Object.keys(signed).sort();
  const urlParams = sortedKeys
    .map((k) => `${wbiEncode(k)}=${wbiEncode(signed[k])}`)
    .join("&");
  const url = `${CONFIG.API_BASE}${path}?${urlParams}`;

  const ts = new Date().toISOString();
  console.log(
    `  [DEBUG] ${ts} wbiApiCall: ${path} wts=${signed.wts} w_rid=${signed.w_rid.slice(0, 8)}...`,
  );

  return page.evaluate(async (apiUrl) => {
    const res = await fetch(apiUrl, { credentials: "include" });
    return res.json();
  }, url);
}
