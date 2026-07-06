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
