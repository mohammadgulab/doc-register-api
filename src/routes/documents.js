const express = require('express');
const schemas = require('../schemas');
const { HttpError, notFound } = require('../errors');
const { toCsv } = require('../csv');
const { nowIso, today } = require('../util');

const router = express.Router();

// Builds the WHERE clause shared by the list and CSV export endpoints.
function buildFilters({ q, status, discipline, type }) {
  const where = [];
  const params = {};
  if (q) {
    where.push('(doc_no LIKE @q OR title LIKE @q)');
    params.q = `%${q}%`;
  }
  if (status) {
    where.push('status = @status');
    params.status = status;
  }
  if (discipline) {
    where.push('discipline = @discipline');
    params.discipline = discipline;
  }
  if (type) {
    where.push('type = @type');
    params.type = type;
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

// "sort" is already checked against a whitelist, so it is safe to put in SQL.
function orderBy(sort) {
  const desc = sort.startsWith('-');
  const field = sort.replace(/^-/, '');
  return `ORDER BY ${field} ${desc ? 'DESC' : 'ASC'}, id ASC`;
}

function getDocument(db, id) {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) throw notFound('Document');
  return doc;
}

function getRevisions(db, documentId) {
  return db.prepare('SELECT * FROM revisions WHERE document_id = ? ORDER BY id ASC').all(documentId);
}

// GET /api/documents
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const query = schemas.documentListQuery.parse(req.query);
  const { sql, params } = buildFilters(query);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM documents ${sql}`).get(params).n;
  const offset = (query.page - 1) * query.limit;
  const data = db
    .prepare(`SELECT * FROM documents ${sql} ${orderBy(query.sort)} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: query.limit, offset });
  res.json({ data, page: query.page, limit: query.limit, total });
});

// GET /api/documents/export.csv
router.get('/export.csv', (req, res) => {
  const db = req.app.locals.db;
  const query = schemas.documentFilters.parse(req.query);
  const { sql, params } = buildFilters(query);
  const rows = db.prepare(`SELECT * FROM documents ${sql} ${orderBy(query.sort)}`).all(params);
  const csv = toCsv(
    [
      { key: 'doc_no', label: 'Document No' },
      { key: 'title', label: 'Title' },
      { key: 'discipline', label: 'Discipline' },
      { key: 'type', label: 'Type' },
      { key: 'originator', label: 'Originator' },
      { key: 'current_rev', label: 'Current Rev' },
      { key: 'status', label: 'Status' },
      { key: 'updated_at', label: 'Last Updated' },
    ],
    rows
  );
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="document-register-${today()}.csv"`);
  res.send(csv);
});

// GET /api/documents/:id
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = schemas.idParam.parse(req.params);
  const doc = getDocument(db, id);
  res.json({ ...doc, revisions: getRevisions(db, id) });
});

// POST /api/documents
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const body = schemas.createDocument.parse(req.body);

  const exists = db.prepare('SELECT id FROM documents WHERE doc_no = ?').get(body.doc_no);
  if (exists) {
    throw new HttpError(409, `Document number ${body.doc_no} already exists`, [
      { field: 'doc_no', message: 'Already in use' },
    ]);
  }

  const now = nowIso();
  // The document and its first revision are saved together.
  const create = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO documents (doc_no, title, discipline, type, originator, current_rev, status, created_at, updated_at)
         VALUES (@doc_no, @title, @discipline, @type, @originator, @rev, 'Pending', @now, @now)`
      )
      .run({ ...body, now });
    db.prepare(
      `INSERT INTO revisions (document_id, rev, status, submitted_on) VALUES (?, ?, 'Pending', ?)`
    ).run(info.lastInsertRowid, body.rev, body.submitted_on || today());
    return info.lastInsertRowid;
  });

  const id = create();
  res.status(201).json({ ...getDocument(db, id), revisions: getRevisions(db, id) });
});

// PATCH /api/documents/:id
router.patch('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = schemas.idParam.parse(req.params);
  const body = schemas.updateDocument.parse(req.body);
  getDocument(db, id);

  if (body.doc_no) {
    const clash = db.prepare('SELECT id FROM documents WHERE doc_no = ? AND id != ?').get(body.doc_no, id);
    if (clash) {
      throw new HttpError(409, `Document number ${body.doc_no} already exists`, [
        { field: 'doc_no', message: 'Already in use' },
      ]);
    }
  }

  const fields = Object.keys(body);
  const sets = fields.map((f) => `${f} = @${f}`).join(', ');
  db.prepare(`UPDATE documents SET ${sets}, updated_at = @now WHERE id = @id`).run({ ...body, now: nowIso(), id });
  res.json({ ...getDocument(db, id), revisions: getRevisions(db, id) });
});

// DELETE /api/documents/:id
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = schemas.idParam.parse(req.params);
  getDocument(db, id);

  // A document that has been sent out is part of the project record.
  const sent = db.prepare('SELECT COUNT(*) AS n FROM transmittal_items WHERE document_id = ?').get(id).n;
  if (sent > 0) {
    throw new HttpError(409, 'Document has been issued on a transmittal and cannot be deleted');
  }

  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  res.status(204).end();
});

// GET /api/documents/:id/revisions
router.get('/:id/revisions', (req, res) => {
  const db = req.app.locals.db;
  const { id } = schemas.idParam.parse(req.params);
  getDocument(db, id);
  res.json({ data: getRevisions(db, id) });
});

// POST /api/documents/:id/revisions
// A new submission becomes the current revision and puts the document back to Pending.
router.post('/:id/revisions', (req, res) => {
  const db = req.app.locals.db;
  const { id } = schemas.idParam.parse(req.params);
  const body = schemas.createRevision.parse(req.body);
  getDocument(db, id);

  const dup = db.prepare('SELECT id FROM revisions WHERE document_id = ? AND rev = ?').get(id, body.rev);
  if (dup) {
    throw new HttpError(409, `Revision ${body.rev} already exists for this document`, [
      { field: 'rev', message: 'Already in use' },
    ]);
  }

  const add = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO revisions (document_id, rev, status, submitted_on, remarks) VALUES (?, ?, 'Pending', ?, ?)`
      )
      .run(id, body.rev, body.submitted_on || today(), body.remarks || null);
    db.prepare(`UPDATE documents SET current_rev = ?, status = 'Pending', updated_at = ? WHERE id = ?`).run(
      body.rev,
      nowIso(),
      id
    );
    return info.lastInsertRowid;
  });

  const revId = add();
  res.status(201).json(db.prepare('SELECT * FROM revisions WHERE id = ?').get(revId));
});

// PATCH /api/documents/:id/revisions/:revId
// Records the review result. If this is the current revision, the document status follows it.
router.patch('/:id/revisions/:revId', (req, res) => {
  const db = req.app.locals.db;
  const { id, revId } = schemas.revParams.parse(req.params);
  const body = schemas.reviewRevision.parse(req.body);
  const doc = getDocument(db, id);

  const revision = db.prepare('SELECT * FROM revisions WHERE id = ? AND document_id = ?').get(revId, id);
  if (!revision) throw notFound('Revision');

  const review = db.transaction(() => {
    const reviewedOn = body.status === 'Pending' ? null : body.reviewed_on || today();
    db.prepare('UPDATE revisions SET status = ?, remarks = ?, reviewed_on = ? WHERE id = ?').run(
      body.status,
      body.remarks !== undefined ? body.remarks : revision.remarks,
      reviewedOn,
      revId
    );
    if (doc.current_rev === revision.rev) {
      db.prepare('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?').run(body.status, nowIso(), id);
    }
  });
  review();

  res.json({
    revision: db.prepare('SELECT * FROM revisions WHERE id = ?').get(revId),
    document: getDocument(db, id),
  });
});

module.exports = router;
