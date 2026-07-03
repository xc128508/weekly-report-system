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
