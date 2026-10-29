const request = require('supertest');
const { makeApp } = require('./helpers');

let app;
let db;
beforeEach(() => {
  ({ app, db } = makeApp());
});
afterEach(() => db.close());

const newDoc = {
  doc_no: 'HVR-ARC-DWG-0100',
  title: 'Level 3 Floor Plan',
  discipline: 'Architectural',
  type: 'Drawing',
  originator: 'Desert Line Architects',
};

describe('GET /api/documents', () => {
  test('returns the first page with paging info', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 25 });
    expect(res.body.data).toHaveLength(20);
    // Default sort is by document number.
    const numbers = res.body.data.map((d) => d.doc_no);
    expect(numbers).toEqual([...numbers].sort());
  });

  test('second page holds the remaining documents', async () => {
    const res = await request(app).get('/api/documents?page=2&limit=20');
    expect(res.body.data).toHaveLength(5);
    expect(res.body.total).toBe(25);
  });

  test('searches document number and title', async () => {
    const byTitle = await request(app).get('/api/documents?q=foundation');
    expect(byTitle.body.total).toBe(2);
    byTitle.body.data.forEach((d) => expect(d.title.toLowerCase()).toContain('foundation'));

    const byNumber = await request(app).get('/api/documents?q=HVR-CIV');
    expect(byNumber.body.total).toBe(4);
  });

  test('filters by status, discipline and type together', async () => {
    const res = await request(app).get('/api/documents?status=Pending&discipline=MEP&type=Drawing');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].doc_no).toBe('HVR-MEP-DWG-0003');
  });

  test('sorts descending with a leading minus', async () => {
    const res = await request(app).get('/api/documents?sort=-updated_at&limit=5');
    const dates = res.body.data.map((d) => d.updated_at);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  test('returns an empty page, not an error, when nothing matches', async () => {
    const res = await request(app).get('/api/documents?q=no-such-thing');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [], total: 0 });
  });

  test('rejects bad query values with field errors', async () => {
    const res = await request(app).get('/api/documents?status=Done&limit=500&sort=password');
    expect(res.status).toBe(400);
    const fields = res.body.details.map((d) => d.field).sort();
    expect(fields).toEqual(['limit', 'sort', 'status']);
  });
});

describe('GET /api/documents/:id', () => {
  test('returns the document with its revisions', async () => {
    const res = await request(app).get('/api/documents/1');
    expect(res.status).toBe(200);
    expect(res.body.doc_no).toBe('HVR-STR-DWG-0001');
    expect(res.body.revisions.map((r) => r.rev)).toEqual(['P01', 'P02', 'C01']);
  });

  test('404 for a missing document', async () => {
    const res = await request(app).get('/api/documents/9999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Document not found');
  });

  test('400 for an id that is not a number', async () => {
    const res = await request(app).get('/api/documents/abc');
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ field: 'id', message: 'Must be a number' }]);
  });
});

describe('POST /api/documents', () => {
  test('creates a document with its first revision', async () => {
    const res = await request(app).post('/api/documents').send({ ...newDoc, doc_no: 'hvr-arc-dwg-0100' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      doc_no: 'HVR-ARC-DWG-0100', // stored in upper case
      current_rev: 'P01',
      status: 'Pending',
    });
    expect(res.body.revisions).toHaveLength(1);
    expect(res.body.revisions[0]).toMatchObject({ rev: 'P01', status: 'Pending' });
  });

  test('lists every missing or invalid field', async () => {
    const res = await request(app).post('/api/documents').send({ doc_no: 'bad', discipline: 'Landscape' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    const byField = Object.fromEntries(res.body.details.map((d) => [d.field, d.message]));
    expect(byField.doc_no).toMatch(/HVR-STR-DWG-0001/);
    expect(byField.title).toBe('Required');
    expect(byField.type).toBe('Required');
    expect(byField.originator).toBe('Required');
    expect(byField.discipline).toBe('Must be one of: Architectural, Structural, MEP, Civil');
  });

  test('rejects a blank title after trimming', async () => {
    const res = await request(app).post('/api/documents').send({ ...newDoc, title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ field: 'title', message: 'Must not be empty' }]);
  });

  test('409 when the document number is already used', async () => {
    const res = await request(app).post('/api/documents').send({ ...newDoc, doc_no: 'HVR-STR-DWG-0001' });
    expect(res.status).toBe(409);
    expect(res.body.details[0].field).toBe('doc_no');
  });

  test('400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Content-Type', 'application/json')
      .send('{"doc_no": ');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not valid JSON/);
  });
});

describe('PATCH /api/documents/:id', () => {
  test('updates the given fields and bumps updated_at', async () => {
    const before = (await request(app).get('/api/documents/2')).body;
    const res = await request(app).patch('/api/documents/2').send({ title: 'Raft Reinforcement Details, Zone A' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Raft Reinforcement Details, Zone A');
    expect(res.body.discipline).toBe(before.discipline);
    expect(res.body.updated_at > before.updated_at).toBe(true);
  });

  test('refuses an empty body', async () => {
    const res = await request(app).patch('/api/documents/2').send({});
    expect(res.status).toBe(400);
  });

  test('refuses fields that are managed by revisions', async () => {
    const res = await request(app).patch('/api/documents/2').send({ status: 'Approved' });
    expect(res.status).toBe(400);
  });

  test('409 when renaming to an existing number', async () => {
    const res = await request(app).patch('/api/documents/2').send({ doc_no: 'HVR-STR-DWG-0001' });
    expect(res.status).toBe(409);
  });

  test('404 for a missing document', async () => {
    const res = await request(app).patch('/api/documents/9999').send({ title: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/documents/:id', () => {
  test('deletes a document and its revisions', async () => {
    const created = await request(app).post('/api/documents').send(newDoc);
    const id = created.body.id;
    const res = await request(app).delete(`/api/documents/${id}`);
    expect(res.status).toBe(204);
    expect((await request(app).get(`/api/documents/${id}`)).status).toBe(404);
    const left = db.prepare('SELECT COUNT(*) AS n FROM revisions WHERE document_id = ?').get(id).n;
    expect(left).toBe(0);
  });

  test('409 when the document is on a transmittal', async () => {
    const res = await request(app).delete('/api/documents/1');
    expect(res.status).toBe(409);
  });

  test('404 for a missing document', async () => {
    expect((await request(app).delete('/api/documents/9999')).status).toBe(404);
  });
});

describe('GET /api/documents/export.csv', () => {
  test('downloads the filtered register as CSV', async () => {
    const res = await request(app).get('/api/documents/export.csv?discipline=Civil');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="document-register-\d{4}-\d{2}-\d{2}\.csv"$/);
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe('Document No,Title,Discipline,Type,Originator,Current Rev,Status,Last Updated');
    expect(lines).toHaveLength(5);
  });

  test('quotes commas and double quotes properly', async () => {
    await request(app)
      .post('/api/documents')
      .send({ ...newDoc, title: 'Lobby "Feature" Wall, Elevation' });
    const res = await request(app).get('/api/documents/export.csv?q=HVR-ARC-DWG-0100');
    const row = res.text.trim().split('\r\n')[1];
    expect(row).toContain('"Lobby ""Feature"" Wall, Elevation"');
  });

  test('uses the same validation as the list', async () => {
    const res = await request(app).get('/api/documents/export.csv?status=Maybe');
    expect(res.status).toBe(400);
  });
});
