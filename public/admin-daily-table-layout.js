(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function shortText(value, max) {
    value = String(value || '').trim();
    if (value.length <= max) return value;
    return value.slice(0, max) + '…';
  }

  function headers(table) {
    return Array.from(table.querySelectorAll('thead th')).map(function (th) {
      return text(th);
    });
  }

  function isAdminDailyTable(table) {
    var hs = headers(table).join('|');

    return (
      hs.indexOf('日期') !== -1 &&
      hs.indexOf('姓名') !== -1 &&
      hs.indexOf('职位') !== -1 &&
      (
        hs.indexOf('今日工作内容') !== -1 ||
        hs.indexOf('任务内容') !== -1 ||
        hs.indexOf('关联任务') !== -1 ||
        hs.indexOf('任务标题') !== -1
      )
    );
  }

  function findIndex(hs, keywords) {
    for (var i = 0; i < hs.length; i++) {
      for (var j = 0; j < keywords.length; j++) {
        if (hs[i].indexOf(keywords[j]) !== -1) return i;
      }
    }
    return -1;
  }

  function makeCell(tag, html, className) {
    var cell = document.createElement(tag);
    if (className) cell.className = className;
    cell.innerHTML = html || '';
    return cell;
  }

  function findDailyHref(row) {
    var editLink = row.querySelector('a[href*="/admin/daily-tasks/"][href*="/edit"]');
    if (editLink) return editLink.getAttribute('href') || '';

    var anyLink = row.querySelector('a[href*="/admin/daily-tasks/"]');
    if (anyLink) return anyLink.getAttribute('href') || '';

    return '';
  }

  function desiredHeader(table) {
    var hs = headers(table);
    var target = ['日期', '姓名', '职位', '任务标题', '任务内容', '问题/支持', '明日计划', '整体进度', '操作'];
    return hs.length === target.length && hs.every(function (h, i) { return h === target[i]; });
  }

  function rebuildTable(table) {
    if (!isAdminDailyTable(table)) return;

    if (desiredHeader(table) && table.classList.contains('xy-admin-daily-table-final')) {
      return;
    }

    var hs = headers(table);

    var dateIndex = findIndex(hs, ['日期']);
    var nameIndex = findIndex(hs, ['姓名']);
    var positionIndex = findIndex(hs, ['职位']);
    var titleIndex = findIndex(hs, ['关联任务', '任务标题']);
    var contentIndex = findIndex(hs, ['今日工作内容', '任务内容']);
    var problemIndex = findIndex(hs, ['问题', '支持']);
    var planIndex = findIndex(hs, ['明日计划']);
    var progressIndex = findIndex(hs, ['整体进度', '进度']);
    var actionIndex = findIndex(hs, ['操作']);

    if (dateIndex < 0 || nameIndex < 0 || positionIndex < 0 || titleIndex < 0) return;

    var headRow = table.querySelector('thead tr');
    if (!headRow) return;

    headRow.innerHTML = '';
    [
      '日期',
      '姓名',
      '职位',
      '任务标题',
      '任务内容',
      '问题/支持',
      '明日计划',
      '整体进度',
      '操作'
    ].forEach(function (h) {
      headRow.appendChild(makeCell('th', h));
    });

    table.querySelectorAll('tbody tr').forEach(function (row) {
      var oldCells = Array.from(row.children);

      function cellHtml(index) {
        if (index < 0 || !oldCells[index]) return '';
        return oldCells[index].innerHTML || '';
      }

      function cellText(index) {
        if (index < 0 || !oldCells[index]) return '';
        return text(oldCells[index]);
      }

      var dailyHref = findDailyHref(row);
      var fullTitle = cellText(titleIndex);
      var fullContent = cellText(contentIndex);
      var actionHtml = actionIndex >= 0 ? cellHtml(actionIndex) : '';

      var titleHtml = dailyHref
        ? '<a class="xy-daily-title-link" href="' + escapeHtml(dailyHref) + '" title="' + escapeHtml(fullTitle) + '">' + escapeHtml(shortText(fullTitle, 20)) + '</a>'
        : '<span title="' + escapeHtml(fullTitle) + '">' + escapeHtml(shortText(fullTitle, 20)) + '</span>';

      var contentHtml = '<span title="' + escapeHtml(fullContent) + '">' + escapeHtml(shortText(fullContent, 30)) + '</span>';

      row.innerHTML = '';

      row.appendChild(makeCell('td', cellHtml(dateIndex), 'xy-daily-date-cell'));
      row.appendChild(makeCell('td', cellHtml(nameIndex), 'xy-daily-name-cell'));
      row.appendChild(makeCell('td', cellHtml(positionIndex), 'xy-daily-position-cell'));
      row.appendChild(makeCell('td', titleHtml, 'xy-daily-title-cell'));
      row.appendChild(makeCell('td', contentHtml, 'xy-daily-content-cell'));
      row.appendChild(makeCell('td', cellHtml(problemIndex), 'xy-daily-problem-cell'));
      row.appendChild(makeCell('td', cellHtml(planIndex), 'xy-daily-plan-cell'));
      row.appendChild(makeCell('td', cellHtml(progressIndex), 'xy-daily-progress-cell'));
      row.appendChild(makeCell('td', actionHtml, 'xy-daily-action-last-cell'));
    });

    table.classList.remove('daily-actions-first');
    table.classList.add('xy-admin-daily-table-final');
  }

  function removeDuplicateHeaderAndStats() {
    if (window.location.pathname.indexOf('/admin/daily-tasks') !== 0) return;

    document.querySelectorAll('.xy-page-header, .xy-stat-cards').forEach(function (el) {
      el.remove();
    });
  }

  function renameNavText() {
    document.querySelectorAll('a[href="/admin/daily-tasks"]').forEach(function (a) {
      if (text(a) === '每日任务') {
        a.textContent = '日报';
      }
    });
  }

  function run() {
    if (window.location.pathname.indexOf('/admin/daily-tasks') !== 0) return;

    removeDuplicateHeaderAndStats();
    renameNavText();

    document.querySelectorAll('table').forEach(function (table) {
      rebuildTable(table);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    run();

    var count = 0;
    var timer = setInterval(function () {
      run();
      count += 1;
      if (count >= 20) clearInterval(timer);
    }, 300);
  });
})();
