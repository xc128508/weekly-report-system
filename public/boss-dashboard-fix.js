(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function fixBossDashboard() {
    if (window.location.pathname !== '/boss/dashboard') return;

    /*
     * 1. 左侧导航链接修复
     */
    document.querySelectorAll('a').forEach(function (a) {
      var t = text(a);

      if (t === '周报管理') {
        a.href = '/boss/weekly-management';
        a.classList.remove('active');
      }

      if (t === '日报看板') {
        a.href = '/boss/dashboard';
        a.classList.add('active');
      }
    });

    /*
     * 2. 日报看板页面里，不显示底部“周报管理”模块
     */
    document.querySelectorAll('section, .boss-v2-card, .card').forEach(function (section) {
      var h2 = section.querySelector('h2');
      if (h2 && text(h2) === '周报管理') {
        section.remove();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    fixBossDashboard();

    var count = 0;
    var timer = setInterval(function () {
      fixBossDashboard();
      count += 1;
      if (count >= 10) clearInterval(timer);
    }, 300);
  });
})();
