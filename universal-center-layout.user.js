// ==UserScript==
// @name         万象归中-猹王
// @namespace    http://tampermonkey.net/
// @version      4.0.1
// @description  按网站域名独立控制页面居中显示，最大宽度700px，两侧留白。每个网站单独记忆开关状态，默认关闭。
// @author       猹王
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/Fcgushu/userscripts/main/universal-center-layout.user.js
// @downloadURL  https://raw.githubusercontent.com/Fcgushu/userscripts/main/universal-center-layout.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 存储键前缀
    const STORAGE_PREFIX = 'center_layout_';
    // 样式表 ID
    const STYLE_ID = 'center-layout-style';

    // 获取当前网站域名（不含端口）
    function getHostname() {
        return window.location.hostname;
    }

    // 获取当前网站的存储键
    function getStorageKey() {
        return STORAGE_PREFIX + getHostname();
    }

    // 读取当前网站的开关状态，默认关闭
    function isEnabled() {
        return GM_getValue(getStorageKey(), false);
    }

    // 保存当前网站的开关状态
    function setEnabled(enabled) {
        GM_setValue(getStorageKey(), enabled);
    }

    // 生成 CSS 样式
    function getCSS() {
        return `
            /* 页面内容居中显示 */
            html {
                overflow-x: hidden;
            }
            body {
                max-width: 700px !important;
                margin-left: auto !important;
                margin-right: auto !important;
                width: 100% !important;
                box-sizing: border-box !important;
                padding-left: 16px !important;
                padding-right: 16px !important;
            }
        `;
    }

    // 应用样式
    function applyStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = getCSS();
        document.documentElement.appendChild(style);
    }

    // 移除样式
    function removeStyle() {
        const style = document.getElementById(STYLE_ID);
        if (style) style.remove();
    }

    // 切换当前网站的居中状态
    function toggle() {
        const newState = !isEnabled();
        setEnabled(newState);
        if (newState) {
            applyStyle();
        } else {
            removeStyle();
        }
        updateMenu();
    }

    // 更新菜单文字
    let menuCommandId;
    function updateMenu() {
        if (menuCommandId !== undefined) {
            GM_unregisterMenuCommand(menuCommandId);
        }
        const hostname = getHostname();
        const enabled = isEnabled();
        const label = enabled
            ? '✅ [' + hostname + '] 居中已开启（点击关闭）'
            : '❌ [' + hostname + '] 居中已关闭（点击开启）';
        menuCommandId = GM_registerMenuCommand(label, toggle);
    }

    // 初始化
    function init() {
        updateMenu();
        if (isEnabled()) {
            applyStyle();
        }
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
