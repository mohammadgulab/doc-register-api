const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { seed } = require('../src/seed');

// Fresh in memory database with the sample project loaded.
function makeApp({ seeded = true } = {}) {
  const db = openDb(':memory:');
  if (seeded) seed(db);
  return { app: createApp(db), db };
}

module.exports = { makeApp };
