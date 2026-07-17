function registerAdminRoutes(app, deps) {
  const { requireLogin, requireAdmin, readDb, reportService } = deps;

  app.get('/admin/api/dashboard-summary', requireLogin, requireAdmin, (req, res) => {
    const date = String(req.query.date || '').slice(0, 10);
    res.json(reportService.buildAdminDashboardInsights(readDb(), date || undefined));
  });
}

module.exports = { registerAdminRoutes };
