(function () {
  function textOf(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function path() {
    return window.location.pathname || '';
  }

  function isAdminPage() {
    return path().indexOf('/admin') === 0;
  }

  function findMain() {
    return document.querySelector('main') ||
      document.querySelector('.container') ||
      document.querySelector('.content') ||
      document.querySelector('.main') ||
      document.body;
  }

  function findNav() {
    return document.querySelector('header.xy-left-sidebar nav') ||
      document.querySelector('.topbar.xy-left-sidebar nav') ||
      document.querySelector('.navbar.xy-left-sidebar nav') ||
      document.querySelector('header nav') ||
      document.querySelector('.topbar nav') ||
      document.querySelector('.navbar nav');
  }

  function enhanceSidebarGroups() {
    var nav = findNav();
    if (!nav || nav.dataset.xyGrouped === '1') return;

    var children = Array.from(nav.children);
    if (!children.length) return;

    var groups = {
      work: {
        title: '工作台',
        items: []
      },
      daily: {
        title: '日报管理',
        items: []
      },
      task: {
        title: '任务管理',
        items: []
      },
      system: {
        title: '系统管理',
        items: []
      },
      other: {
        title: '其他',
        items: []
      }
    };

    children.forEach(function (child) {
      var t = textOf(child);
      var href = '';
      var action = '';

      var a = child.matches && child.matches('a') ? child : child.querySelector && child.querySelector('a');
      var form = child.matches && child.matches('form') ? child : child.querySelector && child.querySelector('form');

      if (a) href = a.getAttribute('href') || '';
      if (form) action = form.getAttribute('action') || '';

      if (
        t.indexOf('今日') !== -1 ||
        t.indexOf('提交监督') !== -1 ||
        t.indexOf('监督') !== -1
      ) {
        groups.work.items.push(child);
        return;
      }

      if (
        href.indexOf('/admin/daily-tasks') !== -1 ||
        href.indexOf('/admin/reports/generate') !== -1 ||
        t.indexOf('日报') !== -1 ||
        t.indexOf('每日任务') !== -1 ||
        t.indexOf('生成周报') !== -1
      ) {
        groups.daily.items.push(child);
        return;
      }

      if (
        href.indexOf('/admin/task-pool') !== -1 ||
        t.indexOf('任务总表') !== -1 ||
        t.indexOf('任务列表') !== -1
      ) {
        groups.task.items.push(child);
        return;
      }

      if (
        href.indexOf('/admin/users') !== -1 ||
        href.indexOf('/change-password') !== -1 ||
        action.indexOf('/logout') !== -1 ||
        t.indexOf('账号') !== -1 ||
        t.indexOf('密码') !== -1 ||
        t.indexOf('退出') !== -1 ||
        t.indexOf('管理员') !== -1
      ) {
        groups.system.items.push(child);
        return;
      }

      groups.other.items.push(child);
    });

    nav.innerHTML = '';

    ['work', 'daily', 'task', 'system', 'other'].forEach(function (key) {
      var group = groups[key];
      if (!group.items.length) return;

      var section = document.createElement('div');
      section.className = 'xy-sidebar-group xy-sidebar-group-' + key;

      var title = document.createElement('div');
      title.className = 'xy-sidebar-group-title';
      title.textContent = group.title;

      var list = document.createElement('div');
      list.className = 'xy-sidebar-group-list';

      group.items.forEach(function (item) {
        list.appendChild(item);
      });

      section.appendChild(title);
      section.appendChild(list);
      nav.appendChild(section);
    });

    nav.dataset.xyGrouped = '1';
  }

  function pageConfig() {
    var p = path();

    if (p.indexOf('/admin/daily-tasks') === 0) {
      return {
        title: '日报管理',
        desc: '查看实习生日报提交情况、工作内容、问题反馈和明日计划。'
      };
    }

    if (p.indexOf('/admin/task-pool') === 0) {
      return {
        title: '任务总表',
        desc: '管理各部门任务、认领申请、任务负责人和整体进度。'
      };
    }

    if (p.indexOf('/admin/reports/generate') === 0) {
      return {
        title: '生成周报',
        desc: '根据实习生日报自动生成周报草稿，支持人工确认后提交。'
      };
    }

    if (p.indexOf('/admin/users') === 0) {
      return {
        title: '账号管理',
        desc: '管理实习生账号、职位、联系方式和账号状态。'
      };
    }

    if (p.indexOf('/admin') === 0) {
      return {
        title: '管理员工作台',
        desc: '查看实习生提交情况、任务进度和待处理事项。'
      };
    }

    return null;
  }

  function addPageHeader() {
    if (!isAdminPage()) return;
    if (document.querySelector('.xy-page-header')) return;

    var config = pageConfig();
    if (!config) return;

    var main = findMain();

    var header = document.createElement('div');
    header.className = 'xy-page-header';

    var left = document.createElement('div');
    left.className = 'xy-page-header-left';

    var h1 = document.createElement('h1');
    h1.textContent = config.title;

    var p = document.createElement('p');
    p.textContent = config.desc;

    left.appendChild(h1);
    left.appendChild(p);

    header.appendChild(left);

    var first = main.firstElementChild;
    main.insertBefore(header, first);
  }

  function getToday() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getHeaders(table) {
    return Array.from(table.querySelectorAll('thead th')).map(function (th) {
      return textOf(th);
    });
  }

  function findTable(matchFn) {
    var tables = Array.from(document.querySelectorAll('table'));
    for (var i = 0; i < tables.length; i++) {
      if (matchFn(getHeaders(tables[i]))) return tables[i];
    }
    return null;
  }

  function getProgress(row) {
    var node = row.querySelector('.xy-progress-number');
    if (node) {
      var m1 = textOf(node).match(/(\d{1,3})\s*%/);
      if (m1) return Math.max(0, Math.min(100, Number(m1[1])));
    }

    var text = textOf(row);
    var m2 = text.match(/(\d{1,3})\s*%/);
    if (m2) return Math.max(0, Math.min(100, Number(m2[1])));

    if (text.indexOf('已完成') !== -1) return 100;
    if (text.indexOf('进行中') !== -1) return 50;
    return 0;
  }

  function renderCards(cards) {
    var existing = document.querySelector('.xy-stat-cards');
    if (!existing) {
      existing = document.createElement('div');
      existing.className = 'xy-stat-cards';

      var header = document.querySelector('.xy-page-header');
      if (header) {
        header.insertAdjacentElement('afterend', existing);
      } else {
        var main = findMain();
        main.insertBefore(existing, main.firstElementChild);
      }
    }

    existing.innerHTML = '';

    cards.forEach(function (card) {
      var item = document.createElement('div');
      item.className = 'xy-stat-card';

      var label = document.createElement('div');
      label.className = 'xy-stat-card-label';
      label.textContent = card.label;

      var value = document.createElement('div');
      value.className = 'xy-stat-card-value';
      value.textContent = card.value;

      var desc = document.createElement('div');
      desc.className = 'xy-stat-card-desc';
      desc.textContent = card.desc || '';

      item.appendChild(label);
      item.appendChild(value);
      item.appendChild(desc);

      existing.appendChild(item);
    });
  }

  function renderDailyStats() {
    var table = findTable(function (headers) {
      return headers.indexOf('日期') !== -1 &&
        headers.indexOf('姓名') !== -1 &&
        headers.some(function (h) {
          return h.indexOf('今日工作内容') !== -1;
        });
    });

    if (!table) return false;

    var headers = getHeaders(table);
    var dateIndex = headers.indexOf('日期');
    var nameIndex = headers.indexOf('姓名');

    var problemIndex = headers.findIndex(function (h) {
      return h.indexOf('问题') !== -1 || h.indexOf('支持') !== -1;
    });

    var rows = Array.from(table.querySelectorAll('tbody tr'));
    var today = getToday();
    var names = {};
    var todayCount = 0;
    var problemCount = 0;

    rows.forEach(function (row) {
      var cells = row.children;

      if (nameIndex >= 0 && cells[nameIndex]) {
        var name = textOf(cells[nameIndex]);
        if (name) names[name] = true;
      }

      if (dateIndex >= 0 && cells[dateIndex]) {
        if (textOf(cells[dateIndex]).indexOf(today) !== -1) todayCount += 1;
      }

      if (problemIndex >= 0 && cells[problemIndex]) {
        var problemText = textOf(cells[problemIndex]);
        if (
          problemText &&
          problemText !== '暂无' &&
          problemText !== '-' &&
          problemText.indexOf('暂无') === -1
        ) {
          problemCount += 1;
        }
      }
    });

    renderCards([
      {
        label: '日报总数',
        value: rows.length,
        desc: '当前列表内日报数量'
      },
      {
        label: '涉及人数',
        value: Object.keys(names).length,
        desc: '当前列表涉及实习生'
      },
      {
        label: '今日日报',
        value: todayCount,
        desc: '今日已记录日报'
      },
      {
        label: '需关注',
        value: problemCount,
        desc: '存在问题或支持需求'
      }
    ]);

    return true;
  }

  function renderTaskStats() {
    var table = findTable(function (headers) {
      return headers.indexOf('需求部门') !== -1 &&
        headers.indexOf('对接人') !== -1 &&
        headers.some(function (h) {
          return h.indexOf('任务标题') !== -1;
        });
    });

    if (!table) return false;

    var rows = Array.from(table.querySelectorAll('tbody tr'));

    var applying = 0;
    var doing = 0;
    var done = 0;
    var closed = 0;
    var todo = 0;

    rows.forEach(function (row) {
      var text = textOf(row);
      var progress = getProgress(row);
      var isClosed =
        row.classList.contains('xy-task-row-closed') ||
        text.indexOf('当前已关闭') !== -1 ||
        text.indexOf('❌') !== -1;

      var hasApply =
        text.indexOf('人申请') !== -1 ||
        text.indexOf('同意') !== -1 ||
        text.indexOf('拒绝') !== -1;

      if (isClosed) {
        closed += 1;
        return;
      }

      if (hasApply) applying += 1;

      if (progress >= 100) {
        done += 1;
      } else if (progress > 0) {
        doing += 1;
      } else {
        todo += 1;
      }
    });

    renderCards([
      {
        label: '全部任务',
        value: rows.length,
        desc: '当前任务总数'
      },
      {
        label: '待认领',
        value: todo,
        desc: '暂无实际进度任务'
      },
      {
        label: '有申请',
        value: applying,
        desc: '等待管理员处理'
      },
      {
        label: '进行中',
        value: doing,
        desc: '进度 1% - 99%'
      },
      {
        label: '已完成',
        value: done,
        desc: '进度 100%'
      },
      {
        label: '已关闭',
        value: closed,
        desc: '已关闭认领任务'
      }
    ]);

    return true;
  }

  function renderGenericStats() {
    var table = document.querySelector('table');
    if (!table) return false;

    var rows = Array.from(table.querySelectorAll('tbody tr'));

    renderCards([
      {
        label: '记录总数',
        value: rows.length,
        desc: '当前列表数据'
      }
    ]);

    return true;
  }

  function addStats() {
    if (!isAdminPage()) return;

    var p = path();

    if (p.indexOf('/admin/daily-tasks') === 0) {
      if (renderDailyStats()) return;
    }

    if (p.indexOf('/admin/task-pool') === 0) {
      if (renderTaskStats()) return;
    }

    renderGenericStats();
  }

  function run() {
    document.body.classList.add('xy-admin-layout-enhanced');

    enhanceSidebarGroups();
    addPageHeader();
    addStats();
  }

  document.addEventListener('DOMContentLoaded', function () {
    run();

    var count = 0;
    var timer = setInterval(function () {
      run();
      count += 1;
      if (count >= 6) clearInterval(timer);
    }, 300);
  });
})();
