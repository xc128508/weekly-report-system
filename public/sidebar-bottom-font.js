(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function findSidebar() {
    var candidates = Array.from(document.querySelectorAll(
      'aside, nav, .sidebar, .side-nav, .xy-sidebar, .app-sidebar, .layout-sidebar'
    ));

    return candidates.find(function (el) {
      var t = text(el);
      return (
        t.indexOf('解悠数字科技') !== -1 &&
        t.indexOf('退出') !== -1
      );
    }) || null;
  }

  function directChildOf(parent, node) {
    var cur = node;
    while (cur && cur.parentElement && cur.parentElement !== parent) {
      cur = cur.parentElement;
    }
    return cur && cur.parentElement === parent ? cur : null;
  }

  function findDirectChildByText(sidebar, keywords) {
    var nodes = Array.from(sidebar.querySelectorAll('*'));

    for (var i = 0; i < nodes.length; i++) {
      var t = text(nodes[i]);
      if (!t) continue;

      var matched = keywords.some(function (key) {
        return t === key || t.indexOf(key) !== -1;
      });

      if (matched) {
        var child = directChildOf(sidebar, nodes[i]);
        if (child) return child;
      }
    }

    return null;
  }

  function moveBottom() {
    var sidebar = findSidebar();
    if (!sidebar) return;

    sidebar.classList.add('xy-sidebar-bottom-font');

    var bottom = sidebar.querySelector('.xy-sidebar-bottom-area');
    if (!bottom) {
      bottom = document.createElement('div');
      bottom.className = 'xy-sidebar-bottom-area';
      sidebar.appendChild(bottom);
    }

    var systemNode = findDirectChildByText(sidebar, ['系统管理']);
    var passwordNode = findDirectChildByText(sidebar, ['修改密码']);
    var userNode = findDirectChildByText(sidebar, ['实习生', '管理员', '老板']);
    var logoutNode = findDirectChildByText(sidebar, ['退出', '退出登录']);

    [systemNode, passwordNode, userNode, logoutNode].forEach(function (node) {
      if (node && node !== bottom && !bottom.contains(node)) {
        bottom.appendChild(node);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    moveBottom();
    setTimeout(moveBottom, 300);
    setTimeout(moveBottom, 800);
    setTimeout(moveBottom, 1500);
  });
})();
