/* =========================================================
   intern-daily.js
   实习生每日任务统一交互文件
   由以下文件整合：
   - intern-daily-multi-task.js
   - daily-progress-submit-fix.js
   - intern-remove-old-progress-row.js

   职责：
   1. 每日任务支持一个页面填写多个任务；
   2. 每个任务有独立任务进度条；
   3. 提交前同步 progress / xyMultiProgresses[] hidden 字段；
   4. 移除旧版“整体进度”行，避免重复显示；
   5. 统一由 /intern/daily-tasks 页面加载一次。
   ========================================================= */

/* ===== BEGIN intern-daily-multi-task.js ===== */
(function () {
  var READY_FLAG = 'xyInternDailyProgressBarReadyV2';

  var PROGRESS_OPTIONS = [
    { value: 0, label: '0% 未启动' },
    { value: 10, label: '10% 调研准备' },
    { value: 30, label: '30% 初步执行' },
    { value: 50, label: '50% 过半' },
    { value: 70, label: '70% 收尾阶段' },
    { value: 90, label: '90% 待验收' },
    { value: 100, label: '100% 已完成' }
  ];

  var PROGRESS_TIP = '进度说明：0% 未启动；10% 调研准备；30% 初步执行；50% 过半；70% 收尾阶段；90% 待验收；100% 已完成。保存后会同步到任务总表状态。';

  function text(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function isPage() {
    return window.location.pathname === '/intern/daily-tasks/new';
  }

  function nearestProgress(value) {
    var n = Number(value);
    if (!isFinite(n)) return 0;

    var best = PROGRESS_OPTIONS[0].value;
    var bestDiff = Math.abs(n - best);

    PROGRESS_OPTIONS.forEach(function (item) {
      var diff = Math.abs(n - item.value);
      if (diff < bestDiff) {
        best = item.value;
        bestDiff = diff;
      }
    });

    return best;
  }

  function progressLabel(value) {
    value = Number(value) || 0;
    var item = PROGRESS_OPTIONS.find(function (x) {
      return x.value === value;
    });
    return item ? item.label : value + '%';
  }

  function findForm() {
    return Array.from(document.querySelectorAll('form')).find(function (form) {
      var t = text(form);
      return t.indexOf('关联任务') !== -1 && t.indexOf('今日工作内容') !== -1;
    }) || document.querySelector('form');
  }

  function findTaskSelect(form) {
    return (
      form.querySelector('select[name="taskId"]') ||
      form.querySelector('select[name="taskPoolId"]') ||
      form.querySelector('select[name="relatedTaskId"]') ||
      form.querySelector('select[name="poolTaskId"]') ||
      Array.from(form.querySelectorAll('select')).find(function (select) {
        var selectText = text(select);
        return selectText.indexOf('请选择参与任务') !== -1 ||
          selectText.indexOf('请选择已认领任务') !== -1 ||
          select.options.length > 1;
      })
    );
  }

  function findWorkTextarea(form) {
    return (
      form.querySelector('textarea[name="content"]') ||
      form.querySelector('textarea[name="todayContent"]') ||
      form.querySelector('textarea[name="workContent"]') ||
      form.querySelector('textarea[name="todayWork"]') ||
      Array.from(form.querySelectorAll('textarea')).find(function (textarea) {
        var label = textarea.closest('label');
        return label && text(label).indexOf('今日工作内容') !== -1;
      }) ||
      form.querySelector('textarea')
    );
  }

  function findOriginalProgressField(form) {
    return Array.from(form.querySelectorAll('select, input')).find(function (field) {
      var name = field.getAttribute('name') || '';
      var label = field.closest('label');
      var labelText = label ? text(label) : '';
      var fieldText = text(field);

      return (
        name === 'progress' ||
        name === 'overallProgress' ||
        name === 'taskProgress' ||
        labelText.indexOf('整体进度') !== -1 ||
        labelText.indexOf('任务进度') !== -1 ||
        fieldText.indexOf('请选择整体进度') !== -1 ||
        fieldText.indexOf('请选择任务进度') !== -1
      );
    });
  }

  function hideOriginalProgress(field) {
    if (!field) return;

    field.removeAttribute('required');

    var label = field.closest('label');
    var block = field.closest('.form-group, .field, .mb-3');

    var target = label || block;

    if (target) {
      target.style.display = 'none';
    } else {
      field.style.display = 'none';
    }
  }

  function setOriginalProgressValue(field, value) {
    if (!field) return;

    var v = String(value);

    if (field.tagName === 'SELECT') {
      var matched = Array.from(field.options).find(function (opt) {
        var optNum = String(opt.value || opt.textContent || '').match(/\d+/);
        return optNum && optNum[0] === v;
      });

      if (matched) field.value = matched.value;
      return;
    }

    field.value = v;
  }

  function createProgressBar(initialValue) {
    var value = nearestProgress(initialValue || 0);

    var wrap = document.createElement('div');
    wrap.className = 'xy-progressbar-wrap';

    wrap.innerHTML = [
      '<div class="xy-progressbar-top">',
        '<span class="xy-progressbar-name">任务进度</span>',
        '<strong class="xy-progressbar-value"></strong>',
      '</div>',
      '<input class="xy-progressbar-range" type="range" min="0" max="100" step="1">',
      '<input class="xy-progressbar-hidden" type="hidden" value="">',
      '<div class="xy-progressbar-ticks">',
        '<span>0%</span><span>10%</span><span>30%</span><span>50%</span><span>70%</span><span>90%</span><span>100%</span>',
      '</div>',
      '<div class="xy-task-progress-tip"></div>'
    ].join('');

    var range = wrap.querySelector('.xy-progressbar-range');
    var hidden = wrap.querySelector('.xy-progressbar-hidden');
    var badge = wrap.querySelector('.xy-progressbar-value');
    var tip = wrap.querySelector('.xy-task-progress-tip');

    tip.textContent = PROGRESS_TIP;

    function update(raw) {
      var n = nearestProgress(raw);
      range.value = n;
      hidden.value = n;
      badge.textContent = progressLabel(n);
      wrap.style.setProperty('--xy-progress-percent', n + '%');
    }

    range.addEventListener('input', function () {
      update(range.value);
    });

    range.addEventListener('change', function () {
      update(range.value);
    });

    update(value);

    return wrap;
  }

  function cloneTaskSelect(firstSelect) {
    var cloned = firstSelect.cloneNode(true);
    cloned.removeAttribute('id');
    cloned.name = 'xyMultiTaskId';
    cloned.required = true;
    cloned.value = '';
    return cloned;
  }

  function createTextarea() {
    var textarea = document.createElement('textarea');
    textarea.name = 'xyMultiWorkContent';
    textarea.rows = 6;
    textarea.required = true;
    textarea.placeholder = '请输入该任务今日完成的工作内容';
    return textarea;
  }

  function allTaskSelects(form, firstSelect) {
    return [firstSelect].concat(Array.from(form.querySelectorAll('.xy-daily-task-extra select[name="xyMultiTaskId"]')));
  }

  function allWorkTextareas(form, firstTextarea) {
    return [firstTextarea].concat(Array.from(form.querySelectorAll('.xy-daily-task-extra textarea[name="xyMultiWorkContent"]')));
  }

  function allProgressValues(form, firstProgressWrap) {
    return [firstProgressWrap].concat(Array.from(form.querySelectorAll('.xy-daily-task-extra .xy-progressbar-wrap'))).map(function (wrap) {
      var hidden = wrap.querySelector('.xy-progressbar-hidden');
      return hidden ? hidden.value : '';
    });
  }

  function refreshTitles(form) {
    form.querySelectorAll('.xy-daily-task-extra').forEach(function (block, index) {
      var title = block.querySelector('.xy-daily-task-extra-title');
      if (title) title.textContent = '任务 ' + (index + 2);
    });
  }

  function refreshDuplicateOptions(form, firstSelect) {
    var selects = allTaskSelects(form, firstSelect);
    var selected = selects.map(function (s) { return s.value; }).filter(Boolean);

    selects.forEach(function (select) {
      Array.from(select.options).forEach(function (opt) {
        if (!opt.value) return;
        opt.disabled = selected.indexOf(opt.value) !== -1 && select.value !== opt.value;
      });
    });
  }

  function appendHidden(form, name, value) {
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value || '';
    input.setAttribute('data-xy-multi-daily-hidden', '1');
    form.appendChild(input);
  }

  function removeOldBottomProgressTip() {
    document.querySelectorAll('div, p').forEach(function (el) {
      var t = text(el);
      if (
        t.indexOf('进度选项') !== -1 &&
        t.indexOf('0% 未启动') !== -1 &&
        !el.classList.contains('xy-task-progress-tip')
      ) {
        el.remove();
      }
    });
  }

  function renameProgressText() {
    document.querySelectorAll('label, option, div, p, span, strong').forEach(function (el) {
      var t = text(el);
      if (!t) return;

      if (t.indexOf('整体进度') !== -1) {
        el.textContent = t.replace(/整体进度/g, '任务进度');
      }

      if (t.indexOf('请选择整体进度') !== -1) {
        el.textContent = t.replace(/请选择整体进度/g, '请选择任务进度');
      }
    });
  }

  function setup() {
    // XY_INTERN_DAILY_MULTI_ONCE_GUARD
    if (document.body.getAttribute('data-xy-intern-daily-multi-ready') === '1') return;
    document.body.setAttribute('data-xy-intern-daily-multi-ready', '1');
    if (!isPage()) return;
    if (window[READY_FLAG]) return;

    var form = findForm();
    if (!form) return;

    var firstSelect = findTaskSelect(form);
    var firstTextarea = findWorkTextarea(form);
    var originalProgress = findOriginalProgressField(form);

    if (!firstSelect || !firstTextarea) return;

    window[READY_FLAG] = true;

    renameProgressText();
    removeOldBottomProgressTip();
    hideOriginalProgress(originalProgress);

    var firstProgressWrap = createProgressBar(0);

    firstTextarea.insertAdjacentElement('afterend', firstProgressWrap);

    var addWrap = document.createElement('div');
    addWrap.className = 'xy-daily-task-add-wrap';
    addWrap.innerHTML = '<button type="button" class="xy-daily-task-add-btn">＋ 添加一个任务</button>';

    firstProgressWrap.insertAdjacentElement('afterend', addWrap);

    addWrap.querySelector('button').addEventListener('click', function () {
      var block = document.createElement('div');
      block.className = 'xy-daily-task-extra';

      block.innerHTML = [
        '<div class="xy-daily-task-extra-head">',
          '<strong class="xy-daily-task-extra-title">任务</strong>',
          '<button type="button" class="xy-daily-task-remove-btn">删除</button>',
        '</div>',
        '<label class="xy-daily-task-extra-label">关联任务</label>',
        '<div class="xy-daily-task-select-slot"></div>',
        '<label class="xy-daily-task-extra-label">今日工作内容</label>',
        '<div class="xy-daily-task-textarea-slot"></div>'
      ].join('');

      var select = cloneTaskSelect(firstSelect);
      var textarea = createTextarea();
      var progressWrap = createProgressBar(0);

      block.querySelector('.xy-daily-task-select-slot').appendChild(select);
      block.querySelector('.xy-daily-task-textarea-slot').appendChild(textarea);
      block.appendChild(progressWrap);

      block.querySelector('.xy-daily-task-remove-btn').addEventListener('click', function () {
        block.remove();
        refreshTitles(form);
        refreshDuplicateOptions(form, firstSelect);
      });

      select.addEventListener('change', function () {
        refreshDuplicateOptions(form, firstSelect);
      });

      addWrap.insertAdjacentElement('afterend', block);

      refreshTitles(form);
      refreshDuplicateOptions(form, firstSelect);
    });

    firstSelect.addEventListener('change', function () {
      refreshDuplicateOptions(form, firstSelect);
    });

    form.addEventListener('submit', function (event) {
      form.querySelectorAll('input[data-xy-multi-daily-hidden="1"]').forEach(function (el) {
        el.remove();
      });

      var selects = allTaskSelects(form, firstSelect);
      var textareas = allWorkTextareas(form, firstTextarea);
      var progresses = allProgressValues(form, firstProgressWrap);

      var used = {};
      var items = [];

      for (var i = 0; i < selects.length; i++) {
        var taskId = selects[i].value;
        var content = textareas[i] ? textareas[i].value.trim() : '';
        var progress = progresses[i] || '';

        if (!taskId && !content) continue;

        if (!taskId) {
          event.preventDefault();
          alert('请选择第 ' + (i + 1) + ' 个任务。');
          selects[i].focus();
          return;
        }

        if (!content) {
          event.preventDefault();
          alert('请填写第 ' + (i + 1) + ' 个任务的今日工作内容。');
          textareas[i].focus();
          return;
        }

        if (used[taskId]) {
          event.preventDefault();
          alert('同一个任务一天只能填写一次，请删除重复任务。');
          selects[i].focus();
          return;
        }

        used[taskId] = true;

        items.push({
          taskId: taskId,
          content: content,
          progress: progress
        });
      }

      if (items.length === 0) {
        event.preventDefault();
        alert('请至少填写一个任务。');
        firstSelect.focus();
        return;
      }

      setOriginalProgressValue(originalProgress, items[0].progress);

      appendHidden(form, 'xyMultiDailySubmit', '1');

      items.forEach(function (item) {
        appendHidden(form, 'xyMultiTaskIds[]', item.taskId);
        appendHidden(form, 'xyMultiWorkContents[]', item.content);
        appendHidden(form, 'xyMultiProgresses[]', item.progress);
      });
    });

    refreshDuplicateOptions(form, firstSelect);
  }

  document.addEventListener('DOMContentLoaded', setup);
})();

/* ===== END intern-daily-multi-task.js ===== */

/* ===== BEGIN daily-progress-submit-fix.js ===== */
(function () {
  function isDailyFormPage() {
    return location.pathname === '/intern/daily-tasks/new' ||
      /^\/intern\/daily-tasks\/[^/]+\/edit$/.test(location.pathname);
  }

  if (!isDailyFormPage()) return;

  function normPercent(value) {
    var n = Number(String(value || '').replace('%', '').trim());
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return Math.round(n);
  }

  function syncProgressWrap(wrap) {
    if (!wrap) return 0;

    var range = wrap.querySelector('.xy-progressbar-range');
    var hidden = wrap.querySelector('.xy-progressbar-hidden');

    var value = range ? range.value : hidden ? hidden.value : 0;
    var n = normPercent(value);

    if (range) range.value = String(n);

    if (hidden) {
      hidden.value = String(n);
      hidden.setAttribute('value', String(n));
      if (!hidden.name) hidden.name = 'xyProgressValue[]';
    }

    wrap.style.setProperty('--xy-progress-percent', n + '%');

    var badge = wrap.querySelector('.xy-progressbar-value');
    if (badge) {
      var label = n + '%';
      if (n === 0) label += ' · 未启动';
      else if (n === 10) label += ' · 调研准备';
      else if (n === 30) label += ' · 初步执行';
      else if (n === 50) label += ' · 过半';
      else if (n === 70) label += ' · 收尾阶段';
      else if (n === 90) label += ' · 待验收';
      else if (n === 100) label += ' · 已完成';
      badge.textContent = label;
    }

    return n;
  }

  function syncAllProgress(form) {
    var wraps = Array.from(form.querySelectorAll('.xy-progressbar-wrap'));
    var values = wraps.map(syncProgressWrap);

    if (!values.length) {
      var oldField = form.querySelector('input[name="progress"], select[name="progress"], input[name="taskProgress"], select[name="taskProgress"], input[name="overallProgress"], select[name="overallProgress"]');
      if (oldField) values = [normPercent(oldField.value)];
    }

    if (!values.length) values = [0];

    function setHidden(name, value) {
      var el = form.querySelector('input[name="' + name + '"][data-xy-progress-submit-fix="1"]');
      if (!el) {
        el = document.createElement('input');
        el.type = 'hidden';
        el.name = name;
        el.setAttribute('data-xy-progress-submit-fix', '1');
        form.appendChild(el);
      }
      el.value = String(value);
      el.setAttribute('value', String(value));
    }

    setHidden('progress', values[0]);
    setHidden('taskProgress', values[0]);
    setHidden('overallProgress', values[0]);

    return values;
  }

  function bind() {
    document.querySelectorAll('form').forEach(function (form) {
      if (form.getAttribute('data-xy-progress-submit-bound') === '1') return;
      form.setAttribute('data-xy-progress-submit-bound', '1');

      form.addEventListener('input', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('xy-progressbar-range')) {
          var wrap = e.target.closest('.xy-progressbar-wrap');
          syncProgressWrap(wrap);
        }
      }, true);

      form.addEventListener('change', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('xy-progressbar-range')) {
          var wrap = e.target.closest('.xy-progressbar-wrap');
          syncProgressWrap(wrap);
        }
      }, true);
    });
  }

  document.addEventListener('submit', function (e) {
    if (e.target && e.target.tagName === 'FORM') {
      syncAllProgress(e.target);
    }
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    document.querySelectorAll('.xy-progressbar-wrap').forEach(syncProgressWrap);
  });

  setTimeout(function () {
    bind();
    document.querySelectorAll('.xy-progressbar-wrap').forEach(syncProgressWrap);
  }, 500);

  setTimeout(function () {
    bind();
    document.querySelectorAll('.xy-progressbar-wrap').forEach(syncProgressWrap);
  }, 1500);
})();

/* ===== END daily-progress-submit-fix.js ===== */

/* ===== XY_SYNC_HIDDEN_PROGRESS_FROM_BAR_BEGIN ===== */
(function () {
  function syncHiddenProgressFromBar() {
    document.querySelectorAll('form').forEach(function (form) {
      var wrap = form.querySelector('.xy-progressbar-wrap');
      if (!wrap) return;

      var hiddenInBar = wrap.querySelector('.xy-progressbar-hidden');
      var range = wrap.querySelector('.xy-progressbar-range');
      var value = hiddenInBar && hiddenInBar.value !== '' ? hiddenInBar.value : range ? range.value : '';

      if (value === '') return;

      var progress = form.querySelector('input[name="progress"]');
      if (!progress) {
        progress = document.createElement('input');
        progress.type = 'hidden';
        progress.name = 'progress';
        form.appendChild(progress);
      }

      progress.value = value;
      progress.setAttribute('value', value);
    });
  }

  document.addEventListener('input', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('xy-progressbar-range')) {
      syncHiddenProgressFromBar();
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('xy-progressbar-range')) {
      syncHiddenProgressFromBar();
    }
  });

  document.addEventListener('submit', function () {
    syncHiddenProgressFromBar();
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncHiddenProgressFromBar);
  } else {
    syncHiddenProgressFromBar();
  }
})();
/* ===== XY_SYNC_HIDDEN_PROGRESS_FROM_BAR_END ===== */


/* ===== XY_FORCE_SUBMIT_PROGRESS_FIELD_V2_BEGIN ===== */
/*
 * 今日任务填写页：强制把进度条值写入隐藏字段 xyProgress。
 * 目的：保证后端一定能从 req.body.xyProgress 读到图三进度条的值。
 */
(function () {
  if (window.__XY_FORCE_SUBMIT_PROGRESS_FIELD_V2__) return;
  window.__XY_FORCE_SUBMIT_PROGRESS_FIELD_V2__ = true;

  function isDailyTaskFormPage() {
    return location.pathname === '/intern/daily-tasks/new' ||
      /^\/intern\/daily-tasks\/[^/]+\/edit$/.test(location.pathname);
  }

  function normalizeProgress(value) {
    var raw = String(value == null ? '' : value).replace('%', '').trim();
    if (!raw) return '';

    var n = Number(raw);
    if (!Number.isFinite(n)) return '';

    n = Math.max(0, Math.min(100, Math.round(n)));
    return String(n);
  }

  function findProgressValue(form) {
    if (!form) return '';

    var wrap = form.querySelector('.xy-progressbar-wrap');
    if (wrap) {
      var hidden = wrap.querySelector('.xy-progressbar-hidden');
      var range = wrap.querySelector('.xy-progressbar-range');

      var v1 = hidden ? normalizeProgress(hidden.value) : '';
      if (v1) return v1;

      var v2 = range ? normalizeProgress(range.value) : '';
      if (v2) return v2;
    }

    var existing = form.querySelector('[name="xyProgress"], [name="progress"], [name="taskProgress"], [name="overallProgress"], [name="dailyProgress"]');
    return existing ? normalizeProgress(existing.value) : '';
  }

  function ensureHidden(form, name, value) {
    if (!form || !name) return;

    var input = form.querySelector('input[type="hidden"][name="' + name + '"]');

    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      form.appendChild(input);
    }

    input.value = value;
  }

  function syncForm(form) {
    if (!form) return;

    var progress = findProgressValue(form);
    if (!progress) return;

    // xyProgress 是后端优先读取字段；另外同步 progress/taskProgress/overallProgress 兼容旧逻辑
    ensureHidden(form, 'xyProgress', progress);
    ensureHidden(form, 'progress', progress);
    ensureHidden(form, 'taskProgress', progress);
    ensureHidden(form, 'overallProgress', progress);
  }

  function syncAll() {
    if (!isDailyTaskFormPage()) return;

    document.querySelectorAll('form').forEach(function (form) {
      if (
        form.querySelector('.xy-progressbar-wrap') ||
        form.querySelector('[name="progress"]') ||
        form.querySelector('[name="taskProgress"]') ||
        form.querySelector('[name="overallProgress"]')
      ) {
        syncForm(form);
      }
    });
  }

  document.addEventListener('input', function (event) {
    if (!event.target || !event.target.classList || !event.target.classList.contains('xy-progressbar-range')) return;
    var form = event.target.closest('form');
    syncForm(form);
  }, true);

  document.addEventListener('change', function (event) {
    if (!event.target || !event.target.classList || !event.target.classList.contains('xy-progressbar-range')) return;
    var form = event.target.closest('form');
    syncForm(form);
  }, true);

  document.addEventListener('submit', function (event) {
    syncForm(event.target);
  }, true);

  document.addEventListener('DOMContentLoaded', syncAll);
  setTimeout(syncAll, 0);
})();
/* ===== XY_FORCE_SUBMIT_PROGRESS_FIELD_V2_END ===== */
