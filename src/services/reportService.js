function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toDateText(value) {
  return String(value || '').slice(0, 10);
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function weekStartText(base = new Date()) {
  const date = new Date(base);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function weekEndText(base = new Date()) {
  const date = new Date(weekStartText(base));
  date.setDate(date.getDate() + 6);
  return date.toISOString().slice(0, 10);
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function safeProgress(value) {
  const n = Number(String(value ?? '').replace('%', ''));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function taskIsDone(task) {
  const status = String(task.status || '');
  return status.includes('完成') || safeProgress(task.progress) >= 100;
}

function internUsers(db) {
  return asArray(db.users).filter((user) => user.role === 'intern');
}

function currentWeekReports(db, baseDate = new Date()) {
  const start = weekStartText(baseDate);
  const end = weekEndText(baseDate);
  return asArray(db.reports).filter((report) => {
    const reportStart = toDateText(report.weekStart);
    const reportEnd = toDateText(report.weekEnd);
    return reportStart <= end && reportEnd >= start;
  });
}

function submittedReportUserIds(reports) {
  return new Set(
    asArray(reports)
      .filter((report) => ['submitted', 'approved', 'returned'].includes(String(report.status || '')))
      .map((report) => report.userId)
      .filter(Boolean)
  );
}

function getTaskCompletionRate(db) {
  const tasks = asArray(db.taskPool);
  return percent(tasks.filter(taskIsDone).length, tasks.length);
}

function getDailySubmissionSnapshot(db, date = todayText()) {
  const interns = internUsers(db);
  const dailyTasks = asArray(db.dailyTasks).filter((task) => toDateText(task.date || task.taskDate || task.dailyDate) === date);
  const submitted = new Set(dailyTasks.map((task) => task.userId).filter(Boolean));

  return {
    date,
    internCount: interns.length,
    submittedCount: interns.filter((user) => submitted.has(user.id)).length,
    notSubmittedCount: interns.filter((user) => !submitted.has(user.id)).length,
    taskCount: dailyTasks.length,
    submissionRate: percent(interns.filter((user) => submitted.has(user.id)).length, interns.length)
  };
}

function getWeeklySubmissionSnapshot(db, baseDate = new Date()) {
  const interns = internUsers(db);
  const reports = currentWeekReports(db, baseDate);
  const submittedIds = submittedReportUserIds(reports);

  return {
    weekStart: weekStartText(baseDate),
    weekEnd: weekEndText(baseDate),
    internCount: interns.length,
    submittedCount: interns.filter((user) => submittedIds.has(user.id)).length,
    notSubmittedCount: interns.filter((user) => !submittedIds.has(user.id)).length,
    reportCount: reports.length,
    submissionRate: percent(interns.filter((user) => submittedIds.has(user.id)).length, interns.length)
  };
}

function normalizeSupportText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function hasMeaningfulSupportText(text) {
  const normalized = normalizeSupportText(text);
  if (!normalized) return false;
  const compact = normalized.replace(/[。．.，,；;、\s\-—_]/g, '');

  const noSupportTexts = new Set([
    '无',
    '暂无',
    '没有',
    '无需要',
    '无需',
    '无需支持',
    '不需要',
    '暂不需要',
    '暂无需要老板额外支持的事项'
  ]);

  if (noSupportTexts.has(normalized)) return false;
  if (noSupportTexts.has(compact)) return false;
  if (/^(暂无|暂不|不需要|无需|没有).*(支持|事项|问题|需求)/.test(normalized)) return false;
  if (/^(暂无|暂不|不需要|无需|没有).*(支持|事项|问题|需求)?$/.test(compact)) return false;

  return true;
}

function getSupportReports(db) {
  return asArray(db.reports).filter((report) => hasMeaningfulSupportText(report.supportNeeded));
}

function getSupportDetails(db) {
  const users = asArray(db.users);

  return getSupportReports(db)
    .map((report) => {
      const user = users.find((item) => String(item.id) === String(report.userId)) || {};

      return {
        id: report.id || '',
        realName: report.realName || user.realName || report.username || '-',
        username: report.username || user.username || '',
        position: report.position || user.position || '-',
        weekStart: report.weekStart || report.startDate || report.fromDate || '',
        weekEnd: report.weekEnd || report.endDate || report.toDate || '',
        supportNeeded: normalizeSupportText(report.supportNeeded),
        updatedAt: report.updatedAt || report.submittedAt || report.createdAt || '',
        status: report.status || ''
      };
    })
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function getSupportHotspots(db, limit = 5) {
  const stopWords = new Set(['暂无', '无', '没有', '需要', '支持', '帮忙', '协助', '一下', '进行', '相关']);
  const counts = new Map();

  for (const report of getSupportReports(db)) {
    const words = normalizeSupportText(report.supportNeeded)
      .split(/[，,。；;、\s/]+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && !stopWords.has(word));

    for (const word of words) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function getPendingFeedbackCount(db) {
  const feedbackReportIds = new Set(asArray(db.feedbacks).map((feedback) => feedback.reportId).filter(Boolean));
  return asArray(db.reports).filter((report) => {
    return String(report.status || '') === 'submitted' && !feedbackReportIds.has(report.id);
  }).length;
}

function getConsecutiveMissingDailyCount(db, days = 3, baseDate = new Date()) {
  const interns = internUsers(db);
  const dailyTasks = asArray(db.dailyTasks);
  const dates = [];

  for (let index = 0; index < days; index += 1) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - index);
    dates.push(date.toISOString().slice(0, 10));
  }

  return interns.filter((user) => {
    return dates.every((date) => !dailyTasks.some((task) => task.userId === user.id && toDateText(task.date || task.taskDate || task.dailyDate) === date));
  }).length;
}

function buildAdminDashboardInsights(db, selectedDate = todayText()) {
  const daily = getDailySubmissionSnapshot(db, selectedDate);
  const weekly = getWeeklySubmissionSnapshot(db);

  return {
    daily,
    weekly,
    taskCompletionRate: getTaskCompletionRate(db),
    pendingFeedbackCount: getPendingFeedbackCount(db),
    supportNeededCount: getSupportReports(db).length,
    consecutiveMissingDailyCount: getConsecutiveMissingDailyCount(db),
    supportHotspots: getSupportHotspots(db),
    supportDetails: getSupportDetails(db)
  };
}

function buildBossDashboardInsights(db) {
  const weekly = getWeeklySubmissionSnapshot(db);

  return {
    weekly,
    taskCompletionRate: getTaskCompletionRate(db),
    pendingFeedbackCount: getPendingFeedbackCount(db),
    supportNeededCount: getSupportReports(db).length,
    supportHotspots: getSupportHotspots(db),
    supportDetails: getSupportDetails(db)
  };
}

module.exports = {
  buildAdminDashboardInsights,
  buildBossDashboardInsights,
  getDailySubmissionSnapshot,
  getWeeklySubmissionSnapshot,
  getSupportHotspots,
  getSupportDetails,
  getTaskCompletionRate
};
