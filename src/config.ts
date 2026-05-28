import * as path from "path";

export const CONFIG = {
  // 浏览器
  USER_DATA_DIR: path.join(__dirname, "..", "browser-profile"),
  EXECUTABLE_PATH: "/snap/bin/chromium",
  VIEWPORT: { width: 1920, height: 1080 } as const,
  LOCALE: "zh-CN",
  USER_AGENT:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",

  // 超时与等待（毫秒）
  PAGE_GOTO_TIMEOUT: 30000,
  HOME_PAGE_GOTO_TIMEOUT: 20000,
  NAVIGATION_WAIT: 8000,       // 页面跳转后等 React 渲染
  DIALOG_WAIT: 5000,           // 等待弹窗出现/消失
  DIALOG_ANIMATION_WAIT: 800,  // Vue 渲染 + CSS 动画
  BETWEEN_VIDEOS_DELAY: 3000,  // 批量投币时视频间延迟

  // 进度文件
  PROGRESS_FILE: path.join(__dirname, "..", "coined.json"),

  // B站 API
  API_BASE: "https://api.bilibili.com",

  // 选择器
  SELECTORS: {
    COIN_BUTTON: ".video-coin.video-toolbar-left-item",
    COIN_DIALOG: ".coin-operated-m-exp",
    COIN_TITLE: ".coin-operated-m-exp .coin-title",
    ONE_COIN: ".coin-operated-m-exp .left-con",
    TWO_COIN: ".coin-operated-m-exp .right-con .c-num",
    TWO_COIN_BOX: ".coin-operated-m-exp .right-con",
    CONFIRM_BTN: ".coin-operated-m-exp .bi-btn",
    TIPS: ".coin-operated-m-exp .tips",
    LIKE_CHECKBOX: ".coin-operated-m-exp .like-checkbox label",
    USER_AVATAR: ".header-avatar-wrap",
    LOGIN_ENTRY: ".header-login-entry",
  },
} as const;
