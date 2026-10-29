require('dotenv').config({ quiet: true });
const { openDb } = require('./db');
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;
const db = openDb();
const app = createApp(db);

const server = app.listen(port, () => {
  console.log(`Document register running on http://localhost:${port}`);
  console.log(`API docs: http://localhost:${port}/docs`);
});

// Close the database cleanly on Ctrl+C or when the host stops the process.
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
