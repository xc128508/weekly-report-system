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
        return text(select).indexOf('请选择已认领任务') !== -1 || select.options.length > 1;
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
  setTimeout(setup, 300);
  setTimeout(setup, 800);
  setTimeout(setup, 1500);
})();
