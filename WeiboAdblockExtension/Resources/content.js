(function () {
  'use strict';

  // 微博给推广内容打的角标文字。按“角标文字”认广告，不按 class 名认，
  // 因为微博的 class 名是构建时生成的哈希，改版就变；角标文字一直是这几个。
  var AD_LABELS = { '广告': true, '热推': true, '推广': true };
  var HOT_LABEL = '荐'; // 热搜里推广条目的角标
  var MAX_CLIMB = 8;    // 从角标往上找卡片根节点，最多爬 8 层
  var MIN_CARD_TEXT = 40; // 卡片根节点正文长度至少这么多字，避免误删角标自己的小容器（用户名+时间一般不到 40 字，短广告也得认）
  var MAX_CARD_TEXT = 4000; // 超过这个长度的就不是单条微博，是整个列表容器，不删

  var removedCount = 0;
  var paused = false;
  var processed = new WeakSet(); // 已经处理过的角标元素，不重复处理
  var removedCards = new WeakSet(); // 已经删过的卡片，不重复计数

  function log() {
    try { console.log.apply(console, ['[微博去广告]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  // 叶子元素且文字正好是广告角标
  function isAdBadge(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.children.length !== 0) return false;
    var t = (el.textContent || '').trim();
    return !!AD_LABELS[t];
  }

  function isHotBadge(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.children.length !== 0) return false;
    return (el.textContent || '').trim() === HOT_LABEL;
  }

  // 从角标往上找它所属的那条微博卡片。
  // 优先用语义结构：article / 微博移动版 .card / 桌面版 Feed 卡片；
  // 注意：Feed_wrap 是装多条微博的列表容器，绝不是卡片，不能进选择器
  // （之前版本误把它当卡片，删一条广告会连整个列表一起删掉，已修复）；
  // 都没有时用通用办法：往上爬，第一个“父级里有多个兄弟、且正文够长”的祖先就是卡片。
  function findCardRoot(badge) {
    var article = badge.closest('article');
    if (article) return article;

    var feedCard = badge.closest('div[class*="Feed_body"], .card, .m-panel');
    if (feedCard) return feedCard;

    var cur = badge;
    for (var i = 0; i < MAX_CLIMB && cur.parentElement; i++) {
      cur = cur.parentElement;
      var tag = cur.tagName;
      if (tag === 'BODY' || tag === 'HTML' || tag === 'MAIN') return null;
      // 爬到列表容器就停：容器不是卡片，不能删
      var cls = (typeof cur.className === 'string') ? cur.className : '';
      if (/wrap|list/i.test(cls)) return null;
      var parent = cur.parentElement;
      if (!parent) return null;
      var textLen = (cur.textContent || '').trim().length;
      if (textLen > MAX_CARD_TEXT) return null; // 爬到列表容器了，停住不删
      if (parent.childElementCount >= 2 && textLen >= MIN_CARD_TEXT) return cur;
    }
    return null;
  }

  function removeCard(card) {
    if (!card || removedCards.has(card)) return false;
    var tag = card.tagName;
    if (tag === 'BODY' || tag === 'HTML' || tag === 'MAIN') return false;
    // 保险：一条微博卡片里不可能同时装 3 条以上别的微博卡片，装了就是列表容器，绝不能删
    try {
      var inner = card.querySelectorAll('article, .card, [class*="Feed_body"]');
      if (inner.length >= 3) return false;
    } catch (e) {}
    removedCards.add(card);
    card.remove();
    removedCount++;
    updatePill();
    return true;
  }

  // 热搜里的推广：角标“荐”所在的那个热搜条目
  function removeHotItem(badge) {
    // 先确认它确实在热搜面板里：往上 6 层内能找到带“热搜”二字的祖先
    var cur = badge;
    var inHotPanel = false;
    for (var i = 0; i < 6 && cur.parentElement; i++) {
      cur = cur.parentElement;
      if ((cur.textContent || '').indexOf('热搜') !== -1) { inHotPanel = true; break; }
    }
    if (!inHotPanel) return false;
    var item = badge.closest('li') || badge.closest('a');
    if (!item) return false;
    return removeCard(item);
  }

  // 扫描一棵子树里的角标。root 可能是 document 或 MutationObserver 刚加进来的节点。
  function scan(root) {
    if (paused || !root) return;
    var nodes = [];
    try {
      if (root.nodeType === 1) {
        if (isAdBadge(root) || isHotBadge(root)) nodes.push(root);
        var list = root.querySelectorAll('span, em, i, div, a, button, strong, b');
        for (var j = 0; j < list.length; j++) nodes.push(list[j]);
      } else if (root.nodeType === 9) {
        var all = root.querySelectorAll('span, em, i, div, a, button, strong, b');
        for (var k = 0; k < all.length; k++) nodes.push(all[k]);
      }
    } catch (e) { return; }

    for (var n = 0; n < nodes.length; n++) {
      var el = nodes[n];
      if (processed.has(el)) continue;
      if (isAdBadge(el)) {
        processed.add(el);
        var card = findCardRoot(el);
        if (card) removeCard(card);
      } else if (isHotBadge(el)) {
        processed.add(el);
        removeHotItem(el);
      }
    }
  }

  // 右下角小圆点：显示已屏蔽条数，点一下暂停/恢复，双击隐藏
  var pill = null;
  function updatePill() {
    if (!pill) return;
    pill.textContent = paused ? '已暂停' : ('已屏蔽 ' + removedCount);
    pill.style.opacity = paused ? '0.45' : '0.85';
  }
  function createPill() {
    try {
      if (!document.body || pill) return;
      pill = document.createElement('div');
      pill.textContent = '已屏蔽 0';
      pill.title = '微博去广告：点一下暂停/恢复，双击隐藏';
      pill.style.cssText = 'position:fixed;right:12px;bottom:72px;z-index:2147483647;' +
        'background:#ff8200;color:#fff;font-size:12px;line-height:1;padding:7px 10px;' +
        'border-radius:20px;cursor:pointer;user-select:none;opacity:0.85;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.25);font-family:-apple-system,sans-serif;';
      pill.addEventListener('click', function () {
        paused = !paused;
        if (!paused) scan(document);
        updatePill();
      });
      pill.addEventListener('dblclick', function () { pill.remove(); pill = null; });
      document.body.appendChild(pill);
    } catch (e) {}
  }

  // 兜底样式：旧版微博和带 ad 标记的容器直接隐藏（新版基本走不到这里，无害）
  function injectCss() {
    try {
      var style = document.createElement('style');
      style.textContent = '[feedtype="ad"], [data-ad="1"], .WB_ad_cls { display: none !important; }';
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {}
  }

  // 微博是单页应用，往下刷会不断加载新微博：监听新增节点即时扫描，
  // 再加一个 2 秒一次的兜底扫描跑 60 秒，防止某些懒加载漏网。
  function start() {
    injectCss();
    createPill();
    scan(document);
    try {
      var observer = new MutationObserver(function (mutations) {
        if (paused) return;
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) scan(added[j]);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
    var ticks = 0;
    var timer = setInterval(function () {
      ticks++;
      if (ticks > 30) { clearInterval(timer); return; }
      if (!document.body) return;
      if (!pill) createPill();
      scan(document);
    }, 2000);
    log('已启动，当前页已屏蔽 ' + removedCount + ' 条');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  // 脚本在 document-start 注入时 DOM 还没好，DOMContentLoaded 兜底再跑一次
  document.addEventListener('DOMContentLoaded', function () { scan(document); });

  // 调试用：在控制台输 __weiboAdblock 能看到屏蔽数和暂停状态
  try {
    window.__weiboAdblock = {
      get count() { return removedCount; },
      get paused() { return paused; },
      rescan: function () { scan(document); }
    };
  } catch (e) {}
})();
