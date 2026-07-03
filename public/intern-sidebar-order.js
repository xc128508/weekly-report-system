(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function isInternPage() {
    return window.location.pathname.indexOf('/intern/') === 0;
  }

  function findSidebar() {
    return Array.from(document.querySelectorAll('aside, nav, .sidebar, .side-nav, [class*="sidebar"], [class*="sider"]'))
      .find(function (el) {
        var t = text(el);
        return t.indexOf('解悠数字科技') !== -1 && t.indexOf('每日任务') !== -1;
      });
  }

  function findTextNodeBox(sidebar, exactText) {
    var el = Array.from(sidebar.querySelectorAll('a, button, div, span, p, strong'))
      .find(function (node) {
        return text(node) === exactText;
      });

    if (!el) return null;

    return el.closest('a, button, li, .nav-item, .menu-item') || el;
  }

  function makeGroup(sidebar, title, items) {
    var nodes = [];

    var titleNode = findTextNodeBox(sidebar, title);
    if (titleNode) nodes.push(titleNode);

    items.forEach(function (name) {
      var node = findTextNodeBox(sidebar, name);
      if (node) nodes.push(node);
    });

    return nodes;
  }

  function moveBefore(target, nodes) {
    if (!target || !nodes.length) return;

    nodes.forEach(function (node) {
      if (node && node.parentElement) {
        target.parentElement.insertBefore(node, target);
      }
    });
  }

  function run() {
    if (!isInternPage()) return;

    var sidebar = findSidebar();
    if (!sidebar) return;

    var systemTitle = findTextNodeBox(sidebar, '系统管理');
    if (!systemTitle) return;

    var otherGroup = makeGroup(sidebar, '其他', [
      '我的周报',
      '任务认领',
      '填写周报'
    ]);

    moveBefore(systemTitle, otherGroup);

    sidebar.classList.add('xy-intern-sidebar-fixed-order');
  }

  document.addEventListener('DOMContentLoaded', run);
  setTimeout(run, 300);
  setTimeout(run, 800);
  setTimeout(run, 1500);
})();
