(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function headers(table) {
    return Array.from(table.querySelectorAll('thead th')).map(function (th) {
      return text(th);
    });
  }

  function removeColumn(table, index) {
    if (index < 0) return;

    var headRow = table.querySelector('thead tr');
    if (headRow && headRow.children[index]) {
      headRow.children[index].remove();
    }

    table.querySelectorAll('tbody tr').forEach(function (row) {
      if (row.children[index]) {
        row.children[index].remove();
      }
    });
  }

  function addColumnClasses(table) {
    var hs = headers(table);

    table.querySelectorAll('thead tr, tbody tr').forEach(function (row) {
      Array.from(row.children).forEach(function (cell, index) {
        var h = hs[index] || '';

        cell.classList.remove(
          'xy-final-dept-col',
          'xy-final-contact-col',
          'xy-final-title-col',
          'xy-final-progress-col',
          'xy-final-assignee-col',
          'xy-final-remark-col',
          'xy-final-action-col'
        );

        if (h.indexOf('需求部门') !== -1) cell.classList.add('xy-final-dept-col');
        if (h.indexOf('对接人') !== -1) cell.classList.add('xy-final-contact-col');
        if (h.indexOf('任务标题') !== -1 || h === '任务') cell.classList.add('xy-final-title-col');
        if (h.indexOf('整体进度') !== -1 || h.indexOf('进度') !== -1) cell.classList.add('xy-final-progress-col');
        if (h.indexOf('认领') !== -1 || h.indexOf('申请') !== -1) cell.classList.add('xy-final-assignee-col');
        if (h.indexOf('备注') !== -1) cell.classList.add('xy-final-remark-col');
        if (h.indexOf('操作') !== -1) cell.classList.add('xy-final-action-col');
      });
    });
  }

  function fixAdminTaskPool() {
    if (window.location.pathname.indexOf('/admin/task-pool') !== 0) return;

    document.querySelectorAll('table').forEach(function (table) {
      var hs = headers(table);
      var isTaskPool =
        hs.indexOf('需求部门') !== -1 &&
        hs.indexOf('对接人') !== -1 &&
        hs.some(function (h) {
          return h.indexOf('任务标题') !== -1 || h.indexOf('任务') !== -1;
        });

      if (!isTaskPool) return;

      var expectedIndex = hs.findIndex(function (h) {
        return h.indexOf('期望完成日期') !== -1 || h.indexOf('期望') !== -1;
      });

      if (expectedIndex >= 0) {
        removeColumn(table, expectedIndex);
      }

      table.classList.add('xy-final-admin-task-table');
      addColumnClasses(table);
    });
  }

  function fixBossTaskBoard() {
    if (window.location.pathname.indexOf('/boss/dashboard') !== 0) return;

    document.querySelectorAll('.boss-v2-card, section, .card').forEach(function (section) {
      var title = section.querySelector('h2');
      if (!title || text(title) !== '任务进度看板') return;

      var table = section.querySelector('table');
      if (!table) return;

      var hs = headers(table);
      var latestDateIndex = hs.findIndex(function (h) {
        return h === '最新日报' || h.indexOf('最新日报') !== -1;
      });

      if (latestDateIndex >= 0) {
        removeColumn(table, latestDateIndex);
      }

      table.classList.add('xy-final-boss-task-board');
    });
  }

  function run() {
    fixAdminTaskPool();
    fixBossTaskBoard();
  }

  document.addEventListener('DOMContentLoaded', function () {
    run();

    /*
     * 等旧脚本执行完后再补两次，避免被旧脚本重新生成表格。
     */
    setTimeout(run, 500);
    setTimeout(run, 1300);
    setTimeout(run, 2200);
  });
})();
