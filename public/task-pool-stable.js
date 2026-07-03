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
        hs.indexOf('任务名称') !== -1 ||
        hs.indexOf('任务') !== -1
      )
    );
  }

  function findIndex(hs, keys) {
    for (var i = 0; i < hs.length; i++) {
      for (var j = 0; j < keys.length; j++) {
        if (hs[i].indexOf(keys[j]) !== -1) return i;
      }
    }
    return -1;
  }

  function moveActionLast(table) {
    var hs = headers(table);
    var actionIndex = hs.findIndex(function (h) { return h === '操作'; });
    if (actionIndex < 0 || actionIndex === hs.length - 1) return;

    function move(row) {
      var cells = Array.from(row.children);
      if (!cells[actionIndex]) return;
      row.appendChild(cells[actionIndex]);
    }

    var headRow = table.querySelector('thead tr');
    if (headRow) move(headRow);

    table.querySelectorAll('tbody tr').forEach(move);
  }

  function getTaskId(row) {
    var el = row.querySelector('a[href*="/admin/task-pool/"], form[action*="/admin/task-pool/"]');
    if (!el) return '';

    var url = el.getAttribute('href') || el.getAttribute('action') || '';
    var match = url.match(/\/admin\/task-pool\/([^\/?#]+)/);
    return match ? match[1] : '';
  }

  function toPercent(value) {
    var m = String(value || '').match(/(\d{1,3})\s*%/);
    if (m) {
      var n = Number(m[1]);
      if (isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
    }

    var t = String(value || '');
    if (t.indexOf('已完成') !== -1) return 100;
    if (t.indexOf('进行中') !== -1) return 50;

    return 0;
  }

  function progressHtml(percent) {
    percent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    var cls = percent >= 100 ? 'done' : percent <= 0 ? 'zero' : 'doing';

    return [
      '<div class="xy-stable-progress">',
        '<strong>', percent, '%</strong>',
        '<span>',
          '<i class="', cls, '" style="width:', percent, '%"></i>',
        '</span>',
      '</div>'
    ].join('');
  }

  function applyProgress(table, progressMap) {
    var hs = headers(table);
    var progressIndex = findIndex(hs, ['整体进度', '进度', '状态', '任务状态']);

    if (progressIndex < 0) return;

    var ths = Array.from(table.querySelectorAll('thead th'));
    if (ths[progressIndex]) {
      ths[progressIndex].textContent = '整体进度';
      ths[progressIndex].classList.add('xy-stable-progress-head');
    }

    table.querySelectorAll('tbody tr').forEach(function (row) {
      var cell = row.children[progressIndex];
      if (!cell) return;

      var taskId = getTaskId(row);
      var percent = null;

      if (taskId && progressMap && progressMap.byId && Object.prototype.hasOwnProperty.call(progressMap.byId, taskId)) {
        percent = progressMap.byId[taskId];
      }

      if (percent === null || percent === undefined) {
        percent = toPercent(text(cell));
      }

      row.dataset.xyProgress = String(percent);
      cell.classList.add('xy-stable-progress-cell');
      cell.innerHTML = progressHtml(percent);
    });
  }

  function normalizeTitleAndRemark(table) {
    var hs = headers(table);
    var titleIndex = findIndex(hs, ['任务标题', '任务名称']);
    var remarkIndex = findIndex(hs, ['备注']);

    table.querySelectorAll('tbody tr').forEach(function (row) {
      if (titleIndex >= 0 && row.children[titleIndex]) {
        var titleCell = row.children[titleIndex];

        var fullTitle =
          titleCell.getAttribute('title') ||
          text(titleCell.querySelector('[title]')) ||
          text(titleCell);

        titleCell.classList.add('xy-stable-title-cell');
        titleCell.setAttribute('title', fullTitle);

        var link = titleCell.querySelector('a');
        if (link) {
          link.textContent = fullTitle;
          link.setAttribute('title', fullTitle);
        } else {
          titleCell.textContent = fullTitle;
        }
      }

      if (remarkIndex >= 0 && row.children[remarkIndex]) {
        var remarkCell = row.children[remarkIndex];
        var fullRemark =
          remarkCell.getAttribute('title') ||
          text(remarkCell.querySelector('[title]')) ||
          text(remarkCell);

        remarkCell.classList.add('xy-stable-remark-cell');
        remarkCell.setAttribute('title', fullRemark);

        if (fullRemark.length > 10) {
          remarkCell.textContent = fullRemark.slice(0, 10) + '…';
        } else {
          remarkCell.textContent = fullRemark;
        }
      }
    });
  }

  function hasApplicants(row) {
    var t = text(row);

    if (t.indexOf('人申请') !== -1) return true;
    if (t.indexOf('同意') !== -1 && t.indexOf('拒绝') !== -1) return true;

    var forms = row.querySelectorAll('form[action]');
    for (var i = 0; i < forms.length; i++) {
      var action = forms[i].getAttribute('action') || '';
      if (
        action.indexOf('approve') !== -1 ||
        action.indexOf('reject') !== -1 ||
        action.indexOf('deny') !== -1
      ) return true;
    }

    return false;
  }

  function markRows(table) {
    table.querySelectorAll('tbody tr').forEach(function (row) {
      var p = Number(row.dataset.xyProgress || 0);
      var applying = hasApplicants(row);
      var t = text(row);

      var cannotClaim =
        t.indexOf('当前已关闭') !== -1 ||
        t.indexOf('❌') !== -1 ||
        row.classList.contains('xy-task-row-closed');

      row.dataset.xyApplying = applying ? '1' : '0';
      row.dataset.xyCannotClaim = cannotClaim ? '1' : '0';

      if (p >= 100) row.dataset.xyType = 'done';
      else if (p > 0) row.dataset.xyType = 'doing';
      else row.dataset.xyType = 'todo';

      row.classList.remove('xy-stable-row-green', 'xy-stable-row-gray');

      if (cannotClaim) {
        row.classList.add('xy-stable-row-gray');
      } else if (p < 100) {
        row.classList.add('xy-stable-row-green');
      }
    });
  }

  function addTabs(table) {
    var parent = table.parentElement;
    if (!parent) return;

    var old = parent.querySelector('.xy-task-filter-tabs');
    if (old) old.remove();

    var tabs = document.createElement('div');
    tabs.className = 'xy-task-filter-tabs';
    tabs.innerHTML = [
      '<button type="button" class="active" data-filter="all">全部</button>',
      '<button type="button" data-filter="todo">待认领</button>',
      '<button type="button" data-filter="applying">有申请</button>',
      '<button type="button" data-filter="doing">进行中</button>',
      '<button type="button" data-filter="done">已完成</button>'
    ].join('');

    tabs.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.querySelectorAll('button').forEach(function (b) {
          b.classList.remove('active');
        });

        btn.classList.add('active');

        var filter = btn.dataset.filter || 'all';

        table.querySelectorAll('tbody tr').forEach(function (row) {
          var show = true;

          if (filter === 'todo') show = row.dataset.xyType === 'todo';
          if (filter === 'applying') show = row.dataset.xyApplying === '1';
          if (filter === 'doing') show = row.dataset.xyType === 'doing';
          if (filter === 'done') show = row.dataset.xyType === 'done';

          row.style.display = show ? '' : 'none';
        });
      });
    });

    parent.insertBefore(tabs, table);
  }

  function stabilize(progressMap) {
    if (window.location.pathname.indexOf('/admin/task-pool') !== 0) return;

    document.querySelectorAll('table').forEach(function (table) {
      if (!isTaskPoolTable(table)) return;

      table.classList.remove(
        'task-pool-actions-first',
        'task-title-two-lines-table',
        'xy-task-title-full-table'
      );

      table.classList.add('xy-task-pool-stable-table');

      moveActionLast(table);
      applyProgress(table, progressMap || {});
      normalizeTitleAndRemark(table);
      markRows(table);
      addTabs(table);
    });
  }

  function run() {
    if (window.location.pathname.indexOf('/admin/task-pool') !== 0) return;

    fetch('/admin/task-progress-force-map', {
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        stabilize(data || {});
      })
      .catch(function () {
        stabilize({});
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    run();

    /*
     * 只额外执行两次，避免持续监听导致页面卡顿。
     */
    setTimeout(run, 500);
    setTimeout(run, 1200);
  });
})();
