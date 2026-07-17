function registerInternRoutes(app, deps) {
  const { requireLogin, requireIntern, readDb, reportService } = deps;

  app.get('/intern/api/dashboard-summary', requireLogin, requireIntern, (req, res) => {
    const db = readDb();
    const weekly = reportService.getWeeklySubmissionSnapshot(db);
    const reports = Array.isArray(db.reports) ? db.reports.filter((report) => report.userId === req.user.id) : [];

    res.json({
      weekly,
      myReportCount: reports.length,
      mySubmittedReportCount: reports.filter((report) => ['submitted', 'approved', 'returned'].includes(String(report.status || ''))).length
    });
  });
}

module.exports = { registerInternRoutes };
