(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function markActiveSidebar() {
    var path = window.location.pathname;

    document.querySelectorAll('aside a, .sidebar a, [class*="sidebar"] a, [class*="sider"] a').forEach(function (a) {
      var href = a.getAttribute('href') || '';

      if (!href || href === '#') return;

      if (path === href || path.indexOf(href) === 0) {
        a.classList.add('active');
      }
    });
  }

  function normalizeButtons() {
    document.querySelectorAll('button, a').forEach(function (el) {
      var t = text(el);

      if (!t) return;

      if (
        t.indexOf('删除') !== -1 ||
        t.indexOf('关闭认领') !== -1 ||
        t.indexOf('拒绝') !== -1
      ) {
        el.classList.add('danger');
      }

      if (
        t.indexOf('保存') !== -1 ||
        t.indexOf('新增') !== -1 ||
        t.indexOf('生成') !== -1 ||
        t.indexOf('提交') !== -1 ||
        t.indexOf('筛选') !== -1 ||
        t.indexOf('认领') !== -1
      ) {
        el.classList.add('primary');
      }
    });
  }

  function normalizeCards() {
    document.querySelectorAll('section, .card, [class*="card"]').forEach(function (el) {
      var t = text(el);
      if (!t) return;
      el.classList.add('xy-ui-card');
    });
  }

  function normalizeTables() {
    document.querySelectorAll('table').forEach(function (table) {
      table.classList.add('xy-ui-table');

      var ths = Array.from(table.querySelectorAll('thead th'));
      ths.forEach(function (th, index) {
        if (text(th).indexOf('操作') !== -1) {
          table.querySelectorAll('tbody tr').forEach(function (tr) {
            if (tr.children[index]) {
              tr.children[index].classList.add('action-cell');
            }
          });
        }
      });
    });
  }

  function run() {
    document.body.classList.add('xy-ui-spec-v2');

    markActiveSidebar();
    normalizeButtons();
    normalizeCards();
    normalizeTables();
  }

  document.addEventListener('DOMContentLoaded', function () {
    run();
    setTimeout(run, 500);
    setTimeout(run, 1200);
  });
})();
