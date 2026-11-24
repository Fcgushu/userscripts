// ==UserScript==
// @name         豆瓣清谈-猹王
// @namespace    local.cleanreader
// @version      1.0.1
// @author       猹王
// @description  豆瓣小组话题页：保留标题/作者/时间/正文，清除评论/回应/推荐/导航/浮层，正文居中白卡，缩放自适应
// @match        https://www.douban.com/group/topic/*
// @match        https://douban.com/group/topic/*
// @run-at       document-idle
// @grant        none
// @noframes
// @downloadURL  https://raw.githubusercontent.com/Fcgushu/userscripts/main/douban-topic-clean-reader.user.js
// @updateURL    https://raw.githubusercontent.com/Fcgushu/userscripts/main/douban-topic-clean-reader.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 参数区：每个站点只改这里 ====================
  var CFG = {
    WIDTH: 700,             // 正文内容宽（卡片总宽 = WIDTH + PAD*2）
    PAD: 34,                // 白卡左右内边距
    BG: '#f4f5f7',          // 页面底色
    CARD_BG: '#ffffff',     // 卡片底色
    RADIUS: 14,             // 卡片圆角
    FONT_RATIO: 1.3,        // 正文字号倍数；1.3 = 放大到 130%（图片不受影响）
    LINE_HEIGHT_MIN: 1.72,  // 行高低于该倍数才放宽；0 = 完全不动行高
    LINE_HEIGHT: 1.9,       // 沉浸阅读行高（倍数）；字号放大后按此重算，不再沿用原站点比例
    PARA_GAP: 20,           // 正文段落间距（px）：沉浸阅读取约半行高，过大会散
    IMG_GAP: 32,            // 正文图片上下留白（px）
    PAD_Y: 44,              // 白卡上下内边距（px）
    IMG_SHRINK: 0,          // 0 = 图片保持原样不缩放
    IMG_ZOOM: true,         // 点击大图全屏查看
    PROGRESS: false,        // 顶部阅读进度条（2026-11-24 用户固定要求：关闭）
    // 哪些路径算"正文页"（只有正文页做清爽化；列表页只居中不清理）
    // 建议按目标站点实际 URL 调整；拿不准就先用默认，装上后看角标再收窄
    READ_PATH: /\/group\/topic\/\d+/,
    // 出现这些字样的短块视为推荐/评论等杂项
    JUNK_WORDS: '回应|全部回应|条回应|发表回应|回复|评论|加入小组|相关小组|小组介绍|小组规则|扫码|下载豆瓣客户端|客户端|分享到|收藏|喜欢|更多小组',
    // 豆瓣每条评论都带 /people/ 作者链接，若设 '/people/' 会把评论区当正文保护，故留空
    AUTHOR_HREF: '',
    LONG: 100,              // 判定"长段落"的字数门槛（定位正文用）
    DEBUG_PARAM: 'cleanread' // 地址后加 ?cleanread=1 显示左下角诊断角标
  };
  // ================================================================

  var W = CFG.WIDTH;
  var PAD = CFG.PAD;
  var CARD = W + PAD * 2;
  var LONG = CFG.LONG;
  var TEXT_MIN = 20;

  function readPage() { return CFG.READ_PATH.test(location.pathname); }
  function vw() { return document.documentElement.clientWidth; }
  function nText(el) { return (el.innerText || '').replace(/\s+/g, ''); }
  function textLen(el) { return nText(el).length; }
  function hide(el) {
    if (!el || el.nodeType !== 1 || el.hasAttribute('data-cr-hide')) return 0;
    el.setAttribute('data-cr-hide', '');
    return 1;
  }
  function junkRe() { return new RegExp(CFG.JUNK_WORDS); }

  // 记录改过的行内样式，换页时逐条还原
  var TOUCHED = [];
  function sp(el, prop, val) {
    if (!el || !el.style) return;
    el.style.setProperty(prop, val, 'important');
    for (var i = 0; i < TOUCHED.length; i++) {
      if (TOUCHED[i].el === el) {
        if (TOUCHED[i].props.indexOf(prop) < 0) TOUCHED[i].props.push(prop);
        return;
      }
    }
    TOUCHED.push({ el: el, props: [prop] });
  }

  var CSS = [
    'html[data-cr-read] body{background:' + CFG.BG + '!important;margin:0!important;padding:0!important;}',
    '[data-cr-col]{box-sizing:border-box!important;width:min(' + CARD + 'px,96vw)!important;',
    'max-width:min(' + CARD + 'px,96vw)!important;margin-left:auto!important;margin-right:auto!important;',
    'margin-top:24px!important;margin-bottom:48px!important;padding:' + CFG.PAD_Y + 'px ' + PAD + 'px!important;',
    'background:' + CFG.CARD_BG + '!important;border-radius:' + CFG.RADIUS + 'px!important;',
    'box-shadow:0 1px 2px rgba(0,0,0,.04),0 10px 30px rgba(0,0,0,.06)!important;}',
    '[data-cr-col] img{max-width:100%!important;height:auto!important;border-radius:6px;}',
    '[data-cr-col] video,[data-cr-col] table{max-width:100%!important;}',
    '[data-cr]{width:min(' + W + 'px,92vw)!important;max-width:min(' + W + 'px,92vw)!important;',
    'margin-left:auto!important;margin-right:auto!important;box-sizing:border-box!important;}',
    '[data-cr-rail]{display:none!important;}',
    '[data-cr-hide]{display:none!important;}',
    'img[data-cr-img]{cursor:zoom-in!important;}',
    '#cr-progress{position:fixed;left:0;top:0;height:3px;width:0;z-index:2147483646;pointer-events:none;',
    'background:linear-gradient(90deg,#f04142,#ff8a3d);transition:width .08s linear;}',
    '#cr-mask{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.88);z-index:2147483647;',
    'display:flex;align-items:center;justify-content:center;cursor:zoom-out;}',
    '#cr-mask img{max-width:92vw;max-height:92vh;border-radius:4px;}',
    '#cr-badge{position:fixed;left:8px;bottom:8px;z-index:2147483647;background:rgba(0,0,0,.82);color:#fff;',
    'font:11px/1.45 monospace;padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre;',
    'max-width:96vw;max-height:60vh;overflow:hidden;}'
  ].join('');

  function ensureStyle() {
    if (document.getElementById('cr-style')) return;
    var s = document.createElement('style');
    s.id = 'cr-style';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------- 找正文 ----------
  function isLeaf(el) {
    return !el.querySelector('div,p,section,article,ul,ol,li,figure,table,h1,h2,h3,h4,h5,h6,blockquote');
  }

  // 评论区容器：标题含「回应 (N)」等字样 + 多个子项。正文宿主在 cutBelow 里不会被判到，安全
  function isCommentZone(el) {
    if (!el || el.nodeType !== 1) return false;
    var head = nText(el).slice(0, 120);
    if (!/全部回应|回应\s*\(?\s*\d+|发表回应|条回应|全部评论|评论\s*\(\s*\d+|共\s*\d+\s*回应/.test(head)) return false;
    return el.children.length >= 2;
  }

  function isJunk(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isCommentZone(el)) return true;
    if (el.tagName === 'VIDEO') return true;
    if (el.querySelector('video')) return true;
    var t = nText(el);
    if (t.length >= 150) return false;
    if (el.querySelector('p')) return false;
    if (CFG.AUTHOR_HREF && el.querySelector('a[href*="' + CFG.AUTHOR_HREF + '"]')) return false;
    var links = el.querySelectorAll('a[href*="/video/"],a[href*="/article/"],a[href*="/post/"],a[href*="/news/"],a[href*="/p/"]');
    if (links.length >= 2) return true;
    if (/\d+\s*万?\s*(次)?播放|播放\s*\d+|评论\s*\d+/.test(t) && t.length < 120) return true;
    if (junkRe().test(t) && t.length < 80) return true;
    return false;
  }

  function longBlocks(min) {
    var out = [];
    var nodes = document.body.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,blockquote,span,section,article,figcaption');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.closest('[data-cr-hide]')) continue;
      if (!isLeaf(el)) continue;
      if (el.getBoundingClientRect().width < 150) continue;
      if (textLen(el) < min) continue;
      if (isJunk(el)) continue;
      out.push(el);
    }
    return out;
  }

  function lca(list) {
    if (!list.length) return null;
    if (list.length === 1) return list[0].parentElement || null;
    var a = list[0];
    for (var i = 1; i < list.length; i++) {
      var b = list[i];
      while (a && !a.contains(b)) a = a.parentElement;
      if (!a) return null;
    }
    return a;
  }

  function findHost() {
    var blocks = longBlocks(LONG);
    if (!blocks.length) blocks = longBlocks(40);
    if (!blocks.length) blocks = longBlocks(TEXT_MIN);
    if (!blocks.length) return null;

    var host = lca(blocks);
    if (!host) return null;
    if (blocks.length > 1) {
      var longLen = 0;
      for (var i = 0; i < blocks.length; i++) longLen += textLen(blocks[i]);
      // 公共祖先里塞了评论/推荐（文字量远大于长段落之和）→ 退回最长那一段的父级
      if (textLen(host) > longLen * 2.2 + 400) {
        blocks.sort(function (a, b) { return textLen(b) - textLen(a); });
        host = blocks[0].parentElement || host;
      }
    }
    return host;
  }

  function hasSideCol(parent, main) {
    var kids = parent.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] === main || kids[i].contains(main)) continue;
      var r = kids[i].getBoundingClientRect();
      if (r.width >= 120 && r.height >= 120) return true;
    }
    return false;
  }

  // 正文所在的那一列：从正文往上取，祖先明显变宽（开始装侧栏）就停
  function findCol(host) {
    var hw = host.getBoundingClientRect().width || 700;
    var limit = Math.min(1150, Math.max(hw + 100, 720));
    var col = host;
    var el = host;
    while (el && el !== document.body) {
      var w = el.getBoundingClientRect().width;
      if (w > limit) break;
      col = el;
      el = el.parentElement;
    }
    // 作者行如果不在这一层里，往上抬一层一起装进卡片（前提：那层没有侧栏）
    var p = col.parentElement;
    if (p && p !== document.body && CFG.AUTHOR_HREF) {
      var pw = p.getBoundingClientRect().width;
      if (pw <= 1150 && p.querySelector('a[href*="' + CFG.AUTHOR_HREF + '"]') && !hasSideCol(p, col)) col = p;
    }
    return col;
  }

  // ---------- 清理 ----------
  function hideJunk(col) {
    var n = 0;
    var nodes = col.querySelectorAll('div,section,ul,ol,li,figure,aside');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].closest('[data-cr-hide]')) continue;
      if (!isJunk(nodes[i])) continue;
      n += hide(nodes[i]);
    }
    return n;
  }

  function hideChrome(col) {
    var n = 0, i, el, r;
    var cr = col.getBoundingClientRect();

    var tags = document.querySelectorAll('header,nav,footer,aside');
    for (i = 0; i < tags.length; i++) {
      el = tags[i];
      if (el.contains(col) || col.contains(el)) continue;
      r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 10) continue;
      n += hide(el);
    }

    // 固定/粘性浮层：悬浮按钮、二维码弹窗、吸顶条
    var all = document.body.getElementsByTagName('*');
    for (i = 0; i < all.length; i++) {
      el = all[i];
      if (el.hasAttribute('data-cr-hide')) continue;
      if (el.contains(col) || col.contains(el)) continue;
      if (el.id && el.id.indexOf('cr-') === 0) continue;   // 别把自己人藏了
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      r = el.getBoundingClientRect();
      if (r.width < 30 || r.height < 12) continue;
      n += hide(el);
    }

    // 贴顶的导航条：矮、多链接或有输入框、在正文上方
    var tops = document.body.querySelectorAll('div,section,ul');
    for (i = 0; i < tops.length; i++) {
      el = tops[i];
      if (el.hasAttribute('data-cr-hide') || el.contains(col) || col.contains(el)) continue;
      if (el.id && el.id.indexOf('cr-') === 0) continue;
      r = el.getBoundingClientRect();
      if (r.top > 4 || r.height > 150 || r.width < 300) continue;
      if (r.top + r.height > cr.top) continue;
      if (el.querySelectorAll('a').length >= 2 || el.querySelector('input,button')) n += hide(el);
    }

    // 正文左右两侧的栏
    var sides = document.body.querySelectorAll('div,aside,section');
    for (i = 0; i < sides.length; i++) {
      el = sides[i];
      if (el.hasAttribute('data-cr-hide') || el.contains(col) || col.contains(el)) continue;
      if (el.id && el.id.indexOf('cr-') === 0) continue;
      r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 60) continue;
      if (r.right <= cr.left + 8 || r.left >= cr.right - 8) n += hide(el);
    }
    return n;
  }

  function keepAsContent(el) {
    if (CFG.AUTHOR_HREF && el.querySelector('a[href*="' + CFG.AUTHOR_HREF + '"]')) return true;
    var blocks = el.querySelectorAll('p,div');
    for (var i = 0; i < blocks.length; i++) {
      if (isLeaf(blocks[i]) && textLen(blocks[i]) >= LONG) return true;
    }
    return false;
  }

  // 评论区：正文之后、正文之外、含多个用户主页链接的块。豆瓣每条评论都带 /people/ 链接，用它兜底
  function killComments(host) {
    var n = 0;
    var all = document.body.querySelectorAll('div,section,ul,ol,article');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.hasAttribute('data-cr-hide') || el.hasAttribute('data-cr-col')) continue;
      if (el.id && el.id.indexOf('cr-') === 0) continue;
      if (host.contains(el) || el.contains(host)) continue;   // 正文自身与祖先不动
      if (el.querySelectorAll('a[href*="/people/"]').length < 3) continue;
      if (!(host.compareDocumentPosition(el) & 4)) continue;  // 4 = DOCUMENT_POSITION_FOLLOWING
      n += hide(el);
    }
    return n;
  }

  // 正文之后的一切（推荐、评论、相关阅读）
  function cutBelow(host, col) {
    var n = 0;
    var cur = host;
    while (cur && cur.parentElement && cur !== col.parentElement) {
      var p = cur.parentElement;
      var kids = [].slice.call(p.children);
      var after = false;
      for (var k = 0; k < kids.length; k++) {
        var sib = kids[k];
        if (sib === cur) { after = true; continue; }
        if (!after || sib.hasAttribute('data-cr-hide')) continue;
        if (keepAsContent(sib) && !isCommentZone(sib)) continue;
        n += hide(sib);
      }
      cur = p;
    }
    return n;
  }

  // ---------- 版式：压成单列 + 居中 ----------
  function layout(col, host) {
    var el = host;
    while (el && el !== col) {
      sp(el, 'width', '100%');
      sp(el, 'max-width', '100%');
      sp(el, 'margin-left', '0');
      sp(el, 'margin-right', '0');
      sp(el, 'box-sizing', 'border-box');
      el = el.parentElement;
    }
    el = col.parentElement;
    while (el && el !== document.documentElement) {
      var cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') {
        sp(el, 'display', 'block');
        sp(el, 'width', '100%');
        sp(el, 'max-width', 'none');
        sp(el, 'margin-left', '0');
        sp(el, 'margin-right', '0');
        sp(el, 'padding-left', '0');
        sp(el, 'padding-right', '0');
        sp(el, 'transform', 'none');
      }
      el = el.parentElement;
    }
  }

  function centerCol(col) {
    col.style.removeProperty('left');
    var r = col.getBoundingClientRect();
    var dx = Math.round((vw() - r.width) / 2 - r.left);
    if (Math.abs(dx) <= 1) return 0;
    sp(col, 'position', 'relative');
    sp(col, 'left', dx + 'px');
    r = col.getBoundingClientRect();
    var err = Math.round(r.left - (vw() - r.width) / 2);
    if (Math.abs(err) > 2) {
      col.style.removeProperty('left');
      r = col.getBoundingClientRect();
      sp(col, 'margin-left', Math.round((vw() - r.width) / 2) + 'px');
      sp(col, 'margin-right', '0');
      r = col.getBoundingClientRect();
      err = Math.round(r.left - (vw() - r.width) / 2);
    }
    return err;
  }

  // ---------- 阅读体验 ----------
  function tidyText(host) {
    var n = 0;
    var nodes = host.querySelectorAll('p,li,blockquote,div,span,h1,h2,h3,h4,h5,h6');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!isLeaf(el)) continue;
      var txt = nText(el);
      var len = txt.length;
      if (len < 6 || (el.getBoundingClientRect().width || 0) < 150) continue;

      // 纯符号分隔线：弱化，不跟着正文放大
      if (/^[\-—=*~_·.]{4,}$/.test(txt)) {
        sp(el, 'font-size', '12px');
        sp(el, 'line-height', '18px');
        sp(el, 'margin-top', '14px');
        sp(el, 'margin-bottom', '14px');
        sp(el, 'color', '#b9b9b9');
        continue;
      }

      if (!el.hasAttribute('data-cr-fs')) {
        var cs = getComputedStyle(el);
        var fs = parseFloat(cs.fontSize);
        var lh = parseFloat(cs.lineHeight);
        if (!fs) continue;
        el.setAttribute('data-cr-fs', fs);
        el.setAttribute('data-cr-lh', lh || '');
      }
      var f = parseFloat(el.getAttribute('data-cr-fs'));
      var l = parseFloat(el.getAttribute('data-cr-lh'));
      if (!f) continue;
      var nf = f * CFG.FONT_RATIO;

      // 正文内小标题 / 目录编号行：加粗、行高收紧、留白与正文区分，避免被当成普通段落
      var isHead = /^h[1-6]$/i.test(el.tagName) ||
        /^[一二三四五六七八九十百]+[、.．]\s*\S/.test(txt) ||
        /^\d{1,2}[、.．]\s*\S/.test(txt) ||
        /^（[一二三四五六七八九十\d]+）/.test(txt);
      if (isHead && len <= 40) {
        sp(el, 'font-size', Math.round(nf) + 'px');
        sp(el, 'line-height', Math.round(nf * 1.5) + 'px');
        sp(el, 'font-weight', '700');
        sp(el, 'margin-top', '16px');
        sp(el, 'margin-bottom', '6px');
        n++;
        continue;
      }

      // 普通正文：字号放大后行高按目标倍数重算，不再沿用原站点偏紧比例
      sp(el, 'font-size', nf.toFixed(1) + 'px');
      var want = Math.round(nf * CFG.LINE_HEIGHT);
      var keep = l ? Math.round(l * CFG.FONT_RATIO) : 0;
      sp(el, 'line-height', Math.max(want, keep) + 'px');
      n++;
      if (CFG.PARA_GAP) sp(el, 'margin-bottom', CFG.PARA_GAP + 'px');
    }
    return n;
  }

  function markImages(col) {
    var imgs = col.querySelectorAll('img');
    var target = Math.round(Math.min(col.getBoundingClientRect().width || W, W) * (CFG.IMG_SHRINK || 1));
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.closest('[data-cr-hide]')) continue;
      var r = img.getBoundingClientRect();
      if (r.width < 180 || r.height < 80) continue;
      img.setAttribute('data-cr-img', '');
      // 图文留白 + 居中：字号放大后图片贴着文字会显得局促
      if (CFG.IMG_GAP) {
        sp(img, 'display', 'block');
        sp(img, 'margin-top', CFG.IMG_GAP + 'px');
        sp(img, 'margin-bottom', CFG.IMG_GAP + 'px');
        sp(img, 'margin-left', 'auto');
        sp(img, 'margin-right', 'auto');
      }
      if (CFG.IMG_SHRINK && img.naturalWidth > target && r.width > target) {
        sp(img, 'width', target + 'px');
        sp(img, 'max-width', target + 'px');
        sp(img, 'height', 'auto');
        sp(img, 'display', 'block');
        sp(img, 'margin-left', 'auto');
        sp(img, 'margin-right', 'auto');
      }
    }
  }

  function progressBar() {
    if (!CFG.PROGRESS) return;
    var b = document.getElementById('cr-progress');
    if (!b) {
      b = document.createElement('div');
      b.id = 'cr-progress';
      document.body.appendChild(b);
      window.addEventListener('scroll', progressBar, { passive: true });
    }
    var h = document.documentElement.scrollHeight - window.innerHeight;
    b.style.width = (h > 60 ? Math.min(100, Math.max(0, window.scrollY / h * 100)) : 0) + '%';
  }

  // ---------- 非正文页（列表/频道页）：只居中 ----------
  function usable(el) {
    if (el === document.body || el === document.documentElement) return false;
    if (el.closest('header,nav,footer')) return false;
    var r = el.getBoundingClientRect();
    var minW = Math.min(360, Math.round(vw() * 0.8));
    if (r.width < minW || r.width > 1200) return false;
    return r.height >= 200;
  }

  function applyFeed() {
    var cands = [], i, el;
    var nodes = document.body.querySelectorAll('div,article,section,main');
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      if (!usable(el) || textLen(el) < 120) continue;
      cands.push(el);
    }
    if (!cands.length) return null;
    var tag = cands.slice();
    for (i = 0; i < cands.length; i++) {
      var p = cands[i].parentElement;
      while (p && p !== document.body) {
        if (p.querySelector('header,nav')) break;
        var w = p.getBoundingClientRect().width;
        if (w > W + 20 && w <= 1200 && w <= vw() - 2 && tag.indexOf(p) < 0) tag.push(p);
        p = p.parentElement;
      }
    }
    for (i = 0; i < tag.length; i++) tag[i].setAttribute('data-cr', '');
    return tag;
  }

  // ---------- 主流程 ----------
  // host/col 一次认定就锁住：每轮重跑重新往上找会一层层飘，最后把整页容器当成正文列
  var CACHE = { href: '', host: null, col: null };

  function resolve() {
    if (CACHE.href === location.pathname && CACHE.col && CACHE.col.isConnected && CACHE.host && CACHE.host.isConnected) {
      return CACHE;
    }
    var host = findHost();
    if (!host) return null;
    CACHE = { href: location.pathname, host: host, col: findCol(host) };
    return CACHE;
  }

  function applyRead() {
    var got = resolve();
    if (!got || !got.col) return null;
    var host = got.host;
    var col = got.col;

    col.setAttribute('data-cr-col', '');
    document.documentElement.setAttribute('data-cr-read', '');

    var hidden = 0;
    hidden += hideJunk(col);
    hidden += hideChrome(col);
    hidden += cutBelow(host, col);
    hidden += killComments(host);

    layout(col, host);
    var cw = Math.min(CARD, Math.round(vw() * 0.96));
    sp(col, 'width', cw + 'px');
    sp(col, 'max-width', cw + 'px');
    sp(col, 'min-width', '0');
    sp(col, 'display', 'block');

    var lined = tidyText(host);
    markImages(col);
    var err = centerCol(col);
    if (CFG.PROGRESS) progressBar();

    var r = col.getBoundingClientRect();
    return 'cleanread | ' + location.pathname.slice(0, 22) + ' | vw ' + vw() +
      ' | 卡 ' + Math.round(r.width) + ' L' + Math.round(r.left) + ' 偏移' + err +
      ' | 藏 ' + hidden + ' | 版式 ' + lined +
      ' | cls ' + (col.className || '').toString().slice(0, 28);
  }

  function apply() {
    if (!document.body) return;
    ensureStyle();
    // 防御：即使旧版本留下过进度条节点，也在这里清掉
    if (!CFG.PROGRESS) {
      var oldBar = document.getElementById('cr-progress');
      if (oldBar && oldBar.parentNode) oldBar.parentNode.removeChild(oldBar);
    }

    if (!readPage()) {
      document.documentElement.removeAttribute('data-cr-read');
      var tag = applyFeed();
      badge(tag ? ('cleanread | 列表页 | vw ' + vw() + ' | 容器 ' + tag.length) : ('cleanread | 列表页 未匹配 | vw ' + vw()));
      return;
    }

    var msg;
    try { msg = applyRead(); } catch (e) { msg = 'cleanread | 出错 ' + e.message; }
    badge(msg || 'cleanread | 未匹配正文');
  }

  function badge(msg) {
    if (location.href.indexOf(CFG.DEBUG_PARAM) < 0) {
      var old = document.getElementById('cr-badge');
      if (old) old.textContent = '';
      return;
    }
    var b = document.getElementById('cr-badge');
    if (!b) {
      b = document.createElement('div');
      b.id = 'cr-badge';
      document.body.appendChild(b);
    }
    b.textContent = msg;
    if (document.title.indexOf('cleanread|') !== 0) document.title = 'cleanread| ' + msg;
  }

  // ---------- 点图放大 ----------
  function closeMask() {
    var m = document.getElementById('cr-mask');
    if (!m) return;
    m.style.display = 'none';
    m.innerHTML = '';
  }

  function getMask() {
    var m = document.getElementById('cr-mask');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'cr-mask';
    m.style.display = 'none';
    m.addEventListener('click', closeMask);
    document.body.appendChild(m);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMask();
    });
    return m;
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var img = t.closest('img[data-cr-img]');
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    var m = getMask();
    var big = document.createElement('img');
    big.src = img.currentSrc || img.src;
    m.innerHTML = '';
    m.appendChild(big);
    m.style.display = 'flex';
  }, true);

  // ---------- 重跑、跟随缩放与换页 ----------
  var lastRun = 0;
  function run() {
    lastRun = Date.now();
    try { apply(); } catch (err) { /* 结构异常时不影响阅读 */ }
  }

  var pending = 0;
  function schedule(delay) {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () { pending = 0; run(); }, delay || 260);
  }

  function resetAll() {
    var i, nodes;
    nodes = document.querySelectorAll('[data-cr],[data-cr-col]');
    for (i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute('data-cr');
      nodes[i].removeAttribute('data-cr-col');
    }
    nodes = document.querySelectorAll('[data-cr-hide],[data-cr-rail]');
    for (i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute('data-cr-hide');
      nodes[i].removeAttribute('data-cr-rail');
    }
    nodes = document.querySelectorAll('[data-cr-fs]');
    for (i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute('data-cr-fs');
      nodes[i].removeAttribute('data-cr-lh');
    }
    for (i = 0; i < TOUCHED.length; i++) {
      var t = TOUCHED[i];
      if (!t.el || !t.el.style) continue;
      for (var j = 0; j < t.props.length; j++) t.el.style.removeProperty(t.props[j]);
    }
    TOUCHED = [];
    CACHE = { href: '', host: null, col: null };
    document.documentElement.removeAttribute('data-cr-read');
    var pr = document.getElementById('cr-progress');
    if (pr) pr.style.width = '0';
  }

  var lastHref = location.href;
  function watchUrl() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    resetAll();
    setTimeout(run, 500);
    setTimeout(run, 1400);
  }

  var lastVW = vw(), lastDPR = window.devicePixelRatio || 1;
  function checkViewport() {
    var w = vw(), d = window.devicePixelRatio || 1;
    if (w === lastVW && d === lastDPR) return;
    lastVW = w; lastDPR = d;
    schedule(60);
  }

  run();
  setTimeout(run, 900);
  setTimeout(run, 2400);
  new MutationObserver(function () {
    if (Date.now() - lastRun < 700) return;
    schedule(400);
  }).observe(document.body, { childList: true, subtree: true });
  setInterval(watchUrl, 800);
  setInterval(checkViewport, 300);
  window.addEventListener('resize', function () {
    lastVW = vw(); lastDPR = window.devicePixelRatio || 1; schedule(60);
  });
  if (CFG.PROGRESS) window.addEventListener('scroll', progressBar, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(checkViewport).observe(document.documentElement);
})();
