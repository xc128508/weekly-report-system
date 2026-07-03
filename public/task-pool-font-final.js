(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function headers(table) {
    return Array.from(table.querySelectorAll('thead th')).map(function (th) {
      return text(th);
    });
  }

  function isTaskPoolTable(table) {
    var hs = headers(table).join('|');

    return (
      hs.indexOf('需求部门') !== -1 &&
      hs.indexOf('对接人') !== -1 &&
      (
        hs.indexOf('任务标题') !== -1 ||
        hs.indexOf('任务') !== -1
      )
    );
  }

  function applyFinalFont() {
    if (window.location.pathname.indexOf('/admin/task-pool') !== 0) return;

    document.querySelectorAll('table').forEach(function (table) {
      if (!isTaskPoolTable(table)) return;

      table.classList.add('xy-task-pool-font-final');

      table.querySelectorAll('th, td, a, button, span, strong, div, p, label').forEach(function (el) {
        el.classList.add('xy-task-pool-font-final-item');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyFinalFont();

    setTimeout(applyFinalFont, 500);
    setTimeout(applyFinalFont, 1200);
    setTimeout(applyFinalFont, 2200);
  });
})();
