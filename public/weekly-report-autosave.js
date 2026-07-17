(function () {
  var form = document.querySelector('[data-weekly-report-form]');
  if (!form || !window.localStorage) return;

  var storageKey = 'xy-weekly-report-draft:' + window.location.pathname;
  var status = document.querySelector('[data-weekly-autosave-status]');
  var clearButton = document.querySelector('[data-weekly-autosave-clear]');
  var timer = null;

  function fields() {
    return Array.prototype.slice.call(form.querySelectorAll('input[name], textarea[name], select[name]'))
      .filter(function (field) {
        return field.type !== 'hidden' && field.name !== 'action';
      });
  }

  function readCurrent() {
    var data = {};
    fields().forEach(function (field) {
      data[field.name] = field.value;
    });
    return data;
  }

  function setStatus(text) {
    if (!status) return;
    status.textContent = text;
  }

  function save() {
    var payload = {
      savedAt: new Date().toISOString(),
      data: readCurrent()
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    setStatus('已自动保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
  }

  function scheduleSave() {
    clearTimeout(timer);
    setStatus('正在保存...');
    timer = setTimeout(save, 500);
  }

  function restore() {
    var raw = localStorage.getItem(storageKey);
    if (!raw) {
      setStatus('自动保存已开启');
      return;
    }

    try {
      var payload = JSON.parse(raw);
      var data = payload && payload.data ? payload.data : {};
      var restored = false;

      fields().forEach(function (field) {
        if (field.value) return;
        if (Object.prototype.hasOwnProperty.call(data, field.name)) {
          field.value = data[field.name] || '';
          restored = true;
        }
      });

      setStatus(restored ? '已恢复本地草稿' : '自动保存已开启');
    } catch (err) {
      setStatus('自动保存已开启');
    }
  }

  fields().forEach(function (field) {
    field.addEventListener('input', scheduleSave);
    field.addEventListener('change', scheduleSave);
  });

  if (clearButton) {
    clearButton.addEventListener('click', function () {
      localStorage.removeItem(storageKey);
      setStatus('本地草稿已清除');
    });
  }

  restore();
})();
