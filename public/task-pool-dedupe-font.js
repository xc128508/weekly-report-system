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

  function removeDuplicateTopArea() {
    if (window.location.pathname.indexOf('/admin/task-pool') !== 0) return;

    /*
     * 删除之前脚本额外生成的顶部标题区和统计卡片。
     * 保留系统原本的“任务总表、筛选任务、任务列表”区域。
     */
    document.querySelectorAll('.xy-page-header, .xy-stat-cards').forEach(function (el) {
      el.remove();
    });
  }

  function unifyTaskTableFont() {
    if (window.location.pathname.indexOf('/admin/task-pool') !== 0) return;

    document.querySelectorAll('table').forEach(function (table) {
      if (!isTaskPoolTable(table)) return;

      table.classList.add('xy-task-pool-uniform-font');

      table.querySelectorAll('th, td, td *, th *, a, button, span, strong').forEach(function (el) {
        el.classList.add('xy-task-pool-font-reset');
      });
    });
  }

  function run() {
    removeDuplicateTopArea();
    unifyTaskTableFont();
  }

  document.addEventListener('DOMContentLoaded', function () {
    run();

    /*
     * 等其他旧脚本执行完后再清理几次，避免重复区域又被加回来。
     */
    var count = 0;
    var timer = setInterval(function () {
      run();
      count += 1;
      if (count >= 12) clearInterval(timer);
    }, 300);
  });
})();
