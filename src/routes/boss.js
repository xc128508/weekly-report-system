function registerBossRoutes(app, deps) {
  const { requireLogin, requireBoss, readDb, reportService } = deps;

  app.get('/boss/api/dashboard-summary', requireLogin, requireBoss, (req, res) => {
    res.json(reportService.buildBossDashboardInsights(readDb()));
  });
}

module.exports = { registerBossRoutes };
