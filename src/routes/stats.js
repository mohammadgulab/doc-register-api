const express = require('express');
const { STATUSES, DISCIPLINES, DOC_TYPES } = require('../constants');

const router = express.Router();

// Counts rows grouped by one column, filling in zeros for missing values.
function countBy(db, column, keys) {
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  const rows = db.prepare(`SELECT ${column} AS key, COUNT(*) AS n FROM documents GROUP BY ${column}`).all();
  for (const row of rows) counts[row.key] = row.n;
  return counts;
}

// GET /api/stats
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  res.json({
    total: db.prepare('SELECT COUNT(*) AS n FROM documents').get().n,
    by_status: countBy(db, 'status', STATUSES),
    by_discipline: countBy(db, 'discipline', DISCIPLINES),
    by_type: countBy(db, 'type', DOC_TYPES),
    transmittals: db.prepare('SELECT COUNT(*) AS n FROM transmittals').get().n,
  });
});

module.exports = router;
