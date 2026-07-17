(function () {
  if (window.__XY_DAILY_PROGRESSBAR_UNIFIED_STYLE_V10__) return;
  window.__XY_DAILY_PROGRESSBAR_UNIFIED_STYLE_V10__ = true;

  var VALUES = [0, 10, 30, 50, 70, 90, 100];
  var FIELD_NAMES = ['xyProgress', 'progress', 'taskProgress', 'overallProgress', 'dailyProgress'];

  function isTargetPage() {
    return location.pathname === '/intern/daily-tasks/new' ||
      /^\/intern\/daily-tasks\/[^/]+\/edit$/.test(location.pathname);
  }

  function labelOf(value) {
    var v = Number(value || 0);
    if (v <= 0) return '未启动';
    if (v === 10) return '调研准备';
    if (v === 30) return '初步执行';
    if (v === 50) return '过半';
    if (v === 70) return '收尾阶段';
    if (v === 90) return '待验收';
    if (v >= 100) return '已完成';
    return '未填写';
  }

  function snap(value) {
    var raw = String(value == null ? '' : value).replace('%', '').trim();
    var n = Number(raw);

    if (!Number.isFinite(n)) return 0;
    if (VALUES.indexOf(n) !== -1) return n;

    if (/^\d+$/.test(raw) && n >= 0 && n <= 6) {
      return VALUES[n];
    }

    var best = VALUES[0];
    var diff = Math.abs(n - best);

    VALUES.forEach(function (v) {
      var d = Math.abs(n - v);
      if (d < diff || (d === diff && v > best)) {
        best = v;
        diff = d;
      }
    });

    return best;
  }

  function isInSidebar(el) {
    return !!(el && el.closest &&
      el.closest('.xy-left-sidebar, .sidebar, aside, nav, .side-nav, .layout-sidebar'));
  }

  function cleanupSidebarProgressbar() {
    document
      .querySelectorAll('.xy-left-sidebar .xy-daily-progressbar-card, .xy-left-sidebar .xy-progressbar-wrap, .xy-left-sidebar .xy-linked-progressbar-wrap, aside .xy-daily-progressbar-card, nav .xy-daily-progressbar-card, .sidebar .xy-daily-progressbar-card')
      .forEach(function (el) {
        el.remove();
      });
  }

  function getMainScope() {
    return document.querySelector('main') ||
      document.querySelector('.main-content') ||
      document.querySelector('.page-main') ||
      document.querySelector('.content') ||
      document.querySelector('.container') ||
      document.body;
  }

  function findDailyForm() {
    var scope = getMainScope();

    var forms = Array.from(scope.querySelectorAll('form')).filter(function (form) {
      if (isInSidebar(form)) return false;

      var text = form.textContent || '';
      var method = String(form.method || '').toLowerCase();

      return method === 'post' ||
        form.querySelector('textarea') ||
        form.querySelector('[name="content"]') ||
        form.querySelector('[name="taskTitle"]') ||
        text.indexOf('今日工作内容') !== -1 ||
        text.indexOf('遇到问题') !== -1 ||
        text.indexOf('明日计划') !== -1;
    });

    return forms[0] || null;
  }

  function readProgress(form) {
    if (!form) return 0;

    var selectors = [
      '[name="xyProgress"]',
      '[name="progress"]',
      '[name="taskProgress"]',
      '[name="overallProgress"]',
      '[name="dailyProgress"]',
      '.xy-daily-progressbar-range',
      '.xy-progressbar-range',
      '.xy-linked-progressbar-range',
      '[data-xy-progress-value]'
    ];

    for (var i = 0; i < selectors.length; i++) {
      var el = form.querySelector(selectors[i]);
      if (!el) continue;

      var raw = el.value || el.getAttribute('data-xy-progress-value') || '';
      if (String(raw).trim() === '') continue;

      if (el.classList && (
        el.classList.contains('xy-daily-progressbar-range') ||
        el.classList.contains('xy-progressbar-range') ||
        el.classList.contains('xy-linked-progressbar-range')
      )) {
        var max = Number(el.getAttribute('max') || '100');
        if (max <= 6) {
          return VALUES[Number(el.value) || 0];
        }
      }

      return snap(raw);
    }

    var text = form.textContent || '';
    var m = text.match(/(\d{1,3})%\s*[·・]/);
    if (m) return snap(m[1]);

    return 0;
  }

  function ensureHidden(form, name, value) {
    var el = form.querySelector('input[type="hidden"][data-xy-progress-hidden="1"][name="' + name + '"]');

    if (!el) {
      el = document.createElement('input');
      el.type = 'hidden';
      el.name = name;
      el.setAttribute('data-xy-progress-hidden', '1');
      form.appendChild(el);
    }

    el.value = String(value);
  }

  function normalizeOldFields(form, progress) {
    FIELD_NAMES.forEach(function (name) {
      Array.from(form.querySelectorAll('[name="' + name + '"]')).forEach(function (el) {
        if (el.getAttribute('data-xy-progress-hidden') === '1') return;

        var type = String(el.type || '').toLowerCase();
        var tag = String(el.tagName || '').toLowerCase();

        if (type === 'range') {
          var max = Number(el.getAttribute('max') || '100');

          if (max <= 6) {
            var idx = VALUES.indexOf(progress);
            el.value = String(idx < 0 ? 0 : idx);
            el.setAttribute('data-xy-original-name', name);
            el.removeAttribute('name');
          } else {
            el.value = String(progress);
          }

          return;
        }

        if (tag === 'select') {
          var hasOption = Array.from(el.options || []).some(function (opt) {
            return String(opt.value) === String(progress);
          });

          if (hasOption) {
            el.value = String(progress);
          } else {
            el.setAttribute('data-xy-original-name', name);
            el.removeAttribute('name');
          }

          return;
        }

        if (type === 'radio' || type === 'checkbox') {
          el.setAttribute('data-xy-original-name', name);
          el.removeAttribute('name');
          return;
        }

        el.value = String(progress);
      });
    });
  }

  function removeAllOldProgressbars(form) {
    Array.from(form.querySelectorAll(
      '.xy-progressbar-wrap, .xy-linked-progressbar-wrap, .xy-daily-progress-shared, .xy-daily-progressbar-card'
    )).forEach(function (el) {
      el.remove();
    });
  }

  function createCard() {
    var card = document.createElement('div');
    card.className = 'xy-daily-progressbar-card';
    card.setAttribute('data-xy-progress-card', '1');

    card.innerHTML = [
      '<div class="xy-daily-progressbar-top">',
        '<strong class="xy-daily-progressbar-title">任务进度</strong>',
        '<span class="xy-daily-progressbar-value"></span>',
      '</div>',
      '<div class="xy-daily-progressbar-track">',
        '<div class="xy-daily-progressbar-fill"></div>',
      '</div>',
      '<input class="xy-daily-progressbar-range" type="range" min="0" max="6" step="1">',
      '<div class="xy-daily-progressbar-ticks">',
        '<span>0%</span><span>10%</span><span>30%</span><span>50%</span><span>70%</span><span>90%</span><span>100%</span>',
      '</div>',
      '<p class="xy-daily-progressbar-tip">保存后会同步到每日任务列表和管理员今日提交监督中的对应任务进度。</p>'
    ].join('');

    return card;
  }

  function insertCard(form, card) {
    var textarea =
      form.querySelector('textarea[name="content"]') ||
      form.querySelector('textarea');

    var group = textarea ? textarea.closest('.form-group, .field, .form-row, div') : null;

    if (group && group.parentNode && !isInSidebar(group)) {
      group.parentNode.insertBefore(card, group.nextSibling);
      return;
    }

    var before = null;

    Array.from(form.children).forEach(function (node) {
      if (before || isInSidebar(node)) return;

      var text = node.textContent || '';

      if (
        text.indexOf('遇到问题') !== -1 ||
        text.indexOf('需要支持') !== -1 ||
        text.indexOf('明日计划') !== -1 ||
        text.indexOf('备注') !== -1
      ) {
        before = node;
      }
    });

    if (before) {
      form.insertBefore(card, before);
    } else {
      var submit = form.querySelector('button[type="submit"], .form-actions, .actions');
      if (submit && submit.parentNode === form) {
        form.insertBefore(card, submit);
      } else {
        form.appendChild(card);
      }
    }
  }

  function updateCard(form, progress) {
    var card = form.querySelector('.xy-daily-progressbar-card');
    if (!card) return;

    var idx = VALUES.indexOf(progress);
    if (idx < 0) idx = 0;

    var range = card.querySelector('.xy-daily-progressbar-range');
    var fill = card.querySelector('.xy-daily-progressbar-fill');
    var value = card.querySelector('.xy-daily-progressbar-value');

    if (range) range.value = String(idx);
    if (fill) fill.style.width = progress + '%';
    if (value) value.textContent = progress + '% · ' + labelOf(progress);

    card.setAttribute('data-xy-progress-value', String(progress));
  }

  function sync(form, value) {
    if (!form || isInSidebar(form)) return 0;

    var progress = snap(value == null ? readProgress(form) : value);

    normalizeOldFields(form, progress);

    FIELD_NAMES.forEach(function (name) {
      ensureHidden(form, name, progress);
    });

    updateCard(form, progress);
    cleanupSidebarProgressbar();

    return progress;
  }

  function render(form) {
    if (!form || isInSidebar(form)) return;

    var initial = readProgress(form);

    removeAllOldProgressbars(form);

    var card = createCard();
    insertCard(form, card);

    var range = card.querySelector('.xy-daily-progressbar-range');

    if (range) {
      range.addEventListener('input', function () {
        sync(form, VALUES[Number(range.value) || 0]);
      });

      range.addEventListener('change', function () {
        sync(form, VALUES[Number(range.value) || 0]);
      });
    }

    sync(form, initial);

    if (!form.__xyDailyProgressUnifiedSubmitBind) {
      form.__xyDailyProgressUnifiedSubmitBind = true;

      form.addEventListener('formdata', function (event) {
        var progress = sync(form);

        FIELD_NAMES.forEach(function (name) {
          event.formData.set(name, String(progress));
        });
      });

      form.addEventListener('submit', function () {
        sync(form);
      }, true);
    }
  }

  function run() {
    if (!isTargetPage()) return;

    cleanupSidebarProgressbar();

    var form = findDailyForm();
    if (form) render(form);
  }

  window.XYDailyProgressbar = {
    values: VALUES.slice(),
    labelOf: labelOf,
    snap: snap,
    sync: sync,
    render: render,
    run: run
  };

  document.addEventListener('DOMContentLoaded', run);
  setTimeout(run, 0);
  setTimeout(run, 300);
  setTimeout(run, 800);
})();
