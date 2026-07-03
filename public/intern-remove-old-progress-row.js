(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim().replace(/\s+/g, ' ');
  }

  function isPage() {
    return window.location.pathname === '/intern/daily-tasks/new';
  }

  function removeOldProgressRow() {
    if (!isPage()) return;

    /*
     * 删除页面最下面旧的原始进度字段：
     * “整体进度 请选择任务进度 0% 未启动...100% 已完成”
     * 不删除每个任务块里的新任务进度条。
     */
    document.querySelectorAll('label, div, p').forEach(function (el) {
      if (
        el.closest('.xy-progressbar-wrap') ||
        el.closest('.xy-daily-task-extra') ||
        el.closest('.xy-daily-task-progress-block')
      ) {
        return;
      }

      var t = text(el);

      var isOldProgress =
        (
          t.indexOf('整体进度') !== -1 ||
          t.indexOf('请选择任务进度') !== -1
        ) &&
        (
          t.indexOf('0% 未启动') !== -1 ||
          t.indexOf('10% 调研准备') !== -1 ||
          t.indexOf('100% 已完成') !== -1
        );

      if (isOldProgress) {
        var target =
          el.closest('.form-group, .field, .mb-3, label') ||
          el;

        target.remove();
      }
    });

    /*
     * 兜底：如果旧字段是 select/input，而不是整段 label，也删除它的外层。
     */
    document.querySelectorAll('select[name="progress"], select[name="overallProgress"], select[name="taskProgress"], input[name="progress"], input[name="overallProgress"], input[name="taskProgress"]').forEach(function (field) {
      if (
        field.closest('.xy-progressbar-wrap') ||
        field.closest('.xy-daily-task-extra') ||
        field.closest('.xy-daily-task-progress-block')
      ) {
        return;
      }

      var target =
        field.closest('.form-group, .field, .mb-3, label, div') ||
        field;

      target.remove();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    removeOldProgressRow();
    setTimeout(removeOldProgressRow, 300);
    setTimeout(removeOldProgressRow, 800);
    setTimeout(removeOldProgressRow, 1500);
  });
})();
