(function () {
  if (window.__XY_BOSS_WEEKLY_POSITION_FILL_V2__) return;
  window.__XY_BOSS_WEEKLY_POSITION_FILL_V2__ = true;

  function norm(value) {
    return String(value || '')
      .replace(/\s+/g, '')
      .replace(/[：:，,。.\-_/\\|]/g, '')
      .trim();
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isBossPage() {
    return /^\/boss(\/|$)/.test(location.pathname);
  }

  function isTaskPoolPage() {
    var path = location.pathname;

    return /task-pool|taskpool|task-list|task-list|tasks/.test(path);
  }

  function getHeaders(table) {
    var headers = Array.from(table.querySelectorAll('thead th'));
    if (headers.length) return headers;

    var firstRow = table.querySelector('tr');
    if (!firstRow) return [];

    return Array.from(firstRow.children).filter(function (cell) {
      return cell.tagName && cell.tagName.toLowerCase() === 'th';
    });
  }

  function headerText(headers) {
    return headers.map(function (h) {
      return clean(h.textContent);
    }).join('|');
  }

  function isTaskTable(headers, table) {
    var text = norm(headerText(headers) + '|' + table.textContent);

    return (
      text.indexOf('任务标题') !== -1 ||
      text.indexOf('任务内容') !== -1 ||
      text.indexOf('任务总表') !== -1 ||
      text.indexOf('任务池') !== -1 ||
      text.indexOf('认领') !== -1 ||
      text.indexOf('版本') !== -1 ||
      text.indexOf('优先级') !== -1 ||
      text.indexOf('期望完成日期') !== -1
    );
  }

  function isWeeklyTable(headers, table) {
    var path = location.pathname;
    var pageText = norm((document.title || '') + '|' + ((document.querySelector('h1,h2,.page-title,.card-title') || {}).textContent || ''));
    var text = norm(headerText(headers) + '|' + table.textContent);

    if (isTaskTable(headers, table)) return false;

    var pageLooksWeekly =
      /weekly|week-report|weekly-report|weekly-reports/.test(path) ||
      pageText.indexOf('周报') !== -1 ||
      pageText.indexOf('周报管理') !== -1;

    var hasPerson =
      text.indexOf('实习生') !== -1 ||
      text.indexOf('姓名') !== -1 ||
      text.indexOf('提交人') !== -1 ||
      text.indexOf('人员') !== -1 ||
      text.indexOf('账号') !== -1 ||
      text.indexOf('用户') !== -1;

    var hasWeeklyColumn =
      text.indexOf('周报') !== -1 ||
      text.indexOf('周次') !== -1 ||
      text.indexOf('本周') !== -1 ||
      text.indexOf('下周') !== -1 ||
      text.indexOf('提交状态') !== -1 ||
      text.indexOf('提交时间') !== -1 ||
      text.indexOf('查看') !== -1;

    return hasPerson && (pageLooksWeekly || hasWeeklyColumn);
  }

  function findColumnIndex(headers, patterns) {
    for (var i = 0; i < headers.length; i++) {
      var text = norm(headers[i].textContent);

      for (var j = 0; j < patterns.length; j++) {
        if (patterns[j].test(text)) return i;
      }
    }

    return -1;
  }

  function getRows(table) {
    var rows = Array.from(table.querySelectorAll('tbody tr'));
    if (rows.length) return rows;
    return Array.from(table.querySelectorAll('tr')).slice(1);
  }

  function removePositionColumnFromNonWeeklyTable(table) {
    var headers = getHeaders(table);
    if (!headers.length) return;

    if (isWeeklyTable(headers, table)) return;

    var posIndex = findColumnIndex(headers, [/职位/, /岗位/]);
    if (posIndex < 0) return;

    var headerRow = headers[0].parentElement;
    if (headerRow && headerRow.children[posIndex]) {
      headerRow.children[posIndex].remove();
    }

    getRows(table).forEach(function (row) {
      if (row.children[posIndex]) {
        row.children[posIndex].remove();
      }
    });
  }

  function ensurePositionColumn(table, headers, nameIndex) {
    var positionIndex = findColumnIndex(headers, [/职位/, /岗位/]);
    if (positionIndex >= 0) return positionIndex;
    if (nameIndex < 0) return -1;

    var headerRow = headers[0] ? headers[0].parentElement : table.querySelector('tr');
    if (!headerRow) return -1;

    var th = document.createElement('th');
    th.textContent = '职位';

    var insertAfter = headerRow.children[nameIndex];

    if (insertAfter && insertAfter.nextSibling) {
      headerRow.insertBefore(th, insertAfter.nextSibling);
    } else {
      headerRow.appendChild(th);
    }

    getRows(table).forEach(function (row) {
      var td = document.createElement('td');
      td.textContent = '-';
      td.setAttribute('data-xy-boss-weekly-position', '1');

      var after = row.children[nameIndex];

      if (after && after.nextSibling) {
        row.insertBefore(td, after.nextSibling);
      } else {
        row.appendChild(td);
      }
    });

    return nameIndex + 1;
  }

  function buildLookup(payload) {
    var lookup = Object.create(null);
    var rows = Array.isArray(payload.rows) ? payload.rows : [];

    rows.forEach(function (user) {
      var position = user.position || '-';

      [
        user.id,
        user.userId,
        user.username,
        user.realName,
        user.name,
        user.displayName
      ].forEach(function (key) {
        var k = norm(key);
        if (k) lookup[k] = position;
      });
    });

    return lookup;
  }

  function fillWeeklyTable(table, lookup) {
    var headers = getHeaders(table);
    if (!headers.length) return;

    if (!isWeeklyTable(headers, table)) {
      removePositionColumnFromNonWeeklyTable(table);
      return;
    }

    var nameIndex = findColumnIndex(headers, [
      /实习生/,
      /姓名/,
      /提交人/,
      /人员/,
      /账号/,
      /用户/
    ]);

    if (nameIndex < 0) nameIndex = 0;

    var positionIndex = ensurePositionColumn(table, headers, nameIndex);
    if (positionIndex < 0) return;

    getRows(table).forEach(function (row) {
      var nameCell = row.children[nameIndex];
      var positionCell = row.children[positionIndex];
      if (!positionCell) return;

      var keys = [
        nameCell ? nameCell.textContent : '',
        row.dataset.userId,
        row.dataset.userid,
        row.dataset.internId,
        row.dataset.internid,
        row.dataset.username,
        row.dataset.realName,
        row.dataset.name
      ];

      var position = '';

      for (var i = 0; i < keys.length; i++) {
        var key = norm(keys[i]);
        if (key && lookup[key]) {
          position = lookup[key];
          break;
        }
      }

      if (!position) return;

      var current = clean(positionCell.textContent);

      if (!current || current === '-' || current === '未填写' || current === '—') {
        positionCell.textContent = position;
        positionCell.setAttribute('data-xy-boss-weekly-position-filled', '1');
      }
    });
  }

  function run() {
    if (!isBossPage()) return;

    if (isTaskPoolPage()) {
      return;
    }

    fetch('/api/boss/intern-position-map', {
      credentials: 'same-origin'
    })
      .then(function (res) {
        if (!res.ok) throw new Error('position map request failed: ' + res.status);
        return res.json();
      })
      .then(function (payload) {
        if (!payload || !payload.ok) return;

        var lookup = buildLookup(payload);

        Array.from(document.querySelectorAll('table')).forEach(function (table) {
          fillWeeklyTable(table, lookup);
        });
      })
      .catch(function (err) {
        console.warn('[XY_BOSS_WEEKLY_POSITION_FILL_FAILED]', err);
      });
  }

  document.addEventListener('DOMContentLoaded', run);
  setTimeout(run, 300);
})();
