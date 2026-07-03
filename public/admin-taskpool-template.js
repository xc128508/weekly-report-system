(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isPage() {
    return window.location.pathname.indexOf('/admin/task-pool') === 0;
  }

  function headers(table) {
    return Array.from(table.querySelectorAll('thead th')).map(function (th) {
      return text(th);
    });
  }

  function findIndex(hs, keywords) {
    for (var i = 0; i < hs.length; i++) {
      for (var j = 0; j < keywords.length; j++) {
        if (hs[i].indexOf(keywords[j]) !== -1) return i;
      }
    }
    return -1;
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

  function cleanTitle(value) {
    return String(value || '')
      .replace(/^▶|^▼/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tag(type, label) {
    return [
      '<span class="xy-demo-tag ', type, '">',
        '<span class="xy-demo-tag-dot"></span>',
        escapeHtml(label),
      '</span>'
    ].join('');
  }

  function getStatus(rowText, statusText) {
    var full = rowText + ' ' + statusText;

    if (full.indexOf('100%') !== -1 || full.indexOf('已完成') !== -1) {
      return {
        label: '已完成',
        cls: 'xy-tag-done'
      };
    }

    return {
      label: '进行中',
      cls: 'xy-tag-progress'
    };
  }

  function getClaimStatus(rowText, claimText) {
    var full = rowText + ' ' + claimText;

    if (
      full.indexOf('待认领') !== -1 ||
      (!claimText || claimText === '-' || claimText === '—')
    ) {
      return {
        label: '待认领',
        cls: 'xy-tag-pending'
      };
    }

    if (
      full.indexOf('已关闭') !== -1 ||
      full.indexOf('关闭认领') !== -1 ||
      full.indexOf('不可继续') !== -1 ||
      full.indexOf('❌') !== -1
    ) {
      return {
        label: '已关闭',
        cls: 'xy-tag-closed'
      };
    }

    return {
      label: '已认领',
      cls: 'xy-tag-claimed'
    };
  }

  function normalizeClaimNames(claimText) {
    var t = String(claimText || '')
      .replace(/当前继续开放/g, '')
      .replace(/关闭认领/g, '')
      .replace(/重新开放/g, '')
      .replace(/已关闭认领/g, '')
      .replace(/[()（）]/g, '')
      .replace(/❌/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!t || t === '-' || t === '—') return '-';

    return t;
  }

  function getActionHtml(row, actionCell) {
    if (!actionCell) return '';

    var html = actionCell.innerHTML || '';

    html = html
      .replace(/<button/gi, '<button onclick="event.stopPropagation()"')
      .replace(/<a/gi, '<a onclick="event.stopPropagation()"');

    return html;
  }

  function buildVersionPanel(index, item) {
    var desc = item.content && item.content !== '-' && item.content !== '—'
      ? item.content
      : '暂无版本记录，可后续在任务详情中补充任务内容或更新记录。';

    var time = item.due && item.due !== '-' && item.due !== '—'
      ? item.due
      : '';

    return [
      '<tr class="xy-version-panel" data-xy-version-for="', index, '">',
        '<td colspan="7">',
          '<div class="xy-version-inner">',
            '<div class="xy-version-header">',
              '<span>版本记录</span>',
              '<span>共 1 个版本</span>',
            '</div>',
            '<div class="xy-version-list">',
              '<div class="xy-version-item">',
                '<span class="xy-version-tag">v1.0</span>',
                '<span class="xy-version-desc">', escapeHtml(desc), '</span>',
                '<span class="xy-version-time">', escapeHtml(time), '</span>',
              '</div>',
            '</div>',
          '</div>',
        '</td>',
      '</tr>'
    ].join('');
  }

  function rebuildTaskTable(table) {
    if (table.dataset.xyTaskpoolTemplateReady === '1') return;

    var hs = headers(table);

    var deptIndex = findIndex(hs, ['需求部门']);
    var contactIndex = findIndex(hs, ['对接人']);
    var titleIndex = findIndex(hs, ['任务标题', '任务名称', '任务']);
    var dateIndex = findIndex(hs, ['期望完成日期', '期望完成', '期望']);
    var statusIndex = findIndex(hs, ['整体进度', '任务进度', '状态']);
    var claimIndex = findIndex(hs, ['认领/申请人', '认领人', '申请人']);
    var contentIndex = findIndex(hs, ['任务内容', '备注']);
    var actionIndex = findIndex(hs, ['操作']);

    if (deptIndex < 0 || contactIndex < 0 || titleIndex < 0) return;

    var rows = Array.from(table.querySelectorAll('tbody tr')).filter(function (row) {
      if (row.classList.contains('xy-version-panel')) return false;
      if (row.children.length < 3) return false;
      return text(row).trim() !== '';
    });

    if (rows.length === 0) return;

    var data = rows.map(function (row) {
      var cells = row.children;
      var rowText = text(row);

      var dept = cells[deptIndex] ? text(cells[deptIndex]) : '-';
      var contact = cells[contactIndex] ? text(cells[contactIndex]) : '-';
      var title = cells[titleIndex] ? cleanTitle(
        cells[titleIndex].getAttribute('data-full-title') ||
        cells[titleIndex].getAttribute('title') ||
        text(cells[titleIndex])
      ) : '-';
      var due = dateIndex >= 0 && cells[dateIndex] ? text(cells[dateIndex]) : '-';
      var statusText = statusIndex >= 0 && cells[statusIndex] ? text(cells[statusIndex]) : '';
      var claimText = claimIndex >= 0 && cells[claimIndex] ? text(cells[claimIndex]) : '-';
      var content = contentIndex >= 0 && cells[contentIndex] ? text(cells[contentIndex]) : '-';
      var actionHtml = actionIndex >= 0 && cells[actionIndex] ? getActionHtml(row, cells[actionIndex]) : '';

      var status = getStatus(rowText, statusText);
      var claimStatus = getClaimStatus(rowText, claimText);
      var claimNames = normalizeClaimNames(claimText);

      return {
        dept: dept,
        contact: contact,
        title: title,
        due: due,
        status: status,
        claimStatus: claimStatus,
        claimNames: claimNames,
        content: content,
        actionHtml: actionHtml
      };
    });

    var html = '';

    data.forEach(function (item, index) {
      html += [
        '<tr class="xy-taskpool-row" data-xy-row-index="', index, '">',
          '<td>', escapeHtml(item.dept), '</td>',
          '<td>', escapeHtml(item.contact), '</td>',
          '<td title="', escapeHtml(item.title), '">',
            '<div class="xy-task-name-cell">',
              '<span class="xy-expand-arrow">▶</span>',
              '<span class="xy-task-name-text">', escapeHtml(item.title), '</span>',
            '</div>',
          '</td>',
          '<td>', escapeHtml(item.due), '</td>',
          '<td>', tag(item.status.cls, item.status.label), '</td>',
          '<td title="', escapeHtml(item.claimNames), '">', escapeHtml(item.claimNames), '</td>',
          '<td class="xy-taskpool-action-cell">', item.actionHtml, '</td>',
        '</tr>',
        buildVersionPanel(index, item)
      ].join('');
    });

    table.innerHTML = [
      '<thead>',
        '<tr>',
          '<th>需求部门</th>',
          '<th>对接人</th>',
          '<th>任务名称</th>',
          '<th>期望完成</th>',
          '<th>状态</th>',
          '<th>认领人</th>',
          '<th>操作</th>',
        '</tr>',
      '</thead>',
      '<tbody>',
        html,
      '</tbody>'
    ].join('');

    table.classList.add('xy-taskpool-demo-table');
    table.dataset.xyTaskpoolTemplateReady = '1';

    var parent = table.parentElement;
    if (parent && !parent.classList.contains('xy-taskpool-table-wrap')) {
      parent.classList.add('xy-taskpool-table-wrap');
    }

    table.querySelectorAll('.xy-taskpool-row').forEach(function (row) {
      row.addEventListener('click', function (event) {
        if (event.target.closest('.xy-taskpool-action-cell')) return;

        var index = row.getAttribute('data-xy-row-index');
        var panel = table.querySelector('.xy-version-panel[data-xy-version-for="' + index + '"]');
        if (!panel) return;

        var isOpen = panel.classList.contains('show');

        table.querySelectorAll('.xy-version-panel.show').forEach(function (p) {
          p.classList.remove('show');
          var i = p.getAttribute('data-xy-version-for');
          var r = table.querySelector('.xy-taskpool-row[data-xy-row-index="' + i + '"]');
          if (r) r.classList.remove('open');
        });

        if (!isOpen) {
          panel.classList.add('show');
          row.classList.add('open');
        }
      });
    });
  }

  function removeOldTabs() {
    document.querySelectorAll('.xy-task-filter-tabs').forEach(function (el) {
      el.remove();
    });
  }

  function normalizePageTexts() {
    document.querySelectorAll('h1, h2, h3').forEach(function (el) {
      if (text(el) === '任务标题') el.textContent = '任务名称';
    });
  }

  function run() {
    if (!isPage()) return;

    document.body.classList.add('xy-taskpool-template-page');

    removeOldTabs();
    normalizePageTexts();

    document.querySelectorAll('table').forEach(function (table) {
      if (isTaskPoolTable(table)) {
        rebuildTaskTable(table);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    run();
    setTimeout(run, 500);
    setTimeout(run, 1200);
  });
})();
