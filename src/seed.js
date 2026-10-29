require('dotenv').config({ quiet: true });
const { openDb } = require('./db');

// Fictional parties on the sample project.
const ARCH = 'Desert Line Architects';
const STRU = 'Mizan Structural Consultants';
const MEPC = 'Brightflow MEP Engineers';
const CIVL = 'Wadi Stone Civil Engineering';
const MAIN = 'Sawahil Build Contracting';
const PMC = 'Corniche Project Management';

const DISC_CODE = { Architectural: 'ARC', Structural: 'STR', MEP: 'MEP', Civil: 'CIV' };
const TYPE_CODE = {
  Drawing: 'DWG',
  'Method Statement': 'MS',
  'Material Submittal': 'MAT',
  Report: 'RPT',
  Specification: 'SPC',
};

// [discipline, type, title, originator, revisions]
// Each revision: [rev, status, submitted_on, reviewed_on, remarks]
const DOCUMENTS = [
  ['Structural', 'Drawing', 'Foundation Layout Plan', STRU, [
    ['P01', 'Code B', '2026-08-03', '2026-08-10', 'Add pile cap schedule and resubmit.'],
    ['P02', 'Approved', '2026-08-17', '2026-08-21', 'Approved.'],
    ['C01', 'Approved', '2026-08-25', '2026-08-27', 'Issued for construction.'],
  ]],
  ['Structural', 'Drawing', 'Raft Foundation Reinforcement Details', STRU, [
    ['P01', 'Rejected', '2026-08-05', '2026-08-12', 'Bar laps do not match the specification. Revise.'],
    ['P02', 'Approved', '2026-08-20', '2026-08-26', 'Approved.'],
  ]],
  ['Structural', 'Drawing', 'Typical Floor Slab Layout, Levels 1 to 8', STRU, [
    ['P01', 'Code B', '2026-09-01', '2026-09-08', 'Show openings for MEP risers.'],
    ['P02', 'Pending', '2026-10-20', null, null],
  ]],
  ['Structural', 'Method Statement', 'Method Statement for Bored Piling Works', MAIN, [
    ['P01', 'Approved', '2026-07-28', '2026-08-04', 'Approved. Follow the inspection test plan.'],
  ]],
  ['Structural', 'Material Submittal', 'Ready Mix Concrete C40 Mix Design', MAIN, [
    ['P01', 'Code B', '2026-08-11', '2026-08-18', 'Provide 28 day cube results from the batching plant.'],
  ]],
  ['Structural', 'Report', 'Geotechnical Investigation Report', CIVL, [
    ['P01', 'Approved', '2026-07-15', '2026-07-22', 'Accepted for design.'],
  ]],
  ['Structural', 'Specification', 'Concrete Works Specification', STRU, [
    ['P01', 'Pending', '2026-10-22', null, null],
  ]],
  ['Architectural', 'Drawing', 'Ground Floor Plan', ARCH, [
    ['P01', 'Code B', '2026-08-06', '2026-08-13', 'Revise lobby layout as per client comments.'],
    ['P02', 'Approved', '2026-09-02', '2026-09-07', 'Approved.'],
  ]],
  ['Architectural', 'Drawing', 'Typical Apartment Layout, Type A', ARCH, [
    ['P01', 'Approved', '2026-08-14', '2026-08-20', 'Approved.'],
  ]],
  ['Architectural', 'Drawing', 'Building Elevations, North and South', ARCH, [
    ['P01', 'Rejected', '2026-09-10', '2026-09-17', 'Facade cladding does not match the approved concept.'],
    ['P02', 'Pending', '2026-10-25', null, null],
  ]],
  ['Architectural', 'Drawing', 'Wall Sections and Details', ARCH, [
    ['P01', 'Code B', '2026-09-15', '2026-09-23', 'Add waterproofing detail at podium level.'],
  ]],
  ['Architectural', 'Material Submittal', 'Porcelain Floor Tiles, Lobby and Corridors', MAIN, [
    ['P01', 'Rejected', '2026-09-03', '2026-09-09', 'Slip resistance rating below the specification.'],
  ]],
  ['Architectural', 'Material Submittal', 'Aluminium Windows and Glazing System', MAIN, [
    ['P01', 'Pending', '2026-10-18', null, null],
  ]],
  ['Architectural', 'Specification', 'Finishes Schedule and Specification', ARCH, [
    ['P01', 'Code B', '2026-08-28', '2026-09-04', 'Update the wet area finishes and resubmit.'],
  ]],
  ['MEP', 'Drawing', 'HVAC Ductwork Layout, Typical Floor', MEPC, [
    ['P01', 'Code B', '2026-09-07', '2026-09-14', 'Coordinate duct levels with structural beams.'],
    ['P02', 'Approved', '2026-10-01', '2026-10-06', 'Approved.'],
  ]],
  ['MEP', 'Drawing', 'Electrical Single Line Diagram', MEPC, [
    ['P01', 'Code B', '2026-09-12', '2026-09-20', 'Update transformer rating and resubmit.'],
  ]],
  ['MEP', 'Drawing', 'Plumbing and Drainage Riser Diagram', MEPC, [
    ['P01', 'Pending', '2026-10-24', null, null],
  ]],
  ['MEP', 'Material Submittal', 'Chilled Water Pumps', MAIN, [
    ['P01', 'Code B', '2026-09-21', '2026-09-28', 'Provide pump curves at the design duty point.'],
  ]],
  ['MEP', 'Material Submittal', 'Fire Alarm Control Panel', MAIN, [
    ['P01', 'Rejected', '2026-09-25', '2026-10-02', 'Panel is not on the approved manufacturer list.'],
  ]],
  ['MEP', 'Method Statement', 'Method Statement for Cable Tray Installation', MAIN, [
    ['P01', 'Pending', '2026-10-27', null, null],
  ]],
  ['MEP', 'Report', 'Electrical Load Calculation Report', MEPC, [
    ['P01', 'Code B', '2026-08-30', '2026-09-06', 'Add diversity factors for the retail units.'],
  ]],
  ['Civil', 'Drawing', 'Site Grading and Levels Plan', CIVL, [
    ['P01', 'Approved', '2026-08-01', '2026-08-08', 'Approved.'],
    ['C01', 'Approved', '2026-08-12', '2026-08-14', 'Issued for construction.'],
  ]],
  ['Civil', 'Drawing', 'Stormwater Drainage Network', CIVL, [
    ['P01', 'Code B', '2026-09-18', '2026-09-25', 'Increase manhole spacing detail. Resubmit.'],
    ['P02', 'Pending', '2026-10-21', null, null],
  ]],
  ['Civil', 'Method Statement', 'Method Statement for Excavation and Dewatering', MAIN, [
    ['P01', 'Rejected', '2026-07-30', '2026-08-06', 'Dewatering design calculations missing.'],
  ]],
  ['Civil', 'Report', 'Traffic Impact Assessment', CIVL, [
    ['P01', 'Approved', '2026-07-20', '2026-07-29', 'Accepted.'],
  ]],
];

// [to_party, subject, purpose, issued_on, [index into DOCUMENTS, rev]]
const TRANSMITTALS = [
  [STRU, 'Foundation drawings and piling method statement for review', 'For Approval', '2026-08-17', [[0, 'P02'], [1, 'P02'], [3, 'P01']]],
  [MAIN, 'Approved foundation and grading drawings', 'For Construction', '2026-08-27', [[0, 'C01'], [21, 'C01']]],
  [PMC, 'Architectural design package, ground floor and apartments', 'For Information', '2026-09-08', [[7, 'P02'], [8, 'P01'], [13, 'P01']]],
  [MEPC, 'MEP drawings and submittals for review', 'For Approval', '2026-10-02', [[14, 'P02'], [15, 'P01'], [17, 'P01']]],
];

// Wipes the database and loads the sample project.
function seed(db) {
  const insertDoc = db.prepare(
    `INSERT INTO documents (doc_no, title, discipline, type, originator, current_rev, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertRev = db.prepare(
    `INSERT INTO revisions (document_id, rev, status, submitted_on, reviewed_on, remarks) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertTr = db.prepare(
    `INSERT INTO transmittals (number, to_party, subject, purpose, issued_on, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertItem = db.prepare(
    'INSERT INTO transmittal_items (transmittal_id, document_id, revision_id) VALUES (?, ?, ?)'
  );

  const run = db.transaction(() => {
    db.exec(`
      DELETE FROM transmittal_items; DELETE FROM transmittals;
      DELETE FROM revisions; DELETE FROM documents;
      DELETE FROM sqlite_sequence;
    `);

    // Running number per discipline and type, e.g. HVR-STR-DWG-0003.
    const counters = {};
    const revIds = []; // revIds[docIndex][rev] = revision id
    const docIds = [];

    DOCUMENTS.forEach(([discipline, type, title, originator, revisions]) => {
      const prefix = `HVR-${DISC_CODE[discipline]}-${TYPE_CODE[type]}`;
      counters[prefix] = (counters[prefix] || 0) + 1;
      const docNo = `${prefix}-${String(counters[prefix]).padStart(4, '0')}`;

      const last = revisions[revisions.length - 1];
      const created = `${revisions[0][2]}T08:00:00.000Z`;
      const updated = `${last[3] || last[2]}T12:30:00.000Z`;
      const info = insertDoc.run(docNo, title, discipline, type, originator, last[0], last[1], created, updated);

      const ids = {};
      for (const [rev, status, submitted, reviewed, remarks] of revisions) {
        ids[rev] = insertRev.run(info.lastInsertRowid, rev, status, submitted, reviewed, remarks).lastInsertRowid;
      }
      docIds.push(info.lastInsertRowid);
      revIds.push(ids);
    });

    TRANSMITTALS.forEach(([to, subject, purpose, issuedOn, items], i) => {
      const number = `TR-${String(i + 1).padStart(4, '0')}`;
      const tr = insertTr.run(number, to, subject, purpose, issuedOn, `${issuedOn}T09:00:00.000Z`);
      for (const [docIndex, rev] of items) {
        insertItem.run(tr.lastInsertRowid, docIds[docIndex], revIds[docIndex][rev]);
      }
    });
  });

  run();
  return { documents: DOCUMENTS.length, transmittals: TRANSMITTALS.length };
}

module.exports = { seed };

// Allow "npm run seed" to run this file directly.
if (require.main === module) {
  const db = openDb();
  const result = seed(db);
  db.close();
  console.log(`Seeded ${result.documents} documents and ${result.transmittals} transmittals.`);
}
