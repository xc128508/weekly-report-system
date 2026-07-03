(function () {
  var PREVIEW_LEN = 10;

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

  function isAdminTaskPoolTable(table) {
    var hs = headers(table).join('|');

    return (
      hs.indexOf('需求部门') !== -1 &&
      hs.indexOf('对接人') !== -1 &&
      hs.indexOf('任务标题') !== -1 &&
      hs.indexOf('认领') !== -1
    );
  }

  function findEditHref(row) {
    var edit = row.querySelector('a[href*="/admin/task-pool/"][href*="edit"]');
    if (edit) return edit.getAttribute('href');

    var any = row.querySelector('a[href*="/admin/task-pool/"]');
    if (any) return any.getAttribute('href');

    return '';
  }

  function fixTaskPoolRemarkColumn() {
    if (window.location.pathname.indexOf('/admin/task-pool') !== 0) return;

    document.querySelectorAll('table').forEach(function (table) {
      if (!isAdminTaskPoolTable(table)) return;

      table.classList.add('xy-task-pool-final-content-table');

      var ths = Array.from(table.querySelectorAll('thead th'));

      var contentIndex = ths.findIndex(function (th) {
        var h = text(th);
        return h.indexOf('备注') !== -1 || h.indexOf('任务内容') !== -1;
      });

      if (contentIndex < 0) return;

      var th = ths[contentIndex];

      if (text(th) !== '任务内容') {
        th.textContent = '任务内容';
      }

      th.classList.add('xy-final-task-content-th');

      table.querySelectorAll('tbody tr').forEach(function (row) {
        var cell = row.children[contentIndex];
        if (!cell) return;

        cell.classList.add('xy-final-task-content-td');

        var full =
          cell.getAttribute('data-xy-full-task-content') ||
          cell.getAttribute('title') ||
          text(cell);

        full = String(full || '').trim();

        if (!full || full === '-' || full === '—' || full === '无') {
          if (text(cell) !== '—') {
            cell.textContent = '—';
          }
          cell.setAttribute('title', '');
          cell.setAttribute('data-xy-full-task-content', '');
          return;
        }

        cell.setAttribute('data-xy-full-task-content', full);
        cell.setAttribute('title', full);

        var preview = cut(full, PREVIEW_LEN);
        var href = findEditHref(row);
        var current = text(cell);

        if (current === preview) return;

        if (href && chars(full).length > PREVIEW_LEN) {
          cell.innerHTML =
            '<a class="xy-final-task-content-link" href="' +
            esc(href) +
            '" title="' +
            esc(full) +
            '">' +
            esc(preview) +
            '</a>';
        } else {
          cell.textContent = preview;
        }
      });
    });
  }

  function fixTaskPoolFormLabel() {
    if (window.location.pathname.indexOf('/admin/task-pool') !== 0) return;

    document.querySelectorAll('label, th').forEach(function (el) {
      var t = text(el);
      if (t.indexOf('备注') !== -1) {
        el.textContent = t.replace(/备注/g, '任务内容');
      }
    });

    document.querySelectorAll('input, textarea').forEach(function (el) {
      var ph = el.getAttribute('placeholder') || '';
      if (ph.indexOf('备注') !== -1) {
        el.setAttribute('placeholder', ph.replace(/备注/g, '任务内容'));
      }
    });
  }

  function run() {
    fixTaskPoolRemarkColumn();
    fixTaskPoolFormLabel();
  }

  var scheduled = false;

  function scheduleRun() {
    if (scheduled) return;

    scheduled = true;

    window.requestAnimationFrame(function () {
      scheduled = false;
      run();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    run();

    setTimeout(run, 300);
    setTimeout(run, 800);
    setTimeout(run, 1500);
    setTimeout(run, 3000);

    /*
     * 监听旧脚本或页面重新渲染，发现“备注”又出现就改回“任务内容”。
     * 用 requestAnimationFrame 节流，避免卡顿。
     */
    var observer = new MutationObserver(scheduleRun);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  });
})();
