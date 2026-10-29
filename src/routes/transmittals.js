const express = require('express');
const schemas = require('../schemas');
const { HttpError, notFound } = require('../errors');
const { nowIso, today } = require('../util');

const router = express.Router();

// Next number in the TR-0001 series.
function nextNumber(db) {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(number, 4) AS INTEGER)) AS n FROM transmittals").get();
  return `TR-${String((row.n || 0) + 1).padStart(4, '0')}`;
}

function getTransmittal(db, id) {
  const tr = db.prepare('SELECT * FROM transmittals WHERE id = ?').get(id);
  if (!tr) throw notFound('Transmittal');
  const items = db
    .prepare(
      `SELECT ti.id, ti.document_id, ti.revision_id, d.doc_no, d.title, r.rev, r.status AS rev_status
         FROM transmittal_items ti
         JOIN documents d ON d.id = ti.document_id
         JOIN revisions r ON r.id = ti.revision_id
        WHERE ti.transmittal_id = ?
        ORDER BY d.doc_no`
    )
    .all(id);
  return { ...tr, items };
}

// GET /api/transmittals
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const data = db
    .prepare(
      `SELECT t.*, COUNT(ti.id) AS item_count
         FROM transmittals t
         LEFT JOIN transmittal_items ti ON ti.transmittal_id = t.id
        GROUP BY t.id
        ORDER BY t.id DESC`
    )
    .all();
  res.json({ data, total: data.length });
});

// GET /api/transmittals/:id
router.get('/:id', (req, res) => {
  const { id } = schemas.idParam.parse(req.params);
  res.json(getTransmittal(req.app.locals.db, id));
});

// POST /api/transmittals
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const body = schemas.createTransmittal.parse(req.body);

  // Check every line before writing anything, and collect all problems at once.
  const errors = [];
  const seen = new Set();
  const resolved = body.items.map((item, i) => {
    const doc = db.prepare('SELECT id, current_rev FROM documents WHERE id = ?').get(item.document_id);
    if (!doc) {
      errors.push({ field: `items.${i}.document_id`, message: `Document ${item.document_id} not found` });
      return null;
    }
    const rev = item.revision_id
      ? db.prepare('SELECT id FROM revisions WHERE id = ? AND document_id = ?').get(item.revision_id, doc.id)
      : db.prepare('SELECT id FROM revisions WHERE rev = ? AND document_id = ?').get(doc.current_rev, doc.id);
    if (!rev) {
      errors.push({
        field: `items.${i}.revision_id`,
        message: `Revision ${item.revision_id || doc.current_rev} does not belong to document ${doc.id}`,
      });
      return null;
    }
    const key = `${doc.id}:${rev.id}`;
    if (seen.has(key)) errors.push({ field: `items.${i}`, message: 'This document revision is listed twice' });
    seen.add(key);
    return { document_id: doc.id, revision_id: rev.id };
  });
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  const create = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO transmittals (number, to_party, subject, purpose, issued_on, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(nextNumber(db), body.to_party, body.subject, body.purpose, body.issued_on || today(), nowIso());
    const addItem = db.prepare(
      'INSERT INTO transmittal_items (transmittal_id, document_id, revision_id) VALUES (?, ?, ?)'
    );
    for (const item of resolved) addItem.run(info.lastInsertRowid, item.document_id, item.revision_id);
    return info.lastInsertRowid;
  });

  const id = create();
  res.status(201).json(getTransmittal(db, id));
});

module.exports = router;
