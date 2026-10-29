const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./openapi');
const { notFoundHandler, errorHandler } = require('./errors');

// Builds the Express app around a database handle.
// Kept separate from server.js so tests can create an app with an in memory database.
function createApp(db) {
  const app = express();
  app.locals.db = db;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', require('./routes/health'));
  app.use('/api/documents', require('./routes/documents'));
  app.use('/api/transmittals', require('./routes/transmittals'));
  app.use('/api/stats', require('./routes/stats'));

  app.get('/openapi.json', (req, res) => res.json(openapi));
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapi, {
      customSiteTitle: 'Document Register API docs',
      customCss: '.swagger-ui .topbar { display: none }',
    })
  );

  // The read only register page.
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
