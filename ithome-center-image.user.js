// ==UserScript==
// @name         IT之家披图-猹王
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  正文与评论区统一居中、宽度 680px；正文图片默认 40%，悬停 60%，按住 92%
// @author       猹王
// @license      MIT
//
// ▼▼▼ 生效域名 ▼▼▼
//    已经配好 IT之家全站：www.ithome.com / m.ithome.com / 其他子域都命中
//    只想限定某个子域的话，改成如 *://www.ithome.com/*
// @match        *://*.ithome.com/*
// ▲▲▲ 只改上面这行 ▲▲▲
//
// @grant        none
// @run-at       document-body
// @noframes
// @downloadURL  https://raw.githubusercontent.com/Fcgushu/userscripts/main/ithome-center-image.user.js
// @updateURL    https://raw.githubusercontent.com/Fcgushu/userscripts/main/ithome-center-image.user.js
// ==/UserScript==

(function () {
  'use strict';

  const CSS = `
/* ========== 1. 正文和评论区整体居中，宽度540px ========== */
.post_content,
#paragraph,
#post_comm,
.comm_list,
.comm-con {
  max-width: 540px !important;
  width: 100% !important;
  margin-left: auto !important;
  margin-right: auto !important;
  box-sizing: border-box !important;
}

/* ========== 2. 正文图片缩小到 40% ========== */
.post_content img.lazy,
#paragraph img.lazy,
.post_content img,
#paragraph img {
  max-width: 40% !important;
  width: auto !important;
  height: auto !important;
  display: block !important;
  margin: 8px auto !important;
  border-radius: 8px !important;
  box-shadow: 0 2px 10px rgba(0,0,0,0.12) !important;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
  cursor: zoom-in !important;
}

/* ========== 3. 悬停放大到 60% ========== */
.post_content img.lazy:hover,
#paragraph img.lazy:hover,
.post_content img:hover,
#paragraph img:hover {
  max-width: 60% !important;
  box-shadow: 0 6px 20px rgba(0,0,0,0.18) !important;
  transform: translateY(-2px) !important;
}

/* ========== 4. 按住鼠标放大 ========== */
.post_content img.lazy:active,
#paragraph img.lazy:active,
.post_content img:active,
#paragraph img:active {
  max-width: 92% !important;
  max-width: min(92vw, 1000px) !important;
  transform: scale(1.05) translateY(-4px) !important;
  box-shadow: 0 12px 40px rgba(0,0,0,0.3) !important;
  cursor: zoom-out !important;
  position: relative !important;
  z-index: 100 !important;
}

/* ========== 5. 正文字体保持不变，段落样式不变 ========== */
.post_content,
#paragraph {
  font-size: unset !important;
}

/* 注意：不再修改评论区字体和图片大小 */
`;

  const style = document.createElement('style');
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);
})();
