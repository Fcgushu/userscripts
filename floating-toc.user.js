// ==UserScript==
// @name         通用悬浮 TOC 目录
// @namespace    workbuddy.wbtoc
// @version      1.2.0
// @description  在大部分网页上生成悬浮目录：按标题层级自动生成（不显示页面主标题）、跟随滚动高亮、自动避让已有目录/回顶控件、默认停靠右缘垂直居中、可拖动/拉伸宽高、内置设置面板（字号/宽度/高度/固定常显/层级编号/深色面板）。默认不启用，需在油猴菜单中按站点开启。
// @author       WorkBuddy
// @match        *://*/*
// @exclude      *://localhost*
// @exclude      *://127.0.0.1*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @downloadURL  https://raw.githubusercontent.com/Fcgushu/userscripts/main/floating-toc.user.js
// @updateURL    https://raw.githubusercontent.com/Fcgushu/userscripts/main/floating-toc.user.js
// ==/UserScript==

(function () {
  'use strict';

  const host = location.hostname;
  const KEY = {
    enabled: 'wbtoc:enabled:' + host,   // 按站点开关，默认 false
    pos:     'wbtoc:pos:' + host,       // 按站点记忆拖动位置
    settings:'wbtoc:settings',          // 全局自定义设置
  };
  const DEF = { font: 14, width: 300, hvh: 60, pin: false, dark: false };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function getSettings() {
    const s = GM_getValue(KEY.settings, {}) || {};
    const out = Object.assign({}, DEF);
    for (const k in DEF) {
      if (s[k] != null) out[k] = typeof DEF[k] === 'number' ? (Number(s[k]) || DEF[k]) : !!s[k];
    }
    out.font = clamp(out.font, 10, 24);
    out.width = clamp(out.width, 220, 520);
    out.hvh = clamp(out.hvh, 20, 90);
    return out;
  }
  let S = getSettings();
  const saveSettings = () => GM_setValue(KEY.settings, S);
  const isEnabled = () => !!GM_getValue(KEY.enabled, false); // 默认不启用

  // ---------- 油猴菜单 ----------
  GM_registerMenuCommand((isEnabled() ? '🟢 关闭' : '⚪ 开启') + '本站目录（' + host + '）', () => {
    GM_setValue(KEY.enabled, !isEnabled());
    location.reload();
  });
  GM_registerMenuCommand('↺ 重置本站目录位置', () => {
    GM_setValue(KEY.pos, null);
    if (isEnabled()) location.reload();
  });

  if (!isEnabled()) return; // 默认关闭：只提供菜单，不注入任何东西

  // ---------- 工具 ----------
  const CSS = (elm, obj) => { for (const k in obj) elm.style.setProperty(k, obj[k]); };
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => (s || '').trim().replace(/\s+/g, ' ').toLowerCase();

  // ---------- 收集标题（剔除页面主标题） ----------
  function collectHeadings() {
    // 优先在正文容器内找；正文容器内标题不足时退回全页
    const containers = ['article', 'main', '#content', '.content', '.post-content', '.article-content', '.markdown-body'];
    let scope = document.body, best = null, bestN = 0;
    for (const c of containers) {
      const n = document.querySelector(c);
      if (!n) continue;
      const cnt = n.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
      if (cnt > bestN) { bestN = cnt; best = n; }
    }
    if (best && bestN >= 3) scope = best;

    const all = [...scope.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    let hs = all.filter(h => {
      if (root && (h === root || root.contains(h))) return false;
      const r = h.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      const t = (h.innerText || '').trim();
      return t.length > 0 && t.length < 200;
    });
    // 剔除与 document.title 相同的标题
    const title = norm(document.title);
    if (title) hs = hs.filter(h => norm(h.innerText) !== title);
    // 第一个 h1 视为页面主标题，不进目录
    if (hs.length && hs[0].tagName === 'H1') hs = hs.slice(1);
    return hs;
  }

  // ---------- 构建嵌套树 + 层级编号 ----------
  function buildTree(headings) {
    const items = headings.map(h => ({
      el: h,
      level: +h.tagName[1],
      text: (h.innerText || '').trim().replace(/\s+/g, ' '),
      children: [],
    }));
    const tree = [], stack = [];
    for (const it of items) {
      while (stack.length && stack[stack.length - 1].level >= it.level) stack.pop();
      if (stack.length) stack[stack.length - 1].children.push(it);
      else tree.push(it);
      stack.push(it);
    }
    return { tree, items };
  }

  // ---------- 检测已有悬浮控件（目录 / 回顶等），返回它们的可视矩形 ----------
  function detectWidgets() {
    const sels = [
      '[class*="toc" i]', '[id*="toc" i]',
      '[class*="catalog" i]', '[id*="catalog" i]',
      '[class*="outline" i]', '[id*="outline" i]',
      '[class*="directory" i]', '[id*="directory" i]',
      '[class*="backtop" i]', '[id*="backtop" i]',
      '[class*="back-to-top" i]', '[class*="back_top" i]',
      '[class*="gotop" i]', '[class*="go-top" i]', '[id*="gotop" i]',
      '[class*="toTop" i]',
    ];
    const rects = [];
    let nodes;
    try { nodes = document.querySelectorAll(sels.join(',')); } catch (e) { return rects; }
    nodes.forEach(n => {
      if (!n || (root && (n === root || root.contains(n)))) return;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = n.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      if (r.left > innerWidth - 4 || r.right < 4 || r.top > innerHeight - 4 || r.bottom < 4) return;
      if (cs.position === 'fixed' || cs.position === 'sticky' || (cs.position === 'absolute' && r.width < 360 && r.height < 600)) {
        rects.push(r);
      }
    });
    return rects;
  }

  function overlap(r, rects, pad) {
    pad = pad || 12;
    return rects.some(w =>
      r.left - pad < w.right && r.right + pad > w.left &&
      r.top - pad < w.bottom && r.bottom + pad > w.top
    );
  }

  // 初始位置：优先右缘垂直居中；与已有控件冲突则依次尝试右顶 / 左居中 / 左顶
  function pickPosition() {
    const saved = GM_getValue(KEY.pos, null);
    if (saved && typeof saved.left === 'number') return { left: saved.left, top: saved.top, saved: true };
    const rects = detectWidgets();
    const w = S.width, hEst = Math.min(innerHeight * S.hvh / 100 + 46, innerHeight * 0.85), m = 4;
    const midTop = () => clamp((innerHeight - hEst) / 2, 8, innerHeight - 60);
    const cands = [
      () => ({ left: innerWidth - w - m, top: midTop() }), // 右缘垂直居中
      () => ({ left: innerWidth - w - m, top: 16 }),        // 右上
      () => ({ left: m, top: midTop() }),                   // 左缘垂直居中
      () => ({ left: m, top: 16 }),                         // 左上
    ];
    for (const c of cands) {
      const p = c();
      const r = { left: p.left, right: p.left + w, top: p.top, bottom: p.top + hEst };
      if (!overlap(r, rects)) return { left: p.left + w - 42, top: p.top, saved: false }; // 返回悬浮球的左坐标
    }
    return { left: innerWidth - 46, top: 16, saved: false };
  }

  // ---------- UI ----------
  let root = null, listEl = null, handleEl = null, panelEl = null, setBox = null;
  let activeItem = null;
  let dragging = false, suppressClick = false, dragOff = { x: 0, y: 0 };
  let resizing = false, rs = { x: 0, y: 0, w: 0, h: 0 };

  function injectStyle() {
    const st = document.createElement('style');
    st.textContent = `
#wbtoc-root{position:fixed;z-index:2147483000;font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  --p-bg:rgba(252,253,255,.93);--p-fg:#232630;--muted:#9aa0ab;--item:#3a3f4a;--accent:#4a6cf7;
  --hov:rgba(74,108,247,.08);--act:rgba(74,108,247,.12);--line:rgba(0,0,0,.06);}
#wbtoc-root.wbtoc-dark{--p-bg:rgba(24,26,32,.94);--p-fg:#e8eaee;--muted:#8b909c;--item:#c6cad3;
  --accent:#7aa2ff;--hov:rgba(122,162,255,.16);--act:rgba(122,162,255,.22);--line:rgba(255,255,255,.08);}
#wbtoc-handle{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;cursor:pointer;user-select:none;
  background:rgba(30,32,38,.7);opacity:.75;
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  box-shadow:0 4px 18px rgba(0,0,0,.18);transition:background .2s,opacity .2s,transform .15s;}
#wbtoc-handle:hover{opacity:1;background:rgba(30,32,38,.92);transform:translateY(-1px);}
#wbtoc-handle svg{width:15px;height:15px;fill:none;stroke:#8fd3ff;stroke-width:2;stroke-linecap:round;}
#wbtoc-panel{display:none;margin-top:8px;box-sizing:border-box;position:relative;
  padding:8px 6px 14px;border-radius:14px;background:rgba(250,251,255,.42);color:var(--p-fg);
  backdrop-filter:blur(26px) saturate(170%);-webkit-backdrop-filter:blur(26px) saturate(170%);
  box-shadow:0 8px 30px rgba(0,0,0,.07);}
#wbtoc-root.wbtoc-dark #wbtoc-panel{background:rgba(22,24,30,.5);}
#wbtoc-root.wbtoc-open #wbtoc-panel{display:block;}
#wbtoc-root.wbtoc-open #wbtoc-handle{display:none;}
#wbtoc-toolbar{display:flex;justify-content:space-between;align-items:center;padding:0 8px 6px;font-size:11px;color:var(--muted);}
#wbtoc-toolbar .wbtoc-act{cursor:pointer;border-radius:6px;padding:2px 6px;user-select:none;}
#wbtoc-toolbar .wbtoc-act:hover{background:rgba(127,127,127,.12);color:var(--accent);}
#wbtoc-setbox{display:none;padding:8px 10px;margin:0 2px 6px;border-radius:10px;background:rgba(127,127,127,.08);font-size:12px;color:var(--p-fg);}
#wbtoc-setbox.wbtoc-show{display:block;}
#wbtoc-setbox .wbtoc-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0;}
#wbtoc-setbox label{display:flex;align-items:center;gap:6px;cursor:pointer;}
#wbtoc-setbox input[type="number"]{width:46px;box-sizing:border-box;}
#wbtoc-setbox input[type="range"]{width:110px;}
#wbtoc-setbox [data-v]{min-width:38px;text-align:right;color:var(--muted);font-size:11px;}
#wbtoc-list{max-height:60vh;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;}
#wbtoc-list ul{list-style:none;margin:0;padding:0 0 0 14px;}
#wbtoc-list li{position:relative;}
#wbtoc-list .wbtoc-caret{position:absolute;left:-12px;top:7px;width:10px;font-size:10px;line-height:1;
  color:var(--muted);cursor:pointer;user-select:none;}
#wbtoc-list .wbtoc-caret:hover{color:var(--accent);}
#wbtoc-list a{display:block;padding:4px 8px;border-radius:8px;color:var(--item);line-height:1.45;
  text-decoration:none;cursor:pointer;white-space:normal;word-break:break-word;font-size:var(--wbtoc-font,14px);
  border-left:2px solid transparent;transition:background .15s,color .15s;}
#wbtoc-list a:hover{background:var(--hov);color:var(--p-fg);}
#wbtoc-list a.wbtoc-active{background:var(--act);color:var(--accent);font-weight:600;border-left-color:var(--accent);}
#wbtoc-resize{position:absolute;right:2px;bottom:2px;width:16px;height:16px;cursor:nwse-resize;border-radius:0 0 10px 0;
  background:linear-gradient(135deg,transparent 45%,var(--muted) 46%,var(--muted) 52%,transparent 53%,
    transparent 62%,var(--muted) 63%,var(--muted) 70%,transparent 71%);opacity:.6;}
#wbtoc-resize:hover{opacity:1;}
#wbtoc-root.wbtoc-dragging{cursor:grabbing;}
#wbtoc-root.wbtoc-dragging #wbtoc-panel,#wbtoc-root.wbtoc-resizing #wbtoc-setbox{display:none;}
`;
    document.documentElement.appendChild(st);
  }

  const ICON = '<svg viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="17" y2="18"/></svg>';

  function buildUI() {
    root = el('div');
    root.id = 'wbtoc-root';
    handleEl = el('div', '', ICON);
    handleEl.id = 'wbtoc-handle';
    handleEl.title = '点击展开/收起 · 按住拖动调整位置';
    panelEl = el('div');
    panelEl.id = 'wbtoc-panel';

    // 工具条：设置 / 全部展开 / 全部收起
    const toolbar = el('div');
    toolbar.id = 'wbtoc-toolbar';
    const gear = el('span', 'wbtoc-act', '⚙ 设置');
    const expandAct = el('span', 'wbtoc-act', '全部展开');
    const collapseAct = el('span', 'wbtoc-act', '全部收起');
    const hideAct = el('span', 'wbtoc-act', '收起');
    gear.onclick = () => setBox.classList.toggle('wbtoc-show');
    expandAct.onclick = () => setAllExpanded(true);
    collapseAct.onclick = () => setAllExpanded(false);
    hideAct.onclick = () => close();
    toolbar.append(gear, expandAct, collapseAct, hideAct);

    // 设置面板
    setBox = el('div');
    setBox.id = 'wbtoc-setbox';
    setBox.innerHTML =
      '<div class="wbtoc-row"><label>字号 <input type="number" min="10" max="24" step="1" data-k="font"></label><span data-v="font"></span></div>' +
      '<div class="wbtoc-row"><label>宽度 <input type="range" min="220" max="520" step="10" data-k="width"></label><span data-v="width"></span></div>' +
      '<div class="wbtoc-row"><label>高度 <input type="range" min="20" max="90" step="5" data-k="hvh"></label><span data-v="hvh"></span></div>' +
      '<div class="wbtoc-row"><label><input type="checkbox" data-k="pin"> 固定常显</label>' +
      '<label><input type="checkbox" data-k="dark"> 深色面板</label></div>';
    wireSettings();

    listEl = el('div');
    listEl.id = 'wbtoc-list';
    const resizeEl = el('div');
    resizeEl.id = 'wbtoc-resize';
    resizeEl.title = '拖动调整宽高';

    panelEl.append(toolbar, setBox, listEl, resizeEl);
    root.append(handleEl, panelEl);
    document.documentElement.appendChild(root);

    applySettings();
    place();

    handleEl.addEventListener('click', () => { if (!suppressClick) togglePanel(); });
    root.addEventListener('mouseleave', () => { if (!S.pin && !dragging) close(); });
    // 点击页面空白处收起（固定常显时除外）
    document.addEventListener('pointerdown', (e) => {
      if (root.classList.contains('wbtoc-open') && !S.pin && !root.contains(e.target)) close();
    });
    if (S.pin) open();

    makeDraggable();
    makeResizable(resizeEl);
  }

  function wireSettings() {
    setBox.querySelectorAll('input').forEach(inp => {
      const k = inp.dataset.k;
      if (inp.type === 'checkbox') {
        inp.checked = !!S[k];
        inp.onchange = () => { S[k] = inp.checked; saveSettings(); applySettings(); };
      } else {
        inp.value = S[k];
        inp.oninput = () => {
          const v = Number(inp.value);
          if (isNaN(v)) return;
          if (k === 'font') S.font = clamp(v, 10, 24);
          else if (k === 'width') S.width = clamp(v, 220, 520);
          else if (k === 'hvh') S.hvh = clamp(v, 20, 90);
          saveSettings(); applySettings(); syncVals();
        };
      }
    });
    syncVals();
  }

  function syncVals() {
    setBox.querySelectorAll('[data-v]').forEach(sp => {
      const k = sp.dataset.v;
      sp.textContent = S[k] + (k === 'hvh' ? '%' : 'px');
    });
  }

  function applySettings() {
    root.style.setProperty('--wbtoc-font', S.font + 'px');
    panelEl.style.width = S.width + 'px';
    listEl.style.maxHeight = Math.round(innerHeight * S.hvh / 100) + 'px';
    root.classList.toggle('wbtoc-dark', !!S.dark);
    if (S.pin) open();
  }

  // 收起时以悬浮球（34px）贴边计算，展开时以面板（S.width）贴边计算
  function clampLeft(left) {
    const w = root.classList.contains('wbtoc-open') ? Math.max(S.width, 60) : 42;
    return clamp(left, 8, innerWidth - w - 4);
  }
  function syncClamp() {
    const r = root.getBoundingClientRect();
    CSS(root, { left: clampLeft(r.left) + 'px' });
  }

  function place() {
    const p = pickPosition();
    let left = p.left, top = p.top;
    left = clampLeft(left);
    top = clamp(top, 8, innerHeight - 60);
    CSS(root, { left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto' });
    root.dataset.savedPos = p.saved ? '1' : '';
  }

  function togglePanel() { root.classList.contains('wbtoc-open') ? close() : open(); }
  function open() { root.classList.add('wbtoc-open'); syncClamp(); }
  function close() { root.classList.remove('wbtoc-open'); syncClamp(); }

  function setAllExpanded(state) {
    listEl.querySelectorAll('ul').forEach(u => { u.style.display = state ? '' : 'none'; });
    listEl.querySelectorAll('.wbtoc-caret').forEach(c => { c.textContent = state ? '▾' : '▸'; });
  }

  // ---------- 渲染目录树 ----------
  function renderTree(tree) {
    const buildUl = (nodes) => {
      const ul = el('ul');
      nodes.forEach(n => {
        const li = el('li');
        const a = el('a', '', escapeHtml(n.text));
        a.dataset.hid = n.id;
        a.onclick = () => {
          n.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (!S.pin) setTimeout(close, 400);
        };
        li.appendChild(a);
        if (n.children.length) {
          const caret = el('span', 'wbtoc-caret', '▾');
          const sub = buildUl(n.children);
          caret.onclick = (e) => {
            e.stopPropagation();
            const hidden = sub.style.display === 'none';
            sub.style.display = hidden ? '' : 'none';
            caret.textContent = hidden ? '▾' : '▸';
          };
          li.appendChild(caret);
          li.appendChild(sub);
        }
        ul.appendChild(li);
      });
      return ul;
    };
    listEl.innerHTML = '';
    listEl.appendChild(buildUl(tree));
  }

  // ---------- 滚动跟随高亮 ----------
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; setActive(); });
  }

  function setActive() {
    if (!state.items.length) return;
    const offset = 90;
    let current = null;
    for (const it of state.items) {
      if (it.el.getBoundingClientRect().top <= offset) current = it;
      else break;
    }
    if (!current) current = state.items[0];
    if (activeItem === current) return;
    activeItem = current;
    listEl.querySelectorAll('a.wbtoc-active').forEach(a => a.classList.remove('wbtoc-active'));
    const link = listEl.querySelector('a[data-hid="' + CSS.escape(current.id) + '"]');
    if (link) {
      link.classList.add('wbtoc-active');
      const lr = link.getBoundingClientRect(), pr = listEl.getBoundingClientRect();
      if (lr.top < pr.top + 10 || lr.bottom > pr.bottom - 10) link.scrollIntoView({ block: 'nearest' });
    }
  }

  // ---------- 拖动（上下左右任意方向） ----------
  function makeDraggable() {
    handleEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true; suppressClick = false;
      root.classList.add('wbtoc-dragging');
      const r = root.getBoundingClientRect();
      dragOff.x = e.clientX - r.left;
      dragOff.y = e.clientY - r.top;
      handleEl.setPointerCapture(e.pointerId);
    });
    handleEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) suppressClick = true;
      let left = clampLeft(e.clientX - dragOff.x);
      let top = e.clientY - dragOff.y;
      top = clamp(top, 8, innerHeight - 60);
      CSS(root, { left: left + 'px', top: top + 'px' });
    });
    handleEl.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      root.classList.remove('wbtoc-dragging');
      handleEl.releasePointerCapture(e.pointerId);
      if (suppressClick) {
        const r = root.getBoundingClientRect();
        GM_setValue(KEY.pos, { left: r.left, top: r.top });
        setTimeout(() => { suppressClick = false; }, 50);
      }
    });
  }

  // ---------- 右下角拉伸宽高 ----------
  function makeResizable(resizeEl) {
    resizeEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      resizing = true;
      root.classList.add('wbtoc-resizing');
      rs = { x: e.clientX, y: e.clientY, w: panelEl.offsetWidth, h: listEl.offsetHeight };
      resizeEl.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    resizeEl.addEventListener('pointermove', (e) => {
      if (!resizing) return;
      const newW = clamp(rs.w + (e.clientX - rs.x), 220, 520);
      const newH = clamp(rs.h - (e.clientY - rs.y), 160, innerHeight * 0.92);
      panelEl.style.width = newW + 'px';
      listEl.style.maxHeight = newH + 'px';
    });
    resizeEl.addEventListener('pointerup', (e) => {
      if (!resizing) return;
      resizing = false;
      root.classList.remove('wbtoc-resizing');
      resizeEl.releasePointerCapture(e.pointerId);
      S.width = clamp(panelEl.offsetWidth, 220, 520);
      S.hvh = clamp(listEl.offsetHeight / innerHeight * 100, 20, 90);
      saveSettings();
      wireSettings(); // 同步设置面板里的滑块数值
    });
  }

  // ---------- 启动 ----------
  const state = { items: [] };
  function init() {
    const headings = collectHeadings();
    if (headings.length < 2) return; // 标题太少，不生成目录
    const { tree, items } = buildTree(headings);
    state.items = items;
    // 给标题打锚点 id（供滚动高亮定位）
    items.forEach((it, idx) => {
      if (!it.el.id) it.el.id = 'wbtoc-h-' + idx;
      it.id = it.el.id;
    });

    injectStyle();
    buildUI();
    renderTree(tree);

    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => {
      applySettings();
      if (!root.dataset.savedPos) place();
    });
    setActive();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
