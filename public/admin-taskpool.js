/* =========================================================
   admin-taskpool.js
   管理员任务总表统一交互文件
   由以下文件整合：
   - admin-taskpool-template.js
   - admin-taskpool-remove-claim-status.js
   - admin-taskpool-version-edit.js
   - admin-taskpool-content-panel.js
   ========================================================= */

/* ===== BEGIN admin-taskpool-template.js ===== */
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
});
})();

/* ===== END admin-taskpool-template.js ===== */

/* ===== BEGIN admin-taskpool-remove-claim-status.js ===== */
(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function removeClaimStatusColumn() {
    if (window.location.pathname.indexOf('/admin/task-pool') !== 0) return;

    document.querySelectorAll('table').forEach(function (table) {
      var ths = Array.from(table.querySelectorAll('thead th'));
      var index = ths.findIndex(function (th) {
        return text(th) === '认领状态';
      });

      if (index < 0) return;

      var headRow = table.querySelector('thead tr');

      if (headRow && headRow.children[index]) {
        headRow.children[index].remove();
      }

      table.querySelectorAll('tbody tr').forEach(function (row) {
        if (row.children[index]) {
          row.children[index].remove();
        }
      });

      table.classList.add('xy-claim-status-removed');

      table.querySelectorAll('td[colspan="8"]').forEach(function (td) {
        td.setAttribute('colspan', '7');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    removeClaimStatusColumn();
    setTimeout(removeClaimStatusColumn, 300);
    setTimeout(removeClaimStatusColumn, 800);
    setTimeout(removeClaimStatusColumn, 1500);
  });
})();

/* ===== END admin-taskpool-remove-claim-status.js ===== */

/* ===== BEGIN admin-taskpool-version-edit.js ===== */
(function () {
  function isPage() {
    return window.location.pathname.indexOf('/admin/task-pool') === 0;
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function extractTaskId(row) {
    var selectors = [
      'a[href]',
      'form[action]',
      'button[formaction]',
      'input[formaction]'
    ];

    var nodes = Array.from(row.querySelectorAll(selectors.join(',')));

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var val =
        el.getAttribute('href') ||
        el.getAttribute('action') ||
        el.getAttribute('formaction') ||
        '';

      var m = val.match(/\/admin\/task-pool\/([^\/?#"']+)/);

      if (m && m[1] && m[1] !== 'new') {
        return decodeURIComponent(m[1]);
      }
    }

    var html = row.innerHTML || '';
    var m2 = html.match(/\/admin\/task-pool\/([^\/?#"']+)/);

    if (m2 && m2[1] && m2[1] !== 'new') {
      return decodeURIComponent(m2[1]);
    }

    return '';
  }

  function apiUrl(taskId, suffix) {
    return '/api/admin/task-pool/' + encodeURIComponent(taskId) + '/versions' + (suffix || '');
  }

  async function apiGet(taskId) {
    var r = await fetch(apiUrl(taskId), {
      credentials: 'same-origin'
    });

    return await r.json();
  }

  async function apiPost(url, data) {
    var r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data || {})
    });

    return await r.json();
  }

  function panelHtml(taskId, colspan) {
    return [
      '<td colspan="', colspan, '">',
        '<div class="xy-real-version-box" data-task-id="', esc(taskId), '">',
          '<div class="xy-real-version-head">',
            '<div>',
              '<span class="xy-real-version-title">版本记录</span>',
              '<span class="xy-real-version-status">加载中...</span>',
            '</div>',
            '<button type="button" class="xy-real-version-add-btn">+ 添加版本</button>',
          '</div>',
          '<div class="xy-real-version-add-form" style="display:none;">',
            '<input class="xy-real-version-input xy-add-version-name" placeholder="版本号，如 v2.0">',
            '<input class="xy-real-version-input xy-add-version-desc" placeholder="版本描述，如：联调测试完成">',
            '<input class="xy-real-version-input xy-add-version-time" type="date">',
            '<button type="button" class="xy-real-version-save-add">保存</button>',
            '<button type="button" class="xy-real-version-cancel-add">取消</button>',
          '</div>',
          '<div class="xy-real-version-list"></div>',
        '</div>',
      '</td>'
    ].join('');
  }

  function renderVersions(box, data) {
    var list = box.querySelector('.xy-real-version-list');
    var status = box.querySelector('.xy-real-version-status');

    if (!data || !data.success) {
      status.textContent = data && data.message ? data.message : '加载失败';
      list.innerHTML = '<div class="xy-real-version-empty">版本记录加载失败</div>';
      return;
    }

    var versions = data.versions || [];

    status.textContent = '共 ' + versions.length + ' 个版本';

    if (versions.length === 0) {
      list.innerHTML = '<div class="xy-real-version-empty">暂无版本记录，点击右上角添加版本</div>';
      return;
    }

    list.innerHTML = versions.map(function (v) {
      return [
        '<div class="xy-real-version-item" data-version-id="', esc(v.id), '">',
          '<input class="xy-real-version-input xy-version-name" value="', esc(v.version), '" placeholder="版本号">',
          '<input class="xy-real-version-input xy-version-desc" value="', esc(v.desc), '" placeholder="版本描述">',
          '<input class="xy-real-version-input xy-version-time" type="date" value="', esc(v.time), '">',
          '<button type="button" class="xy-real-version-save">保存</button>',
          '<button type="button" class="xy-real-version-delete">删除</button>',
        '</div>'
      ].join('');
    }).join('');
  }

  async function loadPanel(box) {
    var taskId = box.getAttribute('data-task-id');

    if (!taskId) {
      box.querySelector('.xy-real-version-status').textContent = '无法识别任务ID';
      box.querySelector('.xy-real-version-list').innerHTML =
        '<div class="xy-real-version-empty">无法识别任务ID，请先使用“编辑”进入任务详情修改。</div>';
      return;
    }

    var data = await apiGet(taskId);
    renderVersions(box, data);
  }

  function bindPanel(box) {
    if (box.dataset.bound === '1') return;
    box.dataset.bound = '1';

    var taskId = box.getAttribute('data-task-id');

    box.addEventListener('click', async function (e) {
      e.stopPropagation();

      var addBtn = e.target.closest('.xy-real-version-add-btn');
      var cancelBtn = e.target.closest('.xy-real-version-cancel-add');
      var saveAddBtn = e.target.closest('.xy-real-version-save-add');
      var saveBtn = e.target.closest('.xy-real-version-save');
      var deleteBtn = e.target.closest('.xy-real-version-delete');

      var addForm = box.querySelector('.xy-real-version-add-form');

      if (addBtn) {
        addForm.style.display = 'flex';
        var nameInput = box.querySelector('.xy-add-version-name');
        if (nameInput && !nameInput.value) nameInput.value = 'v2.0';
        return;
      }

      if (cancelBtn) {
        addForm.style.display = 'none';
        box.querySelector('.xy-add-version-name').value = '';
        box.querySelector('.xy-add-version-desc').value = '';
        box.querySelector('.xy-add-version-time').value = '';
        return;
      }

      if (saveAddBtn) {
        var version = box.querySelector('.xy-add-version-name').value.trim();
        var desc = box.querySelector('.xy-add-version-desc').value.trim();
        var time = box.querySelector('.xy-add-version-time').value.trim();

        if (!version || !desc) {
          alert('请填写版本号和版本描述');
          return;
        }

        var result = await apiPost(apiUrl(taskId), {
          version: version,
          desc: desc,
          time: time
        });

        if (!result.success) {
          alert(result.message || '添加失败');
          return;
        }

        addForm.style.display = 'none';
        box.querySelector('.xy-add-version-name').value = '';
        box.querySelector('.xy-add-version-desc').value = '';
        box.querySelector('.xy-add-version-time').value = '';

        await loadPanel(box);
        return;
      }

      if (saveBtn) {
        var item = e.target.closest('.xy-real-version-item');
        var versionId = item.getAttribute('data-version-id');

        var data = {
          version: item.querySelector('.xy-version-name').value.trim(),
          desc: item.querySelector('.xy-version-desc').value.trim(),
          time: item.querySelector('.xy-version-time').value.trim()
        };

        if (!data.version || !data.desc) {
          alert('请填写版本号和版本描述');
          return;
        }

        var saveResult = await apiPost(apiUrl(taskId, '/' + encodeURIComponent(versionId)), data);

        if (!saveResult.success) {
          alert(saveResult.message || '保存失败');
          return;
        }

        alert('保存成功');
        await loadPanel(box);
        return;
      }

      if (deleteBtn) {
        var delItem = e.target.closest('.xy-real-version-item');
        var delId = delItem.getAttribute('data-version-id');

        if (!confirm('确定删除这个版本记录吗？')) return;

        var delResult = await apiPost(apiUrl(taskId, '/' + encodeURIComponent(delId) + '/delete'), {});

        if (!delResult.success) {
          alert(delResult.message || '删除失败');
          return;
        }

        await loadPanel(box);
        return;
      }
    });
  }

  function patchRows() {
    if (!isPage()) return;

    document.querySelectorAll('.xy-taskpool-row').forEach(function (row) {
      var panel = row.nextElementSibling;

      if (!panel || !panel.classList.contains('xy-version-panel')) return;

      if (panel.dataset.realVersionPatched === '1') return;

      var taskId = extractTaskId(row);
      var colspan = row.children.length || 7;

      panel.innerHTML = panelHtml(taskId, colspan);
      panel.dataset.realVersionPatched = '1';

      var box = panel.querySelector('.xy-real-version-box');

      bindPanel(box);
      loadPanel(box);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    patchRows();
    setTimeout(patchRows, 500);
    setTimeout(patchRows, 1200);
    setTimeout(patchRows, 2000);
  });
})();

/* ===== END admin-taskpool-version-edit.js ===== */

/* ===== BEGIN admin-taskpool-content-panel.js ===== */
(function () {
  const loadingRows = new WeakSet();

  function isPage() {
    return window.location.pathname.indexOf('/admin/task-pool') === 0;
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function txt(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function extractTaskId(row) {
    if (!row) return '';

    const fromAttr = row.getAttribute('data-task-id') || row.dataset.taskId || '';
    if (fromAttr) return String(fromAttr).trim();

    const html = row.innerHTML || '';

    const patterns = [
      /\/admin\/task-pool\/([^\/?#"']+)\/edit/,
      /\/admin\/task-pool\/([^\/?#"']+)\/delete/,
      /\/admin\/task-pool\/([^\/?#"']+)\/approve/,
      /\/admin\/task-pool\/([^\/?#"']+)\/reject/,
      /\/admin\/task-pool\/([^\/?#"']+)/
    ];

    for (let i = 0; i < patterns.length; i++) {
      const m = html.match(patterns[i]);
      if (m && m[1] && m[1] !== 'new') {
        return decodeURIComponent(m[1]);
      }
    }

    return '';
  }

  async function loadContent(taskId) {
    if (!taskId) {
      return {
        success: false,
        content: '暂无任务内容'
      };
    }

    try {
      const res = await fetch('/api/task-pool/' + encodeURIComponent(taskId) + '/admin-edit-content', {
        credentials: 'same-origin'
      });

      return await res.json();
    } catch (err) {
      return {
        success: false,
        content: '任务内容读取失败'
      };
    }
  }

  function makeContentBox(content) {
    const isEmpty = !content || content === '暂无任务内容';

    return [
      '<div class="xy-admin-task-content-box" data-xy-task-content-box="1">',
        '<div class="xy-admin-task-content-title">任务内容</div>',
        '<div class="xy-admin-task-content-text', isEmpty ? ' xy-admin-task-content-empty' : '', '">',
          esc(content || '暂无任务内容'),
        '</div>',
      '</div>'
    ].join('');
  }

  function findTaskRow(panelRow) {
    let prev = panelRow.previousElementSibling;

    while (prev) {
      if (
        prev.tagName === 'TR' &&
        !prev.classList.contains('xy-version-panel-row') &&
        !prev.classList.contains('xy-admin-task-content-panel-row') &&
        !prev.classList.contains('xy-admin-task-content-row')
      ) {
        return prev;
      }

      prev = prev.previousElementSibling;
    }

    return null;
  }

  function dedupeContentBoxes(panelRow) {
    if (!panelRow) return null;

    const boxes = Array.from(panelRow.querySelectorAll('.xy-admin-task-content-box'));

    if (boxes.length === 0) return null;

    const first = boxes[0];

    boxes.slice(1).forEach(function (box) {
      box.remove();
    });

    return first;
  }

  async function patchPanel(panelRow) {
    if (!panelRow) return;

    // 已有多个“任务内容”时，立即清理，只保留第一个
    const existed = dedupeContentBoxes(panelRow);
    if (existed) {
      panelRow.dataset.xyAdminContentDone = '1';
      return;
    }

    // 防止 300ms / 1000ms 多次 setTimeout 同时异步插入
    if (loadingRows.has(panelRow)) return;
    if (panelRow.dataset.xyAdminContentDone === '1') return;

    loadingRows.add(panelRow);

    const td = panelRow.querySelector('td[colspan]') || panelRow.querySelector('td');
    if (!td) {
      loadingRows.delete(panelRow);
      return;
    }

    const taskRow = findTaskRow(panelRow);
    const taskId = extractTaskId(taskRow);

    const data = await loadContent(taskId);
    const content = data && data.success ? data.content : (data.content || '暂无任务内容');

    // 异步回来后再检查一次，避免并发重复插入
    const existedAfterLoad = dedupeContentBoxes(panelRow);
    if (existedAfterLoad) {
      panelRow.dataset.xyAdminContentDone = '1';
      loadingRows.delete(panelRow);
      return;
    }

    if (td.firstElementChild) {
      td.firstElementChild.insertAdjacentHTML('afterbegin', makeContentBox(content));
    } else {
      td.insertAdjacentHTML('afterbegin', makeContentBox(content));
    }

    dedupeContentBoxes(panelRow);

    panelRow.dataset.xyAdminContentDone = '1';
    loadingRows.delete(panelRow);
  }

  function markVersionRows() {
    document.querySelectorAll('tr').forEach(function (row) {
      if (row.classList.contains('xy-version-panel-row')) return;

      const t = txt(row);

      if (t.indexOf('版本记录') !== -1 && row.querySelector('td[colspan]')) {
        row.classList.add('xy-version-panel-row');
      }
    });
  }

  function cleanupAllDuplicates() {
    document.querySelectorAll('.xy-version-panel-row').forEach(function (row) {
      dedupeContentBoxes(row);
    });
  }

  function patch() {
    if (!isPage()) return;

    document.body.classList.add('xy-admin-task-content-page');

    markVersionRows();
    cleanupAllDuplicates();

    document.querySelectorAll('.xy-version-panel-row').forEach(function (row) {
      patchPanel(row);
    });
  }

  if (isPage()) {
    document.addEventListener('DOMContentLoaded', function () {
      patch();
      setTimeout(patch, 300);
      setTimeout(patch, 1000);
    });

    document.addEventListener('click', function () {
      setTimeout(patch, 80);
      setTimeout(patch, 300);
      setTimeout(patch, 800);
    });
  }
})();

/* ===== END admin-taskpool-content-panel.js ===== */
