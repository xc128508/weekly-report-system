const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createJsonDb } = require('./db');
const reportService = require('./services/reportService');
const viewComponents = require('./views/components');
const { registerInternRoutes } = require('./routes/intern');
const { registerAdminRoutes } = require('./routes/admin');
const { registerBossRoutes } = require('./routes/boss');

const app = express();

// ==================== XY_SERVER_HTML_ASSET_MANAGER_V2_BEGIN ====================
// 第一轮整合：统一管理最终 HTML 里的 CSS/JS。
// 目的：
// 1. 同一页面同一 CSS/JS 只输出一次；
// 2. 管理员页面不再加载旧的前端增强导航，避免先旧版后新版的闪动；
// 3. 任务总表字体 class 由服务端直接写入 body，不再依赖 JS 后加载；
// 4. 不改数据库、不改业务数据、不改表格 rows。
function xyAssetPath(url) {
  return String(url || '').split('?')[0].trim();
}

function xyHtmlHasAsset(html, assetPath) {
  return String(html || '').indexOf(assetPath) !== -1;
}

function xyInjectHeadAsset(html, tag, assetPath) {
  if (!html || xyHtmlHasAsset(html, assetPath)) return html;
  if (html.includes('</head>')) return html.replace('</head>', tag + '\n</head>');
  return tag + '\n' + html;
}

function xyInjectBodyAsset(html, tag, assetPath) {
  if (!html || xyHtmlHasAsset(html, assetPath)) return html;
  if (html.includes('</body>')) return html.replace('</body>', tag + '\n</body>');
  return html + '\n' + tag;
}

function xyAddBodyClassToHtml(html, className) {
  if (!className || String(html || '').includes(className)) return html;

  return String(html || '').replace(/<body([^>]*)>/i, function (match, attrs) {
    const cls = attrs.match(/class=["']([^"']*)["']/i);

    if (cls) {
      const next = (cls[1] + ' ' + className).replace(/\s+/g, ' ').trim();
      return '<body' + attrs.replace(cls[0], 'class="' + next + '"') + '>';
    }

    return '<body' + attrs + ' class="' + className + '">';
  });
}

function xyCleanAndManageHtmlAssets(req, html) {
  if (typeof html !== 'string') return html;
  if (!html.includes('<html') && !html.includes('</body>')) return html;

  const path = String(req.path || '');

  const isAdmin = path === '/admin' || path.indexOf('/admin/') === 0;
  const isAdminDaily = path.indexOf('/admin/daily-tasks') === 0;
  const isAdminTaskPool = path.indexOf('/admin/task-pool') === 0;
  const isIntern = path === '/intern' || path.indexOf('/intern/') === 0;
  const isInternDaily = path.indexOf('/intern/daily-tasks') === 0;
    const isInternTaskPool = path.indexOf('/intern/task-pool') === 0;

  const blocked = new Set();

    // XY_INTERN_RUNTIME_BLOCK_OLD_REFLOW_BEGIN
    // 实习生页面不再加载旧的侧边栏排序、移动端重排、管理员表格重排脚本，避免每次点击后 DOM 二次移动
    if (isIntern) {
      [
        '/admin-layout-enhance.js',
        '/admin-daily-table-layout.js',
        '/admin-daily-match-taskpool.css',
        '/admin-daily-match-taskpool.js',
        '/admin-taskpool-template.css',
        '/admin-taskpool-template.js',
        '/admin-taskpool-remove-claim-status.js',
        '/admin-taskpool-version-edit.css',
        '/admin-taskpool-version-edit.js',
        '/admin-taskpool-content-panel.css',
        '/admin-taskpool-content-panel.js',
        '/admin-taskpool-font-plus.css',
        '/admin-taskpool-font-plus.js',
        '/sidebar-bottom-font.js',
        '/intern-sidebar-order.js',
        '/intern-mobile-only.css',
        '/intern-mobile-only.js',
        '/xy-responsive-ui.css',
        '/xy-responsive-ui.js',
        '/xy-safe-ui-polish.css',
        '/xy-safe-ui-polish.js',
        '/xy-ui-spec.css',
        '/xy-ui-spec-normalize.js'
      ].forEach((x) => blocked.add(x));

      if (!isInternDaily) {
        [
          '/intern-daily.js',
          '/intern-daily-multi-task.js',
          '/daily-progress-submit-fix.js',
          '/intern-remove-old-progress-row.js'
        ].forEach((x) => blocked.add(x));
      }

      if (!isInternTaskPool) {
        [
          '/intern-taskpool-version-sync.css',
          '/intern-taskpool-version-sync.js'
        ].forEach((x) => blocked.add(x));
      }
    }
    // XY_INTERN_RUNTIME_BLOCK_OLD_REFLOW_END


  // 管理员导航已经由 server.js 的统一 layout 输出，不再让旧 JS 二次重建导航/标题/统计卡。
  if (isAdmin) {
    [
      '/admin-layout-enhance.js',
      '/admin-ui-simplify.css',
      '/admin-ui-simplify.js',
      '/intern-sidebar-order.js',
      '/sidebar-bottom-font.js',
      '/intern-mobile-only.css',
      '/intern-mobile-only.js',
      '/xy-responsive-ui.css',
      '/xy-responsive-ui.js',
      '/xy-safe-ui-polish.css',
      '/xy-safe-ui-polish.js',
      '/xy-ui-spec.css',
      '/xy-ui-spec-normalize.js'
    ].forEach((x) => blocked.add(x));

    html = xyAddBodyClassToHtml(html, 'xy-server-unified-admin');
    html = xyAddBodyClassToHtml(html, 'xy-left-sidebar-layout');
  }

  // 管理员日报页：不加载任务总表/实习生端的交互脚本。
  if (isAdminDaily) {
    [
      '/admin-daily-table-layout.js',
      '/admin-taskpool-template.css',
      '/admin-taskpool-template.js',
      '/admin-taskpool-version-edit.css',
      '/admin-taskpool-version-edit.js',
      '/admin-taskpool-content-panel.css',
      '/admin-taskpool-content-panel.js',
      '/admin-taskpool-remove-claim-status.js',
      '/intern-daily-multi-task.js',
      '/intern-remove-old-progress-row.js',
      '/intern-daily.js',
      '/intern-taskpool-version-sync.css',
      '/intern-taskpool-version-sync.js'
    ].forEach((x) => blocked.add(x));
  }

  // 管理员任务总表：字体放大由服务端 body class + CSS 控制，不再加载 font-plus.js。
  if (isAdminTaskPool) {
    // XY_TASKPOOL_UNIFIED_ASSETS_BEGIN
    [
      '/admin-taskpool-template.css',
      '/admin-taskpool-template.js',
      '/admin-taskpool-remove-claim-status.js',
      '/admin-taskpool-version-edit.css',
      '/admin-taskpool-version-edit.js',
      '/admin-taskpool-content-panel.css',
      '/admin-taskpool-content-panel.js',
      '/admin-taskpool-font-plus.css',
      '/admin-taskpool-font-plus.js'
    ].forEach((x) => blocked.add(x));

    html = xyAddBodyClassToHtml(html, 'xy-admin-taskpool-font-plus');

    html = xyInjectHeadAsset(
      html,
      '<link rel="stylesheet" href="/admin-taskpool.css?v=2026070721">',
      '/admin-taskpool.css'
    );

    html = xyInjectBodyAsset(
      html,
      '<script src="/admin-taskpool.js?v=2026070721"></script>',
      '/admin-taskpool.js'
    );
    // XY_TASKPOOL_UNIFIED_ASSETS_END

    blocked.add('/admin-taskpool-font-plus.js');
    html = xyAddBodyClassToHtml(html, 'xy-admin-taskpool-font-plus');

    html = xyInjectHeadAsset(
      html,
      '<link rel="stylesheet" href="/admin-taskpool-font-plus.css?v=2026070718">',
      '/admin-taskpool-font-plus.css'
    );
  }

  // 非实习生页面不加载实习生日报脚本。
  if (!isIntern) {
    [
      '/intern-daily-multi-task.js',
      '/intern-remove-old-progress-row.js',
      '/intern-sidebar-order.js',
      '/intern-mobile-only.css',
      '/intern-mobile-only.js'
    ].forEach((x) => blocked.add(x));
  }

  // 实习生日报页：只保留必要的日报多任务与进度提交脚本。
  if (isInternDaily) {
    html = xyInjectBodyAsset(
      html,
      '<script src="/intern-daily-multi-task.js?v=2026070716"></script>',
      '/intern-daily-multi-task.js'
    );

    html = xyInjectBodyAsset(
      html,
      '<script src="/daily-progress-submit-fix.js?v=2026070716"></script>',
      '/daily-progress-submit-fix.js'
    );
  }

    // XY_INTERN_DAILY_UNIFIED_ASSETS_BEGIN
  if (isInternDaily) {
    [
      '/intern-daily-multi-task.js',
      '/daily-progress-submit-fix.js',
      '/intern-remove-old-progress-row.js'
    ].forEach((x) => blocked.add(x));

    html = xyInjectBodyAsset(
      html,
      '<script src="/intern-daily.js?v=2026070745"></script>',
      '/intern-daily.js'
    );
  }
  // XY_INTERN_DAILY_UNIFIED_ASSETS_END

  const seen = new Set();

  html = html.replace(
    /<link\b[^>]*href=["']([^"']+)["'][^>]*>\s*|<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>\s*/gi,
    function (tag, href, src) {
      const raw = href || src || '';
      const assetPath = xyAssetPath(raw);

      if (!assetPath) return tag;

      if (blocked.has(assetPath)) return '';

      if (seen.has(assetPath)) return '';

      seen.add(assetPath);
      return tag;
    }
  );
  return html;
}

app.use((req, res, next) => {
  const oldSend = res.send.bind(res);

  res.send = function xyServerManagedSend(body) {
    try {
      body = xyCleanAndManageHtmlAssets(req, body);
    } catch (err) {
      console.error('[xy server html asset manager v2 error]', err);
    }

    return oldSend(body);
  };

  next();
});
// ==================== XY_SERVER_HTML_ASSET_MANAGER_V2_END ====================

const PORT = process.env.PORT || 8082;
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
let jsonDbStore = null;

app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'weekly-report-demo-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 }
  })
);

function now() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function id() {
  return crypto.randomUUID();
}

function daysAgo(n) {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString().slice(0, 10);
}

function weekStartDefault() {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function weekEndDefault() {
  const date = new Date(weekStartDefault());
  date.setDate(date.getDate() + 6);
  return date.toISOString().slice(0, 10);
}

function seedTaskPool() {
  return [
    {
      id: id(),
      department: '衍生业务部',
      contact: '对接人A',
      title: '发行方（路网、速通）通行费对账全流程',
      expectedDate: '2026-07-03',
      assigneeName: '实习生A',
      claimDate: '2026-06-26',
      status: '已认领',
      remark: ''
    },
    {
      id: id(),
      department: '衍生业务部',
      contact: '对接人B',
      title: '基于第一周流程拆解，提出AI优化方案并开始落地',
      expectedDate: '2026-07-03',
      assigneeName: '实习生A',
      claimDate: '2026-06-26',
      status: '已认领',
      remark: ''
    },
    {
      id: id(),
      department: '产品研发部',
      contact: '对接人C',
      title: '搭建技术基础，熟悉工作环境与团队流程',
      expectedDate: '2026-06-26',
      assigneeName: '实习生B',
      claimDate: '2026-06-23',
      status: '已认领',
      remark: ''
    },
    {
      id: id(),
      department: '产品研发部',
      contact: '对接人C',
      title: '搭建银行流水与数据库的对账系统',
      expectedDate: '2026-07-03',
      assigneeName: '实习生B',
      claimDate: '2026-06-23',
      status: '已认领',
      remark: ''
    },
    {
      id: id(),
      department: '客服部',
      contact: '对接人D',
      title: '客服QA更新自动化系统',
      expectedDate: '2026-07-03',
      assigneeName: '实习生C,实习生D',
      claimDate: '2026-06-23',
      status: '进行中',
      remark: '测试和修复阶段'
    },
    {
      id: id(),
      department: '衍生业务部',
      contact: '对接人E',
      title: '企微存量新能源用户社群运营',
      priority: '紧急',
      expectedDate: '2026-07-03',
      assigneeName: '实习生E,实习生F',
      claimDate: '2026-06-15',
      status: '进行中',
      remark: '个人学习AI'
    },
    {
      id: id(),
      department: '法务部',
      contact: '对接人F',
      title: '诉讼证据收集提效',
      expectedDate: '2026-07-07',
      assigneeName: '实习生G',
      claimDate: '2026-06-23',
      status: '进行中',
      remark: '本周内完成，已经部署完，测试完了'
    },
    {
      id: id(),
      department: '产品研发部',
      contact: '对接人G',
      title: '文档批量转换工具(Markdown → PDF / Word)',
      expectedDate: '2026-06-25',
      assigneeName: '实习生H',
      claimDate: '2026-06-24',
      status: '已完成',
      remark: ''
    },
    {
      id: id(),
      department: '产品研发部',
      contact: '对接人G',
      title: 'CRM 工单数据出发,分析高频客服问题,识别可优化、可自动化的方向',
      expectedDate: '2026-06-26',
      assigneeName: '实习生H',
      claimDate: '2026-06-24',
      status: '已完成',
      remark: ''
    },
    {
      id: id(),
      department: '产品研发部',
      contact: '对接人G',
      title: '开发一个可落地的提效工具，进行方案设计并验证',
      expectedDate: '2026-07-03',
      assigneeName: '实习生H',
      claimDate: '2026-06-25',
      status: '进行中',
      remark: '目前遇到困难，数据收集后重新开始'
    },
    {
      id: id(),
      department: '市场部',
      contact: '对接人H',
      title: '宣传脚本制作，继续找合作大V',
      expectedDate: '2026-06-24',
      assigneeName: '实习生I',
      claimDate: '2026-06-23',
      status: '进行中',
      remark: '暂停，还在考虑方向'
    },
    {
      id: id(),
      department: '市场部',
      contact: '对接人H',
      title: '快手和抖音怎么转到小程序的链路调研，统计大v宣传视频的转化率',
      expectedDate: '2026-06-25',
      assigneeName: '实习生I,实习生J',
      claimDate: '2026-06-26',
      status: '进行中',
      remark: '不考虑第三方平台，抖音开官旗账号，快手和视频号三方平台同时进行'
    }
  ];
}

function ensureDb() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(DB_PATH)) {
    const adminPass = bcrypt.hashSync('admin123', 10);
    const internPass = bcrypt.hashSync('123456', 10);
    const db = {
      users: [
        {
          id: id(),
          username: 'admin',
          passwordHash: adminPass,
          realName: '管理员',
          position: '进程监督管理员',
          role: 'admin',
          createdAt: now()
        },
        {
          id: id(),
          username: 'boss',
          passwordHash: bcrypt.hashSync('boss123', 10),
          realName: '老板',
          position: '公司负责人',
          role: 'boss',
          createdAt: now()
        },
        {
          id: id(),
          username: 'zhangsan',
          passwordHash: internPass,
          realName: '实习生甲',
          position: 'AI工程师实习生',
          role: 'intern',
          createdAt: now()
        },
        {
          id: id(),
          username: 'lisi',
          passwordHash: internPass,
          realName: '实习生乙',
          position: '产品实习生',
          role: 'intern',
          createdAt: now()
        }
      ],
      reports: [],
      feedbacks: [],
      dailyTasks: [],
      taskPool: seedTaskPool()
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    return;
  }

  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  let changed = false;
  if (!Array.isArray(db.feedbacks)) { db.feedbacks = []; changed = true; }
  if (!Array.isArray(db.dailyTasks)) { db.dailyTasks = []; changed = true; }
  if (!Array.isArray(db.taskPool) || db.taskPool.length === 0) { db.taskPool = seedTaskPool(); changed = true; }
  db.taskPool.forEach((task) => {
    if (!task.id) { task.id = id(); changed = true; }
    if (task.department !== normalizeDepartment(task.department)) { task.department = normalizeDepartment(task.department); changed = true; }
    if (!task.status) { task.status = task.assigneeName ? '已认领' : '待认领'; changed = true; }
    if (task.progress !== undefined && task.progress !== '' && taskStatusFromProgress(task.progress)) { task.status = taskStatusFromProgress(task.progress); changed = true; }
    if (task.status === '待审核' && !task.pendingClaimAt) { task.pendingClaimAt = now(); changed = true; }
    if (task.claimedByUserId) {
      const claimedUser = db.users.find((u) => u.id === task.claimedByUserId);
      if (claimedUser && !task.assigneeName) { task.assigneeName = claimedUser.realName; changed = true; }
      if (task.status === '待审核' || task.status === '待认领') { task.status = '已认领'; changed = true; }
    }
    if (!task.assigneeName && !task.claimedByUserId && !task.pendingClaimUserId && !['待认领', '待审核'].includes(task.status)) {
      task.status = '待认领'; changed = true;
    }
  });
  if (!db.users.some((u) => u.role === 'boss')) {
    db.users.push({
      id: id(),
      username: 'boss',
      passwordHash: bcrypt.hashSync('boss123', 10),
      realName: '老板',
      position: '公司负责人',
      role: 'boss',
      createdAt: now()
    });
    changed = true;
  }
  db.users.forEach((u) => {
    if (!u.position) {
      u.position = u.role === 'admin' ? '进程监督管理员' : (u.role === 'boss' ? '公司负责人' : '实习生');
      changed = true;
    }
    if (u.username === 'admin' && u.role === 'admin') {
      if (u.realName === '老板') { u.realName = '管理员'; changed = true; }
      if (u.position === '管理者') { u.position = '进程监督管理员'; changed = true; }
    }
  });

  // 同一实习生、同一周报周期只保留一条记录；如果历史数据里有重复，保留最后更新的一条。
  if (Array.isArray(db.reports) && db.reports.length > 0) {
    const latestReportMap = new Map();
    db.reports.forEach((report) => {
      const key = `${report.userId}|${report.weekStart}|${report.weekEnd}`;
      const current = latestReportMap.get(key);
      const reportTime = report.updatedAt || report.submittedAt || report.createdAt || '';
      const currentTime = current ? (current.updatedAt || current.submittedAt || current.createdAt || '') : '';
      if (!current || reportTime >= currentTime) {
        latestReportMap.set(key, report);
      }
    });
    if (latestReportMap.size !== db.reports.length) {
      db.reports = Array.from(latestReportMap.values());
      changed = true;
    }
  }

  if (changed) fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getJsonDbStore() {
  if (!jsonDbStore) {
    jsonDbStore = createJsonDb({
      dbPath: DB_PATH,
      ensure: ensureDb,
      beforeWrite: [
        (db) => {
          try {
            xySyncTaskPoolCompleteWhenDaily100(db);
          } catch (err) {
            console.error('[daily 100 complete sync error]', err);
          }
        },
        (db) => {
          try {
            xyNormalizeDailyTasksBeforeWrite(db);
          } catch (err) {
            console.error('[daily normalize before write error]', err);
          }
        },
        (db) => {
          try {
            if (typeof syncTaskPoolProgressFromDailyTasks === 'function') {
              syncTaskPoolProgressFromDailyTasks(db);
            }
          } catch (err) {
            console.error('[task progress sync before write error]', err);
          }
        }
      ]
    });
  }

  return jsonDbStore;
}

function readDb() {
  return getJsonDbStore().read();
}

// ==================== XY_DAILY_NORMALIZE_BEFORE_WRITE_BEGIN ====================
// dailyTasks 写库前统一规范化：防止 userId / username / realName / taskTitle 丢失
function xyNormText(value) {
  return String(value || '').trim();
}

function xyDailyTaskTitle(item) {
  return xyNormText(
    item.taskTitle ||
    item.taskName ||
    item.title ||
    item.taskId ||
    item.taskPoolId ||
    item.poolTaskId ||
    item.dailyTaskId ||
    item.relatedTask ||
    item.relatedTaskTitle
  );
}

function xyFindTaskPoolByDaily(db, item) {
  const tasks = Array.isArray(db.taskPool) ? db.taskPool : [];
  const refs = [
    item.taskPoolId,
    item.poolTaskId,
    item.taskId,
    item.dailyTaskId,
    item.relatedTaskId,
    item.taskTitle,
    item.taskName,
    item.title
  ].map(xyNormText).filter(Boolean);

  for (const ref of refs) {
    const found = tasks.find((task) => {
      return (
        xyNormText(task.id) === ref ||
        xyNormText(task._id) === ref ||
        xyNormText(task.taskId) === ref ||
        xyNormText(task.title) === ref ||
        xyNormText(task.taskName) === ref
      );
    });

    if (found) return found;
  }

  return null;
}

function xyFindUserForDaily(db, item) {
  const users = Array.isArray(db.users) ? db.users : [];
  const dailyTasks = Array.isArray(db.dailyTasks) ? db.dailyTasks : [];

  const userId = xyNormText(item.userId);
  const username = xyNormText(item.username);
  const realName = xyNormText(item.realName || item.name);

  if (userId) {
    const byId = users.find(u => xyNormText(u.id) === userId);
    if (byId) return byId;
  }

  if (username) {
    const byUsername = users.find(u => xyNormText(u.username) === username);
    if (byUsername) return byUsername;
  }

  if (realName) {
    const byName = users.find(u => xyNormText(u.realName) === realName || xyNormText(u.name) === realName);
    if (byName) return byName;
  }

  const task = xyFindTaskPoolByDaily(db, item);

  if (task) {
    const taskUserRefs = [];

    if (task.claimedByUserId) taskUserRefs.push(task.claimedByUserId);
    if (task.assigneeUserId) taskUserRefs.push(task.assigneeUserId);
    if (task.userId) taskUserRefs.push(task.userId);

    if (Array.isArray(task.claimedByUserIds)) taskUserRefs.push(...task.claimedByUserIds);
    if (Array.isArray(task.assigneeUserIds)) taskUserRefs.push(...task.assigneeUserIds);

    for (const ref of taskUserRefs.map(xyNormText).filter(Boolean)) {
      const user = users.find(u => xyNormText(u.id) === ref);
      if (user) return user;
    }

    const taskNames = [];
    if (task.assigneeName) taskNames.push(task.assigneeName);
    if (task.claimedByName) taskNames.push(task.claimedByName);
    if (Array.isArray(task.assigneeNames)) taskNames.push(...task.assigneeNames);
    if (Array.isArray(task.claimedByNames)) taskNames.push(...task.claimedByNames);

    for (const name of taskNames.map(xyNormText).filter(Boolean)) {
      const user = users.find(u => xyNormText(u.realName) === name || xyNormText(u.name) === name);
      if (user) return user;
    }
  }

  // 兜底：按同一关联任务的历史日报唯一提交人推断
  const title = xyDailyTaskTitle(item);

  if (title) {
    const candidateIds = new Set();

    for (const other of dailyTasks) {
      if (!other || other === item) continue;
      if (!xyNormText(other.userId)) continue;

      if (xyDailyTaskTitle(other) === title) {
        candidateIds.add(xyNormText(other.userId));
      }
    }

    if (candidateIds.size === 1) {
      const onlyId = Array.from(candidateIds)[0];
      const user = users.find(u => xyNormText(u.id) === onlyId);
      if (user) return user;
    }
  }

  return null;
}

function xyNormalizeDailyTasksBeforeWrite(db) {
  if (!db || !Array.isArray(db.dailyTasks)) return db;

  for (const item of db.dailyTasks) {
    if (!item || typeof item !== 'object') continue;

    const task = xyFindTaskPoolByDaily(db, item);
    const resolvedTitle = xyNormText(
      xyDailyTaskTitle(item) ||
      (task && (task.title || task.taskName))
    );

    if (resolvedTitle) {
      if (!xyNormText(item.taskTitle)) item.taskTitle = resolvedTitle;
      if (!xyNormText(item.taskName)) item.taskName = resolvedTitle;
      if (!xyNormText(item.title)) item.title = resolvedTitle;
      if (!xyNormText(item.taskId)) item.taskId = resolvedTitle;
      if (!xyNormText(item.taskPoolId)) item.taskPoolId = resolvedTitle;
      if (!xyNormText(item.poolTaskId)) item.poolTaskId = resolvedTitle;
    }

    const user = xyFindUserForDaily(db, item);

    if (user) {
      if (!xyNormText(item.userId)) item.userId = user.id || '';
      if (!xyNormText(item.username)) item.username = user.username || '';
      if (!xyNormText(item.realName)) item.realName = user.realName || user.name || '';
      if (!xyNormText(item.name)) item.name = user.realName || user.name || '';
    }

    if (!xyNormText(item.taskDate) && xyNormText(item.date)) item.taskDate = item.date;
    if (!xyNormText(item.dailyDate) && xyNormText(item.date)) item.dailyDate = item.date;
  }

  return db;
}
// ==================== XY_DAILY_NORMALIZE_BEFORE_WRITE_END ====================

// ==================== XY_DAILY_100_COMPLETE_SYNC_BEGIN ====================
// 当实习生日报进度为 100% 时，同步任务总表状态为“已完成”
function xySyncTaskPoolCompleteWhenDaily100(db) {
  if (!db || !Array.isArray(db.dailyTasks) || !Array.isArray(db.taskPool)) return db;

  function norm(v) {
    return String(v ?? '').trim();
  }

  function toPercent(v) {
    const raw = norm(v).replace('%', '');
    if (raw === '') return null;

    const n = Number(raw);
    if (!Number.isFinite(n)) return null;

    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function dailyTaskTitle(daily) {
    return norm(
      daily.taskTitle ||
      daily.taskName ||
      daily.title ||
      daily.taskId ||
      daily.taskPoolId ||
      daily.poolTaskId ||
      daily.dailyTaskId
    );
  }

  function taskMatchesDaily(task, daily) {
    const refs = [
      daily.taskPoolId,
      daily.poolTaskId,
      daily.taskId,
      daily.dailyTaskId,
      daily.taskTitle,
      daily.taskName,
      daily.title
    ].map(norm).filter(Boolean);

    const taskKeys = [
      task.id,
      task._id,
      task.taskId,
      task.taskPoolId,
      task.title,
      task.taskName
    ].map(norm).filter(Boolean);

    return refs.some(ref => taskKeys.includes(ref));
  }

  const completedDailyTasks = db.dailyTasks.filter((daily) => {
    return toPercent(daily.progress) === 100 && dailyTaskTitle(daily);
  });

  if (!completedDailyTasks.length) return db;

  const nowText = new Date().toISOString();

  for (const task of db.taskPool) {
    if (!task || typeof task !== 'object') continue;

    const matched = completedDailyTasks.find((daily) => taskMatchesDaily(task, daily));

    if (!matched) continue;

    task.progress = 100;
    task.overallProgress = 100;
    task.taskProgress = 100;
    task.status = '已完成';
    task.progressRule = '日报进度100%自动完成';
    task.progressUpdatedFromDailyId = matched.id || '';
    task.progressUpdatedFromDailyDate = matched.date || matched.taskDate || matched.dailyDate || '';
    task.progressUpdatedAt = nowText;
    task.updatedAt = nowText;
  }

  return db;
}
// ==================== XY_DAILY_100_COMPLETE_SYNC_END ====================

function writeDb(db) {
  getJsonDbStore().write(db);
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function truncateDailyContent(value, max = 15) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function nl2br(value = '') {
  return escapeHtml(value || '').replaceAll('\n', '<br />');
}

function statusText(status) {
  return {
    draft: '草稿',
    submitted: '已提交',
    approved: '已通过',
    returned: '已退回'
  }[status] || status;
}

function statusBadge(status) {
  return `<span class="badge ${escapeHtml(status)}">${statusText(status)}</span>`;
}

const DEPARTMENTS = ['综合部', '财务部', '产品研发部', '市场部', '客服部', '衍生业务部', '法务部'];
const PROGRESS_OPTIONS = [
  { value: 0, label: '未启动', taskStatus: '已认领' },
  { value: 10, label: '调研准备', taskStatus: '进行中' },
  { value: 30, label: '初步执行', taskStatus: '进行中' },
  { value: 50, label: '过半', taskStatus: '进行中' },
  { value: 70, label: '收尾阶段', taskStatus: '进行中' },
  { value: 90, label: '待验收', taskStatus: '进行中' },
  { value: 100, label: '已完成', taskStatus: '已完成' }
];

function progressStage(progress) {
  const n = Number(progress);
  const option = PROGRESS_OPTIONS.find((item) => item.value === n);
  return option ? option.label : '未填写';
}

function taskStatusFromProgress(progress) {
  const n = Number(progress);
  const option = PROGRESS_OPTIONS.find((item) => item.value === n);
  return option ? option.taskStatus : null;
}

function progressSelect(name, selectedValue) {
  const selected = String(selectedValue ?? '');
  return `<select name="${escapeHtml(name)}" required>
    <option value="">请选择整体进度</option>
    ${PROGRESS_OPTIONS.map((item) => `<option value="${item.value}" ${String(item.value) === selected ? 'selected' : ''}>${item.value}% ${escapeHtml(item.label)}</option>`).join('')}
  </select>`;
}

function progressBadge(progress) {
  const n = Number(progress);
  const value = Number.isFinite(n) ? `${Math.round(n)}%` : '-';
  return `<span class="progress-badge">${value} · ${escapeHtml(progressStage(progress))}</span>`;
}

function progressBar(progress, className = '') {
  const raw = Number(progress);
  const value = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
  const label = `${value}% · ${progressStage(value)}`;

  return `<div class="xy-progress-cell ${escapeHtml(className)}">
    <div class="xy-progress-cell-top"><strong>${escapeHtml(label)}</strong></div>
    <div class="xy-progress-cell-track" aria-label="${escapeHtml(label)}">
      <span style="width:${value}%"></span>
    </div>
  </div>`;
}

function roleText(role) {
  return { admin: '管理员', boss: '老板', intern: '实习生' }[role] || role;
}

function redirectPathByRole(role) {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'boss') return '/boss/dashboard';
  return '/intern/dashboard';
}

function getCurrentUser(req) {
  if (!req.session.userId) return null;
  const db = readDb();
  return db.users.find((u) => u.id === req.session.userId) || null;
}

// ==================== XY_SESSION_ROLE_REFRESH_BEGIN ====================
// 每次请求刷新 session 用户角色，避免账号已是老板/管理员但旧 session 仍被误判
function xyRefreshSessionUser(req) {
  try {
    if (!req.session || !req.session.user) return null;

    const sessionUser = req.session.user;
    const db = readDb();
    const users = Array.isArray(db.users) ? db.users : [];

    const latest = users.find((u) => {
      return (
        (sessionUser.id && String(u.id) === String(sessionUser.id)) ||
        (sessionUser.username && String(u.username) === String(sessionUser.username)) ||
        (sessionUser.realName && String(u.realName) === String(sessionUser.realName))
      );
    });

    if (!latest) {
      req.user = sessionUser;
      return sessionUser;
    }

    req.session.user = {
      ...sessionUser,
      id: latest.id || sessionUser.id,
      username: latest.username || sessionUser.username,
      realName: latest.realName || latest.name || sessionUser.realName,
      name: latest.realName || latest.name || sessionUser.name,
      role: latest.role || sessionUser.role,
      position: latest.position || sessionUser.position
    };

    req.user = req.session.user;
    return req.user;
  } catch (err) {
    console.error('[session role refresh error]', err);
    req.user = req.session && req.session.user ? req.session.user : null;
    return req.user;
  }
}
// ==================== XY_SESSION_ROLE_REFRESH_END ====================

function requireLogin(req, res, next) {
  // XY_SESSION_ROLE_REFRESH_CALL
  xyRefreshSessionUser(req);

  const user = getCurrentUser(req);
  if (!user) return res.redirect('/login');
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  xyRefreshSessionUser(req);
  if (req.user.role !== 'admin') return res.status(403).send('无权限访问：只有管理员可以查看每日任务与提交名单。');
  next();
}

function requireBoss(req, res, next) {
  xyRefreshSessionUser(req);
  if (req.user.role !== 'boss') return res.status(403).send('无权限访问：只有老板账号可以查看周报。');
  next();
}

function requireAccountManager(req, res, next) {
  if (!['admin', 'boss'].includes(req.user.role)) {
    return res.status(403).send('无权限访问：只有管理员和老板可以管理实习生账号。');
  }
  next();
}

function requireIntern(req, res, next) {
  if (req.user.role !== 'intern') return res.status(403).send('无权限访问');
  next();
}


// ==================== XY_UNIFIED_ADMIN_SIDEBAR_BEGIN ====================
// 管理员左侧导航统一来源：直接由后端 layout 输出，避免前端 JS 二次重建造成卡顿/闪动
function xyUnifiedAdminNavLinks() {
  return `
    <div class="xy-sidebar-section-title">工作台</div>
    <a href="/admin/dashboard">今日提交监督</a>

    <div class="xy-sidebar-section-title">日报管理</div>
    <a href="/admin/daily-tasks">日报</a>

    <div class="xy-sidebar-section-title">任务管理</div>
    <a href="/admin/task-pool">任务总表</a>

    <div class="xy-sidebar-section-title">系统管理</div>
    <a href="/admin/users">账号管理</a>
    <a href="/change-password">修改密码</a>
  `;
}
// ==================== XY_UNIFIED_ADMIN_SIDEBAR_END ====================


function layout({ title, user, content }) {
  let navLinks = '';
  if (user?.role === 'admin') {
    navLinks = xyUnifiedAdminNavLinks();
  } else if (user?.role === 'boss') {
    navLinks = '<a href="/boss/weekly-management">周报管理</a><a href="/admin/users">账号管理</a><a href="/change-password">修改密码</a>';
  } else if (user?.role === 'intern') {
    navLinks = '<a href="/intern/dashboard">我的周报</a><a href="/intern/reports/new">填写周报</a><a href="/intern/daily-tasks">每日任务</a><a href="/intern/task-pool">任务认领</a><a href="/change-password">修改密码</a>';
  }
  const nav = user
    ? (user.role === 'boss'
      ? `<header class="topbar xy-boss-final-sidebar">
        <div class="xy-boss-final-brand">
          <div class="company">实习管理平台</div>
          <div class="system-name">实习生周报系统</div>
        </div>
        <nav class="xy-boss-final-nav">
          <div class="xy-boss-section-title">核心功能</div>
          <a href="/boss/weekly-management">周报管理</a>
          <a href="/boss/dashboard">任务总表</a>

          <div class="xy-boss-divider"></div>

          <div class="xy-boss-section-title">系统管理</div>
          <a href="/change-password">修改密码</a>
          <form method="post" action="/logout" class="inline-form xy-boss-final-logout">
            <button class="ghost" type="submit">退出登录</button>
          </form>

          <span class="user-info xy-boss-final-user">${escapeHtml(user.realName)} · ${roleText(user.role)}</span>
        </nav>
      </header>`
      : `<header class="topbar ${user?.role === 'admin' ? 'xy-left-sidebar xy-server-unified-admin-sidebar' : (user?.role === 'intern' ? 'xy-left-sidebar' : '')}" ${user?.role === 'admin' ? 'data-xy-unified-admin-nav="1"' : ''}>
        <div>
          <div class="company">实习管理平台</div>
          <div class="system-name">实习生周报系统</div>
        </div>
        <nav class="${(user?.role === 'admin' || user?.role === 'intern') ? 'xy-sidebar-nav' : ''}">
          ${navLinks}
          <span class="user-info">${escapeHtml(user.realName)} · ${roleText(user.role)}</span>
          <form method="post" action="/logout" class="inline-form"><button class="ghost" type="submit">退出</button></form>
        </nav>
      </header>`)
    : '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} - 实习管理平台</title>
  <link rel="stylesheet" href="/design-tokens.css?v=2026071601" />
  <link rel="stylesheet" href="/styles.css?v=2026071601" />
  <link rel="stylesheet" href="/boss-rebuild.css?v=2026070602" />
<link rel="stylesheet" href="/admin-taskpool-template.css?v=2026070713">
<link rel="stylesheet" href="/admin-taskpool-version-edit.css?v=2026070601">
<link rel="stylesheet" href="/xy-font-only.css?v=2026070602">
<link rel="stylesheet" href="/admin-daily-match-taskpool.css?v=2026070602">
<link rel="stylesheet" href="/ui-system-polish.css?v=2026070601">
<link rel="stylesheet" href="/boss4-unified-nav.css?v=2026070606">
<link rel="stylesheet" href="/intern-taskpool-version-sync.css?v=2026070601">
<link rel="stylesheet" href="/admin-taskpool-content-panel.css?v=2026070602">
</head>
<body class="${user?.role === 'admin' ? 'xy-left-sidebar-layout xy-server-unified-admin' : (user?.role === 'intern' ? 'xy-left-sidebar-layout' : '')}">
  ${nav}
  <main class="container">${content}</main>
<script>
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('table').forEach(function (table) {
    const ths = Array.from(table.querySelectorAll('thead th'));
    const headers = ths.map(th => th.textContent.trim());

    const isDailyTaskTable =
      headers.includes('操作') &&
      headers.includes('日期') &&
      headers.includes('姓名') &&
      headers.includes('职位') &&
      headers.some(h => h.includes('今日工作内容'));

    if (!isDailyTaskTable || table.dataset.dailyActionMovedFirst === '1') return;

    const actionIndex = headers.findIndex(h => h === '操作');
    if (actionIndex <= 0) return;

    function moveActionCellToFirst(row) {
      const cells = Array.from(row.children);
      if (!cells[actionIndex]) return;
      row.appendChild(cells[actionIndex]);
    }

    const headRow = table.querySelector('thead tr');
    if (headRow) moveActionCellToFirst(headRow);

    table.querySelectorAll('tbody tr').forEach(function (row) {
      moveActionCellToFirst(row);
    });

    table.classList.add('daily-actions-last');
    table.dataset.dailyActionMovedFirst = '1';
  });

  document.querySelectorAll('table').forEach(function (table) {
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());

    const isTaskPoolTable =
      headers.includes('需求部门') &&
      headers.includes('对接人') &&
      headers.includes('状态');

    if (isTaskPoolTable) {
      table.classList.add('task-pool-table');
    }
  });
});
</script>
<script id="xy-daily-title-company-closed-row-script">
document.addEventListener('DOMContentLoaded', function () {
  function replaceTextNode(root, fromText, toText) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    nodes.forEach(function (node) {
      if (node.nodeValue && node.nodeValue.indexOf(fromText) !== -1) {
        node.nodeValue = node.nodeValue.split(fromText).join(toText);
      }
    });
  }

  /*
   * 1. 管理员日报页面：
   * “每日任务列表”改为“日报”
   */
  if (window.location.pathname.indexOf('/admin/daily-tasks') === 0) {
    replaceTextNode(document.body, '每日任务列表', '日报');
    replaceTextNode(document.body, '筛选每日任务', '筛选日报');
    replaceTextNode(document.body, '每日任务管理', '日报管理');
    replaceTextNode(document.body, '每日任务总数', '日报总数');
  }

  /*
   * 2. 左侧导航公司名称强制一行
   */
  document.querySelectorAll('header strong, header .brand, .topbar strong, .topbar .brand, .navbar strong, .navbar .brand').forEach(function (el) {
    if (el.textContent.indexOf('实习管理平台') !== -1) {
      el.classList.add('xy-company-name-one-line');
      el.textContent = '实习管理平台';
    }
  });

  /*
   * 3. 任务总表：
   * 如果操作列显示“当前已关闭”，替换成 ❌，并整行标灰
   */
  if (window.location.pathname.indexOf('/admin/task-pool') === 0) {
    document.querySelectorAll('table tbody tr').forEach(function (row) {
      const rowText = row.textContent || '';

      if (rowText.indexOf('当前已关闭') !== -1) {
        row.classList.add('xy-task-row-closed');

        row.querySelectorAll('*').forEach(function (el) {
          if ((el.textContent || '').trim() === '当前已关闭') {
            el.textContent = '❌';
            el.classList.add('xy-closed-icon');
            el.setAttribute('title', '当前已关闭');
          }
        });

        Array.from(row.childNodes).forEach(function (node) {
          if (node.nodeType === Node.TEXT_NODE && node.nodeValue.indexOf('当前已关闭') !== -1) {
            node.nodeValue = node.nodeValue.replaceAll('当前已关闭', '❌');
          }
        });
      }
    });
  }
});
</script>

<script src="/admin-layout-enhance.js?v=2026070709"></script>
<script src="/boss-dashboard-fix.js?v=2026070201"></script>
<script src="/admin-daily-table-layout.js?v=2026070708"></script>
<script src="/sidebar-bottom-font.js?v=2026070301"></script>
<script src="/intern-daily-multi-task.js?v=2026070708"></script>
<script src="/intern-sidebar-order.js?v=2026070301"></script>
<script src="/intern-remove-old-progress-row.js?v=2026070708"></script>
<script src="/admin-taskpool-template.js?v=2026070708"></script>
<script src="/admin-taskpool-remove-claim-status.js?v=2026070301"></script>
<script src="/admin-taskpool-version-edit.js?v=2026070601"></script>
<script src="/admin-daily-match-taskpool.js?v=2026070602"></script>
<script src="/intern-taskpool-version-sync.js?v=2026070601"></script>
<script src="/admin-taskpool-content-panel.js?v=2026070603"></script>
</body>
</html>`;
}

function collectTaskUserRefs(values = []) {
  const out = [];
  const usefulObjectKey = (key) => {
    const lower = String(key || '').toLowerCase();
    const include = [
      'id',
      'name',
      'user',
      'intern',
      'assignee',
      'claim',
      'owner',
      'member',
      'participant',
      'responsible',
      'handler',
      'collaborator',
      'executor',
      'developer',
      'staff',
      'employee',
      '成员',
      '负责人',
      '参与',
      '协作',
      '实习'
    ].some((token) => lower.includes(token));
    const exclude = [
      'status',
      'state',
      'open',
      'date',
      'time',
      'progress',
      'title',
      'content',
      'remark',
      'desc',
      'version',
      'department',
      'contact',
      'phone',
      'email'
    ].some((token) => lower.includes(token));

    return include && !exclude;
  };

  const collect = (value) => {
    if (value == null) return;

    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }

    if (typeof value === 'object') {
      Object.keys(value).forEach((key) => {
        if (usefulObjectKey(key)) collect(value[key]);
      });
      return;
    }

    splitTaskNames(value).forEach((item) => out.push(item));
  };

  values.forEach(collect);
  return uniqueStrings(out);
}

function taskApprovedByUserCompat(task = {}, user = {}) {
  const userIds = uniqueStrings([user.id, user.userId, user.username, user.account]);
  const userNames = uniqueStrings([user.realName, user.name, user.username, user.account]);

  return userIds.some((id) => taskApprovedCompatUserIds(task).includes(id)) ||
    userNames.some((name) => taskApprovedCompatNames(task).includes(name));
}

function taskFormalAssigneeCompatUserIds(task = {}) {
  return collectTaskUserRefs([
    task.claimedByUserId,
    task.claimedByUserIds,
    task.assigneeUserId,
    task.assigneeUserIds,
    task.assignedUserId,
    task.assignedUserIds,
    task.ownerUserId,
    task.ownerUserIds,
    task.responsibleUserId,
    task.responsibleUserIds,
    task.handlerUserId,
    task.handlerUserIds
  ]);
}

function taskApprovedCompatUserIds(task = {}) {
  return collectTaskUserRefs([
    taskFormalAssigneeCompatUserIds(task),
    task.memberId,
    task.memberIds,
    task.memberUserId,
    task.memberUserIds,
    task.projectMemberId,
    task.projectMemberIds,
    task.projectMembers,
    task.projectMemberUsers,
    task.participantId,
    task.participantIds,
    task.participantUserId,
    task.participantUserIds,
    task.collaboratorId,
    task.collaboratorIds,
    task.collaboratorUserId,
    task.collaboratorUserIds,
    task.teamMemberId,
    task.teamMemberIds,
    task.teamMembers,
    task.userId,
    task.userIds,
    task.internId,
    task.internIds,
    task['成员ID'],
    task['成员Id'],
    task['项目成员ID'],
    task['项目成员Id'],
    task['参与人ID'],
    task['参与人Id'],
    task['协作人ID'],
    task['协作人Id'],
    task['实习生ID'],
    task['实习生Id']
  ]);
}

function taskFormalAssigneeCompatNames(task = {}) {
  return collectTaskUserRefs([
    task.claimedBy,
    task.claimedByName,
    task.claimedByNames,
    task.assignee,
    task.assignees,
    task.assigneeName,
    task.assigneeNames,
    task.assignedTo,
    task.assignedUsers,
    task.owner,
    task.owners,
    task.ownerName,
    task.responsible,
    task.responsibleName,
    task.handler,
    task.handlerName
  ]);
}

function taskApprovedCompatNames(task = {}) {
  return collectTaskUserRefs([
    taskFormalAssigneeCompatNames(task),
    task.members,
    task.memberNames,
    task.projectMember,
    task.projectMembers,
    task.projectMemberName,
    task.projectMemberNames,
    task.projectMemberUsers,
    task.participants,
    task.participant,
    task.participantName,
    task.participantNames,
    task.collaborator,
    task.collaborators,
    task.collaboratorName,
    task.collaboratorNames,
    task.teamMember,
    task.teamMembers,
    task.teamMemberName,
    task.teamMemberNames,
    task.user,
    task.users,
    task.userName,
    task.userNames,
    task.intern,
    task.interns,
    task.internName,
    task.internNames,
    task['成员'],
    task['成员名单'],
    task['任务成员'],
    task['项目成员'],
    task['项目组成员'],
    task['参与人'],
    task['协作人'],
    task['实习生'],
    task['关联实习生']
  ]);
}

function splitTaskNames(value) {
  if (Array.isArray(value)) return value.map((x) => String(x || '').trim()).filter(Boolean);
  return String(value || '').split(/[,，、;；]+/).map((x) => x.trim()).filter(Boolean);
}

function uniqueStrings(values) {
  return [...new Set(values.map((x) => String(x || '').trim()).filter(Boolean))];
}

function taskApprovedUserIds(task = {}) {
  return uniqueStrings([...(Array.isArray(task.claimedByUserIds) ? task.claimedByUserIds : []), task.claimedByUserId]);
}

function taskApprovedNames(task = {}) {
  return uniqueStrings([...(Array.isArray(task.assigneeNames) ? task.assigneeNames : []), ...splitTaskNames(task.assigneeName)]);
}

function taskHasApprovedAssignee(task = {}) {
  return taskApprovedUserIds(task).length > 0 ||
    taskApprovedNames(task).length > 0 ||
    taskFormalAssigneeCompatUserIds(task).length > 0 ||
    taskFormalAssigneeCompatNames(task).length > 0;
}

function taskClaimIsOpen(task = {}) {
  if (task.claimClosed === true || task.claimOpen === false) return false;
  if (String(task.status || '') === '已完成') return false;

  // 没有管理员同意的认领人时，任务默认继续开放
  if (!taskHasApprovedAssignee(task)) return true;

  // 已经有人被同意后，只有管理员选择“继续开放”才继续开放
  return task.claimOpen === true;
}

function taskApprovedByUser(task = {}, user = {}) {
  if (!user) return false;
  if (taskApprovedUserIds(task).includes(user.id) || taskApprovedNames(task).includes(user.realName)) {
    return true;
  }

  return taskApprovedByUserCompat(task, user);
}

function taskPendingClaims(task = {}, db = null) {
  const result = [];

  const push = (userId, realName, at) => {
    userId = String(userId || '').trim();
    realName = String(realName || '').trim();

    if (!realName && userId && db && Array.isArray(db.users)) {
      const u = db.users.find((item) => item.id === userId);
      if (u) realName = u.realName;
    }

    if (!userId && realName && db && Array.isArray(db.users)) {
      const u = db.users.find((item) => item.realName === realName);
      if (u) userId = u.id;
    }

    if (!userId && !realName) return;

    const key = userId || realName;
    if (!result.some((item) => (item.userId || item.realName) === key)) {
      result.push({ userId, realName, at: at || now() });
    }
  };

  if (Array.isArray(task.pendingClaims)) {
    task.pendingClaims.forEach((c) => push(c.userId || c.id, c.realName || c.name, c.at || c.createdAt));
  }

  if (task.pendingClaimUserId || task.pendingClaimName) {
    push(task.pendingClaimUserId, task.pendingClaimName, task.pendingClaimAt);
  }

  return result;
}

function setTaskPendingClaims(task, claims = []) {
  const clean = [];

  claims.forEach((claim) => {
    const userId = String(claim.userId || '').trim();
    const realName = String(claim.realName || '').trim();

    if (!userId && !realName) return;

    const key = userId || realName;
    if (!clean.some((item) => (item.userId || item.realName) === key)) {
      clean.push({
        userId,
        realName,
        at: claim.at || now()
      });
    }
  });

  task.pendingClaims = clean;

  if (clean.length) {
    task.pendingClaimUserId = clean[0].userId;
    task.pendingClaimName = clean[0].realName;
    task.pendingClaimAt = clean[0].at;
  } else {
    delete task.pendingClaimUserId;
    delete task.pendingClaimName;
    delete task.pendingClaimAt;
  }
}

function userHasPendingClaim(task = {}, user = {}) {
  if (!user) return false;
  return taskPendingClaims(task).some((claim) => claim.userId === user.id || claim.realName === user.realName);
}

function approveClaimOnTask(task, intern, db, keepOpen = false) {
  const names = taskApprovedNames(task);
  const ids = taskApprovedUserIds(task);

  if (!names.includes(intern.realName)) names.push(intern.realName);
  if (!ids.includes(intern.id)) ids.push(intern.id);

  task.assigneeNames = names;
  task.assigneeName = names.join(',');
  task.claimedByUserIds = ids;
  task.claimedByUserId = ids[0] || intern.id;
  task.claimDate = task.claimDate || today();
  task.status = task.status === '已完成' ? '已完成' : '已认领';

  if (keepOpen) {
    const nextClaims = taskPendingClaims(task, db).filter((claim) => {
      return claim.userId !== intern.id && claim.realName !== intern.realName;
    });

    setTaskPendingClaims(task, nextClaims);
    task.claimOpen = true;
    task.claimClosed = false;
  } else {
    setTaskPendingClaims(task, []);
    task.claimOpen = false;
    task.claimClosed = true;
  }

  task.updatedAt = now();
}

function renderTaskApprovalActions(task, db) {
  const claims = taskPendingClaims(task, db);

  const claimActions = claims.map((claim) => {
    const key = encodeURIComponent(claim.userId || claim.realName);
    const name = escapeHtml(claim.realName || '申请人');

    return `<div class="approval-row">
      <span class="badge draft">${name}</span>

      <form method="post" action="/admin/task-pool/${task.id}/approve-open/${key}" class="inline-form">
        <button class="primary small" type="submit">同意并继续开放</button>
      </form>

      <form method="post" action="/admin/task-pool/${task.id}/approve-close/${key}" class="inline-form">
        <button class="secondary small" type="submit">同意并关闭认领</button>
      </form>

      <form method="post" action="/admin/task-pool/${task.id}/reject/${key}" class="inline-form">
        <button class="danger small" type="submit">拒绝</button>
      </form>
    </div>`;
  }).join('');

  let openCloseAction = '';

  if (taskHasApprovedAssignee(task)) {
    if (taskClaimIsOpen(task)) {
      openCloseAction = `<div class="approval-row">
        <span class="badge approved">当前继续开放</span>
        <form method="post" action="/admin/task-pool/${task.id}/close-claims" class="inline-form">
          <button class="danger small" type="submit">关闭认领</button>
        </form>
      </div>`;
    } else {
      openCloseAction = `<div class="approval-row">
        <span class="badge returned">当前已关闭</span>
        <form method="post" action="/admin/task-pool/${task.id}/open-claims" class="inline-form">
          <button class="primary small" type="submit">重新开放</button>
        </form>
      </div>`;
    }
  }

  return claimActions + openCloseAction;
}

function taskStatusLabel(task) {
  const hasApproved = taskHasApprovedAssignee(task);
  const hasPending = taskPendingClaims(task).length > 0;

  if (hasApproved) {
    const base = task.status || '已认领';
    return taskClaimIsOpen(task) ? `${base}（继续开放）` : `${base}（已关闭认领）`;
  }

  if (hasPending) return '待认领（有申请待审核）';

  return task.status || '待认领';
}

function taskDisplayAssignee(task) {
  const approvedNames = taskApprovedNames(task);
  const pendingNames = taskPendingClaims(task).map((item) => item.realName).filter(Boolean);

  if (approvedNames.length && pendingNames.length) {
    return `认领人：${approvedNames.join('、')}；申请人：${pendingNames.join('、')}`;
  }

  if (approvedNames.length) return approvedNames.join('、');

  if (pendingNames.length) return `申请人：${pendingNames.join('、')}`;

  return '待认领';
}

function taskOwnedByUser(task, user) {
  if (!user) return false;
  return taskApprovedByUser(task, user) || userHasPendingClaim(task, user);
}

function isTaskUnclaimed(task) {
  // 任务是否还向实习生开放认领
  return taskClaimIsOpen(task);
}

function taskVisibleToIntern(task, user) {
  if (taskApprovedByUser(task, user)) return true;
  if (userHasPendingClaim(task, user)) return true;
  return taskClaimIsOpen(task);
}

function normalizeDepartment(name = '') {
  const text = String(name || '').trim();
  if (!text) return '';

  const map = {
    '综合': '综合部',
    '行政部': '综合部',
    '行政综合部': '综合部',

    '财务': '财务部',

    '研发部': '产品研发部',
    '产品部': '产品研发部',
    '产品技术部': '产品研发部',
    '技术部': '产品研发部',

    '市场': '市场部',
    '客服': '客服部',

    '行生业务部': '衍生业务部',
    '衍生部': '衍生业务部',
    '衍生业务': '衍生业务部',

    '法务': '法务部'
  };

  return map[text] || text;
}

function departmentOptions(selected = '') {
  const normalized = normalizeDepartment(selected);
  const values = Array.from(new Set(DEPARTMENTS.concat(normalized ? [normalized] : [])));
  return values.map((dept) => `<option value="${escapeHtml(dept)}" ${dept === normalized ? 'selected' : ''}>${escapeHtml(dept)}</option>`).join('');
}


function normalizeAssigneeNames(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,，、;；]+/);
  return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))];
}

function getTaskAssigneeNames(task = {}) {
  const fromArray = Array.isArray(task.assigneeNames) ? task.assigneeNames : [];
  const fromText = normalizeAssigneeNames(task.assigneeName || '');
  return [...new Set(fromArray.concat(fromText).map((x) => String(x || '').trim()).filter(Boolean))];
}

function setTaskAssignees(task, db, names) {
  const assigneeNames = normalizeAssigneeNames(names);
  const interns = db.users.filter((u) => u.role === 'intern');
  const assigneeIds = assigneeNames
    .map((name) => interns.find((u) => u.realName === name)?.id)
    .filter(Boolean);

  task.assigneeNames = assigneeNames;
  task.assigneeName = assigneeNames.join(',');
  task.claimedByUserIds = assigneeIds;
  task.claimedByUserId = assigneeIds[0] || '';

  if (assigneeNames.length) {
    task.claimDate = task.claimDate || today();
    if (!task.status || ['待认领', '待审核', '待管理员审核'].includes(task.status)) {
      task.status = '已认领';
    }
    delete task.pendingClaimUserId;
    delete task.pendingClaimName;
    delete task.pendingClaimAt;
  } else {
    task.claimDate = '';
    if (!['暂停', '已完成', '进行中'].includes(task.status)) {
      task.status = '待认领';
    }
    delete task.pendingClaimUserId;
    delete task.pendingClaimName;
    delete task.pendingClaimAt;
  }
}

function claimedTasksForUser(db, user) {
  return db.taskPool.filter((task) => taskApprovedByUser(task, user));
}

function taskSelectOptions(tasks, selectedTaskRef = '') {
  const selected = String(selectedTaskRef || '').trim();

  return tasks.map((task) => {
    const taskId = String(task.id || task.taskId || task.taskPoolId || task.title || '').trim();
    const taskTitle = String(task.title || task.taskTitle || task.taskName || taskId).trim();
    const isSelected = selected && (
      selected === taskId ||
      selected === taskTitle ||
      selected === String(task.taskPoolId || '').trim() ||
      selected === String(task.taskId || '').trim()
    );

    return `<option value="${escapeHtml(taskId)}" data-task-title="${escapeHtml(taskTitle)}" ${isSelected ? 'selected' : ''}>${escapeHtml(taskTitle)}（${escapeHtml(task.status || '已认领')}）</option>`;
  }).join('');
}

function taskOptions(db, user) {
  const titles = db.taskPool
    .filter((t) => user?.role === 'admin' || user?.role === 'boss' || taskOwnedByUser(t, user))
    .map((t) => t.title);
  return [...new Set(titles)].map((title) => `<option value="${escapeHtml(title)}"></option>`).join('');
}

function findClaimedTaskFromDailyBody(db, user, body = {}) {
  if (!db || !Array.isArray(db.taskPool) || !user) return null;

  const refs = [
    body.taskId,
    body.taskPoolId,
    body.relatedTaskId,
    body.poolTaskId,
    body.taskTitle,
    body.taskName,
    body.title
  ].map((x) => String(x || '').trim()).filter(Boolean);

  if (!refs.length) return null;

  return claimedTasksForUser(db, user).find((task) => {
    const keys = [
      task.id,
      task._id,
      task.taskId,
      task.taskPoolId,
      task.title,
      task.taskTitle,
      task.taskName
    ].map((x) => String(x || '').trim()).filter(Boolean);

    return refs.some((ref) => keys.includes(ref));
  }) || null;
}

function dailyTaskFieldsFromClaimedTask(task, fallbackRef = '') {
  const taskId = String(task?.id || task?.taskId || task?.taskPoolId || fallbackRef || '').trim();
  const taskTitle = String(task?.title || task?.taskTitle || task?.taskName || fallbackRef || '').trim();

  return {
    taskId,
    taskPoolId: taskId,
    relatedTaskId: taskId,
    poolTaskId: taskId,
    taskTitle,
    taskName: taskTitle,
    title: taskTitle
  };
}

function validateDailyTaskRequired(body, user = null, db = null) {
  const fields = [
    ['date', '日期'],
    ['taskTitle', '关联任务'],
    ['content', '今日工作内容'],
    ['problems', '遇到问题 / 需要支持'],
    ['tomorrowPlan', '明日计划'],
    ['progress', '整体进度']
  ];
  for (const [field, label] of fields) {
    if (String(body[field] ?? '').trim() === '') return `请填写必填项：${label}`;
  }
  const progress = Number(body.progress);
  if (!PROGRESS_OPTIONS.some((item) => item.value === progress)) return '整体进度只能选择：0%、10%、30%、50%、70%、90%、100%。';
  if (user && db) {
    const allowedTask = findClaimedTaskFromDailyBody(db, user, body);
    if (!allowedTask) return '关联任务只能选择该实习生参与的任务。';
  }
  return null;
}

function syncTaskPoolProgressFromDaily(db, dailyTask) {
  const dailyUser = { id: dailyTask.userId, realName: dailyTask.userName };
  const task = xyFindTaskPoolByDaily(db, dailyTask);
  if (task && !taskOwnedByUser(task, dailyUser)) return;
  if (!task) return;
  const nextStatus = taskStatusFromProgress(dailyTask.progress);
  if (nextStatus) task.status = nextStatus;
  task.progress = Number(dailyTask.progress);
  task.updatedAt = now();
}

function taskSortWeight(task) {
  const status = taskStatusLabel(task);
  const order = { '已完成': 0, '进行中': 1, '已认领': 2, '待管理员审核': 3, '待审核': 3, '待认领': 4, '暂停': 5 };
  return order[status] ?? 9;
}

function uniqueNonEmpty(list) {
  const banned = ['无', '暂无', '暂无问题', '没有', '无问题', 'null'];
  return [...new Set(list.map((x) => String(x || '').trim()).filter((x) => x && !banned.includes(x)))];
}

function buildWeeklyDraft(db, user, weekStart, weekEnd) {
  const tasks = db.dailyTasks
    .filter((t) => t.userId === user.id && t.date >= weekStart && t.date <= weekEnd)
    .sort((a, b) => `${a.date}${a.updatedAt || ''}`.localeCompare(`${b.date}${b.updatedAt || ''}`));

  if (!tasks.length) {
    return {
      workContent: '',
      achievements: '',
      problems: '',
      solutions: '',
      nextPlan: '',
      supportNeeded: '',
      aiNote: '当前周期内还没有每日任务，请先填写每日任务后再生成周报。'
    };
  }

  const workContent = tasks.map((t) => {
    const date = (t.date || '').slice(5);
    const title = t.taskTitle ? `【${t.taskTitle}】` : '';
    const progress = t.progress !== '' && t.progress !== undefined ? `（进度${t.progress}%）` : '';
    return `- ${date} ${title}${t.content || ''}${progress}`;
  }).join('\n');

  const achievementTasks = tasks.filter((t) => {
    const text = `${t.content || ''}${t.tomorrowPlan || ''}`;
    return Number(t.progress) >= 80 || /完成|实现|搭建|交付|修复|优化|上线|通过|对接/.test(text);
  });
  const achievements = (achievementTasks.length ? achievementTasks : tasks)
    .map((t) => `- ${t.taskTitle || '日常任务'}：${t.content || ''}`)
    .slice(0, 8)
    .join('\n');

  const problems = uniqueNonEmpty(tasks.map((t) => t.problems)).map((x) => `- ${x}`).join('\n') || '暂无明显阻塞问题。';
  const plans = uniqueNonEmpty(tasks.map((t) => t.tomorrowPlan)).slice(-5).map((x) => `- ${x}`).join('\n') || '继续推进当前任务并按进度完成交付。';
  const supportNeeded = uniqueNonEmpty(tasks.map((t) => t.problems).filter((x) => /需要|支持|权限|接口|费用|数据|资源|沟通|协助/.test(String(x || '')))).map((x) => `- ${x}`).join('\n') || '暂无需要老板额外支持的事项。';
  const solutions = '本周根据每日任务记录持续推进工作：优先完成高优先级任务，遇到问题先自行排查并记录，必要时与对接人沟通确认，后续将根据反馈继续优化和交付。';

  return {
    workContent,
    achievements,
    problems,
    solutions,
    nextPlan: plans,
    supportNeeded,
    aiNote: `已根据 ${tasks.length} 条每日任务自动生成周报草稿，可继续人工修改后提交。`
  };
}

async function buildWeeklyDraftWithAI(db, user, weekStart, weekEnd) {
  const localDraft = buildWeeklyDraft(db, user, weekStart, weekEnd);

  const tasks = db.dailyTasks
    .filter((t) => t.userId === user.id && t.date >= weekStart && t.date <= weekEnd)
    .sort((a, b) => `${a.date}${a.updatedAt || ''}`.localeCompare(`${b.date}${b.updatedAt || ''}`));

  if (!tasks.length) return localDraft;

  const apiKey = process.env.AI_WEEKLY_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_WEEKLY_BASE_URL || 'https://llm-hhgz43e7bd8791r5.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions';
  const model = process.env.AI_WEEKLY_MODEL || 'qwen-plus';

  if (!apiKey) {
    return {
      ...localDraft,
      aiNote: '未配置 API Key，已使用系统本地规则生成周报草稿。'
    };
  }

  const dailyText = tasks.map((t) => [
    `日期：${t.date || ''}`,
    `姓名：${user.realName || ''}`,
    `职位：${user.position || ''}`,
    `关联任务：${t.taskTitle || ''}`,
    `今日工作内容：${t.content || ''}`,
    `遇到问题/需要支持：${t.problems || '暂无'}`,
    `明日计划：${t.tomorrowPlan || ''}`,
    `整体进度：${t.progress ?? ''}%`
  ].join('\n')).join('\n\n---\n\n');

  const prompt = `
你是实习管理平台的自动周报助手。
请根据实习生在指定日期区间内填写的每日日报，生成一份正式、清晰、适合提交给老板查看的中文周报。

要求：
1. 不要编造日报中没有的信息。
2. 表达自然，不要有明显 AI 味。
3. 按“本周工作内容、本周成果、遇到的问题、解决方案/思考、下周计划、需要支持”总结。
4. 如果没有明显问题，可以写“暂无明显阻塞问题”。
5. 只输出 JSON，不要输出 Markdown，不要解释。

JSON 格式必须为：
{
  "workContent": "本周工作内容",
  "achievements": "本周成果",
  "problems": "遇到的问题",
  "solutions": "解决方案 / 思考",
  "nextPlan": "下周计划",
  "supportNeeded": "需要老板/管理员支持"
}

实习生：${user.realName}
职位：${user.position}
周期：${weekStart} 至 ${weekEnd}

日报内容：
${dailyText}
`;

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你是企业内部自动周报助手，负责把日报整理成自然、正式、可提交的周报。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`接口返回异常：${response.status} ${errorText.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error('模型返回内容不是有效 JSON');
    }

    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));

    return {
      workContent: parsed.workContent || localDraft.workContent,
      achievements: parsed.achievements || localDraft.achievements,
      problems: parsed.problems || localDraft.problems,
      solutions: parsed.solutions || localDraft.solutions,
      nextPlan: parsed.nextPlan || localDraft.nextPlan,
      supportNeeded: parsed.supportNeeded || localDraft.supportNeeded,
      aiNote: `已调用自动周报助手，根据 ${tasks.length} 条每日任务生成周报草稿，可继续人工修改后提交。`
    };
  } catch (error) {
    console.error('自动周报助手调用失败：', error);
    return {
      ...localDraft,
      aiNote: `自动周报助手调用失败，已使用系统本地规则生成周报草稿。原因：${error.message}`
    };
  }
}

function csvCell(value = '') {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function sendCsv(res, filename, headers, rows) {
  const csv = [headers.map(csvCell).join(',')]
    .concat(rows.map((row) => row.map(csvCell).join(',')))
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send('\ufeff' + csv);
}

function getFilteredDailyTasks(db, query = {}) {
  const q = {
    name: (query.name || '').trim(),
    position: (query.position || '').trim(),
    taskTitle: (query.taskTitle || '').trim(),
    startDate: (query.startDate || '').trim(),
    endDate: (query.endDate || '').trim(),
    userId: (query.userId || '').trim()
  };
  return db.dailyTasks.map((task) => ({
    ...task,
    intern: db.users.find((u) => u.id === task.userId)
  })).filter((item) => item.intern).filter((item) => {
    if (q.userId && item.userId !== q.userId) return false;
    if (q.name && !item.intern.realName.includes(q.name) && !item.intern.username.includes(q.name)) return false;
    if (q.position && !item.intern.position.includes(q.position)) return false;
    if (q.taskTitle && !String(item.taskTitle || '').includes(q.taskTitle)) return false;
    if (q.startDate && item.date < q.startDate) return false;
    if (q.endDate && item.date > q.endDate) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.intern.realName || '').localeCompare(b.intern.realName || ''));
}

function getFilteredReports(db, query = {}) {
  const q = {
    name: (query.name || '').trim(),
    position: (query.position || '').trim(),
    status: (query.status || '').trim(),
    startDate: (query.startDate || '').trim(),
    endDate: (query.endDate || '').trim(),
    userId: (query.userId || '').trim()
  };
  return db.reports.map((report) => ({
    ...report,
    intern: db.users.find((u) => u.id === report.userId)
  })).filter((item) => item.intern).filter((item) => {
    if (q.userId && item.userId !== q.userId) return false;
    if (q.name && !item.intern.realName.includes(q.name) && !item.intern.username.includes(q.name)) return false;
    if (q.position && !item.intern.position.includes(q.position)) return false;
    if (q.status && item.status !== q.status) return false;
    if (q.startDate && item.weekEnd < q.startDate) return false;
    if (q.endDate && item.weekStart > q.endDate) return false;
    return true;
  }).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function dailyTaskEditForm({ user, task = null, backUrl = '/admin/daily-tasks' }) {
  const db = readDb();
  const interns = db.users.filter((u) => u.role === 'intern');
  const isEdit = Boolean(task);
  const formAction = isEdit ? `/admin/daily-tasks/${task.id}` : '/admin/daily-tasks';
  const selectedUserId = task?.userId || interns[0]?.id || '';
  const internOptions = interns.map((intern) => `<option value="${escapeHtml(intern.id)}" ${intern.id === selectedUserId ? 'selected' : ''}>${escapeHtml(intern.realName)}｜${escapeHtml(intern.position)}</option>`).join('');
  const selectedIntern = interns.find((intern) => intern.id === selectedUserId) || interns[0];
  const selectedTaskRef = task?.taskPoolId || task?.taskId || task?.relatedTaskId || task?.poolTaskId || task?.taskTitle || '';
  const claimedOptions = selectedIntern ? taskSelectOptions(claimedTasksForUser(db, selectedIntern), selectedTaskRef) : '';
  const deleteButton = isEdit ? `<button class="danger" formaction="/admin/daily-tasks/${task.id}/delete" formmethod="post" onclick="return confirm('确认删除这条日报吗？');" type="submit">删除日报</button>` : '';
  const selectedProgress = xyDailyProgressBodyNormalizeRawV6(task?.progress ?? 0) ?? 0;
  return layout({
    title: isEdit ? '编辑日报' : '新增日报',
    user,
    content: `<section class="page-title">
        <div><h1>${isEdit ? '编辑日报' : '新增日报'}</h1><p>管理员可以新增、修改任意实习生的日报内容；关联任务应选择该实习生参与的任务。</p></div>
        <a class="ghost-link" href="${escapeHtml(backUrl)}">返回每日任务</a>
      </section>
      <section class="card">
        <form method="post" action="${formAction}" class="form grid-form">
          <input type="hidden" name="backUrl" value="${escapeHtml(backUrl)}" />
          <label>所属实习生<select name="userId" required>${internOptions}</select></label>
          <div class="hint-box">如果切换了所属实习生，请保存前确认“关联任务”属于该实习生参与的任务。</div>
          <div class="two-cols">
            <label>日期<input type="date" name="date" value="${escapeHtml(task?.date || today())}" required /></label>
          </div>
          <label>关联任务<select name="taskTitle" required>
            <option value="">请选择参与任务</option>
            ${claimedOptions}
          </select></label>
          <label>今日工作内容<textarea name="content" rows="5">${escapeHtml(task?.content || '')}</textarea></label>
          <label>遇到问题 / 需要支持<textarea name="problems" rows="4" required>${escapeHtml(task?.problems || '')}</textarea></label>
          <label>明日计划<textarea name="tomorrowPlan" rows="4" required>${escapeHtml(task?.tomorrowPlan || '')}</textarea></label>
          <label>整体进度${progressSelect('progress', selectedProgress)}</label>
          <div class="hint-box"><strong>进度选项：</strong>0% 未启动；10% 调研准备；30% 初步执行；50% 过半；70% 收尾阶段；90% 待验收；100% 已完成。保存后会同步更新任务总表状态。</div>
          <div class="actions">
            <button class="primary" type="submit">${isEdit ? '保存修改' : '新增日报'}</button>
            ${deleteButton}
          </div>
        </form>
      </section>`
  });
}

// ==================== XY_DAILY_USER_IDENTITY_FIX_BEGIN ====================
// 日报提交用户身份兜底修复：防止 dailyTasks 写入 userId 为空
app.use((req, res, next) => {
  try {
    const sessionUser = req.session && req.session.user ? req.session.user : null;

    if (!sessionUser) return next();

    const db = readDb();
    const users = Array.isArray(db.users) ? db.users : [];

    const fullUser = users.find((u) => {
      return (
        (sessionUser.id && String(u.id) === String(sessionUser.id)) ||
        (sessionUser.username && String(u.username) === String(sessionUser.username)) ||
        (sessionUser.realName && String(u.realName) === String(sessionUser.realName))
      );
    });

    if (fullUser) {
      req.session.user = {
        ...sessionUser,
        id: sessionUser.id || fullUser.id,
        username: sessionUser.username || fullUser.username,
        realName: sessionUser.realName || fullUser.realName,
        name: sessionUser.name || fullUser.realName,
        role: sessionUser.role || fullUser.role,
        position: sessionUser.position || fullUser.position
      };

      req.user = {
        ...(req.user || {}),
        ...req.session.user
      };
    }

    // 如果是实习生提交日报，强制把当前登录人写入 body，防止后续代码取 body 时为空
    if (
      req.method === 'POST' &&
      (
        req.path === '/intern/daily-tasks' ||
        /^\/intern\/daily-tasks\/[^/]+$/.test(req.path)
      ) &&
      req.session.user
    ) {
      req.body = req.body || {};
      req.body.userId = req.session.user.id || req.body.userId || '';
      req.body.username = req.session.user.username || req.body.username || '';
      req.body.realName = req.session.user.realName || req.body.realName || '';
      req.body.name = req.session.user.realName || req.session.user.name || req.body.name || '';
    }
  } catch (err) {
    console.error('[daily user identity fix middleware error]', err);
  }

  next();
});
// ==================== XY_DAILY_USER_IDENTITY_FIX_END ====================

// ==================== XY_DAILY_PROGRESS_BODY_FIX_BEGIN ====================
// 日报进度提交兜底：防止进度条显示了，但 progress 没有进入 req.body
app.use((req, res, next) => {
  try {
    if (
      req.method === 'POST' &&
      (
        req.path === '/intern/daily-tasks' ||
        /^\/intern\/daily-tasks\/[^/]+$/.test(req.path)
      )
    ) {
      req.body = req.body || {};

      function normPercent(value) {
        if (Array.isArray(value)) {
          for (const item of value) {
            const n = normPercent(item);
            if (n !== '') return n;
          }
          return '';
        }

        const raw = String(value ?? '').replace('%', '').trim();

        if (raw === '') return '';

        const n = Number(raw);

        if (!Number.isFinite(n)) return '';

        return String(Math.max(0, Math.min(100, Math.round(n))));
      }

      function firstProgressFromBody(body) {
        const candidates = [
          body.progress,
          body.taskProgress,
          body.overallProgress,
          body.progressValue,
          body.xyProgressValue,
          body.xyMultiProgresses,
          body['xyMultiProgresses[]'],
          body['xyProgressValue[]'],
          body['progress[]'],
          body['taskProgress[]'],
          body['overallProgress[]']
        ];

        for (const c of candidates) {
          const v = normPercent(c);
          if (v !== '') return v;
        }

        return '';
      }

      const current = normPercent(req.body.progress);

      if (current === '') {
        const fixed = firstProgressFromBody(req.body);

        if (fixed !== '') {
          req.body.progress = fixed;
          req.body.taskProgress = req.body.taskProgress || fixed;
          req.body.overallProgress = req.body.overallProgress || fixed;
        }
      }
    }
  } catch (err) {
    console.error('[daily progress body fix error]', err);
  }

  next();
});
// ==================== XY_DAILY_PROGRESS_BODY_FIX_END ====================

app.get('/', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return res.redirect('/login');
  res.redirect(redirectPathByRole(user.role));
});

app.get('/login', (req, res) => {
  const error = req.query.error ? '<div class="alert error">账号或密码错误，请重新输入。</div>' : '';
  res.send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>登录 - 实习管理平台实习生周报系统</title>
  <link rel="stylesheet" href="/design-tokens.css?v=2026071601" />
  <link rel="stylesheet" href="/styles.css?v=2026071601" />
  <link rel="stylesheet" href="/boss-rebuild.css?v=2026070602" />
<link rel="stylesheet" href="/admin-taskpool-template.css?v=2026070713">
<link rel="stylesheet" href="/admin-taskpool-version-edit.css?v=2026070601">
<link rel="stylesheet" href="/xy-font-only.css?v=2026070602">
<link rel="stylesheet" href="/admin-daily-match-taskpool.css?v=2026070602">
<link rel="stylesheet" href="/ui-system-polish.css?v=2026070601">
<link rel="stylesheet" href="/boss4-unified-nav.css?v=2026070606">
<link rel="stylesheet" href="/intern-taskpool-version-sync.css?v=2026070601">
<link rel="stylesheet" href="/admin-taskpool-content-panel.css?v=2026070602">
</head>
<body class="login-body">
  <section class="login-card">
    <div class="login-logo">实习管理平台</div>
    <h1>实习生周报系统</h1>
    <p>请使用公司分配的账号和密码登录</p>
    ${error}
    <form method="post" action="/login" class="form">
      <label>账号<input name="username" placeholder="请输入账号" required /></label>
      <label>密码<input name="password" type="password" placeholder="请输入密码" required /></label>
      <button class="primary full" type="submit">登录</button>
    </form>

  </section>
<script src="/boss-dashboard-fix.js?v=2026070201"></script>
<script src="/admin-daily-table-layout.js?v=2026070708"></script>
<script src="/sidebar-bottom-font.js?v=2026070301"></script>
<script src="/intern-daily-multi-task.js?v=2026070708"></script>
<script src="/intern-sidebar-order.js?v=2026070301"></script>
<script src="/intern-remove-old-progress-row.js?v=2026070708"></script>
<script src="/admin-taskpool-template.js?v=2026070708"></script>
<script src="/admin-taskpool-remove-claim-status.js?v=2026070301"></script>
<script src="/admin-taskpool-version-edit.js?v=2026070601"></script>
<script src="/admin-daily-match-taskpool.js?v=2026070602"></script>
<script src="/intern-taskpool-version-sync.js?v=2026070601"></script>
<script src="/admin-taskpool-content-panel.js?v=2026070603"></script>
</body>
</html>`);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDb();
  const user = db.users.find((u) => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.redirect('/login?error=1');
  }
  req.session.userId = user.id;
  res.redirect(redirectPathByRole(user.role));
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/change-password', requireLogin, (req, res) => {
  const success = req.query.success ? '<div class="alert success">密码已修改，下次请使用新密码登录。</div>' : '';
  const errorMap = {
    old: '原密码不正确，请重新输入。',
    mismatch: '两次输入的新密码不一致。',
    short: '新密码至少需要 6 位。'
  };
  const error = req.query.error ? `<div class="alert error">${escapeHtml(errorMap[req.query.error] || '修改失败，请重试。')}</div>` : '';
  const internTip = req.user.role === 'intern'
    ? '<p class="muted">实习生账号仅可修改自己的登录密码，不能新增或修改其他实习生账号。</p>'
    : '<p class="muted">管理员和老板也可以在“账号管理”中创建、修改实习生账号或重置密码。</p>';

  res.send(layout({
    title: '修改密码',
    user: req.user,
    content: `<section class="page-title">
        <div><h1>修改密码</h1>${internTip}</div>
      </section>
      <section class="card">
        ${success}${error}
        <form method="post" action="/change-password" class="form">
          <label>原密码<input type="password" name="oldPassword" required /></label>
          <label>新密码<input type="password" name="newPassword" minlength="6" required /></label>
          <label>确认新密码<input type="password" name="confirmPassword" minlength="6" required /></label>
          <div class="actions"><button class="primary" type="submit">保存新密码</button></div>
        </form>
      </section>`
  }));
});

app.post('/change-password', requireLogin, (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;
  if (!bcrypt.compareSync(oldPassword || '', req.user.passwordHash)) {
    return res.redirect('/change-password?error=old');
  }
  if ((newPassword || '') !== (confirmPassword || '')) {
    return res.redirect('/change-password?error=mismatch');
  }
  if (String(newPassword || '').length < 6) {
    return res.redirect('/change-password?error=short');
  }
  const db = readDb();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.redirect('/login');
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  user.updatedAt = now();
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/change-password?success=1');
});

app.get('/intern/dashboard', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const reports = db.reports
    .filter((r) => r.userId === req.user.id)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const todayTasks = db.dailyTasks.filter((t) => t.userId === req.user.id && t.date === today());

  const rows = reports.length
    ? reports
        .map((r) => `<tr>
            <td>${escapeHtml(r.weekStart)} 至 ${escapeHtml(r.weekEnd)}</td>
            <td>${statusBadge(r.status)}</td>
            <td>${r.submittedAt ? escapeHtml(r.submittedAt.slice(0, 10)) : '-'}</td>
            <td>${escapeHtml((r.updatedAt || '').slice(0, 10))}</td>
            <td><a class="link-button" href="/intern/reports/${r.id}">查看</a> <a class="ghost-link" href="/intern/reports/${r.id}/edit">修改</a></td>
          </tr>`)
        .join('')
    : '<tr><td colspan="5" class="empty">暂无周报。可以直接填写，也可以先填写每日任务后生成草稿。</td></tr>';

  res.send(layout({
    title: '我的周报',
    user: req.user,
    content: `<section class="page-title">
        <div><h1>我的周报</h1><p>你好，${escapeHtml(req.user.realName)}，你可以在这里填写、保存草稿、提交或修改自己的周报。</p></div>
        <div class="actions"><a class="primary" href="/intern/reports/new">填写周报</a><a class="secondary" href="/intern/task-pool">任务认领</a><a class="secondary" href="/intern/daily-tasks/new">填写今日任务</a></div>
      </section>
      <section class="stats three">
        <div class="stat-card"><span>今日任务数</span><strong>${todayTasks.length}</strong></div>
        <div class="stat-card"><span>历史日报数</span><strong>${db.dailyTasks.filter((t) => t.userId === req.user.id).length}</strong></div>
        <div class="stat-card"><span>周报数</span><strong>${reports.length}</strong></div>
      </section>
      <section class="card">
        <div class="section-head">
          <h2>历史周报</h2>
          <a class="primary" href="/intern/reports/new">填写周报</a>
        </div>
        <table>
          <thead><tr><th>周期</th><th>状态</th><th>提交时间</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`
  }));
});

function dailyTaskForm({ user, task = null }) {
  const db = readDb();
  const isEdit = Boolean(task);
  const formAction = isEdit ? `/intern/daily-tasks/${task.id}` : '/intern/daily-tasks';
  const date = task?.date || today();
  const claimedTasks = claimedTasksForUser(db, user);
  const selectedTaskRef = task?.taskPoolId || task?.taskId || task?.relatedTaskId || task?.poolTaskId || task?.taskTitle || '';
  const options = taskSelectOptions(claimedTasks, selectedTaskRef);
  const noClaimedTaskTip = claimedTasks.length
    ? ''
    : '<div class="alert error">你还没有可填写日报的参与任务，请先到“任务认领”申请任务，或联系管理员把你加入任务成员。</div>';
  return layout({
    title: isEdit ? '修改每日任务' : '填写每日任务',
    user,
    content: `<section class="page-title">
        <div><h1>${isEdit ? '修改每日任务' : '填写每日任务'}</h1><p>每个字段均为必填；关联任务只能从你参与的任务中选择。</p></div>
        <div class="actions"><a class="secondary" href="/intern/task-pool">去任务总表认领</a><a class="ghost-link" href="/intern/daily-tasks">返回每日任务</a></div>
      </section>
      <section class="card">
        ${noClaimedTaskTip}
        <form method="post" action="${formAction}" class="form grid-form">
          <div class="two-cols">
            <label>日期<input type="date" name="date" value="${escapeHtml(date)}" required /></label>
          </div>
          <label>关联任务
            <select name="taskTitle" required>
              <option value="">请选择参与任务</option>
              ${options}
            </select>
          </label>
          <label>今日工作内容<textarea name="content" rows="5">${escapeHtml(task?.content || '')}</textarea></label>
          <label>遇到问题 / 需要支持<textarea name="problems" rows="4" required placeholder="没有问题可填写：暂无问题">${escapeHtml(task?.problems || '')}</textarea></label>
          <label>明日计划<textarea name="tomorrowPlan" rows="4" required>${escapeHtml(task?.tomorrowPlan || '')}</textarea></label>
          <input type=\"hidden\" name=\"progress\" value=\"${escapeHtml(task?.progress ?? '')}\">
          <div class="hint-box">
            <strong>进度选项：</strong>0% 未启动；10% 调研准备；30% 初步执行；50% 过半；70% 收尾阶段；90% 待验收；100% 已完成。保存后会同步到任务总表状态。
          </div>
          <div class="actions">
            <button class="primary" type="submit" ${claimedTasks.length ? '' : 'disabled'}>保存每日任务</button>
          </div>
        </form>
      </section>`
  });
}



// ==================== XY_INTERN_TASK_MINE_OPEN_FIX_BEGIN ====================
// 实习生任务认领页：只要当前用户已经认领/负责该任务，不管任务是否继续开放，都显示为“我的任务”
function xyInternNormText(v) {
  return String(v ?? '').trim();
}

function xyInternSplitNames(v) {
  return xyInternNormText(v)
    .split(/[,，、;；|｜\s]+/)
    .map(xyInternNormText)
    .filter(Boolean);
}

function xyInternCollectTextValues(value, out = []) {
  if (value == null) return out;

  if (Array.isArray(value)) {
    value.forEach((item) => xyInternCollectTextValues(item, out));
    return out;
  }

  if (typeof value === 'object') {
    Object.keys(value).forEach((k) => {
      const lower = String(k).toLowerCase();

      if (
        lower.includes('id') ||
        lower.includes('name') ||
        lower.includes('user') ||
        lower.includes('assignee') ||
        lower.includes('claim') ||
        lower.includes('owner') ||
        lower.includes('member') ||
        lower.includes('real')
      ) {
        xyInternCollectTextValues(value[k], out);
      }
    });

    return out;
  }

  xyInternSplitNames(value).forEach((x) => out.push(x));
  return out;
}

function xyInternTaskStatusText(task) {
  return [
    task.status,
    task.statusText,
    task.claimStatus,
    task.claimState,
    task.assignmentStatus,
    task.progressStatus,
    task.openStatus
  ].map(xyInternNormText).join(' ');
}

function xyInternTaskLooksPendingOnly(task) {
  const t = xyInternTaskStatusText(task);

  return (
    t.includes('待审核') ||
    t.includes('申请中') ||
    t.includes('pending') ||
    t.includes('review')
  );
}

function xyInternUserIsMineTask(task, user) {
  if (!task || !user) return false;

  const uid = xyInternNormText(user.id);
  const uname = xyInternNormText(user.realName || user.username);

  const directIdValues = [];
  [
    task.claimedByUserId,
    task.claimUserId,
    task.assigneeUserId,
    task.assignedUserId,
    task.ownerUserId,
    task.responsibleUserId,
    task.handlerUserId
  ].forEach((v) => xyInternCollectTextValues(v, directIdValues));

  [
    task.claimedByUserIds,
    task.claimUserIds,
    task.assigneeUserIds,
    task.assignedUserIds,
    task.ownerUserIds,
    task.responsibleUserIds,
    task.handlerUserIds
  ].forEach((v) => xyInternCollectTextValues(v, directIdValues));

  if (uid && directIdValues.includes(uid)) return true;

  const directNameValues = [];
  [
    task.claimedBy,
    task.claimedByName,
    task.claimedByNames,
    task.assignee,
    task.assignees,
    task.assigneeName,
    task.assigneeNames,
    task.assignedTo,
    task.assignedUsers,
    task.owner,
    task.owners,
    task.ownerName,
    task.responsible,
    task.responsibleName,
    task.handler,
    task.handlerName,
    task.members,
    task.memberNames,
    task.participants,
    task.participantNames
  ].forEach((v) => xyInternCollectTextValues(v, directNameValues));

  if (uname && directNameValues.includes(uname)) return true;

  /*
   * 兼容旧数据：
   * 有些任务把“已认领人”和“申请人”混在 applicants / claimApplicants 里。
   * 如果当前页面状态不是待审核/申请中，而用户又在这些名单里，也视为“我的任务”。
   */
  if (!xyInternTaskLooksPendingOnly(task)) {
    const mixedValues = [];

    [
      task.applicant,
      task.applicants,
      task.applicantNames,
      task.claimApplicant,
      task.claimApplicants,
      task.claimApplicantNames,
      task.claimUsers,
      task.claimUserNames
    ].forEach((v) => xyInternCollectTextValues(v, mixedValues));

    if ((uid && mixedValues.includes(uid)) || (uname && mixedValues.includes(uname))) {
      return true;
    }
  }

  return false;
}
// ==================== XY_INTERN_TASK_MINE_OPEN_FIX_END ====================


app.get('/intern/task-pool', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  function internTaskIsMine(task) {
    return taskApprovedByUser(task, req.user) ||
      (typeof xyInternUserIsMineTask === 'function' && xyInternUserIsMineTask(task, req.user));
  }

  const visibleTasks = db.taskPool.filter((task) => taskVisibleToIntern(task, req.user) || internTaskIsMine(task)).sort((a, b) => taskSortWeight(a) - taskSortWeight(b) || String(a.expectedDate || '').localeCompare(String(b.expectedDate || '')));
  const mineCount = visibleTasks.filter((task) => internTaskIsMine(task)).length;
  const pendingCount = visibleTasks.filter((task) => userHasPendingClaim(task, req.user)).length;
  const openCount = visibleTasks.filter((task) => !internTaskIsMine(task) && !userHasPendingClaim(task, req.user) && isTaskUnclaimed(task)).length;

  function taskContentText(task) {
    return String(
      task.taskContent ||
      task.content ||
      task.description ||
      task.detail ||
      task.remark ||
      task.currentVersionDesc ||
      ''
    ).trim();
  }

  function taskVersionText(task) {
    const versions = Array.isArray(task.versions) ? task.versions : [];
    const current = versions.find((v) => v.current || v.selected || v.id === task.currentVersionId || v.id === task.selectedVersionId) || versions[0] || {};
    return String(task.currentVersion || current.version || current.name || current.title || '').trim();
  }

  function taskCardAction(task) {
    if (userHasPendingClaim(task, req.user)) {
      return `<form method="post" action="/intern/task-pool/${task.id}/cancel-claim" class="xy-intern-task-action-form">
        <button class="ghost small" type="submit">撤销申请</button>
      </form>`;
    }

    if (internTaskIsMine(task)) {
      const permission = typeof xyInternVersionCanEdit === 'function'
        ? xyInternVersionCanEdit(task, req.user)
        : { ok: false, progress: Number(task.progress || 0), reason: '' };

      return `<a class="${permission.ok ? 'link-button' : 'ghost-link'} small" href="/intern/task-pool/${task.id}/version-edit">
        ${permission.ok ? '修改版本' : `版本修改需 >70%`}
      </a>`;
    }

    if (isTaskUnclaimed(task)) {
      return `<form method="post" action="/intern/task-pool/${task.id}/claim" class="xy-intern-task-action-form">
        <button class="primary small" type="submit">申请认领</button>
      </form>`;
    }

    return '<span class="muted">暂无操作</span>';
  }

  const cards = visibleTasks.length
    ? visibleTasks.map((task) => {
        const status = taskStatusLabel(task);
        const progress = Math.max(0, Math.min(100, Math.round(Number(task.progress || 0) || 0)));
        const isMine = internTaskIsMine(task);
        const isPending = userHasPendingClaim(task, req.user);
        const contentText = taskContentText(task);
        const versionText = taskVersionText(task);
        const cardState = isMine ? 'mine' : (isPending ? 'pending' : (isTaskUnclaimed(task) ? 'open' : 'closed'));

        return `<article class="xy-intern-task-card is-${cardState}" data-task-id="${escapeHtml(task.id)}">
          <div class="xy-intern-task-card-head">
            <div class="xy-intern-task-meta">
              <span>${escapeHtml(task.department || '未分组')}</span>
              <span>${escapeHtml(task.contact || '未填写对接人')}</span>
            </div>
            <span class="xy-intern-task-state">${escapeHtml(status)}</span>
          </div>

          <h2 class="xy-intern-task-card-title">${escapeHtml(task.title || task.taskTitle || '-')}</h2>

          <div class="xy-intern-task-progress">
            <div class="xy-intern-task-progress-top">
              <span>任务进度</span>
              <strong>${progress}%</strong>
            </div>
            <div class="xy-intern-task-progress-track">
              <span style="width:${progress}%"></span>
            </div>
          </div>

          <div class="xy-intern-task-info-grid">
            <div>
              <span>认领/申请人</span>
              <strong>${escapeHtml(taskDisplayAssignee(task))}</strong>
            </div>
            <div>
              <span>当前版本</span>
              <strong>${escapeHtml(versionText || '暂无版本')}</strong>
            </div>
            <div>
              <span>期望完成</span>
              <strong>${escapeHtml(task.expectedDate || '-')}</strong>
            </div>
          </div>

          <details class="xy-intern-task-content">
            <summary>任务内容</summary>
            <div>${contentText ? nl2br(contentText) : '<span class="muted">暂无任务内容</span>'}</div>
          </details>

          <div class="xy-intern-task-card-actions">
            ${isMine ? '<span class="badge approved">我的任务</span>' : ''}
            ${isPending ? '<span class="badge draft">等待审核</span>' : ''}
            ${taskCardAction(task)}
          </div>
        </article>`;
      }).join('')
    : '<div class="empty xy-intern-task-empty">暂无可认领任务。</div>';

  res.send(layout({
    title: '任务认领',
    user: req.user,
    content: `${req.query.versionUpdated ? '<div class="alert success">版本已修改，并已同步到管理员/HR任务总表。</div>' : ''}
      ${req.query.claim ? '<div class="alert success">认领申请已提交。</div>' : ''}
      ${req.query.cancel ? '<div class="alert success">认领申请已撤销。</div>' : ''}
      <section class="page-title">
        <div><h1>任务认领</h1><p>任务内容、认领状态和版本入口集中在这里。</p></div>
        <a class="ghost-link" href="/intern/daily-tasks">返回每日任务</a>
      </section>
      <section class="xy-intern-taskpool-summary" aria-label="任务概览">
        <div><span>我的任务</span><strong>${mineCount}</strong></div>
        <div><span>待审核</span><strong>${pendingCount}</strong></div>
        <div><span>可认领</span><strong>${openCount}</strong></div>
      </section>
      <section class="xy-intern-taskpool-board">
        ${cards}
      </section>`
  }));
});



// ==================== XY_INTERN_VERSION_EDIT_PAGE_BEGIN ====================
// 实习生任务认领页：进度 >70% 后允许修改任务版本；直接写 taskPool.versions，管理员/HR 任务总表同步可见
function xyInternVersionPercent(v) {
  const n = Number(String(v ?? '').replace('%', '').trim());
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function xyInternVersionCanEdit(task, user) {
  if (!task || !user) return { ok: false, progress: 0, reason: '任务不存在' };

  const isMine = taskApprovedByUser(task, user) ||
    (typeof xyInternUserIsMineTask === 'function' && xyInternUserIsMineTask(task, user));

  if (!isMine) {
    return { ok: false, progress: xyInternVersionPercent(task.progress), reason: '只能修改自己已认领的任务版本' };
  }

  const progress = xyInternVersionPercent(task.progress);

  if (progress <= 70) {
    return { ok: false, progress, reason: '任务进度大于 70% 后才可以修改版本' };
  }

  return { ok: true, progress, reason: '' };
}

function xyInternEnsureVersions(task) {
  task.versions = Array.isArray(task.versions) ? task.versions : [];

  task.versions.forEach((v, index) => {
    if (!v.id) {
      v.id = 'ver_' + Date.now() + '_' + index + '_' + Math.random().toString(16).slice(2, 8);
    }
  });

  return task.versions;
}

function xyInternVersionText(v) {
  return String(v ?? '').trim();
}

function xyInternCurrentVersionId(task) {
  return xyInternVersionText(task.currentVersionId || task.selectedVersionId || task.versionId);
}

function xyInternVersionSyncToTask(task, version, user) {
  const versions = xyInternEnsureVersions(task);

  versions.forEach((v) => {
    v.current = v.id === version.id;
    v.selected = v.id === version.id;
  });

  version.current = true;
  version.selected = true;
  version.updatedAt = now();
  version.updatedBy = user.realName || user.username || user.id;
  version.updatedByRole = 'intern';

  task.currentVersionId = version.id;
  task.selectedVersionId = version.id;
  task.currentVersion = version.version || version.name || version.title || '';
  task.currentVersionDesc = version.desc || version.description || version.content || '';
  task.versionUpdatedAt = now();
  task.versionUpdatedBy = user.realName || user.username || user.id;
  task.updatedAt = now();

  task.versionEditLogs = Array.isArray(task.versionEditLogs) ? task.versionEditLogs : [];
  task.versionEditLogs.unshift({
    id: 'version_edit_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8),
    versionId: version.id,
    version: task.currentVersion,
    desc: task.currentVersionDesc,
    userId: user.id,
    userName: user.realName || user.username || '',
    role: 'intern',
    time: now(),
    note: '实习生进度大于70%后修改版本，已同步管理员/HR任务总表'
  });
}

function xyInternVersionOptions(task, selectedId) {
  const versions = xyInternEnsureVersions(task);

  if (!versions.length) {
    return '<option value="">暂无历史版本，保存后将创建新版本</option>';
  }

  return versions.map((v) => {
    const id = xyInternVersionText(v.id);
    const name = xyInternVersionText(v.version || v.name || v.title || '未命名版本');
    const desc = xyInternVersionText(v.desc || v.description || v.content);
    const label = desc ? `${name}｜${desc}` : name;
    return `<option value="${escapeHtml(id)}" ${id === selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

app.get('/intern/task-pool/:id/version-edit', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);

  if (!task) return res.status(404).send('任务不存在');

  const permission = xyInternVersionCanEdit(task, req.user);
  const versions = xyInternEnsureVersions(task);
  const selectedId = xyInternCurrentVersionId(task) || (versions[0]?.id || '');
  const selectedVersion = versions.find((v) => v.id === selectedId) || versions[0] || {};

  const readonlyTip = permission.ok
    ? `<div class="alert success">当前进度 ${permission.progress}%，已满足版本修改条件。保存后会同步到管理员/HR任务总表。</div>`
    : `<div class="alert error">当前进度 ${permission.progress}%。${escapeHtml(permission.reason)}</div>`;

  const disabled = permission.ok ? '' : 'disabled';

  res.send(layout({
    title: '修改任务版本',
    user: req.user,
    content: `<section class="page-title">
        <div>
          <h1>修改任务版本</h1>
          <p>任务：${escapeHtml(task.title || task.taskTitle || task.name || '-')}</p>
        </div>
        <a class="ghost-link" href="/intern/task-pool">返回任务认领</a>
      </section>

      ${readonlyTip}

      <section class="card">
        <form method="post" action="/intern/task-pool/${escapeHtml(task.id)}/version-edit" class="form grid-form">
          <label>选择要修改的版本
            <select name="versionId" ${disabled}>
              ${xyInternVersionOptions(task, selectedId)}
            </select>
          </label>

          <label>版本号 / 版本名称
            <input name="version" value="${escapeHtml(selectedVersion.version || selectedVersion.name || selectedVersion.title || '')}" placeholder="例如：v1.1 / 优化版" ${disabled} required />
          </label>

          <label>版本说明
            <textarea name="desc" rows="5" placeholder="说明这次版本修改了什么" ${disabled}>${escapeHtml(selectedVersion.desc || selectedVersion.description || selectedVersion.content || '')}</textarea>
          </label>

          <div class="hint-box">
            规则：只有该任务进度大于 70% 时，实习生才可以修改版本。修改会直接写入任务总表版本记录，管理员/HR端同步可见。
          </div>

          <div class="actions">
            <button class="primary" type="submit" ${disabled}>保存并同步</button>
            <a class="ghost-link" href="/intern/task-pool">取消</a>
          </div>
        </form>
      </section>`
  }));
});

app.post('/intern/task-pool/:id/version-edit', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);

  if (!task) return res.status(404).send('任务不存在');

  const permission = xyInternVersionCanEdit(task, req.user);

  if (!permission.ok) {
    return res.status(403).send(permission.reason);
  }

  const versions = xyInternEnsureVersions(task);

  const versionId = xyInternVersionText(req.body.versionId);
  const nextVersion = xyInternVersionText(req.body.version);
  const nextDesc = xyInternVersionText(req.body.desc);

  if (!nextVersion) {
    return res.status(400).send('版本号 / 版本名称不能为空');
  }

  let version = versions.find((v) => xyInternVersionText(v.id) === versionId);

  if (!version) {
    version = {
      id: 'ver_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8),
      createdAt: now(),
      createdBy: req.user.realName || req.user.username || req.user.id,
      createdByRole: 'intern'
    };
    versions.push(version);
  }

  version.version = nextVersion;
  version.name = nextVersion;
  version.title = nextVersion;
  version.desc = nextDesc;
  version.description = nextDesc;
  version.content = nextDesc;
  version.time = today();

  xyInternVersionSyncToTask(task, version, req.user);

  writeDb(db);

  res.redirect('/intern/task-pool?versionUpdated=1');
});
// ==================== XY_INTERN_VERSION_EDIT_PAGE_END ====================


app.post('/intern/task-pool/:id/claim', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('任务不存在');

  if (!taskClaimIsOpen(task) && !taskApprovedByUser(task, req.user)) {
    return res.redirect('/intern/task-pool?error=closed');
  }

  if (taskApprovedByUser(task, req.user)) {
    return res.redirect('/intern/task-pool');
  }

  if (!userHasPendingClaim(task, req.user)) {
    const claims = taskPendingClaims(task, db);
    claims.push({
      userId: req.user.id,
      realName: req.user.realName,
      at: now()
    });
    setTaskPendingClaims(task, claims);
  }

  // 管理员同意前，任务仍继续开放
  if (!taskHasApprovedAssignee(task)) {
    task.status = '待认领';
    task.claimOpen = true;
    task.claimClosed = false;
  }

  task.updatedAt = now();
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/intern/task-pool?claim=success');
});



app.post('/intern/task-pool/:id/cancel-claim', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('任务不存在');

  const nextClaims = taskPendingClaims(task, db).filter((claim) => {
    return claim.userId !== req.user.id && claim.realName !== req.user.realName;
  });

  setTaskPendingClaims(task, nextClaims);

  if (!taskHasApprovedAssignee(task)) {
    task.status = '待认领';
    task.claimOpen = true;
    task.claimClosed = false;
  }

  task.updatedAt = now();
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/intern/task-pool?cancel=success');
});

// ==================== XY_DAILY_PROGRESS_BODY_NORMALIZE_V6_BEGIN ====================
// 每日任务进度提交值归一化：避免后端收到 6、80、数组等非法值后报“整体进度只能选择...”
const XY_DAILY_PROGRESS_BODY_ALLOWED_V6 = [0, 10, 30, 50, 70, 90, 100];
const XY_DAILY_PROGRESS_BODY_KEYS_V6 = [
  'xyProgress',
  'progress',
  'taskProgress',
  'overallProgress',
  'dailyProgress'
];

function xyDailyProgressBodyRawListV6(body) {
  const result = [];

  XY_DAILY_PROGRESS_BODY_KEYS_V6.forEach((key) => {
    const value = body?.[key];

    if (Array.isArray(value)) {
      value.forEach((x) => result.push({ key, value: x }));
    } else if (value !== undefined && value !== null) {
      result.push({ key, value });
    }
  });

  return result;
}

function xyDailyProgressBodyStrictAllowedV6(value) {
  const raw = String(value ?? '').replace('%', '').trim();

  if (!raw) return null;

  const n = Number(raw);

  if (!Number.isFinite(n)) return null;

  return XY_DAILY_PROGRESS_BODY_ALLOWED_V6.includes(n) ? n : null;
}

function xyDailyProgressBodyIndexValueV6(value) {
  const raw = String(value ?? '').replace('%', '').trim();

  if (!/^\d+$/.test(raw)) return null;

  const n = Number(raw);

  // 兼容前端 range 使用 0~6 作为下标的情况：
  // 0=>0, 1=>10, 2=>30, 3=>50, 4=>70, 5=>90, 6=>100
  if (n >= 0 && n <= 6) {
    return XY_DAILY_PROGRESS_BODY_ALLOWED_V6[n];
  }

  return null;
}

function xyDailyProgressBodyNearestV6(value) {
  const raw = String(value ?? '').replace('%', '').trim();

  if (!raw) return null;

  const n = Number(raw);

  if (!Number.isFinite(n)) return null;

  let best = XY_DAILY_PROGRESS_BODY_ALLOWED_V6[0];
  let diff = Math.abs(n - best);

  XY_DAILY_PROGRESS_BODY_ALLOWED_V6.forEach((x) => {
    const d = Math.abs(n - x);

    // 如果 80 这种中间值，优先归到更高一档，例如 80=>90
    if (d < diff || (d === diff && x > best)) {
      best = x;
      diff = d;
    }
  });

  return best;
}

function xyDailyProgressBodyNormalizeRawV6(value) {
  const strict = xyDailyProgressBodyStrictAllowedV6(value);
  if (strict !== null) return strict;

  const indexed = xyDailyProgressBodyIndexValueV6(value);
  if (indexed !== null) return indexed;

  return xyDailyProgressBodyNearestV6(value);
}

function xyDailyProgressBodyNormalizeValueV6(body) {
  const items = xyDailyProgressBodyRawListV6(body);

  // 第一优先级：已经是合法值，比如 70、90
  for (const item of items) {
    const v = xyDailyProgressBodyStrictAllowedV6(item.value);
    if (v !== null) return v;
  }

  // 第二优先级：兼容 0~6 下标值
  for (const item of items) {
    const v = xyDailyProgressBodyIndexValueV6(item.value);
    if (v !== null) return v;
  }

  // 第三优先级：兜底最近合法值
  for (const item of items) {
    const v = xyDailyProgressBodyNearestV6(item.value);
    if (v !== null) return v;
  }

  return null;
}

function xyDailyProgressBodyLabelV6(progress) {
  const normalized = xyDailyProgressBodyNormalizeRawV6(progress);
  return normalized === null ? '未填写' : progressStage(normalized);
}

function xyDailyProgressApplyFieldsV6(target, progress) {
  const normalized = xyDailyProgressBodyNormalizeRawV6(progress);
  if (!target || normalized === null) return null;

  target.progress = String(normalized);
  target.taskProgress = String(normalized);
  target.overallProgress = String(normalized);
  target.progressLabel = xyDailyProgressBodyLabelV6(normalized);

  return normalized;
}

function renderDailyTaskBackError(title, message) {
  const safeTitle = escapeHtml(title || '提交失败');
  const safeMessage = escapeHtml(message || title || '提交失败，请返回修改。');
  const alertMessage = JSON.stringify(String(message || title || '提交失败，请返回修改。'));

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="/design-tokens.css?v=2026071601">
  <link rel="stylesheet" href="/styles.css?v=2026071601">
</head>
<body>
  <main class="container" style="max-width:720px;margin:48px auto;padding:0 20px;">
    <section class="card">
      <h1>${safeTitle}</h1>
      <div class="alert error">${safeMessage}</div>
      <div class="actions" style="justify-content:flex-start;">
        <button class="primary" type="button" onclick="history.back()">返回修改</button>
        <a class="ghost-link" href="/intern/daily-tasks">返回每日任务</a>
      </div>
    </section>
  </main>
  <script>
    alert(${alertMessage});
    history.back();
  </script>
</body>
</html>`;
}

app.use((req, res, next) => {
  const path = String(req.path || req.originalUrl || '').split('?')[0];

  const shouldNormalize =
    req.method === 'POST' &&
    /^\/intern\/daily-tasks(\/|$)/.test(path);

  if (!shouldNormalize) {
    return next();
  }

  const beforeProgress = {
    xyProgress: req.body?.xyProgress,
    progress: req.body?.progress,
    taskProgress: req.body?.taskProgress,
    overallProgress: req.body?.overallProgress,
    dailyProgress: req.body?.dailyProgress
  };

  const normalized = xyDailyProgressBodyNormalizeValueV6(req.body);

  if (normalized !== null) {
    XY_DAILY_PROGRESS_BODY_KEYS_V6.forEach((key) => {
      req.body[key] = String(normalized);
    });
    req.body.progressLabel = xyDailyProgressBodyLabelV6(normalized);

    console.log('[XY_DAILY_PROGRESS_BODY_NORMALIZE_V6_OK]', {
      path,
      normalized,
      before: beforeProgress,
      after: {
        xyProgress: req.body.xyProgress,
        progress: req.body.progress,
        taskProgress: req.body.taskProgress,
        overallProgress: req.body.overallProgress,
        dailyProgress: req.body.dailyProgress
      }
    });
  } else {
    console.log('[XY_DAILY_PROGRESS_BODY_NORMALIZE_V6_SKIP]', {
      path,
      before: beforeProgress,
      bodyKeys: Object.keys(req.body || {})
    });
  }

  return next();
});
// ==================== XY_DAILY_PROGRESS_BODY_NORMALIZE_V6_END ====================




// XY_MULTI_DAILY_TASK_ITEMS_PROGRESS_MIDDLEWARE
// 实习生每日任务支持：一天填写多个任务；每个任务有独立今日工作内容和独立整体进度
app.use('/intern/daily-tasks', (req, res, next) => {
  try {
    if (req.method !== 'POST') return next();
    if (!req.body || req.body.xyMultiDailySubmit !== '1') return next();

    const db = readDb();
    db.dailyTasks = Array.isArray(db.dailyTasks) ? db.dailyTasks : [];
    const taskPool = Array.isArray(db.taskPool) ? db.taskPool : [];

    if (typeof xyRefreshSessionUser === 'function') xyRefreshSessionUser(req);

    const sessionUserId = req.session && req.session.userId ? String(req.session.userId) : '';
    const latestUser = Array.isArray(db.users)
      ? db.users.find((user) => {
        return (
          (sessionUserId && String(user.id) === sessionUserId) ||
          (req.session?.user?.id && String(user.id) === String(req.session.user.id)) ||
          (req.session?.user?.username && String(user.username) === String(req.session.user.username)) ||
          (req.session?.user?.realName && String(user.realName) === String(req.session.user.realName))
        );
      })
      : null;

    const sessionUser = latestUser ||
      req.user ||
      (req.session && req.session.user) ||
      {};

    if (!sessionUser.id && !sessionUser.username && !sessionUser.realName) {
      return res.status(401).send('请先登录后再填写每日任务。');
    }

    const userId =
      sessionUser.id ||
      sessionUser.userId ||
      sessionUser.username ||
      (req.session && req.session.userId) ||
      '';

    const username = sessionUser.username || '';
    const realName = sessionUser.realName || sessionUser.name || username || '';

    const date = String(req.body.date || req.body.taskDate || req.body.dailyDate || '').trim();

    let taskIds = req.body['xyMultiTaskIds[]'] || req.body.xyMultiTaskIds || [];
    let contents = req.body['xyMultiWorkContents[]'] || req.body.xyMultiWorkContents || [];
    let progresses = req.body['xyMultiProgresses[]'] || req.body.xyMultiProgresses || [];

    if (!Array.isArray(taskIds)) taskIds = [taskIds].filter(Boolean);
    if (!Array.isArray(contents)) contents = [contents].filter((v) => v !== undefined && v !== null);
    if (!Array.isArray(progresses)) progresses = [progresses].filter((v) => v !== undefined && v !== null);

    const items = [];

    for (let i = 0; i < taskIds.length; i++) {
      const taskId = String(taskIds[i] || '').trim();
      const content = String(contents[i] || '').trim();
      const progressRaw = String(progresses[i] ?? '').trim();

      if (!taskId && !content && !progressRaw) continue;

      if (!taskId || !content || progressRaw === '') {
        return res.status(400).send(renderDailyTaskBackError(
          '填写不完整',
          '每一条任务都必须选择关联任务、填写今日工作内容和整体进度。'
        ));
      }

      const progressNum = xyDailyProgressBodyNormalizeRawV6(progressRaw);

      if (progressNum === null) {
        return res.status(400).send(renderDailyTaskBackError(
          '进度错误',
          '整体进度必须是 0 到 100 之间的数字。'
        ));
      }

      const task = taskPool.find((t) => {
        const keys = [
          t.id,
          t._id,
          t.taskId,
          t.taskPoolId,
          t.title,
          t.taskTitle,
          t.taskName
        ].map((x) => String(x || '').trim()).filter(Boolean);

        return keys.includes(taskId);
      });

      if (!task || !taskApprovedByUser(task, sessionUser)) {
        return res.status(400).send('关联任务只能选择当前实习生参与的任务。');
      }

      const taskFields = dailyTaskFieldsFromClaimedTask(task, taskId);

      items.push({
        taskId: taskFields.taskId,
        taskTitle: taskFields.taskTitle,
        content,
        progress: String(progressNum),
        progressLabel: xyDailyProgressBodyLabelV6(progressNum)
      });
    }

    if (!date || items.length === 0) return next();

    const taskIdSet = new Set();

    for (const item of items) {
      if (taskIdSet.has(item.taskId)) {
        return res.status(400).send(renderDailyTaskBackError(
          '任务重复',
          '同一个任务一天只能填写一次，请删除重复任务。'
        ));
      }

      taskIdSet.add(item.taskId);
    }

    function sameUser(daily) {
      return String(daily.userId || daily.internId || daily.username || daily.userName || '') === String(userId) ||
             String(daily.username || '') === String(username) ||
             String(daily.realName || daily.name || '') === String(realName);
    }

    function sameTask(daily, item) {
      const refs = [
        daily.taskId,
        daily.taskPoolId,
        daily.relatedTaskId,
        daily.poolTaskId,
        daily.task_id,
        daily.taskTitle,
        daily.taskName,
        daily.title
      ].map((x) => String(x || '').trim()).filter(Boolean);

      return refs.includes(String(item.taskId || '').trim()) ||
        refs.includes(String(item.taskTitle || '').trim());
    }

    function dailyDate(daily) {
      return String(daily.date || daily.taskDate || daily.dailyDate || '').slice(0, 10);
    }

    for (const item of items) {
      const existed = db.dailyTasks.some((daily) => {
        return sameUser(daily) && sameTask(daily, item) && dailyDate(daily) === date;
      });

      if (existed) {
        const task = taskPool.find((t) => String(t.id) === String(item.taskId));
        const title = task ? (task.title || task.taskTitle || '该任务') : '该任务';

        return res.status(400).send(renderDailyTaskBackError(
          '今日已填写',
          '你今天已经填写过任务「' + title + '」，同一个任务一天只能填写一次。'
        ));
      }
    }

    const now = new Date().toISOString();

    const problemText = String(req.body.problems || req.body.problem || req.body.issue || req.body.support || '').trim();
    const tomorrowText = String(req.body.tomorrowPlan || req.body.plan || req.body.nextPlan || '').trim();

    for (const item of items) {
      const task = taskPool.find((t) => String(t.id) === String(item.taskId)) || {};
      const taskFields = dailyTaskFieldsFromClaimedTask(task, item.taskTitle || item.taskId);

      const daily = {
        id: 'daily_' + Date.now() + '_' + Math.random().toString(16).slice(2),

        date,
        taskDate: date,
        dailyDate: date,

        userId,
        internId: userId,
        username,
        userName: username,
        realName,
        name: realName,

        ...taskFields,

        content: item.content,
        todayContent: item.content,
        workContent: item.content,
        todayWork: item.content,

        problems: problemText,
        problem: problemText,
        issue: problemText,
        support: problemText,

        tomorrowPlan: tomorrowText,
        plan: tomorrowText,
        nextPlan: tomorrowText,

        progress: item.progress,
        overallProgress: item.progress,
        taskProgress: item.progress,
        progressLabel: item.progressLabel,

        createdAt: now,
        updatedAt: now
      };

      db.dailyTasks.push(daily);
    }

    if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
    writeDb(db);

    return res.redirect('/intern/daily-tasks');
  } catch (error) {
    console.error('多任务每日任务提交失败：', error);
    return next();
  }
});

// ==================== XY_DAILY_PROGRESS_DIRECT_SAVE_BEGIN ====================
// 每日任务进度直接保存：新增/修改提交时，写入 dailyTasks.progress
const XY_DAILY_PROGRESS_ALLOWED_DIRECT = [0, 10, 30, 50, 70, 90, 100];

function xyDailyProgressDirectNum(v) {
  if (Array.isArray(v)) {
    v = v.find((x) => String(x ?? '').trim() !== '');
  }

  const raw = String(v ?? '').replace('%', '').trim();
  if (!raw) return null;

  const n = Number(raw);
  if (!Number.isFinite(n)) return null;

  let best = XY_DAILY_PROGRESS_ALLOWED_DIRECT[0];
  let diff = Math.abs(n - best);

  XY_DAILY_PROGRESS_ALLOWED_DIRECT.forEach((x) => {
    const d = Math.abs(n - x);
    if (d < diff) {
      best = x;
      diff = d;
    }
  });

  return best;
}

function xyDailyProgressDirectLabel(v) {
  const p = xyDailyProgressDirectNum(v);

  if (p === null) return '未填写';
  if (p <= 0) return '未启动';
  if (p === 10) return '调研准备';
  if (p === 30) return '初步执行';
  if (p === 50) return '过半';
  if (p === 70) return '收尾阶段';
  if (p === 90) return '待验收';
  if (p >= 100) return '已完成';

  return '未填写';
}

function xyDailyProgressDirectFromBody(body) {
  return xyDailyProgressDirectNum(
    body?.xyProgress ??
    body?.progress ??
    body?.taskProgress ??
    body?.overallProgress ??
    body?.dailyProgress
  );
}

function xyDailyProgressDirectApplyItem(item, progress) {
  if (!item || progress === null) return;

  item.progress = String(progress);
  item.taskProgress = String(progress);
  item.overallProgress = String(progress);
  item.progressLabel = xyDailyProgressDirectLabel(progress);
  item.progressUpdatedAt = typeof now === 'function' ? now() : new Date().toISOString();
  item.updatedAt = item.progressUpdatedAt;
}

function xyDailyProgressDirectValue(item) {
  return xyDailyProgressDirectNum(
    item?.progress ??
    item?.taskProgress ??
    item?.overallProgress ??
    item?.dailyProgress
  );
}

function xyDailyProgressDirectBadge(item) {
  const p = xyDailyProgressDirectValue(item);

  if (p === null) {
    return '<span class="badge muted">- · 未填写</span>';
  }

  return `<span class="badge approved">${p}% · ${escapeHtml(xyDailyProgressDirectLabel(p))}</span>`;
}

function xyDailyProgressDirectAverage(list) {
  const values = (list || [])
    .map((item) => xyDailyProgressDirectValue(item))
    .filter((v) => v !== null);

  if (!values.length) return null;

  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function xyDailyProgressDirectAverageBadge(list) {
  const p = xyDailyProgressDirectAverage(list);

  if (p === null) {
    return '<span class="badge muted">- · 未填写</span>';
  }

  return `<span class="badge approved">${p}% · ${escapeHtml(xyDailyProgressDirectLabel(p))}</span>`;
}

function xyDailyProgressDirectFindTargets(db, req, progress) {
  const body = req.body || {};
  const editId = String(req.params?.id || '').trim();

  const date = String(body.date || today()).trim();
  const uid = String(req.user?.id || '').trim();
  const uname = String(req.user?.realName || req.user?.username || '').trim();
  const title = String(body.taskTitle || body.taskName || body.title || '').trim();

  if (!db || !Array.isArray(db.dailyTasks)) return [];

  if (editId) {
    const byId = db.dailyTasks.filter((item) => String(item.id || '') === editId);
    if (byId.length) return byId;
  }

  let candidates = db.dailyTasks.filter((item) => {
    if (date && String(item.date || '').trim() !== date) return false;

    const itemUid = String(item.userId || item.internId || '').trim();
    const itemName = String(item.realName || item.userName || item.username || '').trim();

    return (
      (uid && itemUid && uid === itemUid) ||
      (uname && itemName && uname === itemName)
    );
  });

  if (title) {
    const matchedTitle = candidates.filter((item) => {
      const itemTitle = String(item.taskTitle || item.taskName || item.title || '').trim();
      return itemTitle === title;
    });

    if (matchedTitle.length) candidates = matchedTitle;
  }

  // 新增时若匹配多条，优先改最近一条，避免误改同一天其他历史任务
  if (!editId && candidates.length > 1) {
    candidates = candidates
      .sort((a, b) => String(b.createdAt || b.updatedAt || '').localeCompare(String(a.createdAt || a.updatedAt || '')))
      .slice(0, 1);
  }

  return candidates;
}

function xyDailyProgressDirectApplyBeforeWrite(db, req) {
  const progress = xyDailyProgressDirectFromBody(req.body);

  if (progress === null) {
    return { ok: false, reason: 'no_progress_in_body', bodyKeys: Object.keys(req.body || {}) };
  }

  const targets = xyDailyProgressDirectFindTargets(db, req, progress);

  if (!targets.length) {
    return { ok: false, reason: 'no_matched_daily_task', progress };
  }

  targets.forEach((item) => xyDailyProgressDirectApplyItem(item, progress));

  return {
    ok: true,
    count: targets.length,
    progress
  };
}
// ==================== XY_DAILY_PROGRESS_DIRECT_SAVE_END ====================

// ==================== XY_DAILY_PROGRESS_V5_FORCE_BEGIN ====================
// 每日任务进度 V5：强制注入前端脚本，并在日报保存完成后写入 progress
const XY_DAILY_PROGRESS_V5_VALUES = [0, 10, 30, 50, 70, 90, 100];

function xyDailyProgressV5Num(v) {
  if (Array.isArray(v)) {
    v = v.find((x) => String(x ?? '').trim() !== '');
  }

  const raw = String(v ?? '').replace('%', '').trim();
  if (!raw) return null;

  const n = Number(raw);
  if (!Number.isFinite(n)) return null;

  let best = XY_DAILY_PROGRESS_V5_VALUES[0];
  let diff = Math.abs(n - best);

  XY_DAILY_PROGRESS_V5_VALUES.forEach((x) => {
    const d = Math.abs(n - x);
    if (d < diff) {
      best = x;
      diff = d;
    }
  });

  return best;
}

function xyDailyProgressV5Label(v) {
  const p = xyDailyProgressV5Num(v);

  if (p === null) return '未填写';
  if (p <= 0) return '未启动';
  if (p === 10) return '调研准备';
  if (p === 30) return '初步执行';
  if (p === 50) return '过半';
  if (p === 70) return '收尾阶段';
  if (p === 90) return '待验收';
  if (p >= 100) return '已完成';

  return '未填写';
}

function xyDailyProgressV5FromBody(body) {
  return xyDailyProgressV5Num(
    body?.xyProgress ??
    body?.progress ??
    body?.taskProgress ??
    body?.overallProgress ??
    body?.dailyProgress
  );
}

function xyDailyProgressV5Value(item) {
  return xyDailyProgressV5Num(
    item?.progress ??
    item?.taskProgress ??
    item?.overallProgress ??
    item?.dailyProgress
  );
}

function xyDailyProgressV5Badge(item) {
  const p = xyDailyProgressV5Value(item);

  if (p === null) {
    return '<span class="badge muted">- · 未填写</span>';
  }

  return `<span class="badge approved">${p}% · ${escapeHtml(xyDailyProgressV5Label(p))}</span>`;
}

function xyDailyProgressV5TimeScore(item) {
  const values = [
    item.updatedAt,
    item.progressUpdatedAt,
    item.createdAt,
    item.submittedAt,
    item.submitTime,
    item.time
  ].map((x) => String(x || '')).filter(Boolean);

  for (const v of values) {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }

  const id = String(item.id || '');
  const m = id.match(/(\d{10,})/);
  if (m) return Number(m[1]);

  return 0;
}

function xyDailyProgressV5UserMatch(item, req) {
  const user = req.user || {};

  const userValues = [
    user.id,
    user.userId,
    user.username,
    user.realName,
    user.name
  ].map((x) => String(x || '').trim()).filter(Boolean);

  const itemValues = [
    item.userId,
    item.internId,
    item.internUserId,
    item.username,
    item.userName,
    item.realName,
    item.internName,
    item.name
  ].map((x) => String(x || '').trim()).filter(Boolean);

  if (!userValues.length || !itemValues.length) return false;

  return userValues.some((x) => itemValues.includes(x));
}

function xyDailyProgressV5FindTargets(db, req) {
  const body = req.body || {};
  const path = String(req.path || req.originalUrl || '').split('?')[0];

  if (!db || !Array.isArray(db.dailyTasks)) return [];

  const editMatch = path.match(/^\/intern\/daily-tasks\/([^/]+)\/edit$/);
  const editId = editMatch ? editMatch[1] : '';

  if (editId) {
    const byId = db.dailyTasks.filter((item) => String(item.id || '') === editId);
    if (byId.length) return byId;
  }

  const date = String(body.date || today()).trim();
  const title = String(body.taskTitle || body.taskName || body.title || '').trim();

  let sameDate = db.dailyTasks.filter((item) => {
    return !date || String(item.date || '').trim() === date;
  });

  let candidates = sameDate.filter((item) => xyDailyProgressV5UserMatch(item, req));

  if (title && candidates.length) {
    const titleMatched = candidates.filter((item) => {
      const itemTitle = String(item.taskTitle || item.taskName || item.title || '').trim();
      return itemTitle === title;
    });

    if (titleMatched.length) candidates = titleMatched;
  }

  // 兜底 1：如果用户字段匹配不上，用同日期 + 同标题
  if (!candidates.length && title) {
    candidates = sameDate.filter((item) => {
      const itemTitle = String(item.taskTitle || item.taskName || item.title || '').trim();
      return itemTitle === title;
    });
  }

  // 兜底 2：新增日报保存后，通常最近一条就是刚提交的
  if (!candidates.length) {
    candidates = sameDate.slice();
  }

  if (candidates.length > 1) {
    candidates = candidates
      .sort((a, b) => xyDailyProgressV5TimeScore(b) - xyDailyProgressV5TimeScore(a))
      .slice(0, 1);
  }

  return candidates;
}

function xyDailyProgressV5Apply(req) {
  const progress = xyDailyProgressV5FromBody(req.body);

  if (progress === null) {
    return {
      ok: false,
      reason: 'no_progress_in_body',
      path: req.path,
      bodyKeys: Object.keys(req.body || {}),
      progressFields: {
        xyProgress: req.body?.xyProgress,
        progress: req.body?.progress,
        taskProgress: req.body?.taskProgress,
        overallProgress: req.body?.overallProgress,
        dailyProgress: req.body?.dailyProgress
      }
    };
  }

  const db = readDb();
  const targets = xyDailyProgressV5FindTargets(db, req);

  if (!targets.length) {
    return {
      ok: false,
      reason: 'no_matched_daily_task',
      path: req.path,
      progress,
      bodyKeys: Object.keys(req.body || {})
    };
  }

  targets.forEach((item) => {
    item.progress = String(progress);
    item.taskProgress = String(progress);
    item.overallProgress = String(progress);
    item.progressLabel = xyDailyProgressV5Label(progress);
    item.progressUpdatedAt = typeof now === 'function' ? now() : new Date().toISOString();
    item.updatedAt = item.progressUpdatedAt;
  });

  writeDb(db);

  return {
    ok: true,
    path: req.path,
    count: targets.length,
    progress,
    ids: targets.map((item) => item.id)
  };
}

// V5 的 POST 后置写库逻辑已停用；POST 统一交给 V6 body normalize + 路由保存处理。
// ==================== XY_DAILY_PROGRESS_V5_FORCE_END ====================

// ==================== XY_DAILY_PROGRESS_FORCE_INJECT_V6_BEGIN ====================
// 每日任务编辑页单进度条注入；新增页由 intern-daily.js 管理多任务独立进度条
app.use((req, res, next) => {
  const path = String(req.path || req.originalUrl || '').split('?')[0];

  const shouldInject =
    req.method === 'GET' &&
    /^\/intern\/daily-tasks\/[^/]+\/edit$/.test(path);

  if (!shouldInject) {
    return next();
  }

  const originalSend = res.send.bind(res);

  res.send = function xyDailyProgressForceInjectV6Send(body) {
    try {
      let html = body;

      if (Buffer.isBuffer(html)) {
        html = html.toString('utf8');
      }

      if (typeof html === 'string') {
        if (html.includes('</head>') && !html.includes('/daily-progressbar-shared.css')) {
          html = html.replace(
            '</head>',
            '<link rel="stylesheet" href="/daily-progressbar-shared.css?v=2026070810"></head>'
          );
        }

        if (html.includes('</body>') && !html.includes('/intern-progressbar-sync.js')) {
          html = html.replace(
            '</body>',
            '<script src="/intern-progressbar-sync.js?v=2026070810"></script></body>'
          );
        }

        console.log('[XY_DAILY_PROGRESS_FORCE_INJECT_V6_OK]', { path });
      }

      return originalSend(html);
    } catch (err) {
      console.error('[XY_DAILY_PROGRESS_FORCE_INJECT_V6_ERROR]', err);
      return originalSend(body);
    }
  };

  return next();
});
// ==================== XY_DAILY_PROGRESS_FORCE_INJECT_V6_END ====================


app.get('/intern/daily-tasks', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const q = {
    startDate: (req.query.startDate || '').trim(),
    endDate: (req.query.endDate || '').trim()
  };
  let tasks = db.dailyTasks.filter((t) => t.userId === req.user.id);
  if (q.startDate) tasks = tasks.filter((t) => t.date >= q.startDate);
  if (q.endDate) tasks = tasks.filter((t) => t.date <= q.endDate);
  tasks = tasks.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const rows = tasks.length
    ? tasks.map((t) => `<tr>
        <td>${escapeHtml(t.date)}</td>
        <td>${escapeHtml(t.taskTitle)}</td>
        <td>${escapeHtml(t.content).slice(0, 80)}${String(t.content || '').length > 80 ? '...' : ''}</td>
        <td>${escapeHtml(t.problems || '暂无')}</td>
        <td>${xyDailyProgressV5Badge(t)}</td>
        <td><a class="link-button" href="/intern/daily-tasks/${t.id}/edit">查看 / 修改</a></td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="empty">暂无每日任务。</td></tr>';

  res.send(layout({
    title: '我的每日任务',
    user: req.user,
    content: `<section class="page-title">
        <div><h1>我的每日任务</h1><p>你只能看到和修改自己的每日任务，其他实习生不可见。</p></div>
        <a class="primary" href="/intern/daily-tasks/new">填写今日任务</a>
      </section>
      <section class="card">
        <h2>筛选每日任务</h2>
        <form method="get" action="/intern/daily-tasks" class="filter-form compact-filter">
          <input type="date" name="startDate" value="${escapeHtml(q.startDate)}" />
          <input type="date" name="endDate" value="${escapeHtml(q.endDate)}" />
          <button class="primary" type="submit">筛选</button>
          <a class="ghost-link" href="/intern/daily-tasks">重置</a>
        </form>
      </section>
      <section class="card">
        <h2>每日任务列表</h2>
        <table>
          <thead><tr><th>日期</th><th>关联任务</th><th>今日工作内容</th><th>问题/支持</th><th>整体进度</th><th>操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`
  }));
});

app.get('/intern/daily-tasks/new', requireLogin, requireIntern, (req, res) => {
  res.send(dailyTaskForm({ user: req.user }));
});

app.post('/intern/daily-tasks', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const requiredError = validateDailyTaskRequired(req.body, req.user, db);
  if (requiredError) return res.status(400).send(requiredError);
  const normalizedProgress = xyDailyProgressBodyNormalizeRawV6(req.body.progress) ?? 0;
  const claimedTask = findClaimedTaskFromDailyBody(db, req.user, req.body);
  const taskFields = dailyTaskFieldsFromClaimedTask(claimedTask, req.body.taskTitle || req.body.taskId || '');
  const dailyTask = {
    id: id(),
    userId: req.user.id,
    userName: req.user.realName,
    position: req.user.position,
    date: req.body.date,
    ...taskFields,
    content: req.body.content || '',
    problems: req.body.problems || '',
    tomorrowPlan: req.body.tomorrowPlan || '',
    progress: String(normalizedProgress),
    taskProgress: String(normalizedProgress),
    overallProgress: String(normalizedProgress),
    progressLabel: xyDailyProgressBodyLabelV6(normalizedProgress),
    createdAt: now(),
    updatedAt: now()
  };
  db.dailyTasks.push(dailyTask);
  syncTaskPoolProgressFromDaily(db, dailyTask);
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);

  // XY_DAILY_PROGRESS_DIRECT_CALL_BEGIN
  try {
    if (typeof xyDailyProgressDirectApplyBeforeWrite === 'function') {
      const xyProgressResult = xyDailyProgressDirectApplyBeforeWrite(db, req);
      if (xyProgressResult.ok) {
        console.log('[XY_DAILY_PROGRESS_DIRECT_OK]', xyProgressResult);
      } else {
        console.log('[XY_DAILY_PROGRESS_DIRECT_SKIP]', xyProgressResult);
      }
    }
  } catch (err) {
    console.error('[XY_DAILY_PROGRESS_DIRECT_ERROR]', err);
  }
  // XY_DAILY_PROGRESS_DIRECT_CALL_END

writeDb(db);
  res.redirect('/intern/daily-tasks');
});


app.get('/intern/daily-tasks/:id/edit', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const task = db.dailyTasks.find((t) => t.id === req.params.id && t.userId === req.user.id);
  if (!task) return res.status(404).send('每日任务不存在');
  res.send(dailyTaskForm({ user: req.user, task }));
});

app.post('/intern/daily-tasks/:id', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const task = db.dailyTasks.find((t) => t.id === req.params.id && t.userId === req.user.id);
  if (!task) return res.status(404).send('每日任务不存在');
  const requiredError = validateDailyTaskRequired(req.body, req.user, db);
  if (requiredError) return res.status(400).send(requiredError);
  const normalizedProgress = xyDailyProgressBodyNormalizeRawV6(req.body.progress) ?? 0;
  const claimedTask = findClaimedTaskFromDailyBody(db, req.user, req.body);
  const taskFields = dailyTaskFieldsFromClaimedTask(claimedTask, req.body.taskTitle || req.body.taskId || '');
  Object.assign(task, {
    date: req.body.date,
    ...taskFields,
    content: req.body.content || '',
    problems: req.body.problems || '',
    tomorrowPlan: req.body.tomorrowPlan || '',
    progress: String(normalizedProgress),
    taskProgress: String(normalizedProgress),
    overallProgress: String(normalizedProgress),
    progressLabel: xyDailyProgressBodyLabelV6(normalizedProgress),
    updatedAt: now()
  });
  syncTaskPoolProgressFromDaily(db, task);
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);

  // XY_DAILY_PROGRESS_DIRECT_CALL_BEGIN
  try {
    if (typeof xyDailyProgressDirectApplyBeforeWrite === 'function') {
      const xyProgressResult = xyDailyProgressDirectApplyBeforeWrite(db, req);
      if (xyProgressResult.ok) {
        console.log('[XY_DAILY_PROGRESS_DIRECT_OK]', xyProgressResult);
      } else {
        console.log('[XY_DAILY_PROGRESS_DIRECT_SKIP]', xyProgressResult);
      }
    }
  } catch (err) {
    console.error('[XY_DAILY_PROGRESS_DIRECT_ERROR]', err);
  }
  // XY_DAILY_PROGRESS_DIRECT_CALL_END

writeDb(db);
  res.redirect('/intern/daily-tasks');
});


function feedbackBlock(reportId) {
  const db = readDb();
  const feedbacks = db.feedbacks.filter((f) => f.reportId === reportId).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (!feedbacks.length) return '';
  return `<section class="card">
    <h2>反馈</h2>
    ${feedbacks.map((f) => `<div class="feedback">
      <div class="feedback-head">${statusText(f.action)} · ${escapeHtml(f.createdAt.slice(0, 10))}</div>
      <p>${escapeHtml(f.comment || '无文字反馈')}</p>
    </div>`).join('')}
  </section>`;
}

function internReportReadonlyPage(user, report) {
  const docMeta = [
    report.docTitle || report.projectName ? ['文档/项目名称', report.docTitle || report.projectName] : null,
    report.department ? ['负责部门', report.department] : null,
    report.eventDimension ? ['事件维度', report.eventDimension] : null,
    report.eventDate ? ['事件时间节点', report.eventDate] : null,
    report.attachmentName ? ['附件', report.attachmentName] : null,
    report.progressVersion || report.progress_version ? ['项目进度/版本', report.progressVersion || report.progress_version] : null,
    report.importedAt ? ['同步时间', String(report.importedAt).slice(0, 19).replace('T', ' ')] : null
  ].filter(Boolean);

  return layout({
    title: '查看周报',
    user,
    content: `<section class="page-title">
        <div><h1>查看周报</h1><p>${escapeHtml(report.weekStart || report.startDate || '-')} 至 ${escapeHtml(report.weekEnd || report.endDate || '-')} · ${statusBadge(report.status)}</p></div>
        <a class="ghost-link" href="/intern/dashboard">返回我的周报</a>
      </section>
      ${docMeta.length ? `<section class="card">
        <h2>文档来源</h2>
        <table>
          <tbody>
            ${docMeta.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}
          </tbody>
        </table>
      </section>` : ''}
      <section class="card report-detail">
        <h2>本周工作内容</h2><p>${nl2br(report.workContent || report.reportContent || report.content || '-')}</p>
        <h2>本周成果</h2><p>${nl2br(report.achievements || '无')}</p>
        <h2>遇到的问题</h2><p>${nl2br(report.problems || '无')}</p>
        <h2>解决方案 / 思考</h2><p>${nl2br(report.solutions || '无')}</p>
        <h2>下周计划</h2><p>${nl2br(report.nextPlan || '无')}</p>
        <h2>需要的支持</h2><p>${nl2br(report.supportNeeded || '无')}</p>
      </section>
      ${feedbackBlock(report.id)}`
  });
}

function reportForm({ user, report = null, defaults = null, aiNote = '' }) {
  const isEdit = Boolean(report);
  const formAction = isEdit ? `/intern/reports/${report.id}` : '/intern/reports';
  const weekStart = report?.weekStart || defaults?.weekStart || weekStartDefault();
  const weekEnd = report?.weekEnd || defaults?.weekEnd || weekEndDefault();
  const data = {
    workContent: report?.workContent ?? report?.reportContent ?? report?.content ?? defaults?.workContent ?? '',
    achievements: report?.achievements ?? defaults?.achievements ?? '',
    problems: report?.problems ?? defaults?.problems ?? '',
    solutions: report?.solutions ?? defaults?.solutions ?? '',
    nextPlan: report?.nextPlan ?? defaults?.nextPlan ?? '',
    supportNeeded: report?.supportNeeded ?? defaults?.supportNeeded ?? ''
  };

  const aiBox = !isEdit ? `<section class="card ai-card">
        <h2>自动周报助手</h2>
        <p class="muted">先填写每日任务，再选择周报周期，系统会自动汇总成本周工作内容、成果、问题和下周计划。</p>
        ${aiNote ? `<div class="alert success">${escapeHtml(aiNote)}</div>` : ''}
        <form method="get" action="/intern/reports/new" class="filter-form compact-filter">
          <input type="date" name="weekStart" value="${escapeHtml(weekStart)}" required />
          <input type="date" name="weekEnd" value="${escapeHtml(weekEnd)}" required />
          <input type="hidden" name="ai" value="1" />
          <button class="primary" type="submit">自动生成周报草稿</button>
        </form>
      </section>` : '';

  return layout({
    title: isEdit ? '修改周报' : '填写周报',
    user,
    content: `<section class="page-title">
        <div><h1>${isEdit ? '查看 / 修改周报' : '填写本周周报'}</h1><p>周报可以保存草稿或提交，提交后老板可在管理端查看。</p></div>
        <a class="ghost-link" href="/intern/dashboard">返回我的周报</a>
      </section>
      ${aiBox}
      <section class="card">
        <div class="xy-autosave-line">
          <span data-weekly-autosave-status>自动保存已开启</span>
          <button type="button" data-weekly-autosave-clear>清除本地草稿</button>
        </div>
        <form method="post" action="${formAction}" class="form grid-form" data-weekly-report-form>
          <div class="two-cols">
            <label>周开始日期<input type="date" name="weekStart" value="${escapeHtml(weekStart)}" required /></label>
            <label>周结束日期<input type="date" name="weekEnd" value="${escapeHtml(weekEnd)}" required /></label>
          </div>
          <label>本周工作内容<textarea name="workContent" rows="7" required>${escapeHtml(data.workContent)}</textarea></label>
          <label>本周成果<textarea name="achievements" rows="5" required>${escapeHtml(data.achievements)}</textarea></label>
          <label>遇到的问题<textarea name="problems" rows="4">${escapeHtml(data.problems)}</textarea></label>
          <label>解决方案 / 思考<textarea name="solutions" rows="4">${escapeHtml(data.solutions)}</textarea></label>
          <label>下周计划<textarea name="nextPlan" rows="4" required>${escapeHtml(data.nextPlan)}</textarea></label>
          <label>需要的支持<textarea name="supportNeeded" rows="3">${escapeHtml(data.supportNeeded)}</textarea></label>
          <div class="actions">
            <button class="secondary" name="action" value="draft" type="submit">保存草稿</button>
            <button class="primary" name="action" value="submitted" type="submit">提交周报</button>
          </div>
        </form>
      </section>
      ${isEdit ? feedbackBlock(report.id) : ''}
      <script src="/weekly-report-autosave.js?v=2026071601"></script>`
  });
}

function weeklyReportRequiredError(body) {
  const required = [
    ['weekStart', '周开始日期'],
    ['weekEnd', '周结束日期'],
    ['workContent', '本周工作内容'],
    ['achievements', '本周成果'],
    ['nextPlan', '下周计划']
  ];

  for (const [field, label] of required) {
    if (String(body[field] ?? '').trim() === '') return `请填写必填项：${label}`;
  }

  if (String(body.weekStart) > String(body.weekEnd)) return '周开始日期不能晚于周结束日期。';

  return null;
}

app.get('/intern/reports/new', requireLogin, requireIntern, async (req, res) => {
  const db = readDb();
  const weekStart = req.query.weekStart || weekStartDefault();
  const weekEnd = req.query.weekEnd || weekEndDefault();
  const existingReport = db.reports.find((r) => r.userId === req.user.id && r.weekStart === weekStart && r.weekEnd === weekEnd);
  let defaults = { weekStart, weekEnd };
  let aiNote = '';

  if (req.query.ai === '1') {
    const draft = await buildWeeklyDraftWithAI(db, req.user, weekStart, weekEnd);
    defaults = { weekStart, weekEnd, ...draft };
    aiNote = draft.aiNote;
  }

  if (existingReport) {
    const reportForEdit = req.query.ai === '1' ? { ...existingReport, ...defaults } : existingReport;
    return res.send(reportForm({ user: req.user, report: reportForEdit, aiNote }));
  }

  res.send(reportForm({ user: req.user, defaults, aiNote }));
});

app.post('/intern/reports', requireLogin, requireIntern, (req, res) => {
  const requiredError = weeklyReportRequiredError(req.body);
  if (requiredError) return res.status(400).send(requiredError);

  const db = readDb();
  const action = req.body.action === 'draft' ? 'draft' : 'submitted';
  const currentTime = now();

  const existingReport = db.reports.find((r) =>
    r.userId === req.user.id &&
    r.weekStart === req.body.weekStart &&
    r.weekEnd === req.body.weekEnd
  );

  const reportData = {
    userId: req.user.id,
    weekStart: req.body.weekStart,
    weekEnd: req.body.weekEnd,
    workContent: req.body.workContent,
    reportContent: req.body.workContent,
    content: req.body.workContent,
    achievements: req.body.achievements,
    problems: req.body.problems || '',
    solutions: req.body.solutions || '',
    nextPlan: req.body.nextPlan,
    supportNeeded: req.body.supportNeeded || '',
    status: action,
    submittedAt: action === 'submitted' ? currentTime : null,
    updatedAt: currentTime
  };

  if (existingReport) {
    Object.assign(existingReport, reportData);
  } else {
    db.reports.push({
      id: id(),
      source: 'intern_local',
      ...reportData,
      createdAt: currentTime
    });
  }

  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/intern/dashboard');
});

app.get('/intern/reports/:id', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const report = db.reports.find((r) => r.id === req.params.id && r.userId === req.user.id);
  if (!report) return res.status(404).send('周报不存在');
  res.send(internReportReadonlyPage(req.user, report));
});

app.get('/intern/reports/:id/edit', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const report = db.reports.find((r) => r.id === req.params.id && r.userId === req.user.id);
  if (!report) return res.status(404).send('周报不存在');
  res.send(reportForm({ user: req.user, report }));
});

app.post('/intern/reports/:id', requireLogin, requireIntern, (req, res) => {
  const requiredError = weeklyReportRequiredError(req.body);
  if (requiredError) return res.status(400).send(requiredError);

  const db = readDb();
  const report = db.reports.find((r) => r.id === req.params.id && r.userId === req.user.id);
  if (!report) return res.status(404).send('周报不存在');

  const action = req.body.action === 'draft' ? 'draft' : 'submitted';
  const currentTime = now();

  Object.assign(report, {
    weekStart: req.body.weekStart,
    weekEnd: req.body.weekEnd,
    workContent: req.body.workContent,
    reportContent: req.body.workContent,
    content: req.body.workContent,
    achievements: req.body.achievements,
    problems: req.body.problems || '',
    solutions: req.body.solutions || '',
    nextPlan: req.body.nextPlan,
    supportNeeded: req.body.supportNeeded || '',
    status: action,
    submittedAt: action === 'submitted' ? currentTime : null,
    updatedAt: currentTime
  });

  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/intern/dashboard');
});

// ==================== XY_DAILY_PROGRESS_DIRECT_CHECK_API_BEGIN ====================
// 只读检查：查看指定日期日报 progress 是否已保存
app.get('/api/admin/daily-progress-check', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const date = String(req.query.date || today()).trim();

  const rows = (db.dailyTasks || [])
    .filter((t) => t.date === date)
    .map((t) => ({
      id: t.id,
      date: t.date,
      userId: t.userId,
      realName: t.realName || t.userName || t.username || '',
      taskTitle: t.taskTitle || t.taskName || t.title || '',
      progress: t.progress || '',
      taskProgress: t.taskProgress || '',
      overallProgress: t.overallProgress || '',
      resolvedProgress: typeof xyDailyProgressDirectValue === 'function' ? xyDailyProgressDirectValue(t) : null,
      label: typeof xyDailyProgressDirectLabel === 'function' ? xyDailyProgressDirectLabel(t.progress || t.taskProgress || t.overallProgress) : ''
    }));

  res.json({ ok: true, date, count: rows.length, rows });
});
// ==================== XY_DAILY_PROGRESS_DIRECT_CHECK_API_END ====================


app.get('/admin/dashboard', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const selectedDate = (req.query.date || today()).trim();
  const interns = db.users.filter((u) => u.role === 'intern');
  const todayTasks = db.dailyTasks.filter((t) => t.date === selectedDate);
  const submittedIdSet = new Set(todayTasks.map((t) => t.userId));
  const submittedInterns = interns.filter((u) => submittedIdSet.has(u.id));
  const notSubmittedInterns = interns.filter((u) => !submittedIdSet.has(u.id));

  const submittedRows = submittedInterns.length
    ? submittedInterns.map((u, userIndex) => {
        const tasks = todayTasks
          .filter((t) => t.userId === u.id)
          .sort((a, b) => String(a.createdAt || a.updatedAt || a.id || '').localeCompare(String(b.createdAt || b.updatedAt || b.id || '')));
        const lastUpdated = tasks.map((t) => t.updatedAt || t.createdAt || '').sort().at(-1) || '';
        const groupId = `daily-group-${userIndex}`;
        const taskRowsForUser = tasks.map((task, index) => {
          const isFirst = index === 0;
          const taskTitle = task.taskTitle || task.taskName || task.title || '-';
          const updatedText = (task.updatedAt || task.createdAt || lastUpdated || '').slice(0, 16).replace('T', ' ');
          const editHref = `/admin/daily-tasks/${encodeURIComponent(task.id)}/edit?back=${encodeURIComponent(`/admin/dashboard?date=${selectedDate}`)}`;

          return `<tr class="xy-admin-daily-member-row ${isFirst ? 'is-first' : 'is-extra'}" data-daily-group="${groupId}" ${isFirst ? '' : 'hidden'}>
            <td class="xy-admin-daily-member-name">
              ${isFirst ? `<button class="xy-admin-daily-expand" type="button" data-daily-toggle="${groupId}" aria-expanded="false">
                <span>${escapeHtml(u.realName)}</span>
                ${tasks.length > 1 ? `<small>${tasks.length} 条任务</small>` : '<small>1 条任务</small>'}
              </button>` : '<span class="xy-admin-daily-continuation">同上</span>'}
            </td>
            <td>${escapeHtml(u.position || '-')}</td>
            <td><strong>${escapeHtml(taskTitle)}</strong></td>
            <td class="daily-long-cell daily-content-preview-cell">
              <a class="daily-content-preview" href="${editHref}" title="点击查看/编辑完整今日工作内容">
                ${escapeHtml(truncateDailyContent(task.content, 22))}
              </a>
            </td>
            <td>${progressBar(task.progress, 'is-admin-dashboard')}</td>
            <td>${updatedText ? escapeHtml(updatedText) : '-'}</td>
            <td><a class="link-button small" href="${editHref}">编辑</a></td>
          </tr>`;
        }).join('');

        return taskRowsForUser;
      }).join('')
    : '<tr><td colspan="7" class="empty">今日暂无已交人员。</td></tr>';

  const notSubmittedRows = notSubmittedInterns.length
    ? notSubmittedInterns.map((u) => `<tr>
        <td>${escapeHtml(u.realName)}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.position)}</td>
        <td><span class="badge returned">未交</span></td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="empty">今日全部实习生都已提交每日任务。</td></tr>';
  const dashboardInsights = reportService.buildAdminDashboardInsights(db, selectedDate);
  const adminInsightStats = viewComponents.statGrid([
    {
      label: '需要支持事项',
      value: dashboardInsights.supportNeededCount,
      tone: dashboardInsights.supportNeededCount ? 'primary' : 'success',
      hint: '点击查看完整支持内容',
      href: '#admin-support-needed',
      title: '查看完整需要的支持'
    }
  ]);
  const adminSupportDetails = viewComponents.supportDetails('完整的需要的支持', dashboardInsights.supportDetails, {
    id: 'admin-support-needed',
    collapsed: true,
    showAction: false
  });

  res.send(layout({
    title: '今日提交监督',
    user: req.user,
    content: `<style>
      .xy-admin-daily-supervision-table th,
      .xy-admin-daily-supervision-table td {
        vertical-align: middle;
      }

      .xy-admin-daily-member-name {
        min-width: 150px;
      }

      .xy-admin-daily-expand {
        appearance: none;
        border: 0;
        background: transparent;
        color: #1d4ed8;
        cursor: pointer;
        display: inline-grid;
        gap: 3px;
        padding: 0;
        text-align: left;
        font: inherit;
        font-weight: 800;
      }

      .xy-admin-daily-expand small {
        color: #64748b;
        font-size: 12px;
        font-weight: 700;
      }

      .xy-admin-daily-expand::before {
        content: "展开";
        display: inline-flex;
        width: fit-content;
        margin-bottom: 2px;
        padding: 2px 7px;
        border-radius: 999px;
        background: #eff6ff;
        color: #2563eb;
        font-size: 12px;
        font-weight: 800;
      }

      .xy-admin-daily-expand[aria-expanded="true"]::before {
        content: "收起";
        background: #ecfdf5;
        color: #047857;
      }

      .xy-admin-daily-continuation {
        color: #94a3b8;
        font-weight: 700;
      }

      .xy-progress-cell {
        min-width: 170px;
        display: grid;
        gap: 7px;
      }

      .xy-progress-cell-top strong {
        color: #0f172a;
        font-size: 13px;
        white-space: nowrap;
      }

      .xy-progress-cell-track {
        height: 9px;
        border-radius: 999px;
        background: #e5e7eb;
        overflow: hidden;
      }

      .xy-progress-cell-track span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: #2563eb;
      }

      .xy-admin-daily-member-row.is-extra td {
        background: #f8fafc;
      }
    </style>
    <section class="page-title">
        <div><h1>今日提交监督</h1><p>管理员负责监督每日任务提交进程；老板账号不显示每日任务，只查看周报。</p></div>
        <a class="secondary" href="/admin/daily-tasks">查看全部每日任务</a>
      </section>
      <section class="card">
        <h2>选择日期</h2>
        <form method="get" action="/admin/dashboard" class="filter-form compact-filter">
          <input type="date" name="date" value="${escapeHtml(selectedDate)}" required />
          <button class="primary" type="submit">查看</button>
          <a class="ghost-link" href="/admin/dashboard">回到今日</a>
        </form>
      </section>
      <section class="stats">
        <div class="stat-card"><span>实习生人数</span><strong>${interns.length}</strong></div>
        <div class="stat-card"><span>已交人数</span><strong>${submittedInterns.length}</strong></div>
        <div class="stat-card"><span>未交人数</span><strong>${notSubmittedInterns.length}</strong></div>
        <div class="stat-card"><span>今日任务条数</span><strong>${todayTasks.length}</strong></div>
      </section>
      ${adminInsightStats}
      ${adminSupportDetails}
      <section class="card wide-card">
        <h2>${escapeHtml(selectedDate)} 已交名单</h2>
        <table class="daily-table xy-admin-daily-supervision-table">
          <thead><tr><th>姓名</th><th>职位</th><th>关联任务</th><th>今日工作内容</th><th>单项进度</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>${submittedRows}</tbody>
        </table>
      </section>
      <section class="card wide-card">
        <h2>${escapeHtml(selectedDate)} 未交名单</h2>
        <table>
          <thead><tr><th>姓名</th><th>账号</th><th>职位</th><th>状态</th></tr></thead>
          <tbody>${notSubmittedRows}</tbody>
        </table>
      </section>
      <script>
        (function () {
          document.querySelectorAll('a[href="#admin-support-needed"]').forEach(function (link) {
            link.addEventListener('click', function (event) {
              var panel = document.getElementById('admin-support-needed');
              if (!panel) return;

              event.preventDefault();
              panel.hidden = !panel.hidden;
              if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          });

          document.querySelectorAll('[data-daily-toggle]').forEach(function (button) {
            button.addEventListener('click', function () {
              var group = button.getAttribute('data-daily-toggle');
              var expanded = button.getAttribute('aria-expanded') === 'true';
              button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
              document.querySelectorAll('[data-daily-group="' + group + '"].is-extra').forEach(function (row) {
                row.hidden = expanded;
              });
            });
          });
        })();
      </script>`
  }));
});


app.get('/admin/reports/generate', requireLogin, requireAdmin, (req, res) => {
  res.status(403).send('周报由对方文档系统提交并同步到本系统，管理员端不提供本地生成周报功能。');
});

app.post('/admin/reports/generate', requireLogin, requireAdmin, async (req, res) => {
  res.status(403).send('周报由对方文档系统提交并同步到本系统，管理员端不提供本地生成周报功能。');
});

app.get('/admin/reports/export', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const reports = getFilteredReports(db, req.query);
  sendCsv(res, `周报导出_${today()}.csv`,
    ['姓名', '账号', '职位', '周期开始', '周期结束', '状态', '本周工作内容', '本周成果', '遇到的问题', '解决方案/思考', '下周计划', '需要的支持', '提交时间', '更新时间'],
    reports.map((r) => [r.intern.realName, r.intern.username, r.intern.position, r.weekStart, r.weekEnd, statusText(r.status), r.workContent, r.achievements, r.problems, r.solutions, r.nextPlan, r.supportNeeded, r.submittedAt || '', r.updatedAt || ''])
  );
});

function bossV2Esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function bossV2Percent(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  const match = String(value || '').match(/(\d{1,3})\s*%?/);
  if (!match) return null;

  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;

  return Math.max(0, Math.min(100, Math.round(n)));
}

function bossV2DailyTaskTitle(daily) {
  return String(
    daily.taskTitle ||
    daily.relatedTask ||
    daily.relatedTaskTitle ||
    daily.task ||
    daily.title ||
    ''
  ).trim();
}

function bossV2DailyMatchesTask(daily, task) {
  if (!daily || !task) return false;

  const dailyTaskId =
    daily.taskId ||
    daily.taskPoolId ||
    daily.relatedTaskId ||
    daily.poolTaskId ||
    '';

  if (dailyTaskId && String(dailyTaskId) === String(task.id)) {
    return true;
  }

  const dailyTitle = bossV2DailyTaskTitle(daily);
  const taskTitle = String(task.title || '').trim();

  return Boolean(dailyTitle && taskTitle && dailyTitle === taskTitle);
}

function bossV2SortKey(daily) {
  return [
    daily.date || '',
    daily.updatedAt || '',
    daily.createdAt || '',
    daily.id || ''
  ].join('|');
}

function bossV2UserMap(db) {
  const map = {};
  (db.users || []).forEach((u) => {
    map[String(u.id)] = u;
  });
  return map;
}

function bossV2UserName(db, userId, fallback = '-') {
  const user = bossV2UserMap(db)[String(userId || '')];
  return user?.realName || user?.username || fallback || '-';
}

function bossV2UserPosition(db, userId, fallback = '-') {
  const user = bossV2UserMap(db)[String(userId || '')];
  return user?.position || fallback || '-';
}

function bossV2TaskAssigneeNames(db, task) {
  const users = bossV2UserMap(db);
  const names = [];

  if (Array.isArray(task.assigneeNames)) {
    task.assigneeNames.forEach((name) => {
      if (name) names.push(String(name).trim());
    });
  }

  if (task.assigneeName) {
    String(task.assigneeName)
      .split(/[,，、;；]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((name) => names.push(name));
  }

  if (Array.isArray(task.claimedByUserIds)) {
    task.claimedByUserIds.forEach((id) => {
      const user = users[String(id)];
      if (user?.realName) names.push(user.realName);
    });
  }

  if (task.claimedByUserId) {
    const user = users[String(task.claimedByUserId)];
    if (user?.realName) names.push(user.realName);
  }

  return [...new Set(names.filter(Boolean))];
}

/*
 * 多人认领同一任务：
 * 先取每个人最新一条日报进度，再取其中最慢的进度作为任务整体进度。
 */
function bossV2ComputeTaskProgress(db, task) {
  const logs = (db.dailyTasks || [])
    .filter((daily) => bossV2DailyMatchesTask(daily, task))
    .filter((daily) => bossV2Percent(daily.progress) !== null)
    .sort((a, b) => bossV2SortKey(a).localeCompare(bossV2SortKey(b)));

  const latestByUser = {};

  logs.forEach((daily) => {
    const key = String(
      daily.userId ||
      daily.userName ||
      daily.realName ||
      daily.internName ||
      daily.id ||
      ''
    );

    if (key) latestByUser[key] = daily;
  });

  const latestLogs = Object.values(latestByUser);

  if (latestLogs.length) {
    const progresses = latestLogs
      .map((daily) => bossV2Percent(daily.progress))
      .filter((n) => n !== null);
    const assigneeKeys = taskProgressAssigneeKeys(task);

    if (assigneeKeys.length > 1) {
      assigneeKeys.forEach((key) => {
        if (!latestByUser[key]) progresses.push(0);
      });
    }

    if (progresses.length) {
      return Math.min(...progresses);
    }
  }

  const taskProgress = bossV2Percent(task.progress);
  if (taskProgress !== null) return taskProgress;

  if (task.status === '已完成') return 100;
  if (task.status === '进行中') return 50;

  return 0;
}

function bossV2SyncTaskProgress(db) {
  if (!db || !Array.isArray(db.taskPool)) return db;

  (db.taskPool || []).forEach((task) => {
    const progress = bossV2ComputeTaskProgress(db, task);
    applyTaskProgressStatusRule(task, progress, []);
  });

  return db;
}

// ==================== XY_BOSS4_SIDEBAR_HELPER_BEGIN ====================


function boss4Sidebar(active = 'daily') {
  const weeklyActive = active === 'weekly' ? ' active' : '';
  const dailyActive = active === 'daily' ? ' active' : '';

  return `
  <aside class="xy-boss4-navrail">
    <div class="xy-boss4-brand">
      <div class="xy-boss4-company">实习管理平台</div>
      <div class="xy-boss4-system">实习生周报系统</div>
    </div>

    <nav class="xy-boss4-function">
      <div class="xy-boss4-title">功能模块</div>
      <a class="xy-boss4-link${weeklyActive}" href="/boss/weekly-management">周报管理</a>
      <a class="xy-boss4-link${dailyActive}" href="/boss/dashboard">任务总表</a>
    </nav>

    <div class="xy-boss4-account">
      <div class="xy-boss4-title">账号管理</div>
      <a class="xy-boss4-link" href="/change-password">修改密码</a>
      <form method="post" action="/logout" class="xy-boss4-logout-form">
        <button class="xy-boss4-logout-btn" type="submit">退出登录</button>
      </form>
      <div class="xy-boss4-identity">负责人</div>
    </div>
  </aside>`;
}

function bossV2Layout({ title, subtitle, active = 'daily', body }) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${bossV2Esc(title)} - 实习管理平台</title>
  <link rel="stylesheet" href="/design-tokens.css?v=2026071601" />
  <link rel="stylesheet" href="/styles.css?v=2026071601" />
  <link rel="stylesheet" href="/boss-rebuild.css?v=2026070602" />
<link rel="stylesheet" href="/boss4-unified-nav.css?v=2026070606">
<link rel="stylesheet" href="/intern-taskpool-version-sync.css?v=2026070601">
<link rel="stylesheet" href="/admin-taskpool-content-panel.css?v=2026070602">
</head>
<body class="xy-boss3-page xy-boss4-page">
  ${boss4Sidebar(active)}

  <main class="xy-boss3-main">
    <section class="xy-boss3-header">
      <h1>${bossV2Esc(title)}</h1>
      <p>${bossV2Esc(subtitle || '')}</p>
    </section>

    ${body}
  </main>
<script>
  document.addEventListener('click', function(e) {
    var supportLink = e.target.closest('a[href="#support-needed"]');
    if (!supportLink) return;

    var panel = document.getElementById('support-needed');
    if (!panel) return;

    e.preventDefault();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
</script>
<script src="/intern-taskpool-version-sync.js?v=2026070601"></script>
<script src="/admin-taskpool-content-panel.js?v=2026070603"></script>
</body>
</html>
`;
}





// ==================== XY_BOSS_WEEKLY_POSITION_FILL_BEGIN ====================
// 老板周报管理：从账户管理用户信息中读取实习生职位，并补齐周报列表“职位”列
function xyBossWeeklyUserPosition(user) {
  if (!user) return '';

  return String(
    user.position ||
    user.jobTitle ||
    user.post ||
    user.title ||
    user.internPosition ||
    user.internshipPosition ||
    user.roleTitle ||
    user.departmentPosition ||
    user['职位'] ||
    user['岗位'] ||
    user['岗位名称'] ||
    user['实习岗位'] ||
    ''
  ).trim();
}

function xyBossWeeklyUserName(user) {
  if (!user) return '';

  return String(
    user.realName ||
    user.name ||
    user.displayName ||
    user.userName ||
    user.username ||
    ''
  ).trim();
}

function xyBossWeeklyCanReadPosition(req) {
  const role = String(req.user?.role || '').toLowerCase();

  return (
    role === 'boss' ||
    role === 'admin' ||
    role === 'superadmin' ||
    role.includes('boss') ||
    role.includes('admin') ||
    role.includes('老板') ||
    role.includes('管理员')
  );
}

app.get('/api/boss/intern-position-map', requireLogin, (req, res) => {
  if (!xyBossWeeklyCanReadPosition(req)) {
    return res.status(403).json({ ok: false, message: '无权限查看职位信息' });
  }

  const db = readDb();

  const users = []
    .concat(Array.isArray(db.users) ? db.users : [])
    .concat(Array.isArray(db.accounts) ? db.accounts : [])
    .concat(Array.isArray(db.interns) ? db.interns : []);

  const seen = new Set();

  const rows = users
    .map((user) => {
      const id = String(user.id || user.userId || user.internId || '').trim();
      const username = String(user.username || user.userName || user.account || '').trim();
      const realName = xyBossWeeklyUserName(user);
      const position = xyBossWeeklyUserPosition(user);

      return {
        id,
        userId: id,
        username,
        realName,
        name: realName,
        displayName: realName || username || id,
        position: position || '-'
      };
    })
    .filter((row) => {
      const key = [row.id, row.username, row.realName, row.position].join('|');

      if (seen.has(key)) return false;
      seen.add(key);

      return row.id || row.username || row.realName;
    });

  res.json({
    ok: true,
    count: rows.length,
    rows
  });
});

app.use((req, res, next) => {
  const path = String(req.path || req.originalUrl || '').split('?')[0];

  const shouldInject =
    req.method === 'GET' &&
    /^\/boss(\/|$)/.test(path) &&
    !/(task-pool|taskpool|task-list|tasks)/.test(path);

  if (!shouldInject) {
    return next();
  }

  const originalSend = res.send.bind(res);

  res.send = function xyBossWeeklyPositionFillSend(body) {
    try {
      let html = body;

      if (Buffer.isBuffer(html)) {
        html = html.toString('utf8');
      }

      if (typeof html === 'string' && html.includes('</body>') && !html.includes('/boss-weekly-position-fill.js')) {
        html = html.replace(
          '</body>',
          '<script src="/boss-weekly-position-fill.js?v=2026070813"></script></body>'
        );

        console.log('[XY_BOSS_WEEKLY_POSITION_FILL_INJECT_OK]', { path });
      }

      return originalSend(html);
    } catch (err) {
      console.error('[XY_BOSS_WEEKLY_POSITION_FILL_INJECT_ERROR]', err);
      return originalSend(body);
    }
  };

  return next();
});
// ==================== XY_BOSS_WEEKLY_POSITION_FILL_END ====================


app.get('/boss/dashboard', requireLogin, requireBoss, (req, res) => {
  const db = readDb();

  const tasks = Array.isArray(db.taskPool)
    ? db.taskPool
    : (
        Array.isArray(db.tasks)
          ? db.tasks
          : []
      );

  const keyword = String(req.query.keyword || '').trim();
  const statusQuery = String(req.query.status || '').trim();

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safePercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function getTaskContent(task) {
    return String(
      task.taskContent ||
      task.content ||
      task.description ||
      task.remark ||
      task.note ||
      task.requirement ||
      task.detail ||
      ''
    ).trim() || '暂无任务内容';
  }

  function taskAssignees(task) {
    if (Array.isArray(task.assigneeNames) && task.assigneeNames.length) {
      return task.assigneeNames.join('、');
    }

    if (Array.isArray(task.claimedByNames) && task.claimedByNames.length) {
      return task.claimedByNames.join('、');
    }

    if (task.assigneeName) return task.assigneeName;
    if (task.claimedByName) return task.claimedByName;

    return '-';
  }

  function taskStatus(task) {
    const progress = safePercent(task.progress);
    const raw = String(task.status || '').trim();

    if (progress >= 100 || raw.includes('完成')) return '已完成';
    if (raw.includes('进行')) return raw;
    if (task.claimOpen === true && task.claimClosed !== true) return '可继续认领';

    if (
      task.assigneeName ||
      task.claimedByName ||
      (Array.isArray(task.assigneeNames) && task.assigneeNames.length) ||
      (Array.isArray(task.claimedByNames) && task.claimedByNames.length)
    ) {
      return '进行中';
    }

    return raw || '待认领';
  }

  function statusClass(status) {
    if (status.includes('完成')) return 'done';
    if (status.includes('继续')) return 'open';
    if (status.includes('进行')) return 'progress';
    return 'todo';
  }

  function renderVersions(task) {
    const versions = Array.isArray(task.versions) ? task.versions : [];

    if (!versions.length) {
      return `
        <div class="xy-boss-version-list">
          <div class="xy-boss-version-item current">
            <span class="xy-boss-version-tag">v1.0</span>
            <span class="xy-boss-version-desc">${esc(getTaskContent(task))}</span>
            <span class="xy-boss-version-time">${esc(task.expectedDate || task.dueDate || task.deadline || '-')}</span>
          </div>
        </div>
      `;
    }

    const list = versions.map((v, index) => {
      const current = v.current === true || v.selected === true || index === 0;

      return `
        <div class="xy-boss-version-item ${current ? 'current' : ''}">
          <span class="xy-boss-version-tag">${esc(v.version || v.v || v.name || `v${index + 1}.0`)}</span>
          <span class="xy-boss-version-desc">${esc(v.desc || v.description || v.content || v.note || '-')}</span>
          <span class="xy-boss-version-time">${esc(v.time || v.date || v.updatedAt || v.createdAt || '-')}</span>
        </div>
      `;
    }).join('');

    return `<div class="xy-boss-version-list">${list}</div>`;
  }

  const filteredTasks = tasks.filter((task) => {
    const status = taskStatus(task);
    const searchText = [
      task.department,
      task.contact,
      task.title,
      task.taskName,
      taskAssignees(task),
      getTaskContent(task)
    ].join(' ');

    const matchKeyword = !keyword || searchText.includes(keyword);
    const matchStatus = !statusQuery || status === statusQuery || String(task.status || '') === statusQuery;

    return matchKeyword && matchStatus;
  });

  const totalTasks = tasks.length;
  const ongoingTasks = tasks.filter((task) => taskStatus(task).includes('进行')).length;
  const doneTasks = tasks.filter((task) => taskStatus(task).includes('完成')).length;
  const openTasks = tasks.filter((task) => taskStatus(task).includes('继续')).length;
  const versionCount = tasks.reduce((sum, task) => sum + (Array.isArray(task.versions) ? task.versions.length : 0), 0);
  const bossInsights = reportService.buildBossDashboardInsights(db);
  const bossInsightStats = viewComponents.statGrid([
    {
      label: '需要支持事项',
      value: bossInsights.supportNeededCount,
      tone: bossInsights.supportNeededCount ? 'primary' : 'success',
      hint: '点击查看每位实习生的支持内容',
      href: '#support-needed',
      title: '查看需要支持明细'
    }
  ]);
  const bossSupportDetails = viewComponents.supportDetails('需要支持事项明细', bossInsights.supportDetails, { id: 'support-needed', collapsed: true });

  const rows = filteredTasks.map((task, index) => {
    const status = taskStatus(task);
    const cls = statusClass(status);
    const progress = safePercent(task.progress);
    const taskId = esc(task.id || task._id || task.taskId || index);

    return `
      <tr class="xy-boss-task-row" data-task-id="${taskId}">
        <td>${esc(task.department || '-')}</td>
        <td>${esc(task.contact || '-')}</td>
        <td class="xy-boss-task-title-cell">
          <button type="button" class="xy-boss-task-title-btn" data-boss-toggle-task>
            ▸ ${esc(task.title || task.taskName || '-')}
          </button>
        </td>
        <td>${esc(task.expectedDate || task.dueDate || task.deadline || '-')}</td>
        <td><span class="xy-boss-status-tag ${cls}">${esc(status)}</span></td>
        <td>${esc(taskAssignees(task))}</td>
        <td>
          <span class="xy-boss-progress-number">${progress}%</span>
          <div class="xy-boss-progress-wrap">
            <div class="xy-boss-progress-fill" style="width:${progress}%"></div>
          </div>
        </td>
        <td><span class="xy-boss-taskpool-readonly">查看</span></td>
      </tr>
      <tr class="xy-boss-taskpool-detail-row" style="display:none;">
        <td colspan="8">
          <div class="xy-boss-taskpool-detail-panel">
            <div class="xy-boss-taskpool-section">
              <div class="xy-boss-taskpool-section-title">任务内容</div>
              <div class="xy-boss-taskpool-content">${esc(getTaskContent(task))}</div>
            </div>

            <div class="xy-boss-taskpool-section">
              <div class="xy-boss-taskpool-section-title">版本记录</div>
              ${renderVersions(task)}
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>任务总表 - 实习管理平台</title>
  <link rel="stylesheet" href="/design-tokens.css?v=2026071601" />
  <link rel="stylesheet" href="/styles.css?v=2026071601" />
  <link rel="stylesheet" href="/boss4-unified-nav.css?v=2026070607" />
  <link rel="stylesheet" href="/boss-admin-taskpool-sync.css?v=2026070601" />
<link rel="stylesheet" href="/admin-taskpool-content-panel.css?v=2026070602">
</head>
<body class="xy-boss4-page">
  <aside class="xy-boss4-navrail">
    <div class="xy-boss4-brand">
      <div class="xy-boss4-company">实习管理平台</div>
      <div class="xy-boss4-system">实习生周报系统</div>
    </div>

    <nav class="xy-boss4-function">
      <div class="xy-boss4-title">功能模块</div>
      <a class="xy-boss4-link" href="/boss/weekly-management">周报管理</a>
      <a class="xy-boss4-link active" href="/boss/dashboard">任务总表</a>
    </nav>

    <div class="xy-boss4-account">
      <div class="xy-boss4-title">账号管理</div>
      <a class="xy-boss4-link" href="/change-password">修改密码</a>
      <form method="post" action="/logout" class="xy-boss4-logout-form">
        <button class="xy-boss4-logout-btn" type="submit">退出登录</button>
      </form>
      <div class="xy-boss4-identity">负责人</div>
    </div>
  </aside>

  <main class="xy-boss-taskpool-sync-main">
    <section class="xy-boss-taskpool-sync-header">
      <h1>任务总表</h1>
      <p>与管理员任务总表同步展示，包含任务内容和版本记录。老板端仅查看，不提供编辑、删除操作。</p>
    </section>

    <section class="xy-boss-taskpool-sync-stats">
      <div class="xy-boss-taskpool-sync-stat">
        <span>任务总数</span>
        <strong>${totalTasks}</strong>
      </div>
      <div class="xy-boss-taskpool-sync-stat">
        <span>进行中任务</span>
        <strong>${ongoingTasks}</strong>
      </div>
      <div class="xy-boss-taskpool-sync-stat">
        <span>已完成任务</span>
        <strong>${doneTasks}</strong>
      </div>
      <div class="xy-boss-taskpool-sync-stat">
        <span>可继续认领</span>
        <strong>${openTasks}</strong>
      </div>
      <div class="xy-boss-taskpool-sync-stat">
        <span>版本记录数</span>
        <strong>${versionCount}</strong>
      </div>
    </section>

    ${bossInsightStats}
    ${bossSupportDetails}

    <section class="xy-boss-taskpool-sync-card">
      <h2>筛选任务</h2>
      <p>数据来源与管理员任务总表一致，筛选不会改变任务数据。</p>

      <form class="xy-boss-taskpool-sync-filter" method="get" action="/boss/dashboard">
        <input name="keyword" value="${esc(keyword)}" placeholder="按部门 / 对接人 / 任务 / 认领人筛选" />
        <select name="status">
          <option value="">全部状态</option>
          <option value="进行中" ${statusQuery === '进行中' ? 'selected' : ''}>进行中</option>
          <option value="已完成" ${statusQuery === '已完成' ? 'selected' : ''}>已完成</option>
          <option value="可继续认领" ${statusQuery === '可继续认领' ? 'selected' : ''}>可继续认领</option>
          <option value="待认领" ${statusQuery === '待认领' ? 'selected' : ''}>待认领</option>
        </select>
        <button class="xy-boss-taskpool-sync-btn primary" type="submit">筛选</button>
        <a class="xy-boss-taskpool-sync-btn default" href="/boss/dashboard">重置</a>
      </form>
    </section>

    <section class="xy-boss-taskpool-sync-card">
      <h2>任务列表</h2>
      <p>点击任务名称可展开任务内容和版本记录；版本记录与管理员任务总表同步。</p>

      <div class="xy-boss-taskpool-sync-scroll">
        <table class="xy-boss-taskpool-sync-table">
          <thead>
            <tr>
              <th>需求部门</th>
              <th>对接人</th>
              <th>任务名称</th>
              <th>期望完成</th>
              <th>状态</th>
              <th>认领人</th>
              <th>整体进度</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="8" style="padding:32px;color:#999;">暂无任务数据</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  </main>

  <script>
    document.addEventListener('click', function(e) {
      var supportLink = e.target.closest('a[href="#support-needed"]');
      if (!supportLink) return;

      var panel = document.getElementById('support-needed');
      if (!panel) return;

      e.preventDefault();
      panel.hidden = !panel.hidden;
      if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-boss-toggle-task]');
      if (!btn) return;

      var row = btn.closest('tr');
      var detail = row ? row.nextElementSibling : null;

      if (!detail || !detail.classList.contains('xy-boss-taskpool-detail-row')) return;

      var isOpen = detail.style.display !== 'none';

      document.querySelectorAll('.xy-boss-taskpool-detail-row').forEach(function(item) {
        item.style.display = 'none';
      });

      document.querySelectorAll('[data-boss-toggle-task]').forEach(function(item) {
        item.innerHTML = item.innerHTML.replace('▾', '▸');
      });

      if (!isOpen) {
        detail.style.display = '';
        btn.innerHTML = btn.innerHTML.replace('▸', '▾');
      }
    });
  </script>
<script src="/admin-taskpool-content-panel.js?v=2026070603"></script>
</body>
</html>
  `);
});



app.get('/boss/daily-tasks', requireLogin, requireBoss, (req, res) => {
  res.redirect('/boss/dashboard#daily');
});

app.get('/boss/task-daily/:taskId', requireLogin, requireBoss, (req, res) => {
  const db = readDb();

  bossV2SyncTaskProgress(db);
  writeDb(db);

  const taskId = String(req.params.taskId || '').trim();
  const task = (db.taskPool || []).find((t) => String(t.id) === taskId);

  if (!task) {
    return res.status(404).send('任务不存在');
  }

  const logs = (db.dailyTasks || [])
    .filter((daily) => bossV2DailyMatchesTask(daily, task))
    .sort((a, b) => bossV2SortKey(b).localeCompare(bossV2SortKey(a)));

  const progress = bossV2Percent(task.progress) ?? bossV2ComputeTaskProgress(db, task);
  const people = new Set();

  logs.forEach((daily) => {
    people.add(bossV2UserName(db, daily.userId, daily.userName || daily.realName || '-'));
  });

  const logRows = logs.map((daily) => {
    const p = bossV2Percent(daily.progress) ?? 0;
    const name = bossV2UserName(db, daily.userId, daily.userName || daily.realName || '-');
    const position = bossV2UserPosition(db, daily.userId, daily.position || '-');

    return `
      <tr>
        <td>${bossV2Esc(daily.date || '-')}</td>
        <td>${bossV2Esc(name)}</td>
        <td>${bossV2Esc(position)}</td>
        <td><span class="boss-v2-percent-pill">${p}%</span></td>
        <td class="boss-v2-content-cell">${bossV2Esc(daily.content || daily.workContent || '-')}</td>
        <td class="boss-v2-content-cell">${bossV2Esc(daily.problems || daily.problem || '暂无')}</td>
        <td class="boss-v2-content-cell">${bossV2Esc(daily.tomorrowPlan || daily.plan || '-')}</td>
        <td>
          <a class="boss-v2-small-link" href="/boss/daily-detail/${encodeURIComponent(daily.id)}">详情</a>
        </td>
      </tr>
    `;
  }).join('');

  const body = `
    <section class="boss-v2-card boss-v2-task-summary">
      <div>
        <h2>${bossV2Esc(task.title || '-')}</h2>
        <p>
          需求部门：${bossV2Esc(task.department || '-')}　
          对接人：${bossV2Esc(task.contact || '-')}　
          认领人：${bossV2Esc(bossV2TaskAssigneeNames(db, task).join('、') || '-')}
        </p>
      </div>
      <a class="boss-v2-primary-link" href="/boss/dashboard">返回工作台</a>
    </section>

    <section class="boss-v2-stats">
      <div>
        <span>当前整体进度</span>
        <strong>${progress}%</strong>
      </div>
      <div>
        <span>日志数量</span>
        <strong>${logs.length}</strong>
      </div>
      <div>
        <span>参与人数</span>
        <strong>${people.size}</strong>
      </div>
      <div>
        <span>最新更新</span>
        <strong class="boss-v2-date">${bossV2Esc(logs[0]?.date || '-')}</strong>
      </div>
    </section>

    <section class="boss-v2-card">
      <div class="boss-v2-card-head">
        <div>
          <h2>该任务填写日志</h2>
          <p>多人进度不一致时，任务整体进度取每个人最新日报进度中最慢的进度。</p>
        </div>
      </div>

      <div class="boss-v2-table-wrap">
        <table class="boss-v2-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>姓名</th>
              <th>职位</th>
              <th>进度</th>
              <th>今日工作内容</th>
              <th>问题/支持</th>
              <th>明日计划</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${logRows || '<tr><td colspan="8">暂无该任务的填写日志</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  res.send(bossV2Layout({
    title: '任务日志详情',
    subtitle: '查看该任务下每位实习生每天填写的日志。',
    active: 'daily',
    body
  }));
});

app.get('/boss/daily-detail/:dailyId', requireLogin, requireBoss, (req, res) => {
  const db = readDb();
  const dailyId = String(req.params.dailyId || '').trim();

  const daily = (db.dailyTasks || []).find((d) => String(d.id) === dailyId);

  if (!daily) {
    return res.status(404).send('日报不存在');
  }

  const name = bossV2UserName(db, daily.userId, daily.userName || daily.realName || '-');
  const position = bossV2UserPosition(db, daily.userId, daily.position || '-');
  const progress = bossV2Percent(daily.progress) ?? 0;

  const body = `
    <section class="boss-v2-card boss-v2-task-summary">
      <div>
        <h2>${bossV2Esc(name)} 的日报</h2>
        <p>
          日期：${bossV2Esc(daily.date || '-')}　
          职位：${bossV2Esc(position)}　
          关联任务：${bossV2Esc(bossV2DailyTaskTitle(daily) || '-')}
        </p>
      </div>
      <a class="boss-v2-primary-link" href="/boss/dashboard#daily">返回日报看板</a>
    </section>

    <section class="boss-v2-stats">
      <div>
        <span>日报进度</span>
        <strong>${progress}%</strong>
      </div>
      <div>
        <span>填写人</span>
        <strong class="boss-v2-name">${bossV2Esc(name)}</strong>
      </div>
      <div>
        <span>日期</span>
        <strong class="boss-v2-date">${bossV2Esc(daily.date || '-')}</strong>
      </div>
    </section>

    <section class="boss-v2-card">
      <div class="boss-v2-detail-block">
        <h3>今日工作内容</h3>
        <p>${bossV2Esc(daily.content || daily.workContent || '-')}</p>
      </div>

      <div class="boss-v2-detail-block">
        <h3>问题 / 需要支持</h3>
        <p>${bossV2Esc(daily.problems || daily.problem || '暂无')}</p>
      </div>

      <div class="boss-v2-detail-block">
        <h3>明日计划</h3>
        <p>${bossV2Esc(daily.tomorrowPlan || daily.plan || '-')}</p>
      </div>
    </section>
  `;

  res.send(bossV2Layout({
    title: '日报详情',
    subtitle: '老板端精简查看单条日报内容。',
    active: 'daily',
    body
  }));
});

app.get('/boss/reports/export', requireLogin, requireBoss, (req, res) => {
  const db = readDb();
  const reports = getFilteredReports(db, req.query);
  sendCsv(res, `周报导出_${today()}.csv`,
    ['姓名', '账号', '职位', '周期开始', '周期结束', '状态', '本周工作内容', '本周成果', '遇到的问题', '解决方案/思考', '下周计划', '需要的支持', '提交时间', '更新时间'],
    reports.map((r) => [r.intern.realName, r.intern.username, r.intern.position, r.weekStart, r.weekEnd, statusText(r.status), r.workContent, r.achievements, r.problems, r.solutions, r.nextPlan, r.supportNeeded, r.submittedAt || '', r.updatedAt || ''])
  );
});






app.get('/admin/daily-tasks/export', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const rows = getFilteredDailyTasks(db, req.query);
  sendCsv(res, `日报导出_${today()}.csv`,
    ['日期', '姓名', '账号', '职位', '关联任务', '今日工作内容', '遇到问题/需要支持', '明日计划', '整体进度%', '创建时间', '更新时间'],
    rows.map((t) => [t.date, t.intern.realName, t.intern.username, t.intern.position, t.taskTitle, t.content, t.problems || '', t.tomorrowPlan || '', t.progress ?? '', t.createdAt || '', t.updatedAt || ''])
  );
});

app.get('/admin/daily-tasks', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const q = {
    name: (req.query.name || '').trim(),
    position: (req.query.position || '').trim(),
    taskTitle: (req.query.taskTitle || '').trim(),
    startDate: (req.query.startDate || '').trim(),
    endDate: (req.query.endDate || '').trim()
  };

  let rowsData = getFilteredDailyTasks(db, q);

  const rows = rowsData.length
    ? rowsData.map((t) => `<tr>
        <td>${escapeHtml(t.date)}</td>
        <td>${escapeHtml(t.intern.realName)}</td>
        <td>${escapeHtml(t.intern.position)}</td>
        <td class="daily-task-title-cell">${escapeHtml(t.taskTitle)}</td>
        <td class="daily-long-cell daily-content-preview-cell">
          <a class="daily-content-preview" href="/admin/daily-tasks/${t.id}/edit" title="点击查看/编辑完整今日工作内容">
            ${escapeHtml(truncateDailyContent(t.content, 15))}
          </a>
        </td>
        <td class="daily-long-cell">${nl2br(t.problems || '暂无')}</td>
        <td class="daily-long-cell">${nl2br(t.tomorrowPlan || '-')}</td>
        <td>${progressBadge(t.progress)}</td>
        <td class="actions-cell">
          <a class="link-button small" href="/admin/daily-tasks/${t.id}/edit">编辑</a>
          <form method="post" action="/admin/daily-tasks/${t.id}/delete" class="inline-form" onsubmit="return confirm('确认删除该日报吗？');"><button class="ghost small" type="submit">删除</button></form>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="9" class="empty">暂无符合条件的每日任务。</td></tr>';

  const poolRows = db.taskPool.slice(0, 12).map((t) => `<tr>
    <td>${escapeHtml(t.department)}</td><td>${escapeHtml(t.contact)}</td><td>${escapeHtml(t.title)}</td><td>${escapeHtml(taskDisplayAssignee(t))}</td><td>${escapeHtml(taskStatusLabel(t))}</td>
  </tr>`).join('');

  res.send(layout({
    title: '每日任务管理',
    user: req.user,
    content: `<section class="page-title">
        <div><h1>每日任务管理</h1><p>管理员可以看到每位实习生每天填写的任务；实习生之间无法互相查看。</p></div>
        <div class="actions"><a class="primary" href="/admin/daily-tasks/new">新增日报</a><a class="ghost-link" href="/admin/dashboard">返回今日提交监督</a></div>
      </section>
      <section class="stats">
        <div class="stat-card"><span>每日任务总数</span><strong>${db.dailyTasks.length}</strong></div>
        <div class="stat-card"><span>今日填写数</span><strong>${db.dailyTasks.filter((t) => t.date === today()).length}</strong></div>
        <div class="stat-card"><span>任务总表参考数</span><strong>${db.taskPool.length}</strong></div>
        <div class="stat-card"><span>实习生人数</span><strong>${db.users.filter((u) => u.role === 'intern').length}</strong></div>
      </section>
      <section class="card">
        <h2>筛选每日任务</h2>
        <form method="get" action="/admin/daily-tasks" class="filter-form">
          <input name="name" placeholder="按姓名/账号" value="${escapeHtml(q.name)}" />
          <input name="position" placeholder="按职位" value="${escapeHtml(q.position)}" />
          <input name="taskTitle" placeholder="按关联任务" value="${escapeHtml(q.taskTitle)}" />
          <input type="date" name="startDate" value="${escapeHtml(q.startDate)}" />
          <input type="date" name="endDate" value="${escapeHtml(q.endDate)}" />
          <button class="primary" type="submit">筛选</button>
          <button class="secondary" type="submit" formaction="/admin/daily-tasks/export">导出日报</button>
          <a class="ghost-link" href="/admin/daily-tasks">重置</a>
        </form>
      </section>
      <section class="card wide-card">
        <h2>每日任务列表</h2>
        <table class="daily-table admin-daily-table">
          <thead><tr><th>日期</th><th>姓名</th><th>职位</th><th>关联任务</th><th>今日工作内容</th><th>问题/支持</th><th>明日计划</th><th>整体进度</th><th>操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
      <section class="card wide-card">
        <h2>任务总表参考</h2>
        <p class="muted">参考上传表格中的“任务总表”结构：需求部门、对接人、任务标题、优先级、期望完成日期、认领人、状态、任务内容。</p>
        <div class="actions"><a class="primary" href="/admin/task-pool">编辑任务总表 / 审核认领</a></div>
        <table>
          <thead><tr><th>需求部门</th><th>对接人</th><th>任务标题</th><th>认领人</th><th>状态</th></tr></thead>
          <tbody>${poolRows}</tbody>
        </table>
      </section>`
  }));
});



app.get('/admin/daily-tasks/new', requireLogin, requireAdmin, (req, res) => {
  res.send(dailyTaskEditForm({ user: req.user, task: null, backUrl: '/admin/daily-tasks' }));
});

app.post('/admin/daily-tasks', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const intern = db.users.find((u) => u.role === 'intern' && u.id === req.body.userId);
  if (!intern) return res.status(400).send('请选择有效的实习生账号。');
  const requiredError = validateDailyTaskRequired(req.body, intern, db);
  if (requiredError) return res.status(400).send(requiredError);
  const normalizedProgress = xyDailyProgressBodyNormalizeRawV6(req.body.progress) ?? 0;
  const claimedTask = findClaimedTaskFromDailyBody(db, intern, req.body);
  const taskFields = dailyTaskFieldsFromClaimedTask(claimedTask, req.body.taskTitle || req.body.taskId || '');
  const dailyTask = {
    id: id(),
    userId: intern.id,
    userName: intern.realName,
    position: intern.position,
    date: req.body.date,
    ...taskFields,
    content: req.body.content || '',
    problems: req.body.problems || '',
    tomorrowPlan: req.body.tomorrowPlan || '',
    progress: String(normalizedProgress),
    taskProgress: String(normalizedProgress),
    overallProgress: String(normalizedProgress),
    progressLabel: xyDailyProgressBodyLabelV6(normalizedProgress),
    createdByAdminId: req.user.id,
    createdByAdminName: req.user.realName,
    createdAt: now(),
    updatedAt: now()
  };
  db.dailyTasks.push(dailyTask);
  syncTaskPoolProgressFromDaily(db, dailyTask);
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/daily-tasks');
});


app.get('/admin/daily-tasks/:id/edit', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.dailyTasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('日报不存在');
  const backUrl = req.query.back || '/admin/daily-tasks';
  res.send(dailyTaskEditForm({ user: req.user, task, backUrl }));
});

app.post('/admin/daily-tasks/:id', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.dailyTasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('日报不存在');
  const intern = db.users.find((u) => u.role === 'intern' && u.id === req.body.userId);
  if (!intern) return res.status(400).send('请选择有效的实习生账号。');
  const requiredError = validateDailyTaskRequired(req.body, intern, db);
  if (requiredError) return res.status(400).send(requiredError);
  const normalizedProgress = xyDailyProgressBodyNormalizeRawV6(req.body.progress) ?? 0;
  const claimedTask = findClaimedTaskFromDailyBody(db, intern, req.body);
  const taskFields = dailyTaskFieldsFromClaimedTask(claimedTask, req.body.taskTitle || req.body.taskId || '');
  Object.assign(task, {
    userId: intern.id,
    userName: intern.realName,
    position: intern.position,
    date: req.body.date,
    ...taskFields,
    content: req.body.content || '',
    problems: req.body.problems || '',
    tomorrowPlan: req.body.tomorrowPlan || '',
    progress: String(normalizedProgress),
    taskProgress: String(normalizedProgress),
    overallProgress: String(normalizedProgress),
    progressLabel: xyDailyProgressBodyLabelV6(normalizedProgress),
    editedByAdminId: req.user.id,
    editedByAdminName: req.user.realName,
    updatedAt: now()
  });
  syncTaskPoolProgressFromDaily(db, task);
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect(req.body.backUrl || '/admin/daily-tasks');
});


app.post('/admin/daily-tasks/:id/delete', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  db.dailyTasks = db.dailyTasks.filter((t) => t.id !== req.params.id);
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect(req.body.backUrl || req.get('referer') || '/admin/daily-tasks');
});


function adminTaskForm({ user, task = null }) {
  const isEdit = Boolean(task);
  const action = isEdit ? `/admin/task-pool/${task.id}` : '/admin/task-pool';
  const interns = readDb().users.filter((u) => u.role === 'intern');
  const selectedAssignees = getTaskAssigneeNames(task || {});
  const assigneeSelect = interns.map((u) => `<option value="${escapeHtml(u.realName)}" ${selectedAssignees.includes(u.realName) ? 'selected' : ''}>${escapeHtml(u.realName)}（${escapeHtml(u.position || '实习生')}）</option>`).join('');
  const status = task?.status || '待认领';
  const statusOptions = ['待认领', '待审核', '已认领', '进行中', '已完成', '暂停'].map((x) => `<option value="${x}" ${x === status ? 'selected' : ''}>${x}</option>`).join('');
  return layout({
    title: isEdit ? '编辑任务' : '新增任务',
    user,
    content: `<section class="page-title">
        <div><h1>${isEdit ? '编辑任务' : '新增任务'}</h1><p>管理员可以维护任务总表，也可以手动指定认领人。</p></div>
        <a class="ghost-link" href="/admin/task-pool">返回任务总表</a>
      </section>
      <section class="card">
        <form method="post" action="${action}" class="form grid-form">
          <div class="two-cols">
            <label>需求部门<select name="department" required>
              <option value="">请选择需求部门</option>
              ${departmentOptions(task?.department || '')}
            </select></label>
            <label>对接人<input name="contact" value="${escapeHtml(task?.contact || '')}" required /></label>
          </div>
          <label>任务标题<textarea name="title" rows="3" required>${escapeHtml(task?.title || '')}</textarea></label>
          <div class="two-cols">
            <label>期望完成日期<input type="date" name="expectedDate" value="${escapeHtml(task?.expectedDate || '')}" required /></label>
          </div>
          <div class="two-cols">
            <label>认领人（可多选）<select name="assigneeNames" multiple size="6">${assigneeSelect}</select><span class="field-tip">按住 Command/Ctrl 可选择多人；不选则开放认领。</span></label>
            <label>状态<select name="status" required>${statusOptions}</select></label>
          </div>
          <label>任务内容<textarea name="remark" rows="4">${escapeHtml(task?.taskContent || task?.remark || '')}</textarea></label>
          <div class="actions"><button class="primary" type="submit">保存任务</button></div>
        </form>
      </section>`
  });
}

function xyTaskTitleKeyForMerge(title) {
  return String(title || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[，,。；;：:、]/g, '')
    .toLowerCase();
}

function xySplitNamesForMerge(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((x) => String(x || '').trim())
      .filter(Boolean);
  }

  return String(value || '')
    .split(/[,，、;；/]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function xyUniqueForMerge(arr) {
  return [...new Set((arr || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function xyTaskUserNameByIdForMerge(db, userId) {
  const user = (db.users || []).find((u) => String(u.id) === String(userId));
  return user?.realName || user?.username || '';
}

function xyTaskApprovedIdsForMerge(task) {
  const ids = [];

  if (task.claimedByUserId) ids.push(task.claimedByUserId);

  if (Array.isArray(task.claimedByUserIds)) {
    task.claimedByUserIds.forEach((id) => {
      if (id) ids.push(id);
    });
  }

  return xyUniqueForMerge(ids);
}

function xyTaskApprovedNamesForMerge(db, task) {
  const names = [];

  xySplitNamesForMerge(task.assigneeNames).forEach((name) => names.push(name));
  xySplitNamesForMerge(task.assigneeName).forEach((name) => names.push(name));

  xyTaskApprovedIdsForMerge(task).forEach((id) => {
    const name = xyTaskUserNameByIdForMerge(db, id);
    if (name) names.push(name);
  });

  return xyUniqueForMerge(names);
}

function xyTaskPendingClaimsForMerge(db, task) {
  const list = [];

  function addClaim(claim) {
    if (!claim) return;

    if (typeof claim === 'string') {
      const name = xyTaskUserNameByIdForMerge(db, claim);
      list.push({
        userId: claim,
        userName: name || claim,
        createdAt: ''
      });
      return;
    }

    const userId = String(
      claim.userId ||
      claim.claimedByUserId ||
      claim.internId ||
      claim.id ||
      ''
    ).trim();

    const userName = String(
      claim.userName ||
      claim.realName ||
      claim.name ||
      claim.claimedByName ||
      xyTaskUserNameByIdForMerge(db, userId) ||
      ''
    ).trim();

    if (!userId && !userName) return;

    list.push({
      ...claim,
      userId,
      userName: userName || xyTaskUserNameByIdForMerge(db, userId) || userId,
      createdAt: claim.createdAt || claim.applyAt || claim.pendingClaimAt || ''
    });
  }

  if (Array.isArray(task.pendingClaims)) {
    task.pendingClaims.forEach(addClaim);
  }

  if (task.pendingClaimUserId || task.pendingClaimName) {
    addClaim({
      userId: task.pendingClaimUserId || '',
      userName: task.pendingClaimName || '',
      createdAt: task.pendingClaimAt || ''
    });
  }

  const seen = new Set();
  return list.filter((claim) => {
    const key = String(claim.userId || claim.userName || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function xyMergeDuplicateTasksByTitle(db) {
  if (!db || !Array.isArray(db.taskPool)) return db;

  const groups = new Map();

  db.taskPool.forEach((task) => {
    const key = xyTaskTitleKeyForMerge(task.title);
    if (!key) return;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  });

  const duplicateIdToMainId = {};
  const mergedTasks = [];
  let changed = false;

  groups.forEach((tasks) => {
    if (tasks.length <= 1) {
      mergedTasks.push(tasks[0]);
      return;
    }

    changed = true;

    const sorted = tasks.slice().sort((a, b) => {
      const ak = `${a.createdAt || ''}|${a.updatedAt || ''}|${a.id || ''}`;
      const bk = `${b.createdAt || ''}|${b.updatedAt || ''}|${b.id || ''}`;
      return ak.localeCompare(bk);
    });

    const main = sorted[0];

    const allApprovedIds = [];
    const allApprovedNames = [];
    const allPendingClaims = [];
    const allProgress = [];

    sorted.forEach((task) => {
      if (String(task.id) !== String(main.id)) {
        duplicateIdToMainId[String(task.id)] = String(main.id);
      }

      xyTaskApprovedIdsForMerge(task).forEach((id) => allApprovedIds.push(id));
      xyTaskApprovedNamesForMerge(db, task).forEach((name) => allApprovedNames.push(name));
      xyTaskPendingClaimsForMerge(db, task).forEach((claim) => allPendingClaims.push(claim));

      const p = Number(task.progress);
      if (Number.isFinite(p)) {
        allProgress.push(Math.max(0, Math.min(100, Math.round(p))));
      }

      if (!main.department && task.department) main.department = task.department;
      if (!main.contact && task.contact) main.contact = task.contact;
      if (!main.expectedDate && task.expectedDate) main.expectedDate = task.expectedDate;

      if (!main.remark && task.remark) {
        main.remark = task.remark;
      } else if (task.remark && main.remark && !String(main.remark).includes(String(task.remark))) {
        main.remark = `${main.remark}；${task.remark}`;
      }
    });

    const approvedIds = xyUniqueForMerge(allApprovedIds);
    const approvedNames = xyUniqueForMerge(allApprovedNames);

    const seenPending = new Set();
    const pendingClaims = allPendingClaims.filter((claim) => {
      const key = String(claim.userId || claim.userName || '').trim();
      if (!key || seenPending.has(key)) return false;
      seenPending.add(key);
      return true;
    });

    main.claimedByUserIds = approvedIds;
    main.claimedByUserId = approvedIds[0] || '';

    main.assigneeNames = approvedNames;
    main.assigneeName = approvedNames.join('、');

    main.pendingClaims = pendingClaims;

    if (pendingClaims.length) {
      main.pendingClaimUserId = pendingClaims[0].userId || '';
      main.pendingClaimName = pendingClaims[0].userName || '';
      main.pendingClaimAt = pendingClaims[0].createdAt || '';
    } else {
      delete main.pendingClaimUserId;
      delete main.pendingClaimName;
      delete main.pendingClaimAt;
    }

    if (allProgress.length) {
      main.progress = Math.min(...allProgress);
    }

    const progress = Number(main.progress);

    if (Number.isFinite(progress) && progress >= 100) {
      main.status = '已完成';
      main.claimOpen = false;
      main.claimClosed = true;
    } else if (Number.isFinite(progress) && progress > 0) {
      main.status = '进行中';
    } else if (approvedIds.length || approvedNames.length) {
      main.status = '已认领';
    } else {
      main.status = '待认领';
    }

    /*
     * 如果多个重复任务里有任意一个仍开放认领，则合并后的任务继续开放；
     * 如果全部都关闭，则保持关闭。
     */
    const anyOpen = sorted.some((task) => task.claimOpen === true || task.claimClosed === false);
    const allClosed = sorted.every((task) => task.claimClosed === true || task.claimOpen === false);

    if (anyOpen) {
      main.claimOpen = true;
      main.claimClosed = false;
    } else if (allClosed) {
      main.claimOpen = false;
      main.claimClosed = true;
    }

    main.mergedDuplicateTaskIds = xyUniqueForMerge([
      ...(Array.isArray(main.mergedDuplicateTaskIds) ? main.mergedDuplicateTaskIds : []),
      ...sorted.map((task) => task.id)
    ]);

    main.updatedAt = now();

    mergedTasks.push(main);
  });

  /*
   * 非重复标题任务也要保留。
   */
  const duplicateKeys = new Set([...groups.entries()].filter(([, list]) => list.length > 1).map(([key]) => key));

  db.taskPool.forEach((task) => {
    const key = xyTaskTitleKeyForMerge(task.title);
    if (!key || !groups.has(key)) {
      mergedTasks.push(task);
      return;
    }

    if (!duplicateKeys.has(key)) return;
  });

  if (changed) {
    const keepIds = new Set(mergedTasks.map((task) => String(task.id)));

    db.taskPool = mergedTasks.filter((task, index, arr) => {
      return arr.findIndex((x) => String(x.id) === String(task.id)) === index;
    });

    /*
     * 把日报里指向重复任务的 taskId 同步到合并后的主任务。
     */
    (db.dailyTasks || []).forEach((daily) => {
      ['taskId', 'taskPoolId', 'relatedTaskId', 'poolTaskId'].forEach((field) => {
        if (daily[field] && duplicateIdToMainId[String(daily[field])]) {
          daily[field] = duplicateIdToMainId[String(daily[field])];
        }
      });

      const mainTask = db.taskPool.find((task) => {
        return String(task.id) === String(
          daily.taskId ||
          daily.taskPoolId ||
          daily.relatedTaskId ||
          daily.poolTaskId ||
          ''
        );
      });

      if (mainTask && mainTask.title) {
        daily.taskTitle = mainTask.title;
      }
    });
  }

  return db;
}

app.use('/admin/task-pool', (req, res, next) => {
  try {
    const db = readDb();

    const before = JSON.stringify((db.taskPool || []).map((t) => ({
      id: t.id,
      title: t.title,
      assigneeName: t.assigneeName,
      claimedByUserIds: t.claimedByUserIds,
      pendingClaims: t.pendingClaims
    })));

    xyMergeDuplicateTasksByTitle(db);

    const after = JSON.stringify((db.taskPool || []).map((t) => ({
      id: t.id,
      title: t.title,
      assigneeName: t.assigneeName,
      claimedByUserIds: t.claimedByUserIds,
      pendingClaims: t.pendingClaims
    })));

    if (before !== after) {
      writeDb(db);
    }
  } catch (error) {
    console.error('自动合并重复任务失败：', error);
  }

  next();
});



// XY_TASK_TITLE_CONTENT_LIMIT_MIDDLEWARE
app.use('/admin/task-pool', (req, res, next) => {
  try {
    if (req.method === 'POST') {
      const titleField = ['title', 'taskTitle', 'name'].find((key) => req.body && req.body[key] !== undefined);
      const rawTitle = titleField ? String(req.body[titleField] || '').trim() : '';

      if (titleField) {
        req.body[titleField] = rawTitle;
      }

      if (rawTitle && Array.from(rawTitle).length > 15) {
        return res.status(400).send(`
          <!doctype html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>任务标题过长</title>
          <link rel="stylesheet" href="/admin-taskpool-template.css?v=2026070713">
<link rel="stylesheet" href="/admin-taskpool-version-edit.css?v=2026070601">
<link rel="stylesheet" href="/xy-font-only.css?v=2026070602">
<link rel="stylesheet" href="/admin-daily-match-taskpool.css?v=2026070602">
<link rel="stylesheet" href="/ui-system-polish.css?v=2026070601">
<link rel="stylesheet" href="/boss4-unified-nav.css?v=2026070606">
<link rel="stylesheet" href="/intern-taskpool-version-sync.css?v=2026070601">
<link rel="stylesheet" href="/admin-taskpool-content-panel.css?v=2026070602">
</head>
          <body>
            <script>
              alert('任务标题不能超过15字，请返回修改。');
              history.back();
            </script>
          <script src="/sidebar-bottom-font.js?v=2026070301"></script>
<script src="/intern-daily-multi-task.js?v=2026070708"></script>
<script src="/intern-sidebar-order.js?v=2026070301"></script>
<script src="/intern-remove-old-progress-row.js?v=2026070708"></script>
<script src="/admin-taskpool-template.js?v=2026070708"></script>
<script src="/admin-taskpool-remove-claim-status.js?v=2026070301"></script>
<script src="/admin-taskpool-version-edit.js?v=2026070601"></script>
<script src="/admin-daily-match-taskpool.js?v=2026070602"></script>
<script src="/intern-taskpool-version-sync.js?v=2026070601"></script>
<script src="/admin-taskpool-content-panel.js?v=2026070603"></script>
</body>
          </html>
        `);
      }

      // 兼容新字段：页面显示“任务内容”，内部复用 remark 字段保存，避免破坏旧数据。
      if (req.body) {
        if (req.body.taskContent !== undefined && req.body.remark === undefined) {
          req.body.remark = req.body.taskContent;
        }

        if (req.body.content !== undefined && req.body.remark === undefined) {
          req.body.remark = req.body.content;
        }
      }
    }
  } catch (error) {
    console.error('任务标题/任务内容校验失败：', error);
  }

  next();
});



// XY_TASK_POOL_CONTENT_ONLY_MIDDLEWARE
app.use('/admin/task-pool', (req, res, next) => {
  try {
    if (req.method === 'POST' && req.body) {
      const titleField = ['title', 'taskTitle', 'name'].find((key) => req.body[key] !== undefined);
      const rawTitle = titleField ? String(req.body[titleField] || '').trim() : '';

      if (titleField) {
        req.body[titleField] = rawTitle;
      }

      if (rawTitle && Array.from(rawTitle).length > 15) {
        return res.status(400).send(`
          <!doctype html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>任务标题过长</title>
          <link rel="stylesheet" href="/admin-taskpool-template.css?v=2026070713">
<link rel="stylesheet" href="/admin-taskpool-version-edit.css?v=2026070601">
<link rel="stylesheet" href="/xy-font-only.css?v=2026070602">
<link rel="stylesheet" href="/admin-daily-match-taskpool.css?v=2026070602">
<link rel="stylesheet" href="/ui-system-polish.css?v=2026070601">
<link rel="stylesheet" href="/boss4-unified-nav.css?v=2026070606">
<link rel="stylesheet" href="/intern-taskpool-version-sync.css?v=2026070601">
<link rel="stylesheet" href="/admin-taskpool-content-panel.css?v=2026070602">
</head>
          <body>
            <script>
              alert('任务标题不能超过15字，请返回修改。');
              history.back();
            </script>
          <script src="/sidebar-bottom-font.js?v=2026070301"></script>
<script src="/intern-daily-multi-task.js?v=2026070708"></script>
<script src="/intern-sidebar-order.js?v=2026070301"></script>
<script src="/intern-remove-old-progress-row.js?v=2026070708"></script>
<script src="/admin-taskpool-template.js?v=2026070708"></script>
<script src="/admin-taskpool-remove-claim-status.js?v=2026070301"></script>
<script src="/admin-taskpool-version-edit.js?v=2026070601"></script>
<script src="/admin-daily-match-taskpool.js?v=2026070602"></script>
<script src="/intern-taskpool-version-sync.js?v=2026070601"></script>
<script src="/admin-taskpool-content-panel.js?v=2026070603"></script>
</body>
          </html>
        `);
      }

      const rawContent =
        req.body.taskContent !== undefined ? req.body.taskContent :
        req.body.remark !== undefined ? req.body.remark :
        req.body.content !== undefined ? req.body.content :
        req.body.description !== undefined ? req.body.description :
        '';

      const taskContent = String(rawContent || '').trim();

      req.body.taskContent = taskContent;
      req.body.remark = taskContent;

      const pathMatch = req.path.match(/^\/([^\/?#]+)/);
      const possibleTaskId = pathMatch ? decodeURIComponent(pathMatch[1]) : '';

      res.on('finish', () => {
        try {
          if (res.statusCode >= 400) return;
          if (!taskContent && !rawTitle) return;
          if (typeof readDb !== 'function' || typeof writeDb !== 'function') return;

          const db = readDb();
          const tasks = db.taskPool || db.tasks || [];
          if (!Array.isArray(tasks)) return;

          let target = null;

          if (possibleTaskId && !['new', 'create', 'add'].includes(possibleTaskId)) {
            target = tasks.find((t) => String(t.id) === String(possibleTaskId));
          }

          if (!target && rawTitle) {
            const sameTitle = tasks
              .filter((t) => String(t.title || t.taskTitle || '').trim() === rawTitle)
              .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

            target = sameTitle[0] || null;
          }

          if (target) {
            target.taskContent = taskContent;
            target.remark = taskContent;
            target.updatedAt = target.updatedAt || new Date().toISOString();
            writeDb(db);
          }
        } catch (error) {
          console.error('同步任务总表 taskContent 失败：', error);
        }
      });
    }
  } catch (error) {
    console.error('任务总表标题/内容校验失败：', error);
  }

  next();
});



// XY_TASK_POOL_REMARK_RESPONSE_PATCH
// 只修复管理员任务总表页面：把页面中“备注”统一改为“任务内容”
app.use('/admin/task-pool', (req, res, next) => {
  try {
    if (req.method === 'GET') {
      const oldSend = res.send.bind(res);

      res.send = function patchedTaskPoolSend(body) {
        try {
          const isBuffer = Buffer.isBuffer(body);
          let html = isBuffer ? body.toString('utf8') : body;

          if (
            typeof html === 'string' &&
            html.includes('任务列表') &&
            html.includes('任务标题')
          ) {
            html = html.replace(/备注/g, '任务内容');

            body = isBuffer ? Buffer.from(html, 'utf8') : html;
          }
        } catch (error) {
          console.error('任务总表备注替换失败：', error);
        }

        return oldSend(body);
      };
    }
  } catch (error) {
    console.error('任务总表页面响应修复失败：', error);
  }

  next();
});

app.get('/admin/task-pool', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const q = {
    keyword: (req.query.keyword || '').trim(),
    status: (req.query.status || '').trim()
  };
  let tasks = db.taskPool.slice();
  if (q.keyword) {
    tasks = tasks.filter((t) => [t.department, t.contact, t.title, t.assigneeName, t.pendingClaimName, t.remark].some((v) => String(v || '').includes(q.keyword)));
  }
  if (q.status) tasks = tasks.filter((t) => taskStatusLabel(t) === q.status || t.status === q.status);
  tasks = tasks.sort((a, b) => taskSortWeight(a) - taskSortWeight(b) || String(a.expectedDate || '').localeCompare(String(b.expectedDate || '')));
  const pendingCount = db.taskPool.filter((t) => taskPendingClaims(t, db).length).length;
  const unclaimedCount = db.taskPool.filter((t) => isTaskUnclaimed(t)).length;
  const claimedCount = db.taskPool.filter((t) => taskHasApprovedAssignee(t)).length;
  const rows = tasks.length ? tasks.map((task) => {
    const status = taskStatusLabel(task);
    const approvalActions = renderTaskApprovalActions(task, db);
    return `<tr>
      <td>${escapeHtml(task.department || '-')}</td>
      <td>${escapeHtml(task.contact || '-')}</td>
      <td>${escapeHtml(task.title || '-')}</td>
      <td>${escapeHtml(task.expectedDate || '-')}</td>
      <td>${escapeHtml(status)}</td>
      <td>${escapeHtml(taskDisplayAssignee(task))}</td>
      <td>${escapeHtml(task.taskContent || task.remark || '-')}</td>
      <td class="actions-cell">
        ${approvalActions}
        <a class="link-button" href="/admin/task-pool/${task.id}/edit">编辑</a>
        <form method="post" action="/admin/task-pool/${task.id}/delete" class="inline-form" onsubmit="return confirm('确认删除该任务吗？');"><button class="ghost small" type="submit">删除</button></form>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="9" class="empty">暂无任务。</td></tr>';

  res.send(layout({
    title: '',
    user: req.user,
    content: `
<style>
/* 管理员任务总表专项精简：不改任务列表表格内容 */
.xy-admin-taskpool-main-title {
  margin-top: 0 !important;
  margin-bottom: 14px !important;
  padding: 22px 26px !important;
}

.xy-admin-taskpool-main-title h1 {
  font-size: 26px !important;
  margin-bottom: 6px !important;
}

.xy-admin-taskpool-main-title p {
  font-size: 14px !important;
  margin: 0 !important;
}

.stats.three {
  margin-top: 12px !important;
  margin-bottom: 16px !important;
}

.stats.three .stat-card {
  min-height: 82px !important;
  padding: 16px 20px !important;
}

.stats.three .stat-card strong {
  font-size: 26px !important;
}

.card:has(.filter-form.compact-filter) h2 {
  display: none !important;
}

.card:has(.filter-form.compact-filter) {
  padding-top: 16px !important;
  padding-bottom: 16px !important;
}

.filter-form.compact-filter {
  display: grid !important;
  grid-template-columns: 1.4fr 220px 220px 160px !important;
  gap: 12px !important;
  align-items: center !important;
}

.filter-form.compact-filter input,
.filter-form.compact-filter select,
.filter-form.compact-filter button,
.filter-form.compact-filter a {
  height: 42px !important;
}
</style>

<section class="page-title xy-admin-taskpool-main-title">
      <div><h1>任务总表</h1><p>管理员可编辑任务总表，并审核实习生的认领申请。管理员同意前，任务仍对其他实习生开放。</p></div>
      <a class="primary" href="/admin/task-pool/new">新增任务</a>
    </section>
    <section class="stats three">
      <div class="stat-card"><span>待审核认领</span><strong>${pendingCount}</strong></div>
      <div class="stat-card"><span>可认领任务</span><strong>${unclaimedCount}</strong></div>
      <div class="stat-card"><span>已认领/进行中</span><strong>${claimedCount}</strong></div>
    </section>
    <section class="card">
      <h2>筛选任务</h2>
      <form method="get" action="/admin/task-pool" class="filter-form compact-filter">
        <input name="keyword" placeholder="按部门/对接人/任务/认领人" value="${escapeHtml(q.keyword)}" />
        <select name="status">
          <option value="">全部状态</option>
          ${['已完成', '进行中', '已认领', '待管理员审核', '待认领', '暂停'].map((x) => `<option value="${x}" ${q.status === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select>
        <button class="primary" type="submit">筛选</button>
        <a class="ghost-link" href="/admin/task-pool">重置</a>
      </form>
    </section>
    <section class="card wide-card">
      <h2>任务列表</h2>
      <table class="task-pool-table">
        <thead><tr><th>需求部门</th><th>对接人</th><th>任务标题</th><th>期望完成日期</th><th>状态</th><th>认领/申请人</th><th>任务内容</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`
  }));
});

app.get('/admin/task-pool/new', requireLogin, requireAdmin, (req, res) => {
  res.send(adminTaskForm({ user: req.user }));
});


app.post('/admin/task-pool', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const requiredFields = [['department', '需求部门'], ['contact', '对接人'], ['title', '任务标题'], ['expectedDate', '期望完成日期'], ['status', '状态']];
  for (const [field, label] of requiredFields) {
    if (String(req.body[field] ?? '').trim() === '') return res.status(400).send(`请填写必填项：${label}`);
  }
  const assigneeNames = normalizeAssigneeNames(req.body.assigneeNames || req.body.assigneeName);
  const task = {
    id: id(),
    department: normalizeDepartment(req.body.department),
    contact: req.body.contact || '',
    title: req.body.title || '',
    expectedDate: req.body.expectedDate || '',
    assigneeName: '',
    assigneeNames: [],
    claimedByUserId: '',
    claimedByUserIds: [],
    claimDate: '',
    status: req.body.status || '待认领',
    remark: req.body.remark || '',
    createdAt: now(),
    updatedAt: now()
  };
  setTaskAssignees(task, db, assigneeNames);
  if (!assigneeNames.length) task.status = req.body.status || '待认领';
  db.taskPool.push(task);
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/task-pool');
});


app.get('/admin/task-pool/:id/edit', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('任务不存在');
  res.send(adminTaskForm({ user: req.user, task }));
});


app.post('/admin/task-pool/:id', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('任务不存在');

  const requiredFields = [
    ['department', '需求部门'],
    ['contact', '对接人'],
    ['title', '任务标题'],
    ['expectedDate', '期望完成日期'],
    ['status', '状态'],];

  for (const [field, label] of requiredFields) {
    if (String(req.body[field] ?? '').trim() === '') {
      return res.status(400).send(`请填写必填项：${label}`);
    }
  }

  const manualStatus = String(req.body.status || '').trim();

  const rawAssignees = req.body.assigneeNames || req.body.assigneeName || [];
  const assigneeNames = Array.isArray(rawAssignees)
    ? rawAssignees.map((x) => String(x || '').trim()).filter(Boolean)
    : String(rawAssignees || '').split(/[,，、;；]+/).map((x) => x.trim()).filter(Boolean);

  const uniqueAssigneeNames = [...new Set(assigneeNames)];
  const interns = db.users.filter((u) => u.role === 'intern');

  const assigneeIds = uniqueAssigneeNames
    .map((name) => interns.find((u) => u.realName === name)?.id)
    .filter(Boolean);

  task.department = typeof normalizeDepartment === 'function'
    ? normalizeDepartment(req.body.department)
    : req.body.department;

  task.contact = req.body.contact || '';
  task.title = req.body.title || '';
  task.expectedDate = req.body.expectedDate || '';
  task.remark = req.body.remark || '';
  task.updatedAt = now();

  /*
   * 认领人同步：
   * - 可为空
   * - 可 1 人
   * - 可多人
   */
  task.assigneeNames = uniqueAssigneeNames;
  task.assigneeName = uniqueAssigneeNames.join(',');
  task.claimedByUserIds = assigneeIds;
  task.claimedByUserId = assigneeIds[0] || '';

  if (assigneeIds.length > 0) {
    task.claimDate = task.claimDate || today();
  }

  /*
   * 关键修复：
   * 状态必须以编辑页面手动选择的 status 为准。
   * 避免 setTaskAssignees / 认领逻辑覆盖成旧状态。
   */
  task.status = manualStatus;

  /*
   * 根据状态同步进度与认领开放状态。
   */
  if (manualStatus === '待认领') {
    task.progress = 0;
    task.claimOpen = true;
    task.claimClosed = false;

    // 如果管理员手动改回待认领，默认清空正式认领人，重新开放
    task.assigneeNames = [];
    task.assigneeName = '';
    task.claimedByUserIds = [];
    task.claimedByUserId = '';
    task.claimDate = '';

    if (typeof setTaskPendingClaims === 'function') {
      setTaskPendingClaims(task, []);
    } else {
      task.pendingClaims = [];
      delete task.pendingClaimUserId;
      delete task.pendingClaimName;
      delete task.pendingClaimAt;
    }
  }

  if (manualStatus === '已认领') {
    task.progress = Number.isFinite(Number(task.progress)) ? Number(task.progress) : 0;
    if (task.progress > 0 && task.progress >= 100) task.progress = 0;
    task.claimOpen = task.claimOpen === true;
    task.claimClosed = task.claimOpen ? false : true;
  }

  if (manualStatus === '进行中') {
    const currentProgress = Number(task.progress);
    if (!Number.isFinite(currentProgress) || currentProgress <= 0 || currentProgress >= 100) {
      task.progress = 50;
    }
    task.claimOpen = task.claimOpen === true;
    task.claimClosed = task.claimOpen ? false : true;
  }

  if (manualStatus === '已完成') {
    task.progress = 100;
    task.claimOpen = false;
    task.claimClosed = true;

    if (typeof setTaskPendingClaims === 'function') {
      setTaskPendingClaims(task, []);
    } else {
      task.pendingClaims = [];
      delete task.pendingClaimUserId;
      delete task.pendingClaimName;
      delete task.pendingClaimAt;
    }
  }

  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/task-pool?updated=1');
});







app.post('/admin/task-pool/:id/approve/:userKey', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('任务不存在');

  const userKey = decodeURIComponent(req.params.userKey);
  const claims = taskPendingClaims(task, db);
  const claim = claims.find((item) => item.userId === userKey || item.realName === userKey);

  const intern = db.users.find((u) =>
    u.role === 'intern' &&
    (
      u.id === userKey ||
      u.realName === userKey ||
      u.id === claim?.userId ||
      u.realName === claim?.realName
    )
  );

  if (!intern) return res.redirect('/admin/task-pool');

  const names = taskApprovedNames(task);
  const ids = taskApprovedUserIds(task);

  if (!names.includes(intern.realName)) names.push(intern.realName);
  if (!ids.includes(intern.id)) ids.push(intern.id);

  task.assigneeNames = names;
  task.assigneeName = names.join(',');
  task.claimedByUserIds = ids;
  task.claimedByUserId = ids[0] || intern.id;
  task.claimDate = today();
  task.status = '已认领';
  task.updatedAt = now();

  // 管理员同意后，该任务才对其他实习生不可见，所以清空所有待审核申请
  setTaskPendingClaims(task, []);

  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/task-pool');
});

app.post('/admin/task-pool/:id/reject/:userKey', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('任务不存在');

  const userKey = decodeURIComponent(req.params.userKey);
  const nextClaims = taskPendingClaims(task, db).filter((claim) => {
    return claim.userId !== userKey && claim.realName !== userKey;
  });

  setTaskPendingClaims(task, nextClaims);

  if (!taskHasApprovedAssignee(task)) {
    task.status = '待认领';
  }

  task.updatedAt = now();
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/task-pool');
});



app.post('/admin/task-pool/:id/approve-open/:userKey', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('任务不存在');

  const userKey = decodeURIComponent(req.params.userKey);
  const claim = taskPendingClaims(task, db).find((item) => item.userId === userKey || item.realName === userKey);

  const intern = db.users.find((u) =>
    u.role === 'intern' &&
    (
      u.id === userKey ||
      u.realName === userKey ||
      u.id === claim?.userId ||
      u.realName === claim?.realName
    )
  );

  if (!intern) return res.redirect('/admin/task-pool');

  approveClaimOnTask(task, intern, db, true);
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/task-pool');
});

app.post('/admin/task-pool/:id/approve-close/:userKey', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('任务不存在');

  const userKey = decodeURIComponent(req.params.userKey);
  const claim = taskPendingClaims(task, db).find((item) => item.userId === userKey || item.realName === userKey);

  const intern = db.users.find((u) =>
    u.role === 'intern' &&
    (
      u.id === userKey ||
      u.realName === userKey ||
      u.id === claim?.userId ||
      u.realName === claim?.realName
    )
  );

  if (!intern) return res.redirect('/admin/task-pool');

  approveClaimOnTask(task, intern, db, false);
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/task-pool');
});

app.post('/admin/task-pool/:id/open-claims', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('任务不存在');

  if (task.status !== '已完成') {
    task.claimOpen = true;
    task.claimClosed = false;
    task.updatedAt = now();
  }

  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/task-pool');
});

app.post('/admin/task-pool/:id/close-claims', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('任务不存在');

  task.claimOpen = false;
  task.claimClosed = true;
  setTaskPendingClaims(task, []);
  task.updatedAt = now();

  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/task-pool');
});


app.post('/admin/task-pool/:id/approve', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('任务不存在');

  const firstClaim = taskPendingClaims(task, db)[0];
  if (!firstClaim) return res.redirect('/admin/task-pool');

  const intern = db.users.find((u) =>
    u.role === 'intern' &&
    (u.id === firstClaim.userId || u.realName === firstClaim.realName)
  );

  if (!intern) return res.redirect('/admin/task-pool');

  approveClaimOnTask(task, intern, db, false);
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/task-pool');
});



app.post('/admin/task-pool/:id/reject', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).send('任务不存在');

  setTaskPendingClaims(task, []);

  if (!taskHasApprovedAssignee(task)) {
    task.status = '待认领';
    task.claimOpen = true;
    task.claimClosed = false;
  }

  task.updatedAt = now();
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/task-pool');
});



app.post('/admin/task-pool/:id/delete', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();
  db.taskPool = db.taskPool.filter((t) => t.id !== req.params.id);
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/task-pool');
});

app.get('/boss/reports/:id', requireLogin, requireBoss, (req, res) => {
  const db = readDb();
  const report = db.reports.find((r) => r.id === req.params.id);
  if (!report) return res.status(404).send('周报不存在');
  const intern = db.users.find((u) => u.id === report.userId);
  const feedbacks = db.feedbacks.filter((f) => f.reportId === report.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  res.send(layout({
    title: '查看周报',
    user: req.user,
    content: `<section class="page-title">
        <div><h1>${escapeHtml(intern.realName)}的周报</h1><p>${escapeHtml(intern.position)} · ${escapeHtml(report.weekStart)} 至 ${escapeHtml(report.weekEnd)} · ${statusBadge(report.status)}</p></div>
        <a class="ghost-link" href="/boss/dashboard">返回列表</a>
      </section>
      <section class="card report-detail">
        <h2>本周工作内容</h2><p>${nl2br(report.workContent)}</p>
        <h2>本周成果</h2><p>${nl2br(report.achievements)}</p>
        <h2>遇到的问题</h2><p>${nl2br(report.problems || '无')}</p>
        <h2>解决方案 / 思考</h2><p>${nl2br(report.solutions || '无')}</p>
        <h2>下周计划</h2><p>${nl2br(report.nextPlan)}</p>
        <h2>需要的支持</h2><p>${nl2br(report.supportNeeded || '无')}</p>
      </section>
      <section class="card">
        <h2>反馈</h2>
        <form method="post" action="/boss/reports/${report.id}/feedback" class="form">
          <label>反馈内容<textarea name="comment" rows="4" placeholder="填写评价或建议"></textarea></label>
          <div class="actions">
            <button class="primary" name="action" value="approved" type="submit">通过</button>
          </div>
        </form>
        <div class="feedback-list">
          ${feedbacks.length ? feedbacks.map((f) => `<div class="feedback"><div class="feedback-head">${statusText(f.action)} · ${escapeHtml(f.createdAt.slice(0, 10))}</div><p>${escapeHtml(f.comment || '无文字反馈')}</p></div>`).join('') : '<p class="muted">暂无反馈。</p>'}
        </div>
      </section>`
  }));
});

app.post('/boss/reports/:id/feedback', requireLogin, requireBoss, (req, res) => {
  const db = readDb();
  const report = db.reports.find((r) => r.id === req.params.id);
  if (!report) return res.status(404).send('周报不存在');
  const action = 'approved';
  report.status = action;
  report.updatedAt = now();
  db.feedbacks.push({
    id: id(),
    reportId: report.id,
    bossId: req.user.id,
    comment: req.body.comment || '',
    action,
    createdAt: now()
  });
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect(`/boss/reports/${report.id}`);
});

app.get('/admin/users', requireLogin, requireAccountManager, (req, res) => {
  const db = readDb();
  const interns = db.users.filter((u) => u.role === 'intern');
  const rows = interns.length
    ? interns.map((u) => `<tr>
        <td>${escapeHtml(u.realName)}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.position)}</td>
        <td>${escapeHtml((u.createdAt || '').slice(0, 10))}</td>
        <td><a class="link-button" href="/admin/users/${u.id}/edit">修改 / 重置密码</a></td>
        <td>
          <form method="post" action="/admin/users/${u.id}/delete" class="inline-form" onsubmit="return confirm('确认删除该实习生账号吗？该实习生的日报、周报也会同步删除。');">
            <button class="danger small" type="submit">删除</button>
          </form>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="empty">暂无实习生账号。</td></tr>';
  const success = req.query.created
    ? '<div class="alert success">实习生账号已创建。</div>'
    : (req.query.updated ? '<div class="alert success">实习生账号信息已更新。</div>' : (req.query.deleted ? '<div class="alert success">实习生账号已删除。</div>' : ''));
  res.send(layout({
    title: '账号管理',
    user: req.user,
    content: `<section class="page-title"><div><h1>实习生账号管理</h1><p>管理员和老板可新增、修改实习生账号；实习生只能修改自己的密码。</p></div></section>
      ${success}
      <section class="card">
        <h2>新增实习生</h2>
        <form method="post" action="/admin/users" class="filter-form user-form">
          <input name="realName" placeholder="姓名，例如：王五" required />
          <input name="position" placeholder="职位，例如：AI工程师实习生" required />
          <input name="username" placeholder="账号，例如：wangwu" required />
          <input name="password" placeholder="初始密码" required />
          <button class="primary" type="submit">创建账号</button>
        </form>
      </section>
      <section class="card">
        <h2>实习生列表</h2>
        <table><thead><tr><th>姓名</th><th>账号</th><th>职位</th><th>创建时间</th><th>操作</th><th>删除</th></tr></thead><tbody>${rows}</tbody></table>
      </section>`
  }));
});




app.post('/admin/users/:id/delete', requireLogin, requireAccountManager, (req, res) => {
  const db = readDb();
  const intern = db.users.find((u) => u.id === req.params.id && u.role === 'intern');
  if (!intern) return res.status(404).send('实习生账号不存在');

  const internId = intern.id;
  const internName = intern.realName;

  // 1. 删除实习生账号
  db.users = db.users.filter((u) => u.id !== internId);

  // 2. 删除该实习生的日报
  if (Array.isArray(db.dailyTasks)) {
    db.dailyTasks = db.dailyTasks.filter((t) => t.userId !== internId);
  }

  // 3. 删除该实习生的周报，以及对应反馈
  let deletedReportIds = [];
  if (Array.isArray(db.reports)) {
    deletedReportIds = db.reports
      .filter((r) => r.userId === internId)
      .map((r) => r.id);
    db.reports = db.reports.filter((r) => r.userId !== internId);
  }

  if (Array.isArray(db.feedbacks)) {
    db.feedbacks = db.feedbacks.filter((f) => !deletedReportIds.includes(f.reportId));
  }

  // 4. 从任务总表认领人中移除该实习生
  if (Array.isArray(db.taskPool)) {
    db.taskPool.forEach((task) => {
      if (Array.isArray(task.assigneeNames)) {
        task.assigneeNames = task.assigneeNames.filter((name) => name !== internName);
      }

      if (typeof task.assigneeName === 'string') {
        task.assigneeName = task.assigneeName
          .split(/[,，、;；]+/)
          .map((x) => x.trim())
          .filter((x) => x && x !== internName)
          .join(',');
      }

      if (Array.isArray(task.claimedByUserIds)) {
        task.claimedByUserIds = task.claimedByUserIds.filter((id) => id !== internId);
      }

      if (task.claimedByUserId === internId) {
        task.claimedByUserId = Array.isArray(task.claimedByUserIds) && task.claimedByUserIds.length
          ? task.claimedByUserIds[0]
          : '';
      }

      if (task.pendingClaimUserId === internId) {
        delete task.pendingClaimUserId;
        delete task.pendingClaimName;
        delete task.pendingClaimAt;
      }

      const hasAssignee =
        (Array.isArray(task.claimedByUserIds) && task.claimedByUserIds.length > 0) ||
        (Array.isArray(task.assigneeNames) && task.assigneeNames.length > 0) ||
        String(task.assigneeName || '').trim();

      if (!hasAssignee && !['已完成', '进行中'].includes(task.status)) {
        task.status = '待认领';
        task.claimDate = '';
      }

      task.updatedAt = now();
    });
  }

  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/users?deleted=1');
});

app.get('/admin/users/:id/edit', requireLogin, requireAccountManager, (req, res) => {
  const db = readDb();
  const intern = db.users.find((u) => u.id === req.params.id && u.role === 'intern');
  if (!intern) return res.status(404).send('实习生账号不存在');
  const errorMap = {
    duplicate: '账号已存在，请换一个账号名。',
    short: '新密码至少需要 6 位；不修改密码可留空。'
  };
  const error = req.query.error ? `<div class="alert error">${escapeHtml(errorMap[req.query.error] || '修改失败，请重试。')}</div>` : '';
  res.send(layout({
    title: '修改实习生账号',
    user: req.user,
    content: `<section class="page-title">
        <div><h1>修改实习生账号</h1><p>仅管理员和老板可以修改实习生账号信息或重置密码。</p></div>
        <a class="ghost-link" href="/admin/users">返回账号管理</a>
      </section>
      <section class="card">
        ${error}
        <form method="post" action="/admin/users/${intern.id}" class="form">
          <label>姓名<input name="realName" value="${escapeHtml(intern.realName)}" required /></label>
          <label>职位<input name="position" value="${escapeHtml(intern.position)}" required /></label>
          <label>账号<input name="username" value="${escapeHtml(intern.username)}" required /></label>
          <label>重置密码<input type="password" name="password" placeholder="不修改密码请留空；新密码至少 6 位" /></label>
          <div class="actions"><button class="primary" type="submit">保存修改</button></div>
        </form>
      </section>`
  }));
});

app.post('/admin/users/:id', requireLogin, requireAccountManager, (req, res) => {
  const db = readDb();
  const intern = db.users.find((u) => u.id === req.params.id && u.role === 'intern');
  if (!intern) return res.status(404).send('实习生账号不存在');
  const username = (req.body.username || '').trim();
  if (!username || db.users.some((u) => u.username === username && u.id !== intern.id)) {
    return res.redirect(`/admin/users/${intern.id}/edit?error=duplicate`);
  }
  const newPassword = String(req.body.password || '');
  if (newPassword && newPassword.length < 6) {
    return res.redirect(`/admin/users/${intern.id}/edit?error=short`);
  }
  intern.realName = req.body.realName || username;
  intern.position = req.body.position || '实习生';
  intern.username = username;
  if (newPassword) intern.passwordHash = bcrypt.hashSync(newPassword, 10);
  intern.updatedAt = now();
  // 同步历史每日任务中的冗余展示字段，避免改名/改职位后老记录显示不一致。
  db.dailyTasks.forEach((task) => {
    if (task.userId === intern.id) {
      task.userName = intern.realName;
      task.position = intern.position;
    }
  });
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/users?updated=1');
});

app.post('/admin/users', requireLogin, requireAccountManager, (req, res) => {
  const db = readDb();
  const username = (req.body.username || '').trim();
  if (!username || db.users.some((u) => u.username === username)) {
    return res.status(400).send('账号为空或已存在，请返回修改。');
  }
  if (String(req.body.password || '').length < 6) {
    return res.status(400).send('初始密码至少需要 6 位，请返回修改。');
  }
  db.users.push({
    id: id(),
    username,
    passwordHash: bcrypt.hashSync(req.body.password || '123456', 10),
    realName: req.body.realName || username,
    position: req.body.position || '实习生',
    role: 'intern',
    createdAt: now()
  });
  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  res.redirect('/admin/users?created=1');
});

ensureDb();


function clampProgress(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function taskUserIds(task) {
  const ids = [];

  if (task.claimedByUserId) ids.push(task.claimedByUserId);

  if (Array.isArray(task.claimedByUserIds)) {
    task.claimedByUserIds.forEach((id) => {
      if (id) ids.push(id);
    });
  }

  return [...new Set(ids.map(String))];
}

function sameTaskForProgress(daily, task) {
  if (!daily || !task) return false;

  const dailyTaskId =
    daily.taskId ||
    daily.taskPoolId ||
    daily.relatedTaskId ||
    daily.poolTaskId ||
    '';

  if (dailyTaskId && String(dailyTaskId) === String(task.id)) {
    return true;
  }

  const dailyTitle = String(
    daily.taskTitle ||
    daily.relatedTask ||
    daily.relatedTaskTitle ||
    daily.task ||
    daily.title ||
    ''
  ).trim();

  const taskTitle = String(task.title || '').trim();

  return Boolean(dailyTitle && taskTitle && dailyTitle === taskTitle);
}

function dailySortKey(daily) {
  return [
    daily.date || '',
    daily.updatedAt || '',
    daily.createdAt || '',
    daily.id || ''
  ].join('|');
}

function dailyProgressUserKey(daily) {
  return String(
    daily.userId ||
    daily.internId ||
    daily.username ||
    daily.userName ||
    daily.realName ||
    daily.name ||
    daily.internName ||
    ''
  ).trim();
}

function taskHasApprovedAssigneeForProgress(task) {
  return taskUserIds(task).length > 0 ||
    Boolean(String(task.assigneeName || '').trim()) ||
    (Array.isArray(task.assigneeNames) && task.assigneeNames.some((name) => String(name || '').trim()));
}

function taskProgressAssigneeKeys(task) {
  const ids = taskUserIds(task);

  if (ids.length) return ids;

  const names = [];

  if (task.assigneeName) {
    String(task.assigneeName)
      .split(/[,，、;；]+/)
      .map((name) => name.trim())
      .filter(Boolean)
      .forEach((name) => names.push(name));
  }

  if (Array.isArray(task.assigneeNames)) {
    task.assigneeNames
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .forEach((name) => names.push(name));
  }

  return [...new Set(names)];
}

function applyTaskProgressStatusRule(task, progress, latestDailyTasks = []) {
  if (!task || progress === null) return;

  const before = {
    progress: String(task.progress ?? ''),
    overallProgress: String(task.overallProgress ?? ''),
    taskProgress: String(task.taskProgress ?? ''),
    status: String(task.status || ''),
    rule: String(task.progressRule || ''),
    source: String(task.progressSource || ''),
    fromId: String(task.progressUpdatedFromDailyId || ''),
    fromDate: String(task.progressUpdatedFromDailyDate || '')
  };

  task.progress = progress;
  task.overallProgress = progress;
  task.taskProgress = progress;

  if (progress >= 100) {
    task.status = '已完成';
    task.claimOpen = false;
    task.claimClosed = true;

    if (typeof setTaskPendingClaims === 'function') {
      setTaskPendingClaims(task, []);
    } else {
      task.pendingClaims = [];
      delete task.pendingClaimUserId;
      delete task.pendingClaimName;
      delete task.pendingClaimAt;
    }
  } else if (progress > 0) {
    task.status = '进行中';
  } else {
    task.status = taskHasApprovedAssigneeForProgress(task) ? '已认领' : '待认领';
  }

  const assigneeCount = taskProgressAssigneeKeys(task).length;
  task.progressRule = assigneeCount > 1 || latestDailyTasks.length > 1 ? '多人进度取最慢' : '单人进度取最新日报';
  task.progressSource = 'dailyTasks';

  if (latestDailyTasks.length) {
    task.progressUpdatedFromDailyId = latestDailyTasks.map((daily) => daily.id).filter(Boolean).join(',');
    task.progressUpdatedFromDailyDate = latestDailyTasks
      .map((daily) => daily.date || daily.taskDate || daily.dailyDate || '')
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || '';
  }

  const after = {
    progress: String(task.progress ?? ''),
    overallProgress: String(task.overallProgress ?? ''),
    taskProgress: String(task.taskProgress ?? ''),
    status: String(task.status || ''),
    rule: String(task.progressRule || ''),
    source: String(task.progressSource || ''),
    fromId: String(task.progressUpdatedFromDailyId || ''),
    fromDate: String(task.progressUpdatedFromDailyDate || '')
  };

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    task.progressUpdatedAt = now();
    task.updatedAt = task.progressUpdatedAt;
  }
}

function syncTaskPoolProgressFromDailyTasks(db) {
  if (!db || !Array.isArray(db.taskPool) || !Array.isArray(db.dailyTasks)) {
    return db;
  }

  db.taskPool.forEach((task) => {
    const matchedDailyTasks = db.dailyTasks
      .filter((daily) => sameTaskForProgress(daily, task))
      .filter((daily) => clampProgress(daily.progress) !== null)
      .sort((a, b) => dailySortKey(a).localeCompare(dailySortKey(b)));

    if (!matchedDailyTasks.length) {
      const currentProgress = clampProgress(task.progress);

      if (currentProgress !== null) {
        applyTaskProgressStatusRule(task, currentProgress, []);
      }

      return;
    }

    const latestByUser = {};

    matchedDailyTasks.forEach((daily) => {
      const key = dailyProgressUserKey(daily) || `unknown-${daily.id || dailySortKey(daily)}`;
      latestByUser[key] = daily;
    });

    const latestDailyTasks = Object.values(latestByUser);
    const latestProgresses = latestDailyTasks
      .map((daily) => clampProgress(daily.progress))
      .filter((progress) => progress !== null);
    const assigneeKeys = taskProgressAssigneeKeys(task);

    if (assigneeKeys.length > 1) {
      assigneeKeys.forEach((key) => {
        if (!latestByUser[key]) latestProgresses.push(0);
      });
    }

    if (!latestProgresses.length) return;

    applyTaskProgressStatusRule(task, Math.min(...latestProgresses), latestDailyTasks);
  });

  return db;
}


app.get('/admin/task-pool-progress-map', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();

  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') {
    syncTaskPoolProgressFromDailyTasks(db);
    if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  }

  const progressMap = {};
  (db.taskPool || []).forEach((task) => {
    const raw = Number(task.progress);
    progressMap[task.id] = Number.isFinite(raw)
      ? Math.max(0, Math.min(100, Math.round(raw)))
      : 0;
  });

  res.json(progressMap);
});





app.get('/admin/task-pool-progress-map-v2', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();

  if (typeof syncTaskPoolProgressFromDailyTasks === 'function') {
    syncTaskPoolProgressFromDailyTasks(db);
    if (typeof syncTaskPoolProgressFromDailyTasks === 'function') syncTaskPoolProgressFromDailyTasks(db);
  writeDb(db);
  }

  function toProgress(task) {
    const raw = Number(task.progress);

    if (Number.isFinite(raw)) {
      return Math.max(0, Math.min(100, Math.round(raw)));
    }

    if (task.status === '已完成') return 100;
    if (task.status === '进行中') return 50;
    return 0;
  }

  const result = {};

  (db.taskPool || []).forEach((task) => {
    result[task.id] = {
      progress: toProgress(task),
      status: task.status || ''
    };
  });

  res.json(result);
});



function xyEscapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function xyToPercent(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  const text = String(value || '').trim();
  const match = text.match(/(\d{1,3})\s*%?/);
  if (!match) return null;

  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;

  return Math.max(0, Math.min(100, Math.round(n)));
}

function xyDailyTaskTitle(daily) {
  return String(
    daily.taskTitle ||
    daily.relatedTask ||
    daily.relatedTaskTitle ||
    daily.task ||
    daily.title ||
    ''
  ).trim();
}

function xyDailyUserKey(daily) {
  return String(
    daily.userId ||
    daily.userName ||
    daily.realName ||
    daily.name ||
    daily.internName ||
    ''
  ).trim();
}

function xyDailySortKey(daily) {
  return [
    daily.date || '',
    daily.updatedAt || '',
    daily.createdAt || '',
    daily.id || ''
  ].join('|');
}

function xyDailyMatchesTask(daily, task) {
  if (!daily || !task) return false;

  const dailyTaskId =
    daily.taskId ||
    daily.taskPoolId ||
    daily.relatedTaskId ||
    daily.poolTaskId ||
    '';

  if (dailyTaskId && String(dailyTaskId) === String(task.id)) {
    return true;
  }

  const dailyTitle = xyDailyTaskTitle(daily);
  const taskTitle = String(task.title || '').trim();

  return Boolean(dailyTitle && taskTitle && dailyTitle === taskTitle);
}

function xyUserMap(db) {
  const map = {};
  (db.users || []).forEach((u) => {
    map[u.id] = u;
  });
  return map;
}

function xyUserName(db, userId, fallback = '') {
  const users = xyUserMap(db);
  const user = users[userId];
  return user?.realName || user?.username || fallback || '';
}

function xyTaskAssigneeNames(db, task) {
  const users = xyUserMap(db);
  const names = [];

  if (Array.isArray(task.assigneeNames)) {
    task.assigneeNames.forEach((name) => {
      if (name) names.push(String(name).trim());
    });
  }

  if (task.assigneeName) {
    String(task.assigneeName)
      .split(/[,，、;；]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((name) => names.push(name));
  }

  if (Array.isArray(task.claimedByUserIds)) {
    task.claimedByUserIds.forEach((id) => {
      const user = users[id];
      if (user?.realName) names.push(user.realName);
    });
  }

  if (task.claimedByUserId) {
    const user = users[task.claimedByUserId];
    if (user?.realName) names.push(user.realName);
  }

  return [...new Set(names.filter(Boolean))];
}

/*
 * 核心规则：
 * 同一个任务如果多人填写日报进度，先取每个人最新一次日报进度，
 * 再取其中最慢的进度作为任务总表进度。
 */
function xyComputeTaskSlowestProgress(db, task) {
  const matched = (db.dailyTasks || [])
    .filter((daily) => xyDailyMatchesTask(daily, task))
    .filter((daily) => xyToPercent(daily.progress) !== null)
    .sort((a, b) => xyDailySortKey(a).localeCompare(xyDailySortKey(b)));

  const latestByUser = {};

  matched.forEach((daily) => {
    const key = xyDailyUserKey(daily) || `unknown-${daily.id || Math.random()}`;
    latestByUser[key] = daily;
  });

  const latestDailyTasks = Object.values(latestByUser);

  if (latestDailyTasks.length) {
    const progresses = latestDailyTasks
      .map((daily) => xyToPercent(daily.progress))
      .filter((n) => n !== null);
    const assigneeKeys = taskProgressAssigneeKeys(task);

    if (assigneeKeys.length > 1) {
      assigneeKeys.forEach((key) => {
        if (!latestByUser[key]) progresses.push(0);
      });
    }

    if (progresses.length) {
      return {
        progress: Math.min(...progresses),
        latestDailyTasks,
        source: 'daily_slowest'
      };
    }
  }

  const taskProgress = xyToPercent(task.progress);
  if (taskProgress !== null) {
    return {
      progress: taskProgress,
      latestDailyTasks: [],
      source: 'task'
    };
  }

  if (task.status === '已完成') {
    return {
      progress: 100,
      latestDailyTasks: [],
      source: 'status'
    };
  }

  if (task.status === '进行中') {
    return {
      progress: 50,
      latestDailyTasks: [],
      source: 'status'
    };
  }

  return {
    progress: 0,
    latestDailyTasks: [],
    source: 'default'
  };
}

function xySyncTaskProgressBySlowestDaily(db) {
  if (!db || !Array.isArray(db.taskPool)) return db;

  (db.taskPool || []).forEach((task) => {
    const result = xyComputeTaskSlowestProgress(db, task);
    const progress = result.progress;
    applyTaskProgressStatusRule(task, progress, result.latestDailyTasks || []);
  });

  return db;
}

function xyEscapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function xyToPercent(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  const text = String(value || '').trim();
  const match = text.match(/(\d{1,3})\s*%?/);
  if (!match) return null;

  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;

  return Math.max(0, Math.min(100, Math.round(n)));
}

function xyDailyTaskTitle(daily) {
  return String(
    daily.taskTitle ||
    daily.relatedTask ||
    daily.relatedTaskTitle ||
    daily.task ||
    daily.title ||
    ''
  ).trim();
}

function xyDailyUserKey(daily) {
  return String(
    daily.userId ||
    daily.userName ||
    daily.realName ||
    daily.name ||
    daily.internName ||
    ''
  ).trim();
}

function xyDailySortKey(daily) {
  return [
    daily.date || '',
    daily.updatedAt || '',
    daily.createdAt || '',
    daily.id || ''
  ].join('|');
}

function xyDailyMatchesTask(daily, task) {
  if (!daily || !task) return false;

  const dailyTaskId =
    daily.taskId ||
    daily.taskPoolId ||
    daily.relatedTaskId ||
    daily.poolTaskId ||
    '';

  if (dailyTaskId && String(dailyTaskId) === String(task.id)) {
    return true;
  }

  const dailyTitle = xyDailyTaskTitle(daily);
  const taskTitle = String(task.title || '').trim();

  return Boolean(dailyTitle && taskTitle && dailyTitle === taskTitle);
}

function xyUserMap(db) {
  const map = {};
  (db.users || []).forEach((u) => {
    map[u.id] = u;
  });
  return map;
}

function xyUserName(db, userId, fallback = '') {
  const users = xyUserMap(db);
  const user = users[userId];
  return user?.realName || user?.username || fallback || '';
}

function xyTaskAssigneeNames(db, task) {
  const users = xyUserMap(db);
  const names = [];

  if (Array.isArray(task.assigneeNames)) {
    task.assigneeNames.forEach((name) => {
      if (name) names.push(String(name).trim());
    });
  }

  if (task.assigneeName) {
    String(task.assigneeName)
      .split(/[,，、;；]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((name) => names.push(name));
  }

  if (Array.isArray(task.claimedByUserIds)) {
    task.claimedByUserIds.forEach((id) => {
      const user = users[id];
      if (user?.realName) names.push(user.realName);
    });
  }

  if (task.claimedByUserId) {
    const user = users[task.claimedByUserId];
    if (user?.realName) names.push(user.realName);
  }

  return [...new Set(names.filter(Boolean))];
}

/*
 * 核心规则：
 * 同一个任务如果多人填写日报进度，先取每个人最新一次日报进度，
 * 再取其中最慢的进度作为任务总表进度。
 */
function xyComputeTaskSlowestProgress(db, task) {
  const matched = (db.dailyTasks || [])
    .filter((daily) => xyDailyMatchesTask(daily, task))
    .filter((daily) => xyToPercent(daily.progress) !== null)
    .sort((a, b) => xyDailySortKey(a).localeCompare(xyDailySortKey(b)));

  const latestByUser = {};

  matched.forEach((daily) => {
    const key = xyDailyUserKey(daily) || `unknown-${daily.id || Math.random()}`;
    latestByUser[key] = daily;
  });

  const latestDailyTasks = Object.values(latestByUser);

  if (latestDailyTasks.length) {
    const progresses = latestDailyTasks
      .map((daily) => xyToPercent(daily.progress))
      .filter((n) => n !== null);
    const assigneeKeys = taskProgressAssigneeKeys(task);

    if (assigneeKeys.length > 1) {
      assigneeKeys.forEach((key) => {
        if (!latestByUser[key]) progresses.push(0);
      });
    }

    if (progresses.length) {
      return {
        progress: Math.min(...progresses),
        latestDailyTasks,
        source: 'daily_slowest'
      };
    }
  }

  const taskProgress = xyToPercent(task.progress);
  if (taskProgress !== null) {
    return {
      progress: taskProgress,
      latestDailyTasks: [],
      source: 'task'
    };
  }

  if (task.status === '已完成') {
    return {
      progress: 100,
      latestDailyTasks: [],
      source: 'status'
    };
  }

  if (task.status === '进行中') {
    return {
      progress: 50,
      latestDailyTasks: [],
      source: 'status'
    };
  }

  return {
    progress: 0,
    latestDailyTasks: [],
    source: 'default'
  };
}

function xySyncTaskProgressBySlowestDaily(db) {
  if (!db || !Array.isArray(db.taskPool)) return db;

  (db.taskPool || []).forEach((task) => {
    const result = xyComputeTaskSlowestProgress(db, task);
    const progress = result.progress;
    applyTaskProgressStatusRule(task, progress, result.latestDailyTasks || []);
  });

  return db;
}

app.get('/admin/task-progress-force-map', requireLogin, requireAdmin, (req, res) => {
  const db = readDb();

  xySyncTaskProgressBySlowestDaily(db);
  writeDb(db);

  const byId = {};
  const byTitle = {};

  (db.taskPool || []).forEach((task) => {
    const progress = xyToPercent(task.progress) ?? 0;
    byId[String(task.id)] = progress;
    byTitle[String(task.title || '').trim()] = progress;
  });

  res.json({
    byId,
    byTitle
  });
});























app.get('/boss/weekly-management', requireLogin, requireBoss, (req, res) => {
  const db = readDb();

  const reports = Array.isArray(db.reports)
    ? db.reports
    : (Array.isArray(db.weeklyReports) ? db.weeklyReports : []);

  const users = Array.isArray(db.users) ? db.users : [];

  const keyword = String(req.query.keyword || '').trim();
  const statusQuery = String(req.query.status || '').trim();

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function reportName(report) {
    if (report.realName) return report.realName;
    if (report.name) return report.name;
    if (report.username) {
      const user = users.find((u) => u.username === report.username);
      if (user && user.realName) return user.realName;
      return report.username;
    }
    if (report.userId) {
      const user = users.find((u) => String(u.id) === String(report.userId));
      if (user && user.realName) return user.realName;
    }
    return '-';
  }

  function reportPosition(report) {
    if (report.position) return report.position;
    if (report.username) {
      const user = users.find((u) => u.username === report.username);
      if (user && user.position) return user.position;
    }
    return '-';
  }

  function reportPeriod(report) {
    const start = report.weekStart || report.startDate || report.fromDate || report.start || '';
    const end = report.weekEnd || report.endDate || report.toDate || report.end || '';

    if (start || end) return `${start || '-'} 至 ${end || '-'}`;

    return report.period || report.week || '-';
  }

  function statusText(report) {
    const raw = String(report.status || '').trim();

    if (raw.includes('通过') || raw === 'approved') return '已通过';
    if (raw.includes('退') || raw === 'rejected' || raw === 'returned') return '已退回';
    if (raw.includes('提交') || raw === 'submitted') return '已提交';

    return raw || '已提交';
  }

  function statusClass(text) {
    if (text.includes('通过')) return 'approved';
    if (text.includes('退')) return 'rejected';
    return 'submitted';
  }

  const filtered = reports.filter((report) => {
    const name = reportName(report);
    const st = statusText(report);

    const matchKeyword = !keyword || name.includes(keyword);
    const matchStatus = !statusQuery || st === statusQuery || String(report.status || '') === statusQuery;

    return matchKeyword && matchStatus;
  });

  const internCount = users.filter((u) => u.role === 'intern').length;
  const total = reports.length;
  const submitted = reports.filter((r) => statusText(r).includes('提交')).length;
  const approved = reports.filter((r) => statusText(r).includes('通过')).length;
  const rejected = reports.filter((r) => statusText(r).includes('退')).length;
  const bossWeeklyInsights = reportService.buildBossDashboardInsights(db);
  const bossWeeklyInsightStats = viewComponents.statGrid([
    {
      label: '需要支持事项',
      value: bossWeeklyInsights.supportNeededCount,
      tone: bossWeeklyInsights.supportNeededCount ? 'primary' : 'success',
      hint: '点击查看每位实习生的支持内容',
      href: '#support-needed',
      title: '查看需要支持明细'
    }
  ]);
  const bossSupportDetails = viewComponents.supportDetails('需要支持事项明细', bossWeeklyInsights.supportDetails, { id: 'support-needed', collapsed: true });

  const rows = filtered.map((report) => {
    const id = report.id || report._id || report.reportId || '';
    const st = statusText(report);

    return `
      <tr>
        <td>${esc(reportName(report))}</td>
        <td>${esc(reportPosition(report))}</td>
        <td>${esc(reportPeriod(report))}</td>
        <td><span class="xy-boss4-tag ${statusClass(st)}">${esc(st)}</span></td>
        <td>${esc(report.submittedAt || report.updatedAt || report.createdAt || '-')}</td>
        <td>${id ? `<a class="xy-boss4-view-link" href="/boss/reports/${esc(id)}">查看</a>` : '-'}</td>
      </tr>
    `;
  }).join('');

  res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>周报管理 - 实习管理平台</title>
  <link rel="stylesheet" href="/design-tokens.css?v=2026071601" />
  <link rel="stylesheet" href="/styles.css?v=2026071601" />
  <link rel="stylesheet" href="/boss4-unified-nav.css?v=2026070607" />
<link rel="stylesheet" href="/intern-taskpool-version-sync.css?v=2026070601">
<link rel="stylesheet" href="/admin-taskpool-content-panel.css?v=2026070602">
</head>
<body class="xy-boss4-page">
  <aside class="xy-boss4-navrail">
    <div class="xy-boss4-brand">
      <div class="xy-boss4-company">实习管理平台</div>
      <div class="xy-boss4-system">实习生周报系统</div>
    </div>

    <nav class="xy-boss4-function">
      <div class="xy-boss4-title">功能模块</div>
      <a class="xy-boss4-link active" href="/boss/weekly-management">周报管理</a>
      <a class="xy-boss4-link" href="/boss/dashboard">任务总表</a>
    </nav>

    <div class="xy-boss4-account">
      <div class="xy-boss4-title">账号管理</div>
      <a class="xy-boss4-link" href="/change-password">修改密码</a>
      <form method="post" action="/logout" class="xy-boss4-logout-form">
        <button class="xy-boss4-logout-btn" type="submit">退出登录</button>
      </form>
      <div class="xy-boss4-identity">负责人</div>
    </div>
  </aside>

  <main class="xy-boss4-main">
    <section class="xy-boss4-header">
      <h1>周报管理</h1>
      <p>老板端查看所有实习生周报，支持按姓名和状态筛选。</p>
    </section>

    <section class="xy-boss4-stats">
      <div class="xy-boss4-stat">
        <span>实习生人数</span>
        <strong>${internCount}</strong>
      </div>
      <div class="xy-boss4-stat">
        <span>周报总数</span>
        <strong>${total}</strong>
      </div>
      <div class="xy-boss4-stat">
        <span>已提交</span>
        <strong>${submitted}</strong>
      </div>
      <div class="xy-boss4-stat">
        <span>已通过</span>
        <strong>${approved}</strong>
      </div>
      <div class="xy-boss4-stat">
        <span>已退回</span>
        <strong>${rejected}</strong>
      </div>
    </section>

    ${bossWeeklyInsightStats}
    ${bossSupportDetails}

    <section class="xy-boss4-card">
      <h2>筛选周报</h2>
      <p>可按姓名和周报状态快速查看。</p>

      <form class="xy-boss4-filter" method="get" action="/boss/weekly-management">
        <input name="keyword" value="${esc(keyword)}" placeholder="按姓名筛选" />
        <select name="status">
          <option value="">全部状态</option>
          <option value="已提交" ${statusQuery === '已提交' ? 'selected' : ''}>已提交</option>
          <option value="已通过" ${statusQuery === '已通过' ? 'selected' : ''}>已通过</option>
          <option value="已退回" ${statusQuery === '已退回' ? 'selected' : ''}>已退回</option>
        </select>
        <button class="xy-boss4-btn primary" type="submit">筛选</button>
        <a class="xy-boss4-btn default" href="/boss/weekly-management" style="display:flex;align-items:center;text-decoration:none;">重置</a>
      </form>
    </section>

    <section class="xy-boss4-card">
      <h2>周报列表</h2>
      <p>点击查看可进入周报详情。</p>

      <div class="xy-boss4-table-wrap">
        <table class="xy-boss4-table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>职位</th>
              <th>周期</th>
              <th>状态</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" style="padding:32px;color:#999;">暂无周报数据</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  </main>
<script>
  document.addEventListener('click', function(e) {
    var supportLink = e.target.closest('a[href="#support-needed"]');
    if (!supportLink) return;

    var panel = document.getElementById('support-needed');
    if (!panel) return;

    e.preventDefault();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
</script>
<script src="/intern-taskpool-version-sync.js?v=2026070601"></script>
<script src="/admin-taskpool-content-panel.js?v=2026070603"></script>
</body>
</html>
  `);
});


// ==================== XY_WEEKLY_REPORT_IMPORT_API_BEGIN ====================
// 稳定周报导入 API：供对方 docx/文档系统提交转换后的实习生周报。
// 认证方式：请求头 x-api-token / Authorization: Bearer <token> / body.token。
function xyWeeklyImportTokenFromReq(req) {
  const authorization = String(req.headers.authorization || '').trim();
  const bearer = authorization.replace(/^Bearer\s+/i, '').trim();

  return String(
    req.headers['x-api-token'] ||
    bearer ||
    req.query.token ||
    (req.body && req.body.token) ||
    ''
  ).trim();
}

function xyWeeklyImportSavedToken() {
  const tokenPath = path.join(__dirname, '..', 'data', 'api-token.txt');
  return fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : '';
}

function xyWeeklyImportRequireToken(req, res) {
  const savedToken = xyWeeklyImportSavedToken();
  const inputToken = xyWeeklyImportTokenFromReq(req);

  if (!savedToken) {
    res.status(503).json({
      success: false,
      message: '周报导入 API token 未配置，请先在系统 data/api-token.txt 中配置 token'
    });
    return false;
  }

  if (!inputToken || inputToken !== savedToken) {
    res.status(401).json({
      success: false,
      message: 'API token 无效'
    });
    return false;
  }

  return true;
}

function xyWeeklyImportText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(xyWeeklyImportText).filter(Boolean).join('\n');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}

function xyWeeklyImportFirst(body, names) {
  for (const name of names) {
    const value = body && body[name];
    const text = xyWeeklyImportText(value);
    if (text) return text;
  }
  return '';
}

function xyWeeklyImportDate(value) {
  const text = xyWeeklyImportText(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function xyWeeklyImportParseSection(content, titleList) {
  const lines = String(content || '').split(/\r?\n/);
  let collecting = false;
  const result = [];
  const knownTitles = [
    '本周工作内容',
    '工作内容',
    '本周成果',
    '工作成果',
    '成果',
    '遇到的问题',
    '问题',
    '解决方案',
    '处理方案',
    '下周计划',
    '计划',
    '需要支持',
    '支持'
  ];

  function isHeadingLine(trimmed) {
    if (!trimmed) return false;
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    const clean = trimmed.replace(/^[一二三四五六七八九十\d]+[、.．]\s*/, '').replace(/[:：]\s*$/, '').trim();
    return clean.length <= 12 && knownTitles.some((title) => clean === title || clean.includes(title));
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = trimmed
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[一二三四五六七八九十\d]+[、.．]\s*/, '')
      .replace(/[:：]\s*$/, '')
      .trim();
    const isKnownHeading = isHeadingLine(trimmed);

    if (isKnownHeading) {
      if (titleList.some((title) => heading.includes(title))) {
        collecting = true;
        continue;
      }

      if (collecting) break;
    }

    if (collecting) result.push(line);
  }

  return result.join('\n').trim();
}

function xyWeeklyImportFindUser(db, body) {
  const users = Array.isArray(db.users) ? db.users : [];
  const userId = xyWeeklyImportFirst(body, ['userId', 'internId', 'id']);
  const username = xyWeeklyImportFirst(body, ['username', 'account', 'userName', 'loginName']);
  const realName = xyWeeklyImportFirst(body, ['realName', 'name', 'responsiblePerson', 'owner', 'ownerName', '负责人']);
  const identity = userId || username || realName;

  if (!identity) {
    return {
      errorStatus: 400,
      errorMessage: '缺少用户标识：请传 userId、username 或 realName'
    };
  }

  const exact = users.filter((user) => {
    const candidates = [
      user.id,
      user.userId,
      user.username,
      user.account,
      user.userName,
      user.realName,
      user.name
    ].filter(Boolean).map((x) => String(x).trim());

    return (
      (userId && candidates.includes(userId)) ||
      (username && candidates.includes(username)) ||
      (realName && candidates.includes(realName))
    );
  });

  const internMatches = exact.filter((user) => user.role === 'intern');
  const matches = internMatches.length ? internMatches : exact;

  if (!matches.length) {
    return {
      errorStatus: 404,
      errorMessage: '未找到实习生用户：' + identity
    };
  }

  if (matches.length > 1 && !userId && !username) {
    return {
      errorStatus: 409,
      errorMessage: '用户姓名匹配到多个账号，请改传 userId 或 username：' + realName
    };
  }

  return { user: matches[0] };
}

function xyWeeklyImportNormalizeBody(body) {
  const rawContent = xyWeeklyImportFirst(body, [
    'content',
    'markdown',
    'reportContent',
    'text',
    'rawText',
    'docText',
    'summary',
    'abstract',
    'description',
    '摘要'
  ]);

  const workContent = xyWeeklyImportFirst(body, ['workContent', 'thisWeekWork', 'weekContent', '工作内容', '本周工作内容']) ||
    xyWeeklyImportParseSection(rawContent, ['本周工作内容', '工作内容']) ||
    rawContent;

  const achievements = xyWeeklyImportFirst(body, ['achievements', 'results', '本周成果', '工作成果', '成果']) ||
    xyWeeklyImportParseSection(rawContent, ['本周成果', '工作成果', '成果']);

  const problems = xyWeeklyImportFirst(body, ['problems', 'issue', 'issues', '问题', '遇到的问题']) ||
    xyWeeklyImportParseSection(rawContent, ['遇到的问题', '问题']);

  const solutions = xyWeeklyImportFirst(body, ['solutions', 'solution', '解决方案', '处理方案']) ||
    xyWeeklyImportParseSection(rawContent, ['解决方案', '处理方案']);

  const nextPlan = xyWeeklyImportFirst(body, ['nextPlan', 'next_plan', 'nextWeekPlan', '下周计划', '计划']) ||
    xyWeeklyImportParseSection(rawContent, ['下周计划', '计划']);

  const supportNeeded = xyWeeklyImportFirst(body, ['supportNeeded', 'support', 'needSupport', '需要支持', '支持']) ||
    xyWeeklyImportParseSection(rawContent, ['需要支持', '支持']);

  const weekStart = xyWeeklyImportDate(xyWeeklyImportFirst(body, ['weekStart', 'week_start', 'startDate', 'periodStart', 'fromDate'])) ||
    xyWeeklyImportDate(xyWeeklyImportFirst(body, ['eventDate', 'event_date', '事件时间节点']));

  const weekEnd = xyWeeklyImportDate(xyWeeklyImportFirst(body, ['weekEnd', 'week_end', 'endDate', 'periodEnd', 'toDate'])) ||
    weekStart;

  const progressVersion = xyWeeklyImportFirst(body, ['progressVersion', 'progress_version', 'progress', 'version', '项目进度']);
  const docTitle = xyWeeklyImportFirst(body, ['docTitle', 'projectName', 'projectTitle', 'title', '项目名称']);
  const department = xyWeeklyImportFirst(body, ['department', 'responsibleDepartment', '负责部门']);
  const docMonth = xyWeeklyImportFirst(body, ['docMonth', 'month', '所属月份']);
  const eventDimension = xyWeeklyImportFirst(body, ['eventDimension', 'dimension', '事件维度']);
  const eventDate = xyWeeklyImportDate(xyWeeklyImportFirst(body, ['eventDate', 'event_date', '事件时间节点']));
  const attachmentName = xyWeeklyImportFirst(body, ['attachmentName', 'fileName', 'docxName', '附件名称']);
  const externalId = xyWeeklyImportFirst(body, ['externalId', 'docId', 'documentId', 'projectId', 'sourceId']);
  const source = xyWeeklyImportFirst(body, ['source', 'sourceSystem']) || 'docx_system';
  const status = xyWeeklyImportFirst(body, ['status']) || 'submitted';

  return {
    rawContent,
    weekStart,
    weekEnd,
    progressVersion,
    docTitle,
    department,
    docMonth,
    eventDimension,
    eventDate,
    attachmentName,
    externalId,
    source,
    status,
    workContent,
    achievements,
    problems,
    solutions,
    nextPlan,
    supportNeeded
  };
}

app.get('/api/weekly-reports/import/health', (req, res) => {
  try {
    if (!xyWeeklyImportRequireToken(req, res)) return;

    return res.json({
      success: true,
      message: 'weekly report import api is ready',
      endpoint: '/api/weekly-reports/import',
      method: 'POST',
      auth: 'x-api-token 或 Authorization: Bearer <token>',
      requiredFields: ['userId 或 username 或 realName', 'weekStart/week_start', 'weekEnd/week_end', '至少一个周报内容字段'],
      supportedUserFields: ['userId', 'internId', 'username', 'account', 'realName', 'responsiblePerson'],
      supportedDateFields: ['weekStart/week_start/startDate', 'weekEnd/week_end/endDate'],
      supportedContentFields: ['workContent', 'achievements', 'problems', 'solutions', 'nextPlan', 'supportNeeded', 'content', 'markdown', 'summary']
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'health check failed',
      error: err.message
    });
  }
});

app.post('/api/weekly-reports/import', (req, res) => {
  try {
    if (!xyWeeklyImportRequireToken(req, res)) return;

    const body = req.body && typeof req.body === 'object'
      ? (req.body.report || req.body.weeklyReport || req.body.data || req.body)
      : {};

    const db = readDb();
    if (!Array.isArray(db.reports)) db.reports = [];

    const userResult = xyWeeklyImportFindUser(db, body);
    if (userResult.errorMessage) {
      return res.status(userResult.errorStatus).json({
        success: false,
        message: userResult.errorMessage
      });
    }

    const user = userResult.user;
    const normalized = xyWeeklyImportNormalizeBody(body);

    if (!normalized.weekStart || !normalized.weekEnd) {
      return res.status(400).json({
        success: false,
        message: '缺少周报周期：请传 weekStart/week_start 和 weekEnd/week_end，格式 YYYY-MM-DD'
      });
    }

    const hasContent = [
      normalized.workContent,
      normalized.achievements,
      normalized.problems,
      normalized.solutions,
      normalized.nextPlan,
      normalized.supportNeeded,
      normalized.rawContent
    ].some(Boolean);

    if (!hasContent) {
      return res.status(400).json({
        success: false,
        message: '缺少周报内容：请至少传 workContent、achievements、nextPlan、content、markdown 或 summary 中的一个字段'
      });
    }

    const existingIndex = db.reports.findIndex((report) => {
      return String(report.userId || report.internId || '') === String(user.id) &&
        String(report.weekStart || report.startDate || '') === normalized.weekStart &&
        String(report.weekEnd || report.endDate || '') === normalized.weekEnd;
    });

    const currentTime = now();
    const existing = existingIndex >= 0 ? db.reports[existingIndex] : null;
    const reportId = existing ? (existing.id || existing.reportId || id()) : id();
    const submittedAt = existing && existing.submittedAt ? existing.submittedAt : currentTime;

    const report = {
      ...(existing || {}),
      id: reportId,
      reportId,
      type: 'weekly',
      reportType: 'intern_weekly',
      source: normalized.source,
      importedFrom: normalized.source,
      importChannel: 'api',

      userId: user.id,
      internId: user.id,
      username: user.username || user.account || '',
      account: user.username || user.account || '',
      realName: user.realName || user.name || '',
      name: user.realName || user.name || '',
      position: user.position || '',

      startDate: normalized.weekStart,
      endDate: normalized.weekEnd,
      weekStart: normalized.weekStart,
      weekEnd: normalized.weekEnd,
      periodStart: normalized.weekStart,
      periodEnd: normalized.weekEnd,
      period: normalized.weekStart + ' 至 ' + normalized.weekEnd,

      title: normalized.docTitle || existing?.title || ('实习周报 ' + normalized.weekStart + ' 至 ' + normalized.weekEnd),
      docTitle: normalized.docTitle,
      projectName: normalized.docTitle,
      department: normalized.department,
      docMonth: normalized.docMonth,
      eventDimension: normalized.eventDimension,
      eventDate: normalized.eventDate,
      attachmentName: normalized.attachmentName,
      externalId: normalized.externalId,

      progressVersion: normalized.progressVersion,
      progress_version: normalized.progressVersion,

      content: normalized.rawContent,
      markdown: normalized.rawContent,
      reportContent: normalized.rawContent,

      workContent: normalized.workContent,
      thisWeekWork: normalized.workContent,
      achievements: normalized.achievements,
      results: normalized.achievements,
      problems: normalized.problems,
      issue: normalized.problems,
      solutions: normalized.solutions,
      solution: normalized.solutions,
      nextPlan: normalized.nextPlan,
      nextWeekPlan: normalized.nextPlan,
      supportNeeded: normalized.supportNeeded,
      support: normalized.supportNeeded,

      status: normalized.status === 'draft' ? 'draft' : 'submitted',
      submittedAt,
      importedAt: currentTime,
      updatedAt: currentTime,
      createdAt: existing?.createdAt || currentTime
    };

    if (existingIndex >= 0) {
      db.reports[existingIndex] = report;
    } else {
      db.reports.push(report);
    }

    writeDb(db);

    return res.json({
      success: true,
      message: existingIndex >= 0 ? '周报已更新' : '周报导入成功',
      mode: existingIndex >= 0 ? 'update' : 'create',
      reportId,
      userId: user.id,
      username: user.username || '',
      realName: user.realName || user.name || '',
      weekStart: normalized.weekStart,
      weekEnd: normalized.weekEnd
    });
  } catch (err) {
    console.error('[API weekly import error]', err);
    return res.status(500).json({
      success: false,
      message: '周报导入失败',
      error: err.message
    });
  }
});
// ==================== XY_WEEKLY_REPORT_IMPORT_API_END ====================

// ==================== XY_TASK_VERSION_API_BEGIN ====================
// 任务总表版本记录 API：用于 /admin/task-pool 展开面板的版本新增、修改、删除
app.get('/api/admin/task-pool/:id/versions', requireLogin, requireAdmin, (req, res) => {
  try {
    const fsLocal = require('fs');
    const pathLocal = require('path');
    const cryptoLocal = require('crypto');
    const dbPath = pathLocal.join(__dirname, '..', 'data', 'db.json');

    function readDbLocal() {
      return JSON.parse(fsLocal.readFileSync(dbPath, 'utf8'));
    }

    function writeDbLocal(db) {
      fsLocal.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    }

    function makeId() {
      return 'ver_' + Date.now() + '_' + cryptoLocal.randomBytes(4).toString('hex');
    }

    function dateOnly(v) {
      if (!v) return '';
      return String(v).slice(0, 10);
    }

    function findTask(db, id) {
      const target = String(id || '').trim();
      const keys = ['taskPool', 'tasks', 'taskPools', 'task_pool'];

      for (const key of keys) {
        if (!Array.isArray(db[key])) continue;

        const item = db[key].find(t => {
          const ids = [
            t.id,
            t._id,
            t.taskId,
            t.taskPoolId,
            t.poolTaskId
          ].filter(Boolean).map(x => String(x).trim());

          return ids.includes(target);
        });

        if (item) return item;
      }

      for (const [key, value] of Object.entries(db)) {
        if (!Array.isArray(value)) continue;

        const item = value.find(t => {
          if (!t || typeof t !== 'object') return false;

          const ids = [
            t.id,
            t._id,
            t.taskId,
            t.taskPoolId,
            t.poolTaskId
          ].filter(Boolean).map(x => String(x).trim());

          return ids.includes(target);
        });

        if (item) return item;
      }

      return null;
    }

    function normalizeVersion(v, index) {
      return {
        id: v.id || v.versionId || ('ver_' + index),
        version: v.version || v.v || v.name || ('v' + (index + 1) + '.0'),
        desc: v.desc || v.description || v.content || v.note || '',
        time: dateOnly(v.time || v.date || v.createdAt || v.updatedAt || ''),
        current: v.current !== false
      };
    }

    const db = readDbLocal();
    const task = findTask(db, req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '未找到任务'
      });
    }

    if (!Array.isArray(task.versions)) {
      const initDesc = String(
        task.taskContent ||
        task.content ||
        task.description ||
        task.remark ||
        task.note ||
        '初始版本'
      ).trim();

      const initTime = dateOnly(
        task.expectedDate ||
        task.dueDate ||
        task.deadline ||
        task.endDate ||
        task.createdAt ||
        ''
      );

      task.versions = [{
        id: makeId(),
        version: 'v1.0',
        desc: initDesc && initDesc !== '-' ? initDesc : '初始版本',
        time: initTime,
        current: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }];

      writeDbLocal(db);
    }

    return res.json({
      success: true,
      versions: task.versions.map(normalizeVersion)
    });
  } catch (err) {
    console.error('[task version list error]', err);
    return res.status(500).json({
      success: false,
      message: '读取版本记录失败',
      error: err.message
    });
  }
});

app.post('/api/admin/task-pool/:id/versions', requireLogin, requireAdmin, (req, res) => {
  try {
    const fsLocal = require('fs');
    const pathLocal = require('path');
    const cryptoLocal = require('crypto');
    const dbPath = pathLocal.join(__dirname, '..', 'data', 'db.json');

    function readDbLocal() {
      return JSON.parse(fsLocal.readFileSync(dbPath, 'utf8'));
    }

    function writeDbLocal(db) {
      fsLocal.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    }

    function makeId() {
      return 'ver_' + Date.now() + '_' + cryptoLocal.randomBytes(4).toString('hex');
    }

    function findTask(db, id) {
      const target = String(id || '').trim();
      const keys = ['taskPool', 'tasks', 'taskPools', 'task_pool'];

      for (const key of keys) {
        if (!Array.isArray(db[key])) continue;

        const item = db[key].find(t => {
          const ids = [
            t.id,
            t._id,
            t.taskId,
            t.taskPoolId,
            t.poolTaskId
          ].filter(Boolean).map(x => String(x).trim());

          return ids.includes(target);
        });

        if (item) return item;
      }

      for (const value of Object.values(db)) {
        if (!Array.isArray(value)) continue;

        const item = value.find(t => {
          if (!t || typeof t !== 'object') return false;

          const ids = [
            t.id,
            t._id,
            t.taskId,
            t.taskPoolId,
            t.poolTaskId
          ].filter(Boolean).map(x => String(x).trim());

          return ids.includes(target);
        });

        if (item) return item;
      }

      return null;
    }

    const db = readDbLocal();
    const task = findTask(db, req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '未找到任务'
      });
    }

    const version = String(req.body.version || req.body.v || '').trim();
    const desc = String(req.body.desc || req.body.description || '').trim();
    const time = String(req.body.time || req.body.date || '').trim();

    if (!version) {
      return res.status(400).json({
        success: false,
        message: '请填写版本号'
      });
    }

    if (!desc) {
      return res.status(400).json({
        success: false,
        message: '请填写版本描述'
      });
    }

    if (!Array.isArray(task.versions)) task.versions = [];

    task.versions.forEach(v => {
      v.current = false;
    });

    const item = {
      id: makeId(),
      version,
      v: version,
      desc,
      description: desc,
      time,
      date: time,
      current: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    task.versions.unshift(item);

    writeDbLocal(db);

    return res.json({
      success: true,
      message: '版本已添加',
      version: item
    });
  } catch (err) {
    console.error('[task version add error]', err);
    return res.status(500).json({
      success: false,
      message: '添加版本失败',
      error: err.message
    });
  }
});

app.post('/api/admin/task-pool/:id/versions/:versionId', requireLogin, requireAdmin, (req, res) => {
  try {
    const fsLocal = require('fs');
    const pathLocal = require('path');
    const dbPath = pathLocal.join(__dirname, '..', 'data', 'db.json');

    function readDbLocal() {
      return JSON.parse(fsLocal.readFileSync(dbPath, 'utf8'));
    }

    function writeDbLocal(db) {
      fsLocal.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    }

    function findTask(db, id) {
      const target = String(id || '').trim();
      const keys = ['taskPool', 'tasks', 'taskPools', 'task_pool'];

      for (const key of keys) {
        if (!Array.isArray(db[key])) continue;

        const item = db[key].find(t => {
          const ids = [
            t.id,
            t._id,
            t.taskId,
            t.taskPoolId,
            t.poolTaskId
          ].filter(Boolean).map(x => String(x).trim());

          return ids.includes(target);
        });

        if (item) return item;
      }

      for (const value of Object.values(db)) {
        if (!Array.isArray(value)) continue;

        const item = value.find(t => {
          if (!t || typeof t !== 'object') return false;

          const ids = [
            t.id,
            t._id,
            t.taskId,
            t.taskPoolId,
            t.poolTaskId
          ].filter(Boolean).map(x => String(x).trim());

          return ids.includes(target);
        });

        if (item) return item;
      }

      return null;
    }

    const db = readDbLocal();
    const task = findTask(db, req.params.id);

    if (!task || !Array.isArray(task.versions)) {
      return res.status(404).json({
        success: false,
        message: '未找到任务或版本记录'
      });
    }

    const versionId = String(req.params.versionId || '').trim();

    const item = task.versions.find((v, index) => {
      const ids = [
        v.id,
        v.versionId,
        'ver_' + index
      ].filter(Boolean).map(x => String(x).trim());

      return ids.includes(versionId);
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: '未找到版本'
      });
    }

    const version = String(req.body.version || req.body.v || '').trim();
    const desc = String(req.body.desc || req.body.description || '').trim();
    const time = String(req.body.time || req.body.date || '').trim();

    if (!version) {
      return res.status(400).json({
        success: false,
        message: '请填写版本号'
      });
    }

    if (!desc) {
      return res.status(400).json({
        success: false,
        message: '请填写版本描述'
      });
    }

    item.version = version;
    item.v = version;
    item.desc = desc;
    item.description = desc;
    item.time = time;
    item.date = time;
    item.updatedAt = new Date().toISOString();

    writeDbLocal(db);

    return res.json({
      success: true,
      message: '版本已保存',
      version: item
    });
  } catch (err) {
    console.error('[task version update error]', err);
    return res.status(500).json({
      success: false,
      message: '保存版本失败',
      error: err.message
    });
  }
});

app.post('/api/admin/task-pool/:id/versions/:versionId/delete', requireLogin, requireAdmin, (req, res) => {
  try {
    const fsLocal = require('fs');
    const pathLocal = require('path');
    const dbPath = pathLocal.join(__dirname, '..', 'data', 'db.json');

    function readDbLocal() {
      return JSON.parse(fsLocal.readFileSync(dbPath, 'utf8'));
    }

    function writeDbLocal(db) {
      fsLocal.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    }

    function findTask(db, id) {
      const target = String(id || '').trim();
      const keys = ['taskPool', 'tasks', 'taskPools', 'task_pool'];

      for (const key of keys) {
        if (!Array.isArray(db[key])) continue;

        const item = db[key].find(t => {
          const ids = [
            t.id,
            t._id,
            t.taskId,
            t.taskPoolId,
            t.poolTaskId
          ].filter(Boolean).map(x => String(x).trim());

          return ids.includes(target);
        });

        if (item) return item;
      }

      for (const value of Object.values(db)) {
        if (!Array.isArray(value)) continue;

        const item = value.find(t => {
          if (!t || typeof t !== 'object') return false;

          const ids = [
            t.id,
            t._id,
            t.taskId,
            t.taskPoolId,
            t.poolTaskId
          ].filter(Boolean).map(x => String(x).trim());

          return ids.includes(target);
        });

        if (item) return item;
      }

      return null;
    }

    const db = readDbLocal();
    const task = findTask(db, req.params.id);

    if (!task || !Array.isArray(task.versions)) {
      return res.status(404).json({
        success: false,
        message: '未找到任务或版本记录'
      });
    }

    const versionId = String(req.params.versionId || '').trim();

    const before = task.versions.length;

    task.versions = task.versions.filter((v, index) => {
      const ids = [
        v.id,
        v.versionId,
        'ver_' + index
      ].filter(Boolean).map(x => String(x).trim());

      return !ids.includes(versionId);
    });

    if (task.versions.length === before) {
      return res.status(404).json({
        success: false,
        message: '未找到版本'
      });
    }

    if (task.versions.length > 0 && !task.versions.some(v => v.current === true)) {
      task.versions[0].current = true;
    }

    writeDbLocal(db);

    return res.json({
      success: true,
      message: '版本已删除'
    });
  } catch (err) {
    console.error('[task version delete error]', err);
    return res.status(500).json({
      success: false,
      message: '删除版本失败',
      error: err.message
    });
  }
});
// ==================== XY_TASK_VERSION_API_END ====================

// ==================== XY_INTERN_TASK_VERSION_SYNC_API_BEGIN ====================

// ==================== XY_INTERN_VERSION_EDIT_OVER70_BEGIN ====================
// 实习生任务认领页：进度 >70% 后允许修改/切换版本；直接写 taskPool.task.versions，与 HR/管理员任务总表同步
function xyVersionEditNorm(v) {
  return String(v ?? '').trim();
}

function xyVersionEditPercent(v) {
  const raw = xyVersionEditNorm(v).replace('%', '');
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function xyVersionEditLogId() {
  return 'ver_edit_' + Date.now() + '_' + Math.random().toString(16).slice(2, 10);
}

function xyVersionEditUserOwnsTask(task, user) {
  if (!task || !user) return false;

  const uid = xyVersionEditNorm(user.id);
  const name = xyVersionEditNorm(user.realName || user.username);

  const ids = []
    .concat(Array.isArray(task.claimedByUserIds) ? task.claimedByUserIds : [])
    .concat(Array.isArray(task.assigneeUserIds) ? task.assigneeUserIds : [])
    .concat(Array.isArray(task.ownerUserIds) ? task.ownerUserIds : [])
    .map(xyVersionEditNorm)
    .filter(Boolean);

  const names = []
    .concat(Array.isArray(task.assigneeNames) ? task.assigneeNames : [])
    .concat(Array.isArray(task.claimedByNames) ? task.claimedByNames : [])
    .concat(xyVersionEditNorm(task.assigneeName).split(/[,，、;；]+/))
    .concat(xyVersionEditNorm(task.claimedByName).split(/[,，、;；]+/))
    .map(xyVersionEditNorm)
    .filter(Boolean);

  return (
    (uid && (
      xyVersionEditNorm(task.claimedByUserId) === uid ||
      xyVersionEditNorm(task.assigneeUserId) === uid ||
      xyVersionEditNorm(task.ownerUserId) === uid ||
      ids.includes(uid)
    )) ||
    (name && names.includes(name))
  );
}

function xyVersionEditDailyMatchesTask(task, daily) {
  if (!task || !daily) return false;

  const taskId = xyVersionEditNorm(task.id);
  const taskTitle = xyVersionEditNorm(task.title || task.taskTitle || task.name);

  const keys = [
    daily.taskId,
    daily.relatedTaskId,
    daily.taskPoolId,
    daily.poolTaskId,
    daily.linkedTaskId,
    daily.dailyTaskId,
    daily.taskTitle,
    daily.taskName,
    daily.title
  ].map(xyVersionEditNorm).filter(Boolean);

  return (
    (taskId && keys.includes(taskId)) ||
    (taskTitle && keys.includes(taskTitle))
  );
}

function xyVersionEditDailyBelongsToUser(daily, user) {
  if (!daily || !user) return false;

  const uid = xyVersionEditNorm(user.id);
  const name = xyVersionEditNorm(user.realName || user.username);

  return (
    (uid && (
      xyVersionEditNorm(daily.userId) === uid ||
      xyVersionEditNorm(daily.internId) === uid ||
      xyVersionEditNorm(daily.createdByUserId) === uid
    )) ||
    (name && (
      xyVersionEditNorm(daily.realName) === name ||
      xyVersionEditNorm(daily.userName) === name ||
      xyVersionEditNorm(daily.internName) === name
    ))
  );
}

function xyVersionEditTaskProgress(db, task, user) {
  const values = [];

  // 任务总表当前进度
  [
    task.progress,
    task.taskProgress,
    task.overallProgress
  ].forEach((v) => {
    const p = xyVersionEditPercent(v);
    if (p !== null) values.push(p);
  });

  // 当前实习生在日报中提交过的该任务进度
  if (db && Array.isArray(db.dailyTasks)) {
    db.dailyTasks.forEach((daily) => {
      if (!xyVersionEditDailyBelongsToUser(daily, user)) return;
      if (!xyVersionEditDailyMatchesTask(task, daily)) return;

      [
        daily.progress,
        daily.taskProgress,
        daily.overallProgress
      ].forEach((v) => {
        const p = xyVersionEditPercent(v);
        if (p !== null) values.push(p);
      });
    });
  }

  return values.length ? Math.max(...values) : 0;
}

function xyVersionEditEnsureVersions(task) {
  task.versions = Array.isArray(task.versions) ? task.versions : [];
  task.versions.forEach((v, index) => {
    if (!v.id) v.id = 'ver_' + Date.now() + '_' + index + '_' + Math.random().toString(16).slice(2, 8);
  });
  return task.versions;
}

function xyVersionEditSyncToHrTask(task, version, user) {
  const versions = xyVersionEditEnsureVersions(task);

  versions.forEach((v) => {
    v.current = v.id === version.id;
  });

  version.current = true;
  version.updatedAt = now();
  version.updatedBy = user.realName || user.username || user.id;
  version.updatedByUserId = user.id;
  version.updatedByRole = 'intern';

  task.currentVersionId = version.id;
  task.selectedVersionId = version.id;
  task.currentVersion = version.version || version.name || '';
  task.currentVersionDesc = version.desc || version.description || '';
  task.versionUpdatedAt = now();
  task.versionUpdatedBy = user.realName || user.username || user.id;
  task.updatedAt = now();

  task.versionEditLogs = Array.isArray(task.versionEditLogs) ? task.versionEditLogs : [];
  task.versionEditLogs.unshift({
    id: xyVersionEditLogId(),
    versionId: version.id,
    version: version.version || '',
    desc: version.desc || '',
    userId: user.id,
    userName: user.realName || user.username || '',
    role: 'intern',
    time: now(),
    note: '实习生在任务进度大于70%后修改版本，已同步 HR/管理员任务总表'
  });
}

function xyVersionEditPermission(db, task, user) {
  if (!task) return { ok: false, code: 'not_found', message: '任务不存在', progress: 0 };

  if (!xyVersionEditUserOwnsTask(task, user)) {
    return { ok: false, code: 'not_owner', message: '只能修改自己已认领/负责的任务版本', progress: 0 };
  }

  const progress = xyVersionEditTaskProgress(db, task, user);

  if (progress <= 70) {
    return {
      ok: false,
      code: 'progress_low',
      message: '当前任务进度需要大于 70% 才能修改版本',
      progress
    };
  }

  return { ok: true, code: 'ok', message: '允许修改版本', progress };
}

app.get('/api/intern/task-pool/:id/versions/edit-meta', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  const permission = xyVersionEditPermission(db, task, req.user);

  if (!task) {
    return res.status(404).json(permission);
  }

  const versions = xyVersionEditEnsureVersions(task);

  res.json({
    ok: true,
    canEdit: permission.ok,
    code: permission.code,
    message: permission.message,
    progress: permission.progress,
    taskId: task.id,
    taskTitle: task.title || task.taskTitle || '',
    currentVersionId: task.currentVersionId || task.selectedVersionId || '',
    versions
  });
});

app.post('/api/intern/task-pool/:id/versions/:versionId/select', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  const permission = xyVersionEditPermission(db, task, req.user);

  if (!task) return res.status(404).json(permission);
  if (!permission.ok) return res.status(403).json(permission);

  const versions = xyVersionEditEnsureVersions(task);
  const version = versions.find((v) => v.id === req.params.versionId);

  if (!version) {
    return res.status(404).json({ ok: false, code: 'version_not_found', message: '版本不存在' });
  }

  xyVersionEditSyncToHrTask(task, version, req.user);
  writeDb(db);

  res.json({
    ok: true,
    message: '版本已切换，并已同步 HR/管理员任务总表',
    progress: permission.progress,
    taskId: task.id,
    version
  });
});

app.post('/api/intern/task-pool/:id/versions/:versionId/update', requireLogin, requireIntern, (req, res) => {
  const db = readDb();
  const task = db.taskPool.find((t) => t.id === req.params.id);
  const permission = xyVersionEditPermission(db, task, req.user);

  if (!task) return res.status(404).json(permission);
  if (!permission.ok) return res.status(403).json(permission);

  const versions = xyVersionEditEnsureVersions(task);
  const version = versions.find((v) => v.id === req.params.versionId);

  if (!version) {
    return res.status(404).json({ ok: false, code: 'version_not_found', message: '版本不存在' });
  }

  const nextVersion = xyVersionEditNorm(req.body.version || req.body.name || req.body.title);
  const nextDesc = xyVersionEditNorm(req.body.desc || req.body.description || req.body.content);

  if (!nextVersion) {
    return res.status(400).json({ ok: false, code: 'empty_version', message: '版本号不能为空' });
  }

  version.version = nextVersion;
  version.name = nextVersion;
  version.desc = nextDesc;
  version.description = nextDesc;
  version.time = xyVersionEditNorm(req.body.time) || version.time || today();
  version.updatedAt = now();
  version.updatedBy = req.user.realName || req.user.username || req.user.id;
  version.updatedByUserId = req.user.id;
  version.updatedByRole = 'intern';

  xyVersionEditSyncToHrTask(task, version, req.user);
  writeDb(db);

  res.json({
    ok: true,
    message: '版本已修改，并已同步 HR/管理员任务总表',
    progress: permission.progress,
    taskId: task.id,
    version
  });
});

// 兼容 edit 命名
app.post('/api/intern/task-pool/:id/versions/:versionId/edit', requireLogin, requireIntern, (req, res) => {
  req.url = req.url.replace(/\/edit$/, '/update');
  return app._router.handle(req, res);
});
// ==================== XY_INTERN_VERSION_EDIT_OVER70_END ====================


// 实习生任务版本同步 API
// 作用：实习生任务认领页可查看任务内容、选择版本、添加版本，并同步到管理员任务总表 task.versions

app.get('/api/intern/task-pool/:id/detail', requireLogin, requireIntern, (req, res) => {
  try {
    const fsLocal = require('fs');
    const pathLocal = require('path');
    const dbPath = pathLocal.join(__dirname, '..', 'data', 'db.json');

    function readDbLocal() {
      return JSON.parse(fsLocal.readFileSync(dbPath, 'utf8'));
    }

    function writeDbLocal(db) {
      fsLocal.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    }

    function makeId() {
      return 'ver_' + Date.now() + '_' + Math.random().toString(16).slice(2, 10);
    }

    function dateOnly(v) {
      if (!v) return '';
      return String(v).slice(0, 10);
    }

    function getTaskId(task) {
      return String(task.id || task._id || task.taskId || task.taskPoolId || task.poolTaskId || '').trim();
    }

    function findTask(db, id) {
      const target = String(id || '').trim();
      const keys = ['taskPool', 'tasks', 'taskPools', 'task_pool'];

      for (const key of keys) {
        if (!Array.isArray(db[key])) continue;
        const item = db[key].find(task => getTaskId(task) === target);
        if (item) return item;
      }

      for (const value of Object.values(db)) {
        if (!Array.isArray(value)) continue;

        const item = value.find(task => {
          if (!task || typeof task !== 'object') return false;
          return getTaskId(task) === target;
        });

        if (item) return item;
      }

      return null;
    }

    function getTaskContent(task) {
      return String(
        task.taskContent ||
        task.content ||
        task.description ||
        task.remark ||
        task.note ||
        task.requirement ||
        task.detail ||
        ''
      ).trim();
    }

    function normalizeVersion(v, index) {
      return {
        id: String(v.id || v.versionId || ('ver_' + index)),
        version: String(v.version || v.v || v.name || ('v' + (index + 1) + '.0')),
        desc: String(v.desc || v.description || v.content || v.note || ''),
        time: dateOnly(v.time || v.date || v.createdAt || v.updatedAt || ''),
        current: v.current === true || v.selected === true || index === 0,
        createdByName: String(v.createdByName || v.createdBy || '')
      };
    }

    const db = readDbLocal();
    const task = findTask(db, req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '未找到任务'
      });
    }

    if (!Array.isArray(task.versions) || task.versions.length === 0) {
      const initContent = getTaskContent(task) || '初始版本';
      const initTime = dateOnly(task.expectedDate || task.dueDate || task.deadline || task.createdAt || '');

      task.versions = [{
        id: makeId(),
        version: 'v1.0',
        v: 'v1.0',
        desc: initContent,
        description: initContent,
        time: initTime,
        date: initTime,
        current: true,
        selected: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }];

      writeDbLocal(db);
    }

    return res.json({
      success: true,
      task: {
        id: getTaskId(task),
        title: task.title || task.taskName || '',
        department: task.department || '',
        contact: task.contact || '',
        expectedDate: task.expectedDate || task.dueDate || task.deadline || '',
        status: task.status || '',
        progress: task.progress || 0,
        content: getTaskContent(task) || '暂无任务内容'
      },
      versions: task.versions.map(normalizeVersion)
    });
  } catch (err) {
    console.error('[intern task detail error]', err);
    return res.status(500).json({
      success: false,
      message: '读取任务详情失败',
      error: err.message
    });
  }
});

app.post('/api/intern/task-pool/:id/versions', requireLogin, requireIntern, (req, res) => {
  try {
    const fsLocal = require('fs');
    const pathLocal = require('path');
    const dbPath = pathLocal.join(__dirname, '..', 'data', 'db.json');

    function readDbLocal() {
      return JSON.parse(fsLocal.readFileSync(dbPath, 'utf8'));
    }

    function writeDbLocal(db) {
      fsLocal.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    }

    function makeId() {
      return 'ver_' + Date.now() + '_' + Math.random().toString(16).slice(2, 10);
    }

    function getTaskId(task) {
      return String(task.id || task._id || task.taskId || task.taskPoolId || task.poolTaskId || '').trim();
    }

    function findTask(db, id) {
      const target = String(id || '').trim();
      const keys = ['taskPool', 'tasks', 'taskPools', 'task_pool'];

      for (const key of keys) {
        if (!Array.isArray(db[key])) continue;
        const item = db[key].find(task => getTaskId(task) === target);
        if (item) return item;
      }

      for (const value of Object.values(db)) {
        if (!Array.isArray(value)) continue;

        const item = value.find(task => {
          if (!task || typeof task !== 'object') return false;
          return getTaskId(task) === target;
        });

        if (item) return item;
      }

      return null;
    }

    const db = readDbLocal();
    const task = findTask(db, req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '未找到任务'
      });
    }

    const version = String(req.body.version || req.body.v || '').trim();
    const desc = String(req.body.desc || req.body.description || '').trim();
    const time = String(req.body.time || req.body.date || '').trim();

    if (!version) {
      return res.status(400).json({
        success: false,
        message: '请填写版本号'
      });
    }

    if (!desc) {
      return res.status(400).json({
        success: false,
        message: '请填写版本描述'
      });
    }

    if (!Array.isArray(task.versions)) {
      task.versions = [];
    }

    task.versions.forEach(v => {
      v.current = false;
      v.selected = false;
    });

    const item = {
      id: makeId(),
      version,
      v: version,
      desc,
      description: desc,
      time,
      date: time,
      current: true,
      selected: true,
      createdBy: req.session.user.username || req.session.user.realName || req.session.user.id || '',
      createdByName: req.session.user.realName || req.session.user.username || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    task.versions.unshift(item);

    writeDbLocal(db);

    return res.json({
      success: true,
      message: '版本已添加，并已同步到管理员任务总表',
      version: item
    });
  } catch (err) {
    console.error('[intern add version error]', err);
    return res.status(500).json({
      success: false,
      message: '添加版本失败',
      error: err.message
    });
  }
});

app.post('/api/intern/task-pool/:id/versions/:versionId/select', requireLogin, requireIntern, (req, res) => {
  try {
    const fsLocal = require('fs');
    const pathLocal = require('path');
    const dbPath = pathLocal.join(__dirname, '..', 'data', 'db.json');

    function readDbLocal() {
      return JSON.parse(fsLocal.readFileSync(dbPath, 'utf8'));
    }

    function writeDbLocal(db) {
      fsLocal.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    }

    function getTaskId(task) {
      return String(task.id || task._id || task.taskId || task.taskPoolId || task.poolTaskId || '').trim();
    }

    function findTask(db, id) {
      const target = String(id || '').trim();
      const keys = ['taskPool', 'tasks', 'taskPools', 'task_pool'];

      for (const key of keys) {
        if (!Array.isArray(db[key])) continue;
        const item = db[key].find(task => getTaskId(task) === target);
        if (item) return item;
      }

      for (const value of Object.values(db)) {
        if (!Array.isArray(value)) continue;

        const item = value.find(task => {
          if (!task || typeof task !== 'object') return false;
          return getTaskId(task) === target;
        });

        if (item) return item;
      }

      return null;
    }

    const db = readDbLocal();
    const task = findTask(db, req.params.id);

    if (!task || !Array.isArray(task.versions)) {
      return res.status(404).json({
        success: false,
        message: '未找到任务或版本记录'
      });
    }

    const versionId = String(req.params.versionId || '').trim();
    let found = false;

    task.versions.forEach((v, index) => {
      const ids = [
        v.id,
        v.versionId,
        'ver_' + index
      ].filter(Boolean).map(x => String(x));

      const hit = ids.includes(versionId);

      v.current = hit;
      v.selected = hit;

      if (hit) {
        v.selectedBy = req.session.user.username || req.session.user.realName || req.session.user.id || '';
        v.selectedByName = req.session.user.realName || req.session.user.username || '';
        v.updatedAt = new Date().toISOString();
        found = true;
      }
    });

    if (!found) {
      return res.status(404).json({
        success: false,
        message: '未找到要选择的版本'
      });
    }

    writeDbLocal(db);

    return res.json({
      success: true,
      message: '版本已选择，并已同步到管理员任务总表'
    });
  } catch (err) {
    console.error('[intern select version error]', err);
    return res.status(500).json({
      success: false,
      message: '选择版本失败',
      error: err.message
    });
  }
});
// ==================== XY_INTERN_TASK_VERSION_SYNC_API_END ====================

// ==================== XY_ADMIN_TASKPOOL_CONTENT_API_BEGIN ====================
// 管理员任务总表：任务内容读取 API
// 用途：/admin/task-pool 展开任务后，在版本记录上方显示任务内容
app.get('/api/admin/task-pool-content-map', requireLogin, requireAdmin, (req, res) => {
  try {
    const db = readDb();

    const tasks = Array.isArray(db.taskPool)
      ? db.taskPool
      : (
          Array.isArray(db.tasks)
            ? db.tasks
            : []
        );

    function getTaskId(task) {
      return String(task.id || task._id || task.taskId || task.taskPoolId || task.poolTaskId || '').trim();
    }

    function getTaskContent(task) {
      return String(
        task.taskContent ||
        task.content ||
        task.description ||
        task.remark ||
        task.note ||
        task.requirement ||
        task.detail ||
        ''
      ).trim();
    }

    const result = tasks.map((task) => ({
      id: getTaskId(task),
      title: String(task.title || task.taskName || task.name || '').trim(),
      department: String(task.department || '').trim(),
      contact: String(task.contact || '').trim(),
      expectedDate: String(task.expectedDate || task.dueDate || task.deadline || '').trim(),
      content: getTaskContent(task) || '暂无任务内容'
    }));

    res.json({
      success: true,
      tasks: result
    });
  } catch (err) {
    console.error('[admin task content map error]', err);
    res.status(500).json({
      success: false,
      message: '读取任务内容失败',
      error: err.message
    });
  }
});
// ==================== XY_ADMIN_TASKPOOL_CONTENT_API_END ====================

// ==================== XY_TASK_CONTENT_FROM_ADMIN_EDIT_API_BEGIN ====================
// 任务内容统一读取 API
// 来源：管理员「编辑任务」页面保存的任务内容字段
// 用途：admin / intern / boss 任务总表展开时显示“任务内容”

function xyGetTaskId(task) {
  return String(task.id || task._id || task.taskId || task.taskPoolId || task.poolTaskId || '').trim();
}

function xyGetTaskContentFromAdminEdit(task) {
  return String(
    task.taskContent ||
    task.content ||
    task.description ||
    task.remark ||
    task.note ||
    task.requirement ||
    task.detail ||
    ''
  ).trim();
}

function xyFindTaskPoolItem(db, id) {
  const target = String(id || '').trim();

  const keys = ['taskPool', 'tasks', 'taskPools', 'task_pool'];

  for (const key of keys) {
    if (!Array.isArray(db[key])) continue;

    const item = db[key].find(task => xyGetTaskId(task) === target);
    if (item) return item;
  }

  for (const value of Object.values(db)) {
    if (!Array.isArray(value)) continue;

    const item = value.find(task => {
      if (!task || typeof task !== 'object') return false;
      return xyGetTaskId(task) === target;
    });

    if (item) return item;
  }

  return null;
}

app.get('/api/task-pool/:id/admin-edit-content', requireLogin, (req, res) => {
  try {
    const db = readDb();
    const task = xyFindTaskPoolItem(db, req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '未找到任务'
      });
    }

    return res.json({
      success: true,
      id: xyGetTaskId(task),
      title: task.title || task.taskName || '',
      content: xyGetTaskContentFromAdminEdit(task) || '暂无任务内容'
    });
  } catch (err) {
    console.error('[task content from admin edit error]', err);
    return res.status(500).json({
      success: false,
      message: '读取任务内容失败',
      error: err.message
    });
  }
});
// ==================== XY_TASK_CONTENT_FROM_ADMIN_EDIT_API_END ====================

registerInternRoutes(app, {
  requireLogin,
  requireIntern,
  readDb,
  reportService
});

registerAdminRoutes(app, {
  requireLogin,
  requireAdmin,
  readDb,
  reportService
});

registerBossRoutes(app, {
  requireLogin,
  requireBoss,
  readDb,
  reportService
});







app.listen(PORT, HOST, () => {
  console.log(`实习管理平台实习生周报系统已启动：`);
  console.log(`- 本机访问：http://localhost:${PORT}`);
  console.log(`- 局域网访问：请用 http://你的Mac局域网IP:${PORT}`);
});
