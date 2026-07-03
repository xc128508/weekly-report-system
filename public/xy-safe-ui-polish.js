(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function markActiveNav() {
    var path = window.location.pathname;

    document.querySelectorAll('aside a, .sidebar a, [class*="sidebar"] a, [class*="sider"] a').forEach(function (a) {
      var href = a.getAttribute('href') || '';

      if (!href || href === '#') return;

      a.classList.remove('active');

      if (path === href || path.indexOf(href) === 0) {
        a.classList.add('active');
      }
    });
  }

  function markButtons() {
    document.querySelectorAll('button, a, input[type="submit"]').forEach(function (el) {
      var t = text(el) || el.value || '';

      if (
        t.indexOf('保存') !== -1 ||
        t.indexOf('提交') !== -1 ||
        t.indexOf('新增') !== -1 ||
        t.indexOf('生成') !== -1 ||
        t.indexOf('筛选') !== -1 ||
        t.indexOf('查看') !== -1 ||
        t.indexOf('认领') !== -1
      ) {
        el.classList.add('primary');
      }

      if (
        t.indexOf('删除') !== -1 ||
        t.indexOf('拒绝') !== -1 ||
        t.indexOf('关闭') !== -1
      ) {
        el.classList.add('danger');
      }
    });
  }

  function markActionCells() {
    document.querySelectorAll('table').forEach(function (table) {
      var ths = Array.from(table.querySelectorAll('thead th'));
      var index = ths.findIndex(function (th) {
        return text(th).indexOf('操作') !== -1;
      });

      if (index < 0) return;

      table.querySelectorAll('tbody tr').forEach(function (row) {
        if (row.children[index]) {
          row.children[index].classList.add('action-cell');
        }
      });
    });
  }

  function run() {
    document.body.classList.add('xy-safe-ui');

    markActiveNav();
    markButtons();
    markActionCells();
  }

  document.addEventListener('DOMContentLoaded', function () {
    run();
    setTimeout(run, 500);
    setTimeout(run, 1200);
  });
})();
