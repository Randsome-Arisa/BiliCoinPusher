import { Page } from "playwright-core";
import { CONFIG } from "./config";

export interface CoinResult {
  success: boolean;
  videoUrl: string;
  bvid: string;
  title: string;
  alreadyCoined: boolean;
  isReposted: boolean;
  error?: string;
}

/** 对单个视频执行投币操作。调用前 page 无需预先导航。 */
export async function donateCoin(
  page: Page,
  videoUrl: string,
  options: { dryRun?: boolean } = {},
): Promise<CoinResult> {
  const S = CONFIG.SELECTORS;
  const result: CoinResult = {
    success: false,
    videoUrl,
    bvid: "",
    title: "",
    alreadyCoined: false,
    isReposted: false,
  };

  // ── 1. 导航到视频页 ──
  try {
    await page.goto(videoUrl, {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.PAGE_GOTO_TIMEOUT,
      referer: "https://www.bilibili.com/",
    });
  } catch (e: any) {
    result.error = `页面加载失败: ${e.message}`;
    return result;
  }

  await page.waitForTimeout(CONFIG.NAVIGATION_WAIT);

  // ── 2. 检查是否被反爬重定向 ──
  const pageUrl = page.url();
  if (pageUrl.includes("errorpage") || pageUrl.includes("selfDef.errorpage")) {
    result.error = "被反爬虫重定向到错误页";
    return result;
  }

  // ── 3. 提取视频元信息并检查是否已投币 ──
  try {
    const preCheck = await page.evaluate((coinSelector) => {
      const w = window as any;
      const vd = w.__INITIAL_STATE__?.videoData;
      const btn = document.querySelector(coinSelector);
      const hasOnClass = btn?.classList.contains("on") || false;
      const btnTitle = btn?.getAttribute("title") || "";
      return {
        bvid: vd?.bvid || "",
        title: vd?.title || "",
        copyright: vd?.copyright as number | undefined,
        alreadyCoined: hasOnClass || btnTitle.includes("已用完"),
      };
    }, S.COIN_BUTTON);

    result.bvid = preCheck.bvid;
    result.title = preCheck.title;

    if (preCheck.alreadyCoined) {
      result.alreadyCoined = true;
      result.success = true; // 无需操作视为成功
      return result;
    }

    // 转载视频只支持投 1 枚硬币，标记以便后续跳过 2硬币选择
    result.isReposted = preCheck.copyright === 2;
  } catch (e: any) {
    result.error = `提取视频信息失败: ${e.message}`;
    return result;
  }

  // ── 4. dry-run 模式在此返回 ──
  if (options.dryRun) {
    result.success = true;
    return result;
  }

  // ── 5. 点击投币按钮 ──
  try {
    const coinBtn = page.locator(S.COIN_BUTTON).first();
    if (!(await coinBtn.isVisible({ timeout: 3000 }))) {
      result.error = "投币按钮不可见";
      return result;
    }
    await coinBtn.click();
  } catch (e: any) {
    result.error = `点击投币按钮失败: ${e.message}`;
    return result;
  }

  // ── 6. 等待弹窗出现 ──
  try {
    await page.locator(S.COIN_DIALOG).waitFor({ state: "visible", timeout: CONFIG.DIALOG_WAIT });
    await page.waitForTimeout(CONFIG.DIALOG_ANIMATION_WAIT);
  } catch {
    result.error = "投币弹窗未出现";
    return result;
  }

  // ── 7. 确保选中 2硬币（转载视频仅支持 1 硬币，跳过此步）──
  if (!result.isReposted) {
    try {
      const twoCoinBox = page.locator(S.TWO_COIN_BOX);
      const isSelected = await twoCoinBox.evaluate((el) => el.classList.contains("on")).catch(() => false);
      if (!isSelected) {
        await twoCoinBox.click();
        await page.waitForTimeout(300);
      }
    } catch { /* continue */ }
  }

  // ── 8. 点击确定 ──
  try {
    await page.locator(S.CONFIRM_BTN).click();
  } catch (e: any) {
    result.error = `点击确定按钮失败: ${e.message}`;
    return result;
  }

  // ── 9. 等待弹窗关闭 ──
  try {
    await page.locator(S.COIN_DIALOG).waitFor({ state: "hidden", timeout: CONFIG.DIALOG_WAIT });
  } catch {
    // 弹窗可能不自动关闭，再点一次确定
    await page.locator(S.CONFIRM_BTN).click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(1000);

  // ── 10. 验证结果 ──
  try {
    const coinBtn = page.locator(S.COIN_BUTTON).first();
    const cls = (await coinBtn.getAttribute("class").catch(() => "")) || "";
    const tt = (await coinBtn.getAttribute("title").catch(() => "")) || "";
    if (cls.includes("on") || tt.includes("已用完")) {
      result.success = true;
    } else {
      result.error = "投币后按钮状态未变化";
    }
  } catch (e: any) {
    result.error = `验证投币结果失败: ${e.message}`;
  }

  return result;
}
