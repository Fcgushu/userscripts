// ==UserScript==
// @name         头条清读-猹王
// @namespace    local.toutiao.reader
// @version      6.0.4
// @author       猹王
// @description  www.toutiao.com 文章/微头条页：正文压成一列 700px 居中白卡，字号保持站点原样，清掉导航/浮层/推荐/评论等一切干扰，图片点击放大；简悦阅读/聚焦模式自动让路；清除关注按钮与作者热门作品推荐
// @match        https://www.toutiao.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// @downloadURL  https://raw.githubusercontent.com/Fcgushu/userscripts/main/toutiao-clean-reader.user.js
// @updateURL    https://raw.githubusercontent.com/Fcgushu/userscripts/main/toutiao-clean-reader.user.js
// ==/UserScript==

(function () {
  'use strict';

  var W = 700;              // 正文内容宽度
  var PAD = 34;             // 白卡左右内边距
  var CARD = W + PAD * 2;   // 白卡总宽
  var LONG = 100;           // 长段落门槛（用来定位正文）
  var TEXT_MIN = 20;

  function readPage() { return /^\/(article|group|w)\//.test(location.pathname); }
  function vw() { return document.documentElement.clientWidth; }
  function nText(el) { return (el.innerText || '').replace(/\s+/g, ''); }
  function textLen(el) { return nText(el).length; }

  // ---------- 与简悦（SimpRead）共存 ----------
  // 简悦会往页面里插 sr-* / .simpread-* 节点，并给 body 加 simpread-hidden 类。
  // 这些节点一律不碰；进入阅读/聚焦模式时本脚本全部撤回并休眠，退出后自动恢复。
  function isSimpread(el) {
    if (!el || el.nodeType !== 1) return false;
    if (/^sr-/i.test(el.tagName || '') || /^sr-/i.test(el.id || '')) return true;
    var cls = (el.className && el.className.toString()) || '';
    if (/(^|\s)simpread[\w-]*/i.test(cls)) return true;
    if (el.closest && el.closest('.simpread-read-root,.simpread-focus-root,sr-rd-content,sr-rd-title,sr-rd-crlbar,#simpread')) return true;
    return false;
  }

  function simpreadActive() {
    if (!document.body) return false;
    var cls = ((document.body.className || '') + ' ' + (document.documentElement.className || '')).toString();
    if (/simp(?:read|led)[\w-]*-(?:read|focus|hidden)/i.test(cls)) return true;
    var nodes = document.querySelectorAll('.simpread-read-root,.simpread-focus-root,sr-rd-content,sr-rd-title,sr-rd-crlbar,#simpread');
    for (var i = 0; i < nodes.length; i++) {
      var cs;
      try { cs = getComputedStyle(nodes[i]); } catch (e) { continue; }
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = nodes[i].getBoundingClientRect();
      if (r.width > 40 && r.height > 40) return true;
    }
    return false;
  }

  function hide(el) {
    if (!el || el.nodeType !== 1 || el.hasAttribute('data-tt700-hide')) return 0;
    if (isSimpread(el)) return 0;   // 简悦的按钮/工具栏不藏
    el.setAttribute('data-tt700-hide', '');
    return 1;
  }

  // 记录我们改过的行内样式，换页时逐条还原
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
    'html[data-tt700-read] body{background:#f4f5f7!important;margin:0!important;padding:0!important;}',
    '[data-tt700-col]{box-sizing:border-box!important;width:min(' + CARD + 'px,96vw)!important;',
    'max-width:min(' + CARD + 'px,96vw)!important;margin-left:auto!important;margin-right:auto!important;',
    'margin-top:24px!important;margin-bottom:48px!important;padding:' + PAD + 'px!important;',
    'background:#fff!important;border-radius:14px!important;',
    'box-shadow:0 1px 2px rgba(0,0,0,.04),0 10px 30px rgba(0,0,0,.06)!important;}',
    '[data-tt700-col] img{max-width:100%!important;height:auto!important;border-radius:6px;}',
    '[data-tt700-col] video,[data-tt700-col] table{max-width:100%!important;}',
    '[data-tt700]{width:min(' + W + 'px,92vw)!important;max-width:min(' + W + 'px,92vw)!important;',
    'margin-left:auto!important;margin-right:auto!important;box-sizing:border-box!important;}',
    '[data-tt700-rail]{display:none!important;}',
    '[data-tt700-hide]{display:none!important;}',
    'img[data-tt700-img]{cursor:zoom-in!important;}',
    '#tt700-mask{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.88);z-index:2147483647;',
    'display:flex;align-items:center;justify-content:center;cursor:zoom-out;}',
    '#tt700-mask img{max-width:92vw;max-height:92vh;border-radius:4px;}',
    '#tt700-badge{position:fixed;left:8px;bottom:8px;z-index:2147483647;background:rgba(0,0,0,.82);color:#fff;',
    'font:11px/1.45 monospace;padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre;',
    'max-width:96vw;max-height:60vh;overflow:hidden;}'
  ].join('');

  function ensureStyle() {
    if (document.getElementById('tt700-style')) return;
    var s = document.createElement('style');
    s.id = 'tt700-style';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------- 找正文 ----------
  function isLeaf(el) {
    return !el.querySelector('div,p,section,article,ul,ol,li,figure,table,h1,h2,h3,h4,h5,h6,blockquote');
  }

  function junkText(t) {
    return /(小视频|相关推荐|相关阅读|推荐阅读|热门推荐|为你推荐|猜你喜欢|查看更多|热门评论|全部评论|条评论|人参与|去首页|扫码下载)/.test(t);
  }

  // 作者推广卡：关注按钮 + TA的热门作品 + 作品列表项。
  // 这类块带作者链接，旧版会被当成正文保留，必须优先判掉。
  // 文本很短才判，避免误伤正文里碰巧提到这些词的长段落。
  function isAuthorPromo(el) {
    if (!el || el.nodeType !== 1) return false;
    var t = nText(el);
    if (!t) return false;
    if (t.length > 400) return false;
    if (/^(关注|已关注|\+关注|\+ 关注)$/.test(t)) return true;
    if (/(TA的热门作品|他的热门作品|TA的作品|他的作品|更多作品|TA的精选)/.test(t)) return true;
    if (/^\d+\s*阅读\s*\d+\s*(小时|分钟|天|周|月)前$/.test(t)) return true;
    if (/关注/.test(t) && el.querySelector('button') && el.querySelector('a[href*="/c/user/"]')) return true;
    return false;
  }

  function isJunk(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isSimpread(el)) return false;
    if (isAuthorPromo(el)) return true;
    if (el.tagName === 'VIDEO') return true;
    if (el.querySelector('video')) return true;
    var t = nText(el);
    // 有较多文字 / 有段落 / 有作者链接 —— 当正文，不判杂项
    if (t.length >= 150) return false;
    if (el.querySelector('p')) return false;
    if (el.querySelector('a[href*="/c/user/"]')) return false;
    var links = el.querySelectorAll('a[href*="/video/"],a[href*="/article/"],a[href*="/w/"],a[href*="/group/"]');
    if (links.length >= 2) return true;
    if (/\d+\s*万?\s*(次)?播放|播放\s*\d+|评论\s*\d+/.test(t) && t.length < 120) return true;
    if (junkText(t) && t.length < 60) return true;
    return false;
  }

  function longBlocks(min) {
    var out = [];
    var nodes = document.body.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,blockquote,span,section,article,figcaption');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.closest('[data-tt700-hide]')) continue;
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
      // 公共祖先里还塞了评论/推荐（文字量远大于长段落之和）→ 退回最长那一段的父级
      if (textLen(host) > longLen * 2.2 + 400) {
        blocks.sort(function (a, b) { return textLen(b) - textLen(a); });
        host = blocks[0].parentElement || host;
      }
    }
    return host;
  }

  // 正文所在的那一列：从正文往上取，但一旦祖先明显变宽（说明那一层开始装侧栏了）就停，
  // 这样作者行会跟着正文进卡片，侧栏留在卡片外被清掉
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
    // 作者行如果不在这一层里，往上抬一层把它一起装进卡片（前提是那一层没有侧栏）
    var p = col.parentElement;
    if (p && p !== document.body) {
      var pw = p.getBoundingClientRect().width;
      if (pw <= 1150 && p.querySelector('a[href*="/c/user/"]') && !hasSideCol(p, col)) col = p;
    }
    return col;
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

  // ---------- 清理 ----------
  // 列内杂项
  function hideJunk(col) {
    var n = 0;
    var nodes = col.querySelectorAll('div,section,ul,ol,li,figure,aside,button');
    for (var i = 0; i < nodes.length; i++) {
      if (isSimpread(nodes[i])) continue;
      if (nodes[i].closest('[data-tt700-hide]')) continue;
      if (!isJunk(nodes[i])) continue;
      n += hide(nodes[i]);
    }
    return n;
  }

  // 全站骨架：顶栏、导航、浮层、左右栏
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

    // 固定 / 粘性浮层：悬浮按钮、扫码弹窗、吸顶条
    var all = document.body.getElementsByTagName('*');
    for (i = 0; i < all.length; i++) {
      el = all[i];
      if (el.hasAttribute('data-tt700-hide')) continue;
      if (el.contains(col) || col.contains(el)) continue;
      if (el.id && el.id.indexOf('tt700') >= 0) continue;   // 别把自己人藏了
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      r = el.getBoundingClientRect();
      if (r.width < 30 || r.height < 12) continue;
      n += hide(el);
    }

    // 贴顶的导航条：矮、有多个链接、在正文上方
    var tops = document.body.querySelectorAll('div,section,ul');
    for (i = 0; i < tops.length; i++) {
      el = tops[i];
      if (el.hasAttribute('data-tt700-hide') || el.contains(col) || col.contains(el)) continue;
      if (el.id && el.id.indexOf('tt700') >= 0) continue;
      r = el.getBoundingClientRect();
      if (r.top > 4 || r.height > 150 || r.width < 300) continue;
      if (r.top + r.height > cr.top) continue;
      if (el.querySelectorAll('a').length >= 2 || el.querySelector('input,button')) n += hide(el);
    }

    // 正文左右两侧的栏
    var sides = document.body.querySelectorAll('div,aside,section');
    for (i = 0; i < sides.length; i++) {
      el = sides[i];
      if (el.hasAttribute('data-tt700-hide') || el.contains(col) || col.contains(el)) continue;
      if (el.id && el.id.indexOf('tt700') >= 0) continue;
      r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 60) continue;
      if (r.right <= cr.left + 8 || r.left >= cr.right - 8) n += hide(el);
    }
    return n;
  }

  // 正文之后的一切（视频卡、小视频、推荐、评论、相关阅读）
  function keepAsContent(el) {
    if (isAuthorPromo(el)) return false;   // 作者推广卡即便带作者链接也不算正文
    if (el.querySelector('a[href*="/c/user/"]')) return true;
    var blocks = el.querySelectorAll('p,div');
    for (var i = 0; i < blocks.length; i++) {
      if (isLeaf(blocks[i]) && textLen(blocks[i]) >= LONG) return true;
    }
    return false;
  }

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
        if (!after || sib.hasAttribute('data-tt700-hide')) continue;
        if (keepAsContent(sib)) continue;
        n += hide(sib);
      }
      cur = p;
    }
    return n;
  }

  // ---------- 版式：压成单列 + 居中 ----------
  function layout(col, host) {
    // 正文到列之间：撑满卡片内容宽
    var el = host;
    while (el && el !== col) {
      sp(el, 'width', '100%');
      sp(el, 'max-width', '100%');
      sp(el, 'margin-left', '0');
      sp(el, 'margin-right', '0');
      sp(el, 'box-sizing', 'border-box');
      el = el.parentElement;
    }
    // 列之上：逐层退回普通全宽块，消掉固定宽度、flex 布局、偏移与位移
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
  // 行高：字号不动，只把过紧的行距放到 1.85
  function tidyText(host) {
    var n = 0;
    var nodes = host.querySelectorAll('p,li,blockquote,div,span');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!isLeaf(el) || textLen(el) < TEXT_MIN) continue;
      if (!el.hasAttribute('data-tt700-fs')) {
        var cs = getComputedStyle(el);
        var fs = parseFloat(cs.fontSize);
        var lh = parseFloat(cs.lineHeight);
        if (!fs) continue;
        el.setAttribute('data-tt700-fs', fs);
        el.setAttribute('data-tt700-lh', lh || '');
      }
      var f = parseFloat(el.getAttribute('data-tt700-fs'));
      var l = parseFloat(el.getAttribute('data-tt700-lh'));
      if (!f || !l) continue;
      if (l / f < 1.72) {
        sp(el, 'line-height', Math.round(f * 1.85) + 'px');
        n++;
      }
    }
    return n;
  }

  function markImages(root) {
    var imgs = root.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.closest('[data-tt700-hide]')) continue;
      var r = img.getBoundingClientRect();
      if (r.width < 180 || r.height < 80) continue;
      img.setAttribute('data-tt700-img', '');
    }
  }

  // ---------- 非正文页（频道流、热榜）：只居中 ----------
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
    if (!cands.length) return { ok: false };
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
    for (i = 0; i < tag.length; i++) tag[i].setAttribute('data-tt700', '');
    return { ok: true, tag: tag };
  }

  // ---------- 主流程 ----------
  var TAGGED = [];

  // 正文宿主和正文列一旦认定就锁住：每轮重跑都重新往上找的话，
  // 会因为版式已被我们改过而一层层往上飘，最后把整页容器当成正文列
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
    if (!got || !got.col) return { ok: false };
    var host = got.host;
    var col = got.col;

    col.setAttribute('data-tt700-col', '');
    document.documentElement.setAttribute('data-tt700-read', '');

    var hidden = 0;
    hidden += hideJunk(col);
    hidden += hideChrome(col);
    hidden += cutBelow(host, col);

    layout(col, host);
    // 卡片宽度每次按视口重算，避免沿用别处写下的 100%
    var cw = Math.min(CARD, Math.round(vw() * 0.96));
    sp(col, 'width', cw + 'px');
    sp(col, 'max-width', cw + 'px');
    sp(col, 'min-width', '0');
    sp(col, 'display', 'block');

    var lined = tidyText(host);
    markImages(col);
    var err = centerCol(col);

    var r = col.getBoundingClientRect();
    return {
      ok: true,
      text: 'tt700 v6.4 | ' + location.pathname.slice(0, 22) + ' | vw ' + vw() +
        ' | 卡 ' + Math.round(r.width) + ' L' + Math.round(r.left) + ' 偏移' + err +
        ' | 藏 ' + hidden + ' | 行高 ' + lined +
        ' | cls ' + (col.className || '').toString().slice(0, 28)
    };
  }

  function apply() {
    if (!document.body) return;
    ensureStyle();

    if (!readPage()) {
      document.documentElement.removeAttribute('data-tt700-read');
      var f = applyFeed();
      badge(f.ok ? ('tt700 v6.4 | 列表页 | vw ' + vw() + ' | 容器 ' + f.tag.length) : ('tt700 v6.4 | 列表页 未匹配 | vw ' + vw()));
      return;
    }

    var out;
    try { out = applyRead(); } catch (e) { out = { ok: false, text: 'tt700 v6.4 | 出错 ' + e.message }; }
    badge(out.text || 'tt700 v6.4 | 未匹配正文');
  }

  function badge(msg) {
    if (location.href.indexOf('tt700=1') < 0) {
      var old = document.getElementById('tt700-badge');
      if (old) old.textContent = '';
      return;
    }
    var b = document.getElementById('tt700-badge');
    if (!b) {
      b = document.createElement('div');
      b.id = 'tt700-badge';
      document.body.appendChild(b);
    }
    b.textContent = msg;
    if (document.title.indexOf('tt700|') !== 0) document.title = 'tt700| ' + msg;
  }

  // ---------- 点图放大 ----------
  function closeMask() {
    var m = document.getElementById('tt700-mask');
    if (!m) return;
    m.style.display = 'none';
    m.innerHTML = '';
  }

  function getMask() {
    var m = document.getElementById('tt700-mask');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'tt700-mask';
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
    var img = t.closest('img[data-tt700-img]');
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
    if (simpreadActive()) {   // 简悦接管期间，本脚本一行都别跑
      if (!simpOn) { simpOn = true; resetAll(); badge('tt700 v6.4 | 简悦接管，清读暂停'); }
      return;
    }
    if (simpOn) { simpOn = false; setTimeout(run, 360); }
    try { apply(); } catch (err) { /* 结构异常时不影响阅读 */ }
  }

  var pending = 0;
  function schedule(delay) {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () { pending = 0; run(); }, delay || 260);
  }

  function resetAll() {
    var i, nodes;
    nodes = document.querySelectorAll('[data-tt700],[data-tt700-col]');
    for (i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute('data-tt700');
      nodes[i].removeAttribute('data-tt700-col');
    }
    nodes = document.querySelectorAll('[data-tt700-hide],[data-tt700-rail]');
    for (i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute('data-tt700-hide');
      nodes[i].removeAttribute('data-tt700-rail');
    }
    nodes = document.querySelectorAll('[data-tt700-fs]');
    for (i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute('data-tt700-fs');
      nodes[i].removeAttribute('data-tt700-lh');
    }
    for (i = 0; i < TOUCHED.length; i++) {
      var t = TOUCHED[i];
      if (!t.el || !t.el.style) continue;
      for (var j = 0; j < t.props.length; j++) t.el.style.removeProperty(t.props[j]);
    }
    TOUCHED = [];
    TAGGED = [];
    CACHE = { href: '', host: null, col: null };
    document.documentElement.removeAttribute('data-tt700-read');
    if (document.title.indexOf('tt700|') === 0) document.title = document.title.replace(/^tt700\|[^|]*\|\s*/, '');
  }

  var lastHref = location.href;
  function watchUrl() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    resetAll();
    setTimeout(run, 500);
    setTimeout(run, 1400);
  }

  // 简悦状态轮询：进入阅读/聚焦模式 → 撤回本脚本全部改动；退出 → 自动恢复清读
  var simpOn = false;
  function watchSimpread() {
    var on = simpreadActive();
    if (on === simpOn) return;
    simpOn = on;
    if (on) { resetAll(); badge('tt700 v6.4 | 简悦接管，清读暂停'); }
    else setTimeout(run, 400);
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
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  setInterval(watchUrl, 800);
  setInterval(watchSimpread, 400);
  setInterval(checkViewport, 300);
  window.addEventListener('resize', function () {
    lastVW = vw(); lastDPR = window.devicePixelRatio || 1; schedule(60);
  });
})();
