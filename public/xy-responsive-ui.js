(function () {
  function txt(el) {
    return (el && el.innerText ? el.innerText : '').trim();
  }

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function hasNavText(t) {
    return (
      t.indexOf('今日提交监督') !== -1 ||
      t.indexOf('每日任务') !== -1 ||
      t.indexOf('任务总表') !== -1 ||
      t.indexOf('生成周报') !== -1 ||
      t.indexOf('我的周报') !== -1 ||
      t.indexOf('任务认领') !== -1 ||
      t.indexOf('填写周报') !== -1 ||
      t.indexOf('账号管理') !== -1 ||
      t.indexOf('修改密码') !== -1
    );
  }

  function looksLikeWholePage(el) {
    var t = txt(el);

    if (el === document.body || el === document.documentElement) return true;

    if (el.querySelector('main, .main, .content, .page-content, .app-main')) {
      return true;
    }

    if (
      t.indexOf('筛选') !== -1 ||
      t.indexOf('任务列表') !== -1 ||
      t.indexOf('今日工作内容') !== -1 ||
      t.indexOf('新增任务') !== -1 ||
      t.indexOf('工作台') !== -1
    ) {
      return true;
    }

    if (t.length > 500) return true;

    return false;
  }

  function findSidebar() {
    var candidates = Array.from(document.querySelectorAll('aside, nav, .sidebar, .side-nav'));

    var scored = candidates
      .filter(function (el) {
        var t = txt(el);
        if (!hasNavText(t)) return false;
        if (looksLikeWholePage(el)) return false;

        var links = el.querySelectorAll('a, button').length;
        if (links < 2) return false;

        return true;
      })
      .map(function (el) {
        var links = el.querySelectorAll('a, button').length;
        var score = links * 10 - txt(el).length / 20;

        if (el.tagName.toLowerCase() === 'aside') score += 30;
        if (el.tagName.toLowerCase() === 'nav') score += 20;
        if (el.classList.contains('sidebar')) score += 20;
        if (el.classList.contains('side-nav')) score += 20;

        return { el: el, score: score };
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });

    return scored[0] ? scored[0].el : null;
  }

  function findMain(sidebar) {
    var candidates = Array.from(document.querySelectorAll('main, .main, .content, .page-content, .app-main'));

    var found = candidates.find(function (el) {
      if (sidebar && (el === sidebar || sidebar.contains(el) || el.contains(sidebar))) return false;

      var t = txt(el);

      return (
        t.indexOf('任务总表') !== -1 ||
        t.indexOf('每日任务') !== -1 ||
        t.indexOf('今日提交监督') !== -1 ||
        t.indexOf('填写') !== -1 ||
        t.indexOf('工作台') !== -1 ||
        t.indexOf('周报') !== -1 ||
        t.indexOf('账号管理') !== -1
      );
    });

    if (found) return found;

    var children = Array.from(document.body.children).filter(function (el) {
      if (el.classList.contains('xy-mobile-menu-btn')) return false;
      if (el.classList.contains('xy-mobile-sidebar-mask')) return false;
      if (sidebar && (el === sidebar || sidebar.contains(el))) return false;

      var t = txt(el);
      return t.length > 30 && !looksLikeWholePage(sidebar || document.createElement('div'));
    });

    return children[0] || null;
  }

  function clearWrongMarks(sidebar, main) {
    document.querySelectorAll('.xy-mobile-sidebar-target').forEach(function (el) {
      if (el !== sidebar) el.classList.remove('xy-mobile-sidebar-target');
    });

    document.querySelectorAll('.xy-mobile-main-target').forEach(function (el) {
      if (el !== main) el.classList.remove('xy-mobile-main-target');
    });
  }

  function markLayout() {
    var sidebar = findSidebar();
    var main = findMain(sidebar);

    clearWrongMarks(sidebar, main);

    if (sidebar) {
      sidebar.classList.add('xy-mobile-sidebar-target');
      document.body.classList.add('xy-has-mobile-sidebar');
    } else {
      document.body.classList.remove('xy-has-mobile-sidebar');
      document.body.classList.remove('xy-sidebar-open');
    }

    if (main) {
      main.classList.add('xy-mobile-main-target');
    }
  }

  function ensureControls() {
    if (!document.querySelector('.xy-mobile-menu-btn')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'xy-mobile-menu-btn';
      btn.innerHTML = '☰';
      btn.setAttribute('aria-label', '打开导航');

      btn.addEventListener('click', function () {
        document.body.classList.toggle('xy-sidebar-open');
      });

      document.body.appendChild(btn);
    }

    if (!document.querySelector('.xy-mobile-sidebar-mask')) {
      var mask = document.createElement('div');
      mask.className = 'xy-mobile-sidebar-mask';

      mask.addEventListener('click', function () {
        document.body.classList.remove('xy-sidebar-open');
      });

      document.body.appendChild(mask);
    }
  }

  function wrapTables() {
    document.querySelectorAll('table').forEach(function (table) {
      if (table.closest('.xy-mobile-table-wrap')) return;

      var wrap = document.createElement('div');
      wrap.className = 'xy-mobile-table-wrap';

      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function markTableForms() {
    document.querySelectorAll('table form').forEach(function (form) {
      form.classList.add('xy-table-form');
    });
  }

  function closeSidebarOnClick() {
    var sidebar = findSidebar();
    if (!sidebar || sidebar.dataset.xyMobileCloseReady === '1') return;

    sidebar.dataset.xyMobileCloseReady = '1';

    sidebar.addEventListener('click', function (e) {
      if (!isMobile()) return;

      var target = e.target.closest('a, button');
      if (!target) return;

      setTimeout(function () {
        document.body.classList.remove('xy-sidebar-open');
      }, 120);
    });
  }

  function run() {
    document.body.classList.add('xy-mobile-display-ready');

    markLayout();
    ensureControls();
    wrapTables();
    markTableForms();
    closeSidebarOnClick();
  }

  document.addEventListener('DOMContentLoaded', function () {
    run();
    setTimeout(run, 300);
    setTimeout(run, 900);
    setTimeout(run, 1600);
  });

  window.addEventListener('resize', function () {
    run();
  });
})();
