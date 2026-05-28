import { chromium, BrowserContext, Page } from "playwright";
import * as fs from "fs";
import { CONFIG } from "./config";

let _context: BrowserContext | null = null;

async function createContext(headless: boolean): Promise<BrowserContext> {
  _context = await chromium.launchPersistentContext(CONFIG.USER_DATA_DIR, {
    headless,
    executablePath: CONFIG.EXECUTABLE_PATH,
    viewport: CONFIG.VIEWPORT,
    locale: CONFIG.LOCALE,
    userAgent: CONFIG.USER_AGENT,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
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

  // 先尝试 headless 启动（有 profile 才尝试，首次必然有头）
  let context = await createContext(profileExists);
  let page = context.pages()[0] || await context.newPage();

  let loggedIn = await checkLogin(page);
  if (loggedIn) return { context, page };

  // 未登录 — 关闭 headless，开有界面浏览器供登录
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

  // 登录完成，验证并切回 headless
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
