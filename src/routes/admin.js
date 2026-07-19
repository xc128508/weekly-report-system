const bcrypt = require('bcryptjs');

const ACCOUNT_TYPES = {
  intern: {
    label: '实习生',
    description: '填写日报、周报并参与任务认领',
    role: 'intern',
    defaultPosition: '实习生'
  },
  employee: {
    label: '正式员工',
    description: '包含正式员工和现有负责人账号',
    role: 'employee',
    defaultPosition: '正式员工'
  },
  admin: {
    label: '管理员',
    description: '维护部门、账号和系统业务数据',
    role: 'admin',
    defaultPosition: '管理员'
  }
};

function accountTypeForUser(user) {
  if (user.role === 'intern') return 'intern';
  if (user.role === 'admin') return 'admin';
  return 'employee';
}

function accountTypeConfig(value) {
  return ACCOUNT_TYPES[value] || ACCOUNT_TYPES.intern;
}

function sortedUsers(users) {
  return [...users].sort((a, b) => {
    const byPosition = String(a.position || '').localeCompare(String(b.position || ''), 'zh-CN');
    if (byPosition !== 0) return byPosition;
    return String(a.realName || '').localeCompare(String(b.realName || ''), 'zh-CN');
  });
}

function departmentNames(db) {
  return (Array.isArray(db.departments) ? db.departments : [])
    .map((department) => String(department.name || department || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function validDepartmentValue(db, value) {
  const department = String(value || '').trim();
  if (!department) return '';
  return departmentNames(db).includes(department) ? department : null;
}

function departmentOptions(db, selected, escapeHtml) {
  const current = String(selected || '').trim();
  const names = departmentNames(db);
  if (current && !names.includes(current)) names.push(current);
  return [
    '<option value="">未分配部门</option>',
    ...names.map((name) => `<option value="${escapeHtml(name)}" ${name === current ? 'selected' : ''}>${escapeHtml(name)}</option>`)
  ].join('');
}

function userMatchesType(user, type) {
  if (type === 'intern') return user.role === 'intern';
  if (type === 'admin') return user.role === 'admin';
  return user.role === 'employee' || user.role === 'boss';
}

function syncUserReferences(db, user, previousName) {
  if (Array.isArray(db.dailyTasks)) {
    db.dailyTasks.forEach((task) => {
      if (task.userId !== user.id) return;
      task.userName = user.realName;
      task.realName = user.realName;
      task.name = user.realName;
      task.position = user.position;
      task.department = user.department || task.department || '';
    });
  }

  if (user.role !== 'intern' || !previousName || previousName === user.realName || !Array.isArray(db.taskPool)) return;

  db.taskPool.forEach((task) => {
    if (Array.isArray(task.assigneeNames)) {
      task.assigneeNames = task.assigneeNames.map((name) => name === previousName ? user.realName : name);
    }
    if (typeof task.assigneeName === 'string') {
      task.assigneeName = task.assigneeName
        .split(/[,，、;；]+/)
        .map((name) => name.trim() === previousName ? user.realName : name.trim())
        .filter(Boolean)
        .join(',');
    }
  });
}

function deleteInternData(db, user, now) {
  const userId = user.id;
  const realName = user.realName;
  db.dailyTasks = (db.dailyTasks || []).filter((task) => task.userId !== userId);

  const deletedReportIds = (db.reports || [])
    .filter((report) => report.userId === userId)
    .map((report) => report.id);
  db.reports = (db.reports || []).filter((report) => report.userId !== userId);
  db.feedbacks = (db.feedbacks || []).filter((feedback) => !deletedReportIds.includes(feedback.reportId));

  (db.taskPool || []).forEach((task) => {
    if (Array.isArray(task.assigneeNames)) {
      task.assigneeNames = task.assigneeNames.filter((name) => name !== realName);
    }
    if (typeof task.assigneeName === 'string') {
      task.assigneeName = task.assigneeName
        .split(/[,，、;；]+/)
        .map((name) => name.trim())
        .filter((name) => name && name !== realName)
        .join(',');
    }
    if (Array.isArray(task.claimedByUserIds)) {
      task.claimedByUserIds = task.claimedByUserIds.filter((id) => id !== userId);
    }
    if (task.claimedByUserId === userId) {
      task.claimedByUserId = task.claimedByUserIds?.[0] || '';
    }
    if (task.pendingClaimUserId === userId) {
      delete task.pendingClaimUserId;
      delete task.pendingClaimName;
      delete task.pendingClaimAt;
    }

    const hasAssignee =
      task.claimedByUserIds?.length ||
      task.assigneeNames?.length ||
      String(task.assigneeName || '').trim();
    if (!hasAssignee && !['已完成', '进行中'].includes(task.status)) {
      task.status = '待认领';
      task.claimDate = '';
    }
    task.updatedAt = now();
  });
}

function departmentUsage(db, name) {
  return {
    users: (db.users || []).filter((user) => user.department === name).length,
    tasks: (db.taskPool || []).filter((task) => task.department === name).length,
    reports: (db.reports || []).filter((report) => report.department === name).length
  };
}

function registerAdminRoutes(app, deps) {
  const {
    requireLogin,
    requireAdmin,
    readDb,
    writeDb,
    reportService,
    layout,
    escapeHtml,
    id,
    now,
    normalizeDepartment,
    syncTaskPoolProgressFromDailyTasks
  } = deps;

  app.get('/admin/api/dashboard-summary', requireLogin, requireAdmin, (req, res) => {
    const date = String(req.query.date || '').slice(0, 10);
    res.json(reportService.buildAdminDashboardInsights(readDb(), date || undefined));
  });

  app.get('/admin/users', requireLogin, requireAdmin, (req, res) => {
    const db = readDb();
    const selectedType = ACCOUNT_TYPES[req.query.type] ? req.query.type : 'intern';
    const config = accountTypeConfig(selectedType);
    const users = sortedUsers((db.users || []).filter((user) => userMatchesType(user, selectedType)));
    const counts = Object.keys(ACCOUNT_TYPES).reduce((result, type) => {
      result[type] = (db.users || []).filter((user) => userMatchesType(user, type)).length;
      return result;
    }, {});
    const adminCount = counts.admin;

    const typeNav = Object.entries(ACCOUNT_TYPES).map(([type, item]) => `
      <a class="xy-account-type ${type === selectedType ? 'is-active' : ''}" href="/admin/users?type=${type}" ${type === selectedType ? 'aria-current="page"' : ''}>
        <span>${item.label}</span>
        <strong>${counts[type]}</strong>
        <small>${item.description}</small>
      </a>`).join('');

    const rows = users.length ? users.map((user) => {
      const cannotDelete = user.id === req.user.id || (user.role === 'admin' && adminCount <= 1);
      const deleteReason = user.id === req.user.id ? '不能删除当前登录账号' : '系统必须保留至少一个管理员';
      const roleLabel = user.role === 'boss' ? '负责人' : config.label;
      return `<tr>
        <td><strong>${escapeHtml(user.realName)}</strong><small class="xy-table-subtext">${escapeHtml(roleLabel)}</small></td>
        <td>${escapeHtml(user.department || '未分配')}</td>
        <td>${escapeHtml(user.position || '-')}</td>
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml((user.createdAt || '').slice(0, 10) || '-')}</td>
        <td class="xy-account-actions">
          <a class="link-button small" href="/admin/users/${encodeURIComponent(user.id)}/edit">编辑</a>
          <form method="post" action="/admin/users/${encodeURIComponent(user.id)}/delete" class="inline-form" onsubmit="return confirm('确认删除该账号吗？${user.role === 'intern' ? '该实习生的日报和周报也会同步删除。' : ''}');">
            <button class="danger small" type="submit" ${cannotDelete ? `disabled title="${escapeHtml(deleteReason)}"` : ''}>删除</button>
          </form>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="6" class="empty">暂无${config.label}账号。</td></tr>`;

    const messageMap = {
      created: `${config.label}账号已创建。`,
      updated: '账号信息已更新。',
      deleted: '账号已删除。',
      duplicate: '账号名已存在，请换一个账号名。',
      short: '密码至少需要 6 位。',
      department: '所选部门不存在，请先在部门管理中添加。',
      self: '不能删除当前登录账号。',
      'last-admin': '系统必须保留至少一个管理员。'
    };
    const messageKey = Object.keys(messageMap).find((key) => req.query[key]);
    const message = messageKey
      ? `<div class="alert ${['duplicate', 'short', 'department', 'self', 'last-admin'].includes(messageKey) ? 'error' : 'success'}">${escapeHtml(messageMap[messageKey])}</div>`
      : '';

    res.send(layout({
      title: '账号管理',
      user: req.user,
      content: `<section class="page-title">
          <div><h1>账号管理</h1><p>按人员类型维护账号，列表默认按照岗位和姓名排序。</p></div>
          <a class="secondary" href="/admin/departments">部门管理</a>
        </section>
        ${message}
        <nav class="xy-account-types" aria-label="账号类型">${typeNav}</nav>
        <section class="card">
          <div class="section-head"><h2>新增${config.label}</h2><span class="muted">初始密码不少于 6 位</span></div>
          <form method="post" action="/admin/users" class="xy-account-form">
            <input type="hidden" name="accountType" value="${selectedType}" />
            <label>姓名<input name="realName" placeholder="请输入姓名" required /></label>
            <label>部门<select name="department">${departmentOptions(db, '', escapeHtml)}</select></label>
            <label>岗位<input name="position" placeholder="例如：${escapeHtml(config.defaultPosition)}" required /></label>
            <label>登录账号<input name="username" placeholder="请输入登录账号" required /></label>
            <label>初始密码<input type="password" name="password" minlength="6" placeholder="至少 6 位" required /></label>
            <button class="primary" type="submit">添加${config.label}</button>
          </form>
        </section>
        <section class="card wide-card">
          <div class="section-head"><h2>${config.label}列表</h2><span class="muted">按岗位排序，共 ${users.length} 人</span></div>
          <table class="xy-account-table">
            <thead><tr><th>姓名</th><th>部门</th><th>岗位</th><th>登录账号</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`
    }));
  });

  app.post('/admin/users', requireLogin, requireAdmin, (req, res) => {
    const db = readDb();
    const type = ACCOUNT_TYPES[req.body.accountType] ? req.body.accountType : 'intern';
    const config = accountTypeConfig(type);
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const department = validDepartmentValue(db, req.body.department);
    if (!username || db.users.some((user) => user.username === username)) {
      return res.redirect(`/admin/users?type=${type}&duplicate=1`);
    }
    if (password.length < 6) {
      return res.redirect(`/admin/users?type=${type}&short=1`);
    }
    if (department === null) {
      return res.redirect(`/admin/users?type=${type}&department=1`);
    }

    db.users.push({
      id: id(),
      username,
      passwordHash: bcrypt.hashSync(password, 10),
      realName: String(req.body.realName || username).trim(),
      department,
      position: String(req.body.position || config.defaultPosition).trim(),
      role: config.role,
      createdAt: now()
    });
    if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
    writeDb(db);
    res.redirect(`/admin/users?type=${type}&created=1`);
  });

  app.get('/admin/users/:id/edit', requireLogin, requireAdmin, (req, res) => {
    const db = readDb();
    const user = db.users.find((item) => item.id === req.params.id);
    if (!user) return res.status(404).send('账号不存在');
    const type = accountTypeForUser(user);
    const config = accountTypeConfig(type);
    const errorMap = {
      duplicate: '账号已存在，请换一个账号名。',
      short: '新密码至少需要 6 位；不修改密码可留空。',
      department: '所选部门不存在，请先在部门管理中添加。'
    };
    const error = req.query.error
      ? `<div class="alert error">${escapeHtml(errorMap[req.query.error] || '修改失败，请重试。')}</div>`
      : '';

    res.send(layout({
      title: `编辑${config.label}账号`,
      user: req.user,
      content: `<section class="page-title">
          <div><h1>编辑${config.label}账号</h1><p>修改姓名、部门、岗位、登录账号或重置密码。</p></div>
          <a class="ghost-link" href="/admin/users?type=${type}">返回账号管理</a>
        </section>
        <section class="card">
          ${error}
          <form method="post" action="/admin/users/${encodeURIComponent(user.id)}" class="form">
            <div class="two-cols">
              <label>姓名<input name="realName" value="${escapeHtml(user.realName)}" required /></label>
              <label>部门<select name="department">${departmentOptions(db, user.department, escapeHtml)}</select></label>
            </div>
            <div class="two-cols">
              <label>岗位<input name="position" value="${escapeHtml(user.position || '')}" required /></label>
              <label>登录账号<input name="username" value="${escapeHtml(user.username)}" required /></label>
            </div>
            <label>重置密码<input type="password" name="password" minlength="6" placeholder="不修改密码请留空" /></label>
            <div class="actions"><button class="primary" type="submit">保存修改</button></div>
          </form>
        </section>`
    }));
  });

  app.post('/admin/users/:id', requireLogin, requireAdmin, (req, res) => {
    const db = readDb();
    const user = db.users.find((item) => item.id === req.params.id);
    if (!user) return res.status(404).send('账号不存在');
    const type = accountTypeForUser(user);
    const username = String(req.body.username || '').trim();
    const department = validDepartmentValue(db, req.body.department);
    if (!username || db.users.some((item) => item.username === username && item.id !== user.id)) {
      return res.redirect(`/admin/users/${encodeURIComponent(user.id)}/edit?error=duplicate`);
    }
    if (department === null) {
      return res.redirect(`/admin/users/${encodeURIComponent(user.id)}/edit?error=department`);
    }

    const password = String(req.body.password || '');
    if (password && password.length < 6) {
      return res.redirect(`/admin/users/${encodeURIComponent(user.id)}/edit?error=short`);
    }

    const previousName = user.realName;
    user.realName = String(req.body.realName || username).trim();
    user.department = department;
    user.position = String(req.body.position || accountTypeConfig(type).defaultPosition).trim();
    user.username = username;
    if (password) user.passwordHash = bcrypt.hashSync(password, 10);
    user.updatedAt = now();
    syncUserReferences(db, user, previousName);
    if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
    writeDb(db);
    res.redirect(`/admin/users?type=${type}&updated=1`);
  });

  app.post('/admin/users/:id/delete', requireLogin, requireAdmin, (req, res) => {
    const db = readDb();
    const user = db.users.find((item) => item.id === req.params.id);
    if (!user) return res.status(404).send('账号不存在');
    const type = accountTypeForUser(user);
    if (user.id === req.user.id) {
      return res.redirect(`/admin/users?type=${type}&self=1`);
    }
    if (user.role === 'admin' && db.users.filter((item) => item.role === 'admin').length <= 1) {
      return res.redirect('/admin/users?type=admin&last-admin=1');
    }

    if (user.role === 'intern') deleteInternData(db, user, now);
    db.users = db.users.filter((item) => item.id !== user.id);
    if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
    writeDb(db);
    res.redirect(`/admin/users?type=${type}&deleted=1`);
  });

  app.get('/admin/departments', requireLogin, requireAdmin, (req, res) => {
    const db = readDb();
    const departments = [...(db.departments || [])].sort((a, b) => {
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    });
    const rows = departments.length ? departments.map((department) => {
      const usage = departmentUsage(db, department.name);
      const total = usage.users + usage.tasks + usage.reports;
      return `<tr>
        <td><strong>${escapeHtml(department.name)}</strong></td>
        <td>${usage.users}</td>
        <td>${usage.tasks}</td>
        <td>
          <form method="post" action="/admin/departments/${encodeURIComponent(department.id)}/delete" class="inline-form" onsubmit="return confirm('确认删除该部门吗？');">
            <button class="danger small" type="submit" ${total ? `disabled title="该部门仍被人员或任务使用"` : ''}>删除</button>
          </form>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="4" class="empty">暂无部门。</td></tr>';

    const messageMap = {
      created: ['success', '部门已添加。'],
      deleted: ['success', '部门已删除。'],
      duplicate: ['error', '部门已存在，请勿重复添加。'],
      invalid: ['error', '请输入 1 至 50 个字符的部门名称。'],
      'in-use': ['error', '该部门仍被人员、任务或周报使用，暂时不能删除。']
    };
    const key = Object.keys(messageMap).find((item) => req.query[item]);
    const message = key ? `<div class="alert ${messageMap[key][0]}">${messageMap[key][1]}</div>` : '';

    res.send(layout({
      title: '部门管理',
      user: req.user,
      content: `<section class="page-title">
          <div><h1>部门管理</h1><p>新增部门后，可在账号和任务表单中直接选择。</p></div>
          <a class="ghost-link" href="/admin/users">返回账号管理</a>
        </section>
        ${message}
        <section class="card">
          <h2>添加部门</h2>
          <form method="post" action="/admin/departments" class="xy-department-form">
            <label>部门名称<input name="name" maxlength="50" placeholder="例如：运营部" required /></label>
            <button class="primary" type="submit">添加部门</button>
          </form>
        </section>
        <section class="card wide-card">
          <div class="section-head"><h2>部门列表</h2><span class="muted">共 ${departments.length} 个部门</span></div>
          <table class="xy-department-table">
            <thead><tr><th>部门名称</th><th>人员数</th><th>关联任务数</th><th>操作</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`
    }));
  });

  app.post('/admin/departments', requireLogin, requireAdmin, (req, res) => {
    const db = readDb();
    const name = normalizeDepartment(req.body.name);
    if (!name || name.length > 50) return res.redirect('/admin/departments?invalid=1');
    if ((db.departments || []).some((department) => department.name.toLowerCase() === name.toLowerCase())) {
      return res.redirect('/admin/departments?duplicate=1');
    }
    db.departments.push({ id: id(), name, createdAt: now() });
    writeDb(db);
    res.redirect('/admin/departments?created=1');
  });

  app.post('/admin/departments/:id/delete', requireLogin, requireAdmin, (req, res) => {
    const db = readDb();
    const department = (db.departments || []).find((item) => item.id === req.params.id);
    if (!department) return res.status(404).send('部门不存在');
    const usage = departmentUsage(db, department.name);
    if (usage.users + usage.tasks + usage.reports > 0) {
      return res.redirect('/admin/departments?in-use=1');
    }
    db.departments = db.departments.filter((item) => item.id !== department.id);
    writeDb(db);
    res.redirect('/admin/departments?deleted=1');
  });
}

module.exports = { registerAdminRoutes };
