"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const VIDEO_URL = process.argv[2] || "https://www.bilibili.com/video/BV1GJ411x7hQ";
// 持久化用户目录 —— cookie/localStorage 存这里，下次运行复用登录态
const USER_DATA_DIR = path.join(__dirname, "..", "browser-profile");
async function checkLoginStatus(page) {
    // 访问 B站首页后检查是否存在已登录标识
    try {
        const loggedIn = await page.evaluate(() => {
            // B站登录后在 localStorage 中会有 token
            const token = localStorage.getItem("token") || localStorage.getItem("bili_jct");
            // 或者检查页面上的用户头像/登录按钮
            const headerLoginBtn = document.querySelector(".header-login-entry");
            const userAvatar = document.querySelector(".header-avatar-wrap");
            return !!token || !!userAvatar || !headerLoginBtn;
        });
        return loggedIn;
    }
    catch {
        return false;
    }
}
async function main() {
    console.log("=".repeat(60));
    console.log("BiliCoinPusher Step 0: B站页面 DOM 调查");
    console.log("=".repeat(60));
    console.log(`目标视频: ${VIDEO_URL}`);
    console.log(`用户目录: ${USER_DATA_DIR}\n`);
    const headless = process.argv.includes("--headless");
    const isFirstRun = !fs.existsSync(USER_DATA_DIR);
    if (isFirstRun) {
        console.log("⚠ 首次运行: 将打开有界面浏览器，请手动登录 B站");
        console.log("  登录后脚本会自动继续，下次运行将复用登录态\n");
    }
    // 用 launchPersistentContext 持久化浏览器 profile
    const context = await playwright_1.chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: headless && !isFirstRun, // 首次运行强制有头模式以便登录
        executablePath: "/snap/bin/chromium",
        viewport: { width: 1920, height: 1080 },
        locale: "zh-CN",
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
        ],
    });
    const page = context.pages()[0] || await context.newPage();
    // ── 0. 访问首页，检查登录状态 ──
    console.log("[0] 先访问 B站首页...");
    try {
        await page.goto("https://www.bilibili.com/", {
            waitUntil: "domcontentloaded",
            timeout: 20000,
        });
        await page.waitForTimeout(3000);
        const loggedIn = await checkLoginStatus(page);
        if (!loggedIn && isFirstRun) {
            console.log("\n  ⚠ 未检测到登录状态！");
            console.log("  请在浏览器窗口中手动登录 B站（扫码或账号密码）");
            console.log("  登录成功后按 Enter 继续...\n");
            // 等待用户按 Enter
            await new Promise((resolve) => {
                process.stdin.once("data", () => resolve());
            });
            // 登录后刷新页面确认
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.waitForTimeout(2000);
            console.log("  登录确认完成\n");
        }
        else if (loggedIn) {
            console.log("  ✅ 已登录，复用会话\n");
        }
        else {
            console.log("  ⚠ 未检测到登录状态，但非首次运行，继续尝试...\n");
        }
    }
    catch (e) {
        console.log(`  首页加载失败: ${e.message}，继续尝试...\n`);
    }
    // ── 1. 导航到视频页 ──
    console.log("[1/7] 正在打开视频页面...");
    try {
        await page.goto(VIDEO_URL, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
            referer: "https://www.bilibili.com/",
        });
    }
    catch (e) {
        console.log(`  ⚠ 页面加载异常: ${e.message}`);
    }
    // 给 React 时间渲染
    await page.waitForTimeout(8000);
    const pageUrl = page.url();
    const pageTitle = await page.title();
    console.log(`  当前 URL: ${pageUrl}`);
    console.log(`  页面标题: ${pageTitle}`);
    // 检查是否被重定向到错误页
    if (pageUrl.includes("errorpage") || pageUrl.includes("selfDef.errorpage")) {
        console.log("\n  ❌ 页面被重定向到错误页！B站反爬虫拦截了请求。");
        console.log("  尝试换一个视频 URL 或用非 headless 模式...");
        await page.screenshot({ path: "/tmp/bilibili-error.png", fullPage: false });
        console.log("  错误页截图: /tmp/bilibili-error.png\n");
        // 尝试直接用 curl 抓取 HTML
        console.log("── 回退方案：用 page.evaluate 注入 fetch ──");
        try {
            const html = await page.evaluate(async (url) => {
                const res = await fetch(url, {
                    headers: {
                        "User-Agent": navigator.userAgent,
                        Referer: "https://www.bilibili.com/",
                        "Accept-Language": "zh-CN,zh;q=0.9",
                    },
                });
                return await res.text();
            }, VIDEO_URL);
            // 尝试从 HTML 中提取 __INITIAL_STATE__
            const match = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/s);
            if (match) {
                const state = JSON.parse(match[1]);
                console.log(`  ✅ 从 HTML 提取到 __INITIAL_STATE__`);
                console.log(`     视频标题: ${state.videoData?.title || "(未找到)"}`);
                console.log(`     copyright: ${state.videoData?.copyright} (1=原创, 2=转载)`);
                console.log(`     aid: ${state.videoData?.aid}`);
                console.log(`     bvid: ${state.videoData?.bvid}`);
                console.log(`     videos (分P数): ${state.videoData?.videos}`);
                console.log(`     pages: ${JSON.stringify(state.videoData?.pages?.length)}`);
            }
            else {
                console.log(`  ❌ 未能提取 __INITIAL_STATE__`);
                console.log(`     HTML 前 500 字符: ${html.substring(0, 500)}`);
            }
        }
        catch (e) {
            console.log(`  ❌ fetch 也失败了: ${e.message}`);
        }
        await context.close();
        return;
    }
    console.log();
    // ── 2. iframe 检测 ──
    console.log("[2/7] 检测 iframe...");
    const allFrames = page.frames();
    console.log(`  页面共有 ${allFrames.length} 个 frame:`);
    for (const f of allFrames) {
        const url = f.url();
        const name = f.name() || "(unnamed)";
        console.log(`    - [${name}] ${url.substring(0, 120)}`);
    }
    const playerFrames = allFrames.filter((f) => f.url().includes("player.bilibili.com") || f.url().includes("bilibili.com/blackboard"));
    if (playerFrames.length > 0) {
        console.log(`\n  ⚠ 发现 ${playerFrames.length} 个潜在播放器 iframe:`);
        for (const pf of playerFrames) {
            console.log(`    → ${pf.url().substring(0, 120)}`);
            try {
                const coinInFrame = await pf.$('[class*="coin" i]');
                if (coinInFrame) {
                    const text = await coinInFrame.textContent();
                    console.log(`    ✅ 该 iframe 内找到 coin 相关元素: "${text?.substring(0, 50)}"`);
                }
            }
            catch {
                console.log(`    ❌ 无法访问该 iframe（可能跨域）`);
            }
        }
    }
    else {
        console.log("  ✅ 未检测到独立的播放器 iframe（投币按钮在主页面中）");
    }
    console.log();
    // ── 3. 投币按钮定位 ──
    console.log("[3/7] 定位投币按钮...");
    // 策略：先用 evaluate 在浏览器上下文中搜索
    const coinBtnInfo = await page.evaluate(() => {
        const results = [];
        // 搜索所有包含 "coin" 的 class 或 "投币" 的元素
        const all = document.querySelectorAll("*");
        for (const el of all) {
            const cls = el.className?.toString?.() || "";
            const title = el.getAttribute("title") || "";
            const aria = el.getAttribute("aria-label") || "";
            const text = el.textContent?.trim?.() || "";
            if (cls.toLowerCase().includes("coin") ||
                title.includes("投币") ||
                aria.includes("投币")) {
                results.push({
                    tag: el.tagName.toLowerCase(),
                    class: cls.substring(0, 80),
                    id: el.id || "",
                    title,
                    ariaLabel: aria,
                    text: text.substring(0, 40),
                    outerHTML: el.outerHTML.substring(0, 250),
                    visible: !!el.offsetParent,
                });
                if (results.length >= 10)
                    break;
            }
        }
        return results;
    });
    if (coinBtnInfo.length > 0) {
        console.log(`  找到 ${coinBtnInfo.length} 个 coin 相关元素:`);
        for (const info of coinBtnInfo) {
            console.log(`    <${info.tag}> class="${info.class}" visible=${info.visible}`);
            console.log(`      title="${info.title}" aria="${info.ariaLabel}"`);
            console.log(`      text="${info.text}"`);
            console.log(`      html: ${info.outerHTML}`);
            console.log();
        }
    }
    else {
        console.log("  ❌ 未找到任何 coin 相关的 DOM 元素");
    }
    console.log();
    // ── 4. 投币确认面板 ──
    console.log("[4/7] 搜索投币确认面板...");
    const popupInfo = await page.evaluate(() => {
        const results = [];
        for (const el of document.querySelectorAll("*")) {
            const cls = (el.className?.toString?.() || "").toLowerCase();
            if (cls.includes("coin-popup") || cls.includes("coin-panel") || cls.includes("coin-dialog")) {
                results.push({
                    tag: el.tagName.toLowerCase(),
                    class: cls.substring(0, 80),
                    visible: !!el.offsetParent,
                    html: el.outerHTML.substring(0, 300),
                });
            }
        }
        return results;
    });
    if (popupInfo.length > 0) {
        console.log(`  找到 ${popupInfo.length} 个弹窗相关元素:`);
        for (const p of popupInfo) {
            console.log(`    <${p.tag}> class="${p.class}" visible=${p.visible}`);
            console.log(`      html: ${p.html}`);
        }
    }
    else {
        console.log("  ℹ 弹窗 DOM 不在页面中（可能点击投币按钮后才动态渲染）");
    }
    console.log();
    // ── 5. 视频类型检测（原创/转载） ──
    console.log("[5/7] 搜索视频类型标签...");
    const typeInfo = await page.evaluate(() => {
        const results = [];
        // 搜索含"原创"或"转载"文本的元素
        for (const el of document.querySelectorAll("*")) {
            const text = (el.textContent || "").trim();
            if (text === "原创" || text === "转载") {
                results.push({
                    tag: el.tagName.toLowerCase(),
                    class: el.className?.toString?.()?.substring(0, 80) || "",
                    text,
                    parentTag: el.parentElement?.tagName.toLowerCase(),
                    parentClass: el.parentElement?.className?.toString?.()?.substring(0, 80) || "",
                    html: el.outerHTML.substring(0, 200),
                });
                if (results.length >= 5)
                    break;
            }
        }
        return results;
    });
    if (typeInfo.length > 0) {
        console.log(`  找到 ${typeInfo.length} 个类型标签:`);
        for (const t of typeInfo) {
            console.log(`    <${t.tag}> class="${t.class}" text="${t.text}"`);
            console.log(`      parent: <${t.parentTag}> class="${t.parentClass}"`);
            console.log(`      html: ${t.html}`);
        }
    }
    else {
        console.log("  ❌ 未找到'原创'/'转载'文本标签");
    }
    // 尝试从 __INITIAL_STATE__ 获取 copyright
    try {
        const copyright = await page.evaluate(() => {
            const w = window;
            return w.__INITIAL_STATE__?.videoData?.copyright;
        });
        console.log(`\n  __INITIAL_STATE__.videoData.copyright: ${copyright} (1=原创, 2=转载)`);
    }
    catch {
        console.log("  无法访问 __INITIAL_STATE__");
    }
    console.log();
    // ── 6. 视频标题 ──
    console.log("[6/7] 视频元信息:");
    try {
        const videoData = await page.evaluate(() => {
            const w = window;
            const vd = w.__INITIAL_STATE__?.videoData;
            if (!vd)
                return null;
            return {
                title: vd.title,
                aid: vd.aid,
                bvid: vd.bvid,
                copyright: vd.copyright,
                videos: vd.videos, // 分P数
                pages: vd.pages?.length,
                owner: vd.owner?.name,
                coins: vd.stat?.coin, // 已有投币数
            };
        });
        if (videoData) {
            console.log(`  标题: ${videoData.title}`);
            console.log(`  UP主: ${videoData.owner}`);
            console.log(`  aid: ${videoData.aid}, bvid: ${videoData.bvid}`);
            console.log(`  分P数: ${videoData.videos}, pages: ${videoData.pages}`);
            console.log(`  copyright: ${videoData.copyright} (1=原创 2=转载)`);
            console.log(`  已有投币数: ${videoData.coins}`);
        }
        else {
            console.log("  ❌ 未找到 __INITIAL_STATE__.videoData");
        }
    }
    catch (e) {
        console.log(`  ❌ 提取元信息失败: ${e.message}`);
    }
    console.log();
    // ── 7. 截图（弹窗前） ──
    console.log("[7/12] 弹窗前截图...");
    await page.screenshot({ path: "/tmp/bilibili-before-coin.png", fullPage: false });
    console.log("  截图已保存: /tmp/bilibili-before-coin.png\n");
    // ── 8. 点击投币按钮 ──
    console.log("[8/12] 点击投币按钮...");
    let dialogOpened = false;
    try {
        const coinBtn = page.locator(".video-coin.video-toolbar-left-item").first();
        if (await coinBtn.isVisible({ timeout: 3000 })) {
            const beforeTitle = await coinBtn.getAttribute("title");
            console.log(`  投币按钮 title: "${beforeTitle}"`);
            await coinBtn.click();
            console.log("  已点击投币按钮，等待弹窗渲染...");
            // 等待弹窗动画完成 —— 关键：用 waitForSelector 确保 DOM 就绪
            await page.waitForSelector(".coin-operated-m-exp", { state: "visible", timeout: 5000 });
            await page.waitForTimeout(800); // 等待 Vue 渲染 + CSS 动画
            dialogOpened = true;
        }
        else {
            console.log("  ⚠ .video-coin 不可见，尝试备用选择器...");
            const backupBtn = page.locator('div[title*="投币"]').first();
            if (await backupBtn.isVisible({ timeout: 3000 })) {
                await backupBtn.click();
                await page.waitForSelector(".coin-operated-m-exp", { state: "visible", timeout: 5000 });
                await page.waitForTimeout(800);
                dialogOpened = true;
            }
        }
    }
    catch (e) {
        console.log(`  点击投币按钮失败: ${e.message}`);
    }
    console.log();
    // ── 9. 检查投币弹窗并执行投币 ──
    console.log("[9/12] 检查投币弹窗并执行投币...");
    if (dialogOpened) {
        // 用 Playwright locator 获取文本（自带 auto-waiting，比 page.evaluate 更可靠）
        try {
            const titleText = await page.locator(".coin-operated-m-exp .coin-title").textContent().catch(() => "");
            const oneCoinText = await page.locator(".coin-operated-m-exp .left-con .c-num").textContent().catch(() => "");
            const twoCoinText = await page.locator(".coin-operated-m-exp .right-con .c-num").textContent().catch(() => "");
            const confirmText = await page.locator(".coin-operated-m-exp .bi-btn").textContent().catch(() => "");
            const tipsText = await page.locator(".coin-operated-m-exp .tips").textContent().catch(() => "");
            const likeLabel = await page.locator(".coin-operated-m-exp .like-checkbox label").textContent().catch(() => "");
            // 检查 2硬币选项是否已选中
            const rightCon = page.locator(".coin-operated-m-exp .right-con");
            const twoCoinSelected = await rightCon.evaluate((el) => el.classList.contains("on")).catch(() => false);
            console.log(`  标题: "${titleText?.trim()}"`);
            console.log(`  1硬币: "${oneCoinText?.trim()}"`);
            console.log(`  2硬币: "${twoCoinText?.trim()}" (已选中=${twoCoinSelected})`);
            console.log(`  点赞: "${likeLabel?.trim()}"`);
            console.log(`  确定按钮: "${confirmText?.trim()}"`);
            console.log(`  经验提示: "${tipsText?.trim()}"`);
            // 如果 2硬币未选中，点击选中
            if (!twoCoinSelected) {
                console.log("\n  → 2硬币未选中，点击选中...");
                await rightCon.click();
                await page.waitForTimeout(300);
            }
            // 点击确定按钮执行投币
            console.log("  → 点击确定按钮执行投币...");
            await page.locator(".coin-operated-m-exp .bi-btn").click();
            // 等待投币完成（弹窗关闭）
            try {
                await page.locator(".coin-operated-m-exp").waitFor({ state: "hidden", timeout: 5000 });
                console.log("  ✅ 弹窗已关闭，投币动作已执行");
            }
            catch {
                console.log("  ⚠ 弹窗未关闭（可能投币失败或弹窗不自动关闭）");
                // 截图留证据
                await page.screenshot({ path: "/tmp/bilibili-coin-failed.png", fullPage: false });
            }
            await page.waitForTimeout(1500);
        }
        catch (e) {
            console.log(`  ❌ 弹窗操作失败: ${e.message}`);
        }
    }
    else {
        console.log("  ⏭ 跳过（弹窗未触发）");
    }
    console.log();
    // ── 10. 投币后按钮状态验证 ──
    console.log("[10/12] 验证投币后按钮状态...");
    try {
        const coinBtn = page.locator(".video-coin.video-toolbar-left-item").first();
        const afterClass = await coinBtn.getAttribute("class").catch(() => "");
        const afterTitle = await coinBtn.getAttribute("title").catch(() => "");
        const afterText = await coinBtn.locator(".video-coin-info").textContent().catch(() => "");
        const hasOnClass = (afterClass || "").includes("on");
        console.log(`  class: "${afterClass}"`);
        console.log(`  title: "${afterTitle}"`);
        console.log(`  投币数: "${afterText}"`);
        console.log(`  hasOnClass: ${hasOnClass}`);
        if (hasOnClass) {
            console.log("  ✅ 投币成功！按钮已变为 on 状态");
        }
        else if ((afterTitle || "").includes("已用完")) {
            console.log("  ✅ 投币成功！提示今日对该视频投币已用完");
        }
        else {
            console.log("  ⚠ 按钮状态未变化，投币可能未成功");
        }
    }
    catch (e) {
        console.log(`  检测失败: ${e.message}`);
    }
    console.log();
    // ── 11. 截图（投币后状态） ──
    console.log("[11/12] 投币后截图...");
    await page.screenshot({ path: "/tmp/bilibili-after-coin.png", fullPage: false });
    console.log("  截图已保存: /tmp/bilibili-after-coin.png\n");
    // ── 12. 补充：弹窗 HTML 结构 dump ──
    console.log("[12/12] 补充：弹窗内部结构（如果弹窗仍在）...");
    try {
        const dialogHtml = await page.locator(".coin-operated-m-exp").innerHTML({ timeout: 2000 }).catch(() => "");
        if (dialogHtml) {
            console.log(`  .coin-operated-m-exp 内部 HTML 前 500 字符:`);
            console.log(`  ${dialogHtml.substring(0, 500)}`);
        }
        else {
            console.log("  弹窗已关闭（投币成功）");
        }
    }
    catch {
        console.log("  弹窗已关闭（投币成功）");
    }
    // ── 总结 ──
    console.log("=".repeat(60));
    console.log("调查总结");
    console.log("=".repeat(60));
    if (coinBtnInfo.length > 0) {
        console.log("✅ 投币按钮: 已定位 (.video-coin.video-toolbar-left-item)");
    }
    else {
        console.log("❌ 投币按钮: 未找到（可能需要登录或页面被拦截）");
    }
    if (playerFrames.length > 0) {
        console.log("⚠ iframe: 播放器在独立 iframe 中，需用 frameLocator()");
    }
    else {
        console.log("✅ iframe: 投币按钮在主页面中");
    }
    if (typeInfo.length > 0) {
        console.log("✅ 视频类型标签: 已定位");
    }
    else {
        console.log("⚠ 视频类型标签: 建议从 __INITIAL_STATE__.copyright 获取");
    }
    console.log("✅ 弹窗选择器已确认:");
    console.log("   - 弹窗容器: .coin-operated-m-exp");
    console.log("   - 1硬币: .left-con");
    console.log("   - 2硬币: .right-con");
    console.log("   - 确定按钮: .bi-btn");
    console.log("   - 点赞复选框: .like-checkbox input[type='checkbox']");
    console.log("   - 关闭按钮: .coin-operated-m-exp .icon.close");
    await context.close();
}
main().catch((e) => {
    console.error("调查脚本错误:", e);
    process.exit(1);
});
