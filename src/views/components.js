function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function statGrid(items, options = {}) {
  const columnsClass = options.columns ? ` ${escapeHtml(options.columns)}` : '';
  const rows = items.map((item) => {
    const tone = item.tone ? ` tone-${escapeHtml(item.tone)}` : '';
    const suffix = item.suffix ? `<em>${escapeHtml(item.suffix)}</em>` : '';
    const hint = item.hint ? `<small>${escapeHtml(item.hint)}</small>` : '';
    const tag = item.href ? 'a' : 'div';
    const href = item.href ? ` href="${escapeHtml(item.href)}"` : '';
    const title = item.title ? ` title="${escapeHtml(item.title)}"` : '';

    return `<${tag}${href}${title} class="stat-card xy-stat-card${tone}${item.href ? ' is-clickable' : ''}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}${suffix}</strong>
      ${hint}
    </${tag}>`;
  }).join('');

  return `<section class="stats xy-dashboard-stats${columnsClass}">${rows}</section>`;
}

function insightList(title, items, emptyText = '暂无数据') {
  const body = items && items.length
    ? `<ul class="xy-insight-list">${items.map((item) => `<li><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.count)}</strong></li>`).join('')}</ul>`
    : `<p class="muted">${escapeHtml(emptyText)}</p>`;

  return `<section class="card xy-insights-card">
    <div class="section-head"><h2>${escapeHtml(title)}</h2></div>
    ${body}
  </section>`;
}

function table({ headers, rows, emptyText, className = '' }) {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const body = rows && rows.length
    ? rows.join('')
    : `<tr><td colspan="${headers.length}" class="empty">${escapeHtml(emptyText || '暂无数据')}</td></tr>`;

  return `<table class="${escapeHtml(className)}">
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function supportDetails(title, items, options = {}) {
  const idAttr = options.id ? ` id="${escapeHtml(options.id)}"` : '';
  const hiddenAttr = options.collapsed ? ' hidden' : '';
  const stateAttr = options.collapsed ? ' data-collapsed="true"' : '';
  const showAction = options.showAction !== false;
  const actionPrefix = options.actionPrefix || '/boss/reports/';
  const rows = items && items.length
    ? items.map((item) => {
      const period = item.weekStart || item.weekEnd
        ? `${item.weekStart || '-'} 至 ${item.weekEnd || '-'}`
        : '-';
      const action = showAction
        ? (item.id ? `<td><a class="link-button small" href="${escapeHtml(actionPrefix)}${escapeHtml(item.id)}">查看周报</a></td>` : '<td>-</td>')
        : '';

      return `<tr>
        <td>${escapeHtml(item.realName || '-')}</td>
        <td>${escapeHtml(item.position || '-')}</td>
        <td>${escapeHtml(period)}</td>
        <td class="xy-support-content">${escapeHtml(item.supportNeeded || '-')}</td>
        ${action}
      </tr>`;
    }).join('')
    : `<tr><td colspan="${showAction ? 5 : 4}" class="empty">暂无需要支持的事项。</td></tr>`;
  const actionHeader = showAction ? '<th>操作</th>' : '';

  return `<section${idAttr}${hiddenAttr}${stateAttr} class="card wide-card xy-support-details-card">
    <div class="section-head"><h2>${escapeHtml(title)}</h2></div>
    <table class="xy-support-details-table">
      <thead><tr><th>实习生</th><th>职位</th><th>周期</th><th>需要支持内容</th>${actionHeader}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

module.exports = { escapeHtml, statGrid, insightList, table, supportDetails };
