import { chromium, BrowserContext, Page } from "playwright-core";
import * as fs from "fs";
import { execSync } from "child_process";
import { CONFIG } from "./config";

let _context: BrowserContext | null = null;

/** 跨平台自动检测 Chrome/Chromium/Edge 路径 */
function detectBrowser(): string {
  const { platform } = process;
  const candidates: string[] = [];

  if (platform === "linux") {
    candidates.push(
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/snap/bin/chromium",
      "/opt/google/chrome/chrome",
    );
  } else if (platform === "win32") {
    candidates.push(
      (process.env.LOCALAPPDATA || "") + "\\Google\\Chrome\\Application\\chrome.exe",
      (process.env.PROGRAMFILES || "") + "\\Google\\Chrome\\Application\\chrome.exe",
      (process.env["PROGRAMFILES(X86)"] || "") + "\\Google\\Chrome\\Application\\chrome.exe",
      (process.env.PROGRAMFILES || "") + "\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    );
  }

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }

  // 最后尝试 which/where 命令
  try {
    const cmd = platform === "win32" ? "where chrome" : "which chromium-browser || which chromium || which google-chrome";
    const out = execSync(cmd, { encoding: "utf-8" }).trim();
    if (out) return out.split("\n")[0].trim();
  } catch { /* not found */ }

  throw new Error(
    "未找到 Chrome/Chromium/Edge 浏览器。\n" +
    "Linux: sudo snap install chromium  或  sudo apt install chromium-browser\n" +
    "Windows: 请安装 Google Chrome 或 Microsoft Edge",
  );
}

async function createContext(headless: boolean): Promise<BrowserContext> {
  const args: string[] = [
    "--disable-blink-features=AutomationControlled",
  ];

  // Linux 沙箱参数
  if (process.platform === "linux") {
    args.push("--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage");
  }

  _context = await chromium.launchPersistentContext(CONFIG.USER_DATA_DIR, {
    headless,
    executablePath: detectBrowser(),
    viewport: CONFIG.VIEWPORT,
    locale: CONFIG.LOCALE,
    userAgent: CONFIG.USER_AGENT,
    args,
  });
  return _context;
}

async function checkLogin(page: Page): Promise<boolean> {
  try {
    await page.goto("https://www.bilibili.com/", {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.HOME_PAGE_GOTO_TIMEOUT,
    });
    await page.waitForTimeout(3000);

    return page.evaluate(() => {
      const token = localStorage.getItem("token") || localStorage.getItem("bili_jct");
      const avatar = document.querySelector(".header-avatar-wrap");
      const loginEntry = document.querySelector(".header-login-entry");
      return !!token || !!avatar || !loginEntry;
    });
  } catch {
    return false;
  }
}

/** 自动判断登录态：已登录则 headless 运行，未登录则弹窗登录后自动切回 headless */
export async function setup(): Promise<{ context: BrowserContext; page: Page }> {
  const profileExists = fs.existsSync(CONFIG.USER_DATA_DIR);

  let context = await createContext(profileExists);
  let page = context.pages()[0] || await context.newPage();

  let loggedIn = await checkLogin(page);
  if (loggedIn) return { context, page };

  await context.close();
  console.log("未检测到登录状态，正在打开浏览器供登录...\n");

  context = await createContext(false);
  page = context.pages()[0] || await context.newPage();

  await page.goto("https://www.bilibili.com/", {
    waitUntil: "domcontentloaded",
    timeout: CONFIG.HOME_PAGE_GOTO_TIMEOUT,
  });
  await page.waitForTimeout(3000);

  console.log("请在浏览器中登录 B站（扫码或账号密码），登录成功后按 Enter 继续...");
  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  loggedIn = await checkLogin(page);
  if (!loggedIn) {
    await context.close();
    throw new Error("登录验证失败 — 未检测到登录状态，请删除 browser-profile/ 后重试");
  }

  await context.close();

  context = await createContext(true);
  page = context.pages()[0] || await context.newPage();

  console.log("登录成功，后续将自动运行\n");
  return { context, page };
}

export async function closeContext(): Promise<void> {
  if (_context) {
    await _context.close();
    _context = null;
  }
}
