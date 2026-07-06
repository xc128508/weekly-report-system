(function () {
  function isInternPage() {
    return window.location.pathname.indexOf('/intern') === 0;
  }

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function text(el) {
    return (el && el.innerText ? el.innerText : '').trim();
  }

  function hasInternNavText(t) {
    return (
      t.indexOf('我的周报') !== -1 ||
      t.indexOf('任务认领') !== -1 ||
      t.indexOf('填写周报') !== -1 ||
      t.indexOf('填写日报') !== -1 ||
      t.indexOf('每日任务') !== -1 ||
      t.indexOf('修改密码') !== -1 ||
      t.indexOf('系统管理') !== -1
    );
  }

  function looksLikeWholePage(el) {
    var t = text(el);

    if (!el || el === document.body || el === document.documentElement) return true;

    if (el.querySelector('main, .main, .content, .page-content, .app-main')) return true;

    if (
      t.indexOf('今日工作内容') !== -1 ||
      t.indexOf('任务进度') !== -1 ||
      t.indexOf('筛选') !== -1 ||
      t.indexOf('列表') !== -1
    ) {
      return true;
    }

    return t.length > 600;
  }

  function findSidebar() {
    var candidates = Array.from(document.querySelectorAll('aside, nav, .sidebar, .side-nav'));

    var scored = candidates
      .filter(function (el) {
        var t = text(el);
        if (!hasInternNavText(t)) return false;
        if (looksLikeWholePage(el)) return false;
        if (el.querySelectorAll('a, button').length < 2) return false;
        return true;
      })
      .map(function (el) {
        var score = el.querySelectorAll('a, button').length * 10 - text(el).length / 30;

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

      var t = text(el);

      return (
        t.indexOf('我的周报') !== -1 ||
        t.indexOf('任务认领') !== -1 ||
        t.indexOf('填写') !== -1 ||
        t.indexOf('每日任务') !== -1 ||
        t.indexOf('工作台') !== -1 ||
        t.indexOf('修改密码') !== -1
      );
    });

    if (found) return found;

    var children = Array.from(document.body.children).filter(function (el) {
      if (el.classList.contains('xy-intern-mobile-topbar')) return false;
      if (el.classList.contains('xy-intern-mobile-mask')) return false;
      if (sidebar && (el === sidebar || sidebar.contains(el))) return false;
      return text(el).length > 40;
    });

    return children[0] || null;
  }

  function markLayout() {
    var sidebar = findSidebar();
    var main = findMain(sidebar);

    document.querySelectorAll('.xy-intern-mobile-sidebar').forEach(function (el) {
      if (el !== sidebar) el.classList.remove('xy-intern-mobile-sidebar');
    });

    document.querySelectorAll('.xy-intern-mobile-main').forEach(function (el) {
      if (el !== main) el.classList.remove('xy-intern-mobile-main');
    });

    if (sidebar) sidebar.classList.add('xy-intern-mobile-sidebar');
    if (main) main.classList.add('xy-intern-mobile-main');
  }

  function ensureTopbar() {
    if (document.querySelector('.xy-intern-mobile-topbar')) return;

    var bar = document.createElement('div');
    bar.className = 'xy-intern-mobile-topbar';

    bar.innerHTML = [
      '<button type="button" class="xy-intern-mobile-menu-btn" aria-label="打开导航">☰</button>',
      '<div class="xy-intern-mobile-title">实习生系统</div>'
    ].join('');

    bar.querySelector('.xy-intern-mobile-menu-btn').addEventListener('click', function () {
      document.body.classList.toggle('xy-intern-sidebar-open');
    });

    document.body.appendChild(bar);

    var mask = document.createElement('div');
    mask.className = 'xy-intern-mobile-mask';
    mask.addEventListener('click', function () {
      document.body.classList.remove('xy-intern-sidebar-open');
    });
    document.body.appendChild(mask);
  }

  function closeSidebarAfterClick() {
    var sidebar = findSidebar();

    if (!sidebar || sidebar.dataset.xyInternMobileCloseReady === '1') return;

    sidebar.dataset.xyInternMobileCloseReady = '1';

    sidebar.addEventListener('click', function (e) {
      if (!isMobile()) return;

      var target = e.target.closest('a, button');
      if (!target) return;

      setTimeout(function () {
        document.body.classList.remove('xy-intern-sidebar-open');
      }, 120);
    });
  }

  function getHeaders(table) {
    return Array.from(table.querySelectorAll('thead th')).map(function (th) {
      return text(th);
    });
  }

  function isActionLabel(label) {
    return label.indexOf('操作') !== -1;
  }

  function pickTitle(headers, values) {
    var preferred = ['任务名称', '任务标题', '关联任务', '周报标题', '日期', '姓名'];

    for (var i = 0; i < preferred.length; i++) {
      var idx = headers.findIndex(function (h) {
        return h.indexOf(preferred[i]) !== -1;
      });

      if (idx >= 0 && values[idx]) return values[idx];
    }

    return values.find(function (v) {
      return v && v !== '-' && v !== '—';
    }) || '记录';
  }

  function buildMobileCards(table) {
    if (table.dataset.xyInternMobileCardReady === '1') return;

    var headers = getHeaders(table);

    if (headers.length === 0) return;

    var rows = Array.from(table.querySelectorAll('tbody tr')).filter(function (tr) {
      return !tr.classList.contains('xy-version-panel') && tr.children.length > 0;
    });

    var cardList = document.createElement('div');
    cardList.className = 'xy-intern-mobile-card-list';

    var usefulRows = 0;

    rows.forEach(function (tr) {
      if (tr.children.length === 1 && tr.children[0].hasAttribute('colspan')) {
        var empty = document.createElement('div');
        empty.className = 'xy-intern-empty-card';
        empty.textContent = text(tr) || '暂无数据';
        cardList.appendChild(empty);
        usefulRows += 1;
        return;
      }

      var cells = Array.from(tr.children);
      var values = cells.map(function (td) {
        return text(td);
      });

      if (values.join('').trim() === '') return;

      usefulRows += 1;

      var title = pickTitle(headers, values);

      var card = document.createElement('div');
      card.className = 'xy-intern-m-card';

      var titleEl = document.createElement('div');
      titleEl.className = 'xy-intern-m-card-title';
      titleEl.textContent = title;
      card.appendChild(titleEl);

      headers.forEach(function (label, index) {
        var cell = cells[index];
        if (!cell) return;

        if (isActionLabel(label)) {
          var actions = document.createElement('div');
          actions.className = 'xy-intern-m-actions';
          actions.innerHTML = cell.innerHTML;
          card.appendChild(actions);
          return;
        }

        if (values[index] === title && (
          label.indexOf('任务') !== -1 ||
          label.indexOf('标题') !== -1 ||
          label.indexOf('日期') !== -1
        )) {
          return;
        }

        var row = document.createElement('div');
        row.className = 'xy-intern-m-row';

        var lab = document.createElement('div');
        lab.className = 'xy-intern-m-label';
        lab.textContent = label || '字段';

        var val = document.createElement('div');
        val.className = 'xy-intern-m-value';
        val.innerHTML = cell.innerHTML;

        row.appendChild(lab);
        row.appendChild(val);
        card.appendChild(row);
      });

      cardList.appendChild(card);
    });

    if (usefulRows === 0) return;

    table.classList.add('xy-intern-mobile-table-source');
    table.dataset.xyInternMobileCardReady = '1';

    if (table.parentNode) {
      table.parentNode.insertBefore(cardList, table.nextSibling);
    }
  }

  function markTableForms() {
    document.querySelectorAll('table form').forEach(function (form) {
      form.classList.add('xy-intern-table-form');
    });
  }

  function convertTables() {
    document.querySelectorAll('table').forEach(function (table) {
      buildMobileCards(table);
    });
  }

  function run() {
    if (!isInternPage()) return;

    document.body.classList.add('xy-intern-mobile');

    ensureTopbar();
    markLayout();
    closeSidebarAfterClick();
    markTableForms();
    convertTables();
  }

  document.addEventListener('DOMContentLoaded', function () {
    run();
    setTimeout(run, 300);
    setTimeout(run, 900);
    setTimeout(run, 1600);
  });

  window.addEventListener('resize', function () {
    if (!isInternPage()) return;
    markLayout();
  });
})();
