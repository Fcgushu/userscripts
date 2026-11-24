// ==UserScript==
// @name         Reddit 净读-猹王
// @namespace    reddit-clean-reader
// @version      4.0.1
// @description  详情页只留标题/正文/图片/评论区；列表页保留原始卡片样式，仅居中 500px 并缩至 85%
// @author       猹王
// @match        https://www.reddit.com/*
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Fcgushu/userscripts/main/reddit-clean-reader.user.js
// @downloadURL  https://raw.githubusercontent.com/Fcgushu/userscripts/main/reddit-clean-reader.user.js
// ==/UserScript==

(function () {
  'use strict';

  const WIDTH = 500;       // 内容列宽度（px）
  const ZOOM_DETAIL = 1;   // 详情页缩放 100%
  const ZOOM_LIST = 0.85;  // 列表页缩放 85%
  const ROOT_ID = 'rc-reader';

  // 帖子配图所在容器（图片帖 / 图集 / 单图）
  const MEDIA_SEL = '[slot="post-media-container"], gallery-carousel, img#post-image';

  // 详情页保留内容内部的非正文元素
  const HIDE = [
    'shreddit-comment-action-row',
    'shreddit-post-overflow-menu',
    'shreddit-post-share-button',
    'award-button',
    'faceplate-dropdown-menu',
  ].map(s => `#${ROOT_ID} ${s}`).join(',');

  const style = document.createElement('style');
  style.textContent = `
    /* 只有成功抽出内容后才清场，避免整页空白 */
    html.rc-on body > *:not(#${ROOT_ID}) { display: none !important; }
    html.rc-on body { margin: 0 !important; padding: 0 !important; }

    #${ROOT_ID}.rc-detail { zoom: ${ZOOM_DETAIL}; }
    #${ROOT_ID}.rc-list { zoom: ${ZOOM_LIST}; }
    #${ROOT_ID} .rc-col {
      width: ${WIDTH}px;
      margin: 0 auto;
      padding: 24px 0 160px;
      box-sizing: content-box;
    }
    #${ROOT_ID} .rc-post [slot="title"] { display: block; margin: 0 0 12px; }
    #${ROOT_ID} .rc-post [slot="text-body"] { margin: 0; }
    #${ROOT_ID} .rc-comments { margin-top: 32px; }
    #${ROOT_ID} img { max-width: 100%; height: auto; }
    #${ROOT_ID} pre { overflow-x: auto; }

    ${HIDE} { display: none !important; }
    /* 懒加载容器里如果装的是图片就放行，别把图一起清掉 */
    #${ROOT_ID} shreddit-async-loader:not(:has(img, video, figure)) { display: none !important; }
  `;
  document.head.appendChild(style);

  const isPostPage = () => /\/comments\//.test(location.pathname);

  // 找不到时再穿透 shadow root 找一次（Reddit 大量组件带 shadow DOM）
  function findAll(sel) {
    const found = [...document.querySelectorAll(sel)];
    if (found.length) return found;
    const out = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (!el.shadowRoot) continue;
        out.push(...el.shadowRoot.querySelectorAll(sel));
        walk(el.shadowRoot);
      }
    };
    walk(document);
    return out;
  }

  function rootEl() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    return root;
  }

  function column(root, mode) {
    root.className = mode;          // rc-detail / rc-list，决定缩放
    root.textContent = '';
    const col = document.createElement('div');
    col.className = 'rc-col';
    root.appendChild(col);
    return col;
  }

  /* ---------- 详情页：只留标题、配图、正文、评论区 ---------- */
  function renderPost() {
    const post = document.querySelector('shreddit-post');
    if (!post) return false;

    // 顶层楼层：没有 shreddit-comment 祖先的那些（子回复本身嵌套在父楼层里）
    const tops = findAll('shreddit-comment')
      .filter(c => !c.parentElement || !c.parentElement.closest('shreddit-comment'));

    const root = rootEl();
    const scope = post.closest('article[data-post-id]') || post;
    const title = scope.querySelector('[slot="title"]') ||
                  scope.querySelector('h1, h2, h3, a[href*="/comments/"]');
    const body = scope.querySelector('[slot="text-body"]') || scope.querySelector('.md');
    // 配图可能上一轮已经被搬进容器了，root 里找得到就复用
    const media = scope.querySelector(MEDIA_SEL) || root.querySelector(MEDIA_SEL);

    const col = column(root, 'rc-detail');

    const wrap = document.createElement('article');
    wrap.className = 'rc-post';
    if (title) wrap.appendChild(title.cloneNode(true));
    if (media) wrap.appendChild(media);            // 移动真实节点，保住画廊/懒加载
    if (body) wrap.appendChild(body.cloneNode(true));
    col.appendChild(wrap);

    if (tops.length) {
      const holder = document.createElement('div');
      holder.className = 'rc-comments';
      for (const c of tops) holder.appendChild(c); // 移动真实节点，保住折叠与懒加载
      col.appendChild(holder);
    }
    return true;
  }

  /* ---------- 列表页：整块搬走帖子容器，样式除居中外不动 ---------- */
  function listItems() {
    const all = [...document.querySelectorAll('article[data-post-id], shreddit-post')];
    return all.filter(el => el.tagName === 'ARTICLE' || !el.closest('article[data-post-id]'));
  }

  function commonParent(nodes) {
    const up = n => { const a = []; for (let e = n; e; e = e.parentElement) a.push(e); return a; };
    let node = nodes[0];
    for (const n of nodes.slice(1)) {
      const b = up(n);
      node = up(node).find(x => b.includes(x));
      if (!node) return null;
    }
    return node;
  }

  function renderList() {
    const items = listItems();
    if (!items.length) return false;

    const root = rootEl();
    const col = column(root, 'rc-list');

    // 整体搬容器，Reddit 自己的间距/网格/响应式类全部保留
    let feed = commonParent(items);
    if (feed && (feed === document.body || feed.tagName === 'HTML' ||
                 feed.querySelector('reddit-header-large'))) {
      feed = null;                       // 容器范围太大，退回逐个搬
    }

    if (feed) {
      col.appendChild(feed);
    } else {
      const gap = parseFloat(getComputedStyle(items[0]).marginBottom) || 12;
      for (const el of items) {
        el.style.marginBottom = gap + 'px';
        col.appendChild(el);
      }
    }
    return true;
  }

  function render() {
    const ok = isPostPage() ? renderPost() : renderList();
    if (ok) document.documentElement.classList.add('rc-on');
    return ok;
  }

  let pending = false;
  let lastHref = location.href;

  function maybeRender() {
    const root = document.getElementById(ROOT_ID);
    const on = document.documentElement.classList.contains('rc-on');

    if (location.href !== lastHref) {           // SPA 跳转：丢弃旧内容重建
      lastHref = location.href;
      if (root) root.querySelectorAll('shreddit-comment').forEach(c => c.remove());
      document.documentElement.classList.remove('rc-on');
      render();
      return;
    }
    if (!on || !root || !root.firstChild) { render(); return; }

    // 详情页：评论区是懒加载的，出现了就补进去
    if (isPostPage() && !root.querySelector('shreddit-comment') &&
        findAll('shreddit-comment').length) {
      render();
    }
  }

  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; maybeRender(); }, 300);
  }

  schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
})();
