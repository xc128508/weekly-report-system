(function () {
  var MAX_TITLE = 15;
  var MAX_CONTENT_PREVIEW = 10;

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function chars(str) {
    return Array.from(String(str || '').trim());
  }

  function cut(str, n) {
    var arr = chars(str);
    if (arr.length <= n) return arr.join('');
    return arr.slice(0, n).join('') + '…';
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
        hs.indexOf('任务名称') !== -1
      ) &&
      hs.indexOf('认领') !== -1
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

  function findEditHref(row) {
    var edit = row.querySelector('a[href*="/admin/task-pool/"][href*="edit"]');
    if (edit) return edit.getAttribute('href');

    var any = row.querySelector('a[href*="/admin/task-pool/"]');
    if (any) return any.getAttribute('href');

    return '';
  }

  function normalizeTaskPoolTable() {
    if (window.location.pathname.indexOf('/admin/task-pool') !== 0) return;

    document.querySelectorAll('table').forEach(function (table) {
      if (!isTaskPoolTable(table)) return;

      table.classList.add('xy-task-pool-content-only-table');

      var hs = headers(table);

      var titleIndex = findIndex(hs, ['任务标题', '任务名称']);
      var contentIndex = findIndex(hs, ['任务内容', '备注']);

      if (titleIndex >= 0) {
        var titleTh = table.querySelectorAll('thead th')[titleIndex];
        if (titleTh) titleTh.textContent = '任务标题';
      }

      if (contentIndex >= 0) {
        var contentTh = table.querySelectorAll('thead th')[contentIndex];
        if (contentTh) {
          contentTh.textContent = '任务内容';
          contentTh.classList.add('xy-task-content-head');
        }
      }

      table.querySelectorAll('tbody tr').forEach(function (row) {
        if (titleIndex >= 0 && row.children[titleIndex]) {
          var titleCell = row.children[titleIndex];
          var link = titleCell.querySelector('a');

          var fullTitle =
            titleCell.getAttribute('data-full-title') ||
            titleCell.getAttribute('title') ||
            text(link) ||
            text(titleCell);

          titleCell.setAttribute('data-full-title', fullTitle);
          titleCell.setAttribute('title', fullTitle);
          titleCell.classList.add('xy-task-title-15-cell');

          var showTitle = cut(fullTitle, MAX_TITLE);

          if (link) {
            link.textContent = showTitle;
            link.setAttribute('title', fullTitle);
          } else {
            titleCell.textContent = showTitle;
          }
        }

        if (contentIndex >= 0 && row.children[contentIndex]) {
          var contentCell = row.children[contentIndex];

          var fullContent =
            contentCell.getAttribute('data-full-task-content') ||
            contentCell.getAttribute('title') ||
            text(contentCell);

          fullContent = String(fullContent || '').trim();

          contentCell.classList.add('xy-task-content-10-cell');

          if (!fullContent || fullContent === '-' || fullContent === '—' || fullContent === '无') {
            contentCell.textContent = '—';
            contentCell.setAttribute('title', '');
            return;
          }

          contentCell.setAttribute('data-full-task-content', fullContent);
          contentCell.setAttribute('title', fullContent);

          var preview = cut(fullContent, MAX_CONTENT_PREVIEW);
          var href = findEditHref(row);

          if (href && chars(fullContent).length > MAX_CONTENT_PREVIEW) {
            contentCell.innerHTML =
              '<a class="xy-task-content-10-link" href="' +
              esc(href) +
              '" title="' +
              esc(fullContent) +
              '">' +
              esc(preview) +
              '</a>';
          } else {
            contentCell.textContent = preview;
          }
        }
      });
    });
  }

  function findTitleInput(form) {
    return (
      form.querySelector('input[name="title"]') ||
      form.querySelector('textarea[name="title"]') ||
      form.querySelector('input[name="taskTitle"]') ||
      form.querySelector('textarea[name="taskTitle"]')
    );
  }

  function findContentInput(form) {
    return (
      form.querySelector('textarea[name="taskContent"]') ||
      form.querySelector('input[name="taskContent"]') ||
      form.querySelector('textarea[name="remark"]') ||
      form.querySelector('input[name="remark"]') ||
      form.querySelector('textarea[name="content"]') ||
      form.querySelector('input[name="content"]')
    );
  }

  function relabelOnlyTaskPool(scope) {
    scope.querySelectorAll('label, th').forEach(function (el) {
      var t = text(el);
      if (t.indexOf('备注') !== -1) {
        el.textContent = t.replace(/备注/g, '任务内容');
      }
    });

    scope.querySelectorAll('input, textarea').forEach(function (el) {
      var ph = el.getAttribute('placeholder') || '';
      if (ph.indexOf('备注') !== -1) {
        el.setAttribute('placeholder', ph.replace(/备注/g, '任务内容'));
      }
    });
  }

  function normalizeTaskPoolForms() {
    if (window.location.pathname.indexOf('/admin/task-pool') !== 0) return;

    document.querySelectorAll('form').forEach(function (form) {
      var action = form.getAttribute('action') || '';
      var formText = text(form);

      var isTaskPoolForm =
        action.indexOf('/admin/task-pool') !== -1 ||
        formText.indexOf('新增任务') !== -1 ||
        formText.indexOf('编辑任务') !== -1 ||
        formText.indexOf('任务标题') !== -1;

      if (!isTaskPoolForm) return;

      relabelOnlyTaskPool(form);

      var titleInput = findTitleInput(form);

      if (titleInput && titleInput.dataset.xyTitle15Ready !== '1') {
        titleInput.dataset.xyTitle15Ready = '1';
        titleInput.setAttribute('maxlength', String(MAX_TITLE));

        var counter = document.createElement('div');
        counter.className = 'xy-task-title-15-counter';

        function updateCounter() {
          counter.textContent = chars(titleInput.value).length + '/' + MAX_TITLE + ' 字';
        }

        titleInput.addEventListener('input', updateCounter);
        titleInput.insertAdjacentElement('afterend', counter);
        updateCounter();
      }

      var contentInput = findContentInput(form);

      if (contentInput) {
        contentInput.setAttribute('name', 'taskContent');
        contentInput.setAttribute('placeholder', '请输入任务内容');
      } else if (titleInput) {
        var block = document.createElement('div');
        block.className = 'xy-task-content-form-block';
        block.innerHTML =
          '<label>任务内容</label>' +
          '<textarea name="taskContent" rows="4" placeholder="请输入任务内容"></textarea>';

        var wrap = titleInput.closest('.form-group, .field, .mb-3, div') || titleInput.parentElement;
        if (wrap && wrap.parentElement) {
          wrap.insertAdjacentElement('afterend', block);
        } else {
          form.appendChild(block);
        }
      }

      if (form.dataset.xyTaskPoolContentSubmitReady === '1') return;
      form.dataset.xyTaskPoolContentSubmitReady = '1';

      form.addEventListener('submit', function (event) {
        var input = findTitleInput(form);

        if (input && chars(input.value).length > MAX_TITLE) {
          event.preventDefault();
          alert('任务标题不能超过15字，请精简后再提交。');
          input.focus();
          return;
        }

        var content = findContentInput(form);

        if (content) {
          var oldHidden = form.querySelector('input[name="remark"][data-xy-compat="1"]');
          if (oldHidden) oldHidden.remove();

          var hidden = document.createElement('input');
          hidden.type = 'hidden';
          hidden.name = 'remark';
          hidden.value = content.value || '';
          hidden.setAttribute('data-xy-compat', '1');
          form.appendChild(hidden);
        }
      });
    });
  }

  function run() {
    normalizeTaskPoolForms();
    normalizeTaskPoolTable();
  }

  document.addEventListener('DOMContentLoaded', function () {
    run();

    var count = 0;
    var timer = setInterval(function () {
      run();
      count += 1;
      if (count >= 16) clearInterval(timer);
    }, 300);
  });
})();
