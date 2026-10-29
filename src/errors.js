const { ZodError } = require('zod');

// An error that carries an HTTP status, thrown from route handlers.
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);

// Turns zod issues into a short, readable list of field errors.
function formatIssues(issues) {
  return issues.map((issue) => {
    const field = issue.path.length ? issue.path.join('.') : '(body)';
    let message = issue.message;
    if (issue.code === 'invalid_type' && /received undefined/.test(message)) message = 'Required';
    return { field, message };
  });
}

// Catches requests that did not match any route.
function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
}

// One place that turns every thrown error into a JSON response.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: formatIssues(err.issues) });
  }
  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }
  // Malformed JSON body sent by the client.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'A record with the same unique value already exists' });
  }
  if (process.env.NODE_ENV !== 'test') console.error(err);
  return res.status(500).json({ error: 'Something went wrong on the server' });
}

module.exports = { HttpError, notFound, notFoundHandler, errorHandler, formatIssues };
