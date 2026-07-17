(function () {
  if (window.__XY_INTERN_TASKPOOL_READY__) return;
  window.__XY_INTERN_TASKPOOL_READY__ = true;

  function run() {
    if (window.location.pathname.indexOf('/intern/task-pool') !== 0) return;
    document.body.classList.add('xy-intern-task-version-page');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
