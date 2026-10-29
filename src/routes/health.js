const express = require('express');

const router = express.Router();

// GET /api/health
router.get('/', (req, res) => {
  // A tiny query proves the database is reachable.
  req.app.locals.db.prepare('SELECT 1').get();
  res.json({
    status: 'ok',
    project: process.env.PROJECT_NAME || 'Harbor View Residences, Jeddah',
    uptime: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
});

module.exports = router;
