const request = require('supertest');
const { makeApp } = require('./helpers');

let app;
let db;
beforeEach(() => {
  ({ app, db } = makeApp());
});
afterEach(() => db.close());

const body = {
  to_party: 'Mizan Structural Consultants',
  subject: 'Slab layout for review',
  purpose: 'For Approval',
  issued_on: '2026-10-29',
  items: [{ document_id: 3 }],
};

describe('transmittals', () => {
  test('lists seeded transmittals newest first with item counts', async () => {
    const res = await request(app).get('/api/transmittals');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    expect(res.body.data[0].number).toBe('TR-0004');
    expect(res.body.data[3]).toMatchObject({ number: 'TR-0001', item_count: 3 });
  });

  test('gets one transmittal with its documents', async () => {
    const res = await request(app).get('/api/transmittals/2');
    expect(res.status).toBe(200);
    expect(res.body.purpose).toBe('For Construction');
    expect(res.body.items.map((i) => `${i.doc_no} ${i.rev}`)).toEqual([
      'HVR-CIV-DWG-0001 C01',
      'HVR-STR-DWG-0001 C01',
    ]);
  });

  test('creates the next numbered transmittal using the current revision', async () => {
    const res = await request(app).post('/api/transmittals').send(body);
    expect(res.status).toBe(201);
    expect(res.body.number).toBe('TR-0005');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ doc_no: 'HVR-STR-DWG-0003', rev: 'P02' });
  });

  test('can send a specific older revision', async () => {
    const p01 = db.prepare("SELECT id FROM revisions WHERE document_id = 3 AND rev = 'P01'").get().id;
    const res = await request(app)
      .post('/api/transmittals')
      .send({ ...body, items: [{ document_id: 3, revision_id: p01 }] });
    expect(res.status).toBe(201);
    expect(res.body.items[0].rev).toBe('P01');
  });

  test('numbers keep counting up', async () => {
    await request(app).post('/api/transmittals').send(body);
    const res = await request(app).post('/api/transmittals').send(body);
    expect(res.body.number).toBe('TR-0006');
  });

  test('defaults issued_on to today', async () => {
    const { issued_on, ...rest } = body;
    const res = await request(app).post('/api/transmittals').send(rest);
    expect(res.body.issued_on).toBe(new Date().toISOString().slice(0, 10));
  });

  test('400 for an empty item list or unknown purpose', async () => {
    const res = await request(app).post('/api/transmittals').send({ ...body, purpose: 'For Fun', items: [] });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field).sort()).toEqual(['items', 'purpose']);
  });

  test('400 with line numbers for unknown documents and wrong revisions', async () => {
    const res = await request(app)
      .post('/api/transmittals')
      .send({ ...body, items: [{ document_id: 3 }, { document_id: 999 }, { document_id: 3, revision_id: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toEqual(['items.1.document_id', 'items.2.revision_id']);
    // Nothing is saved when any line is wrong.
    expect(db.prepare('SELECT COUNT(*) AS n FROM transmittals').get().n).toBe(4);
  });

  test('400 when the same revision is listed twice', async () => {
    const res = await request(app)
      .post('/api/transmittals')
      .send({ ...body, items: [{ document_id: 3 }, { document_id: 3 }] });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('items.1');
  });

  test('404 for a missing transmittal', async () => {
    expect((await request(app).get('/api/transmittals/999')).status).toBe(404);
  });

  test('first transmittal on an empty database is TR-0001', async () => {
    const empty = makeApp({ seeded: false });
    const doc = await request(empty.app).post('/api/documents').send({
      doc_no: 'HVR-CIV-RPT-0009',
      title: 'Survey Report',
      discipline: 'Civil',
      type: 'Report',
      originator: 'Wadi Stone Civil Engineering',
    });
    const res = await request(empty.app)
      .post('/api/transmittals')
      .send({ ...body, items: [{ document_id: doc.body.id }] });
    expect(res.body.number).toBe('TR-0001');
    empty.db.close();
  });
});
