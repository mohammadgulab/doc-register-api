const request = require('supertest');
const { makeApp } = require('./helpers');
const { csvValue, toCsv } = require('../src/csv');

let app;
let db;
beforeAll(() => {
  ({ app, db } = makeApp());
});
afterAll(() => db.close());

describe('health, stats and docs', () => {
  test('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.project).toMatch(/Harbor View/);
  });

  test('GET /api/stats counts by status and discipline', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(res.body.by_status)).toBe(25);
    expect(sum(res.body.by_discipline)).toBe(25);
    expect(Object.keys(res.body.by_status)).toEqual(['Pending', 'Approved', 'Code B', 'Rejected']);
    expect(res.body.transmittals).toBe(4);
  });

  test('stats include zero counts on an empty database', async () => {
    const empty = makeApp({ seeded: false });
    const res = await request(empty.app).get('/api/stats');
    expect(res.body.by_status).toEqual({ Pending: 0, Approved: 0, 'Code B': 0, Rejected: 0 });
    empty.db.close();
  });

  test('serves the OpenAPI spec and Swagger UI', async () => {
    const spec = await request(app).get('/openapi.json');
    expect(spec.body.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.body.paths)).toContain('/api/documents/{id}/revisions/{revId}');
    const ui = await request(app).get('/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger-ui');
  });

  test('serves the register page', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Document Register');
  });

  test('unknown routes get a JSON 404', async () => {
    const res = await request(app).get('/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Route GET /api/nothing-here not found');
  });
});

describe('csv helpers', () => {
  test('leaves plain values alone', () => {
    expect(csvValue('HVR-STR-DWG-0001')).toBe('HVR-STR-DWG-0001');
    expect(csvValue(null)).toBe('');
    expect(csvValue(12)).toBe('12');
  });

  test('quotes commas, quotes and line breaks', () => {
    expect(csvValue('a,b')).toBe('"a,b"');
    expect(csvValue('say "hi"')).toBe('"say ""hi"""');
    expect(csvValue('line1\nline2')).toBe('"line1\nline2"');
  });

  test('stops spreadsheet formulas', () => {
    expect(csvValue('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
  });

  test('builds a full file with CRLF line endings', () => {
    const out = toCsv([{ key: 'a', label: 'A' }], [{ a: 1 }, { a: 2 }]);
    expect(out).toBe('A\r\n1\r\n2\r\n');
  });
});
