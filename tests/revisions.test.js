const request = require('supertest');
const { makeApp } = require('./helpers');

let app;
let db;
beforeEach(() => {
  ({ app, db } = makeApp());
});
afterEach(() => db.close());

// Document 3 (HVR-STR-DWG-0003) has P01 (Code B) and P02 (Pending, current).
const DOC = 3;

describe('GET /api/documents/:id/revisions', () => {
  test('lists revisions oldest first', async () => {
    const res = await request(app).get(`/api/documents/${DOC}/revisions`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.rev)).toEqual(['P01', 'P02']);
  });

  test('404 for a missing document', async () => {
    expect((await request(app).get('/api/documents/9999/revisions')).status).toBe(404);
  });
});

describe('POST /api/documents/:id/revisions', () => {
  test('new revision becomes current and resets status to Pending', async () => {
    // Document 1 is Approved at C01.
    const res = await request(app)
      .post('/api/documents/1/revisions')
      .send({ rev: 'c02', submitted_on: '2026-10-29', remarks: 'Updated pile cap levels' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ rev: 'C02', status: 'Pending', submitted_on: '2026-10-29' });

    const doc = (await request(app).get('/api/documents/1')).body;
    expect(doc.current_rev).toBe('C02');
    expect(doc.status).toBe('Pending');
    expect(doc.revisions).toHaveLength(4);
  });

  test('409 for a revision code that already exists', async () => {
    const res = await request(app).post(`/api/documents/${DOC}/revisions`).send({ rev: 'P01' });
    expect(res.status).toBe(409);
  });

  test('400 for a badly formed revision code or date', async () => {
    const res = await request(app)
      .post(`/api/documents/${DOC}/revisions`)
      .send({ rev: 'rev 3', submitted_on: '29/10/2026' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field).sort()).toEqual(['rev', 'submitted_on']);
  });

  test('404 for a missing document', async () => {
    const res = await request(app).post('/api/documents/9999/revisions').send({ rev: 'P01' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/documents/:id/revisions/:revId', () => {
  const revId = (rev) =>
    db.prepare('SELECT id FROM revisions WHERE document_id = ? AND rev = ?').get(DOC, rev).id;

  test('reviewing the current revision updates the document status', async () => {
    const res = await request(app)
      .patch(`/api/documents/${DOC}/revisions/${revId('P02')}`)
      .send({ status: 'Approved', remarks: 'Riser openings now shown. Approved.', reviewed_on: '2026-10-29' });
    expect(res.status).toBe(200);
    expect(res.body.revision).toMatchObject({ status: 'Approved', reviewed_on: '2026-10-29' });
    expect(res.body.document.status).toBe('Approved');
  });

  test('reviewing an older revision leaves the document status alone', async () => {
    const res = await request(app)
      .patch(`/api/documents/${DOC}/revisions/${revId('P01')}`)
      .send({ status: 'Rejected', remarks: 'Superseded' });
    expect(res.status).toBe(200);
    expect(res.body.revision.status).toBe('Rejected');
    expect(res.body.document.status).toBe('Pending');
  });

  test('keeps the old remarks when none are sent', async () => {
    const res = await request(app).patch(`/api/documents/${DOC}/revisions/${revId('P01')}`).send({ status: 'Code B' });
    expect(res.body.revision.remarks).toBe('Show openings for MEP risers.');
  });

  test('400 for an unknown status', async () => {
    const res = await request(app).patch(`/api/documents/${DOC}/revisions/${revId('P02')}`).send({ status: 'Code Z' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('status');
  });

  test('404 when the revision belongs to another document', async () => {
    const otherRev = db.prepare('SELECT id FROM revisions WHERE document_id = 1 LIMIT 1').get().id;
    const res = await request(app).patch(`/api/documents/${DOC}/revisions/${otherRev}`).send({ status: 'Approved' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Revision not found');
  });
});
