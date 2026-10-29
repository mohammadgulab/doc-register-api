const { z } = require('zod');
const { DISCIPLINES, DOC_TYPES, STATUSES, PURPOSES, SORT_FIELDS } = require('./constants');

// Friendlier default messages for missing fields and bad enum values.
z.config({
  customError: (issue) => {
    if (issue.input === undefined) return 'Required';
    if (issue.code === 'invalid_value') return `Must be one of: ${issue.values.join(', ')}`;
    return undefined;
  },
});

const text = (max) => z.string().trim().min(1, 'Must not be empty').max(max, `Must be at most ${max} characters`);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date like 2026-10-30');

// Project style document number, for example HVR-STR-DWG-0001.
const docNo = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]+(-[A-Z0-9]+){2,}$/, 'Must look like HVR-STR-DWG-0001');

// Revision codes: one letter and two digits, for example P01 or C01.
const revCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]\d{2}$/, 'Must be a letter and two digits, for example P01 or C01');

const idParam = z.object({
  id: z.coerce.number({ error: 'Must be a number' }).int('Must be a whole number').positive('Must be a positive number'),
});

const revParams = idParam.extend({
  revId: z.coerce.number({ error: 'Must be a number' }).int('Must be a whole number').positive('Must be a positive number'),
});

// Filters shared by the list endpoint and the CSV export.
const documentFilters = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(STATUSES).optional(),
  discipline: z.enum(DISCIPLINES).optional(),
  type: z.enum(DOC_TYPES).optional(),
  sort: z
    .string()
    .refine((s) => SORT_FIELDS.includes(s.replace(/^-/, '')), {
      message: `Must be one of ${SORT_FIELDS.join(', ')} (prefix with - for descending)`,
    })
    .default('doc_no'),
});

const documentListQuery = documentFilters.extend({
  page: z.coerce.number().int().min(1, 'Must be 1 or more').default(1),
  limit: z.coerce.number().int().min(1, 'Must be 1 or more').max(100, 'Must be 100 or less').default(20),
});

const createDocument = z.object({
  doc_no: docNo,
  title: text(200),
  discipline: z.enum(DISCIPLINES),
  type: z.enum(DOC_TYPES),
  originator: text(120),
  // The first revision is created together with the document.
  rev: revCode.default('P01'),
  submitted_on: isoDate.optional(),
});

const updateDocument = z
  .object({
    doc_no: docNo.optional(),
    title: text(200).optional(),
    discipline: z.enum(DISCIPLINES).optional(),
    type: z.enum(DOC_TYPES).optional(),
    originator: text(120).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to update' });

const createRevision = z.object({
  rev: revCode,
  submitted_on: isoDate.optional(),
  remarks: z.string().trim().max(500).optional(),
});

const reviewRevision = z.object({
  status: z.enum(['Approved', 'Code B', 'Rejected', 'Pending']),
  remarks: z.string().trim().max(500).optional(),
  reviewed_on: isoDate.optional(),
});

const createTransmittal = z.object({
  to_party: text(120),
  subject: text(200),
  purpose: z.enum(PURPOSES),
  issued_on: isoDate.optional(),
  items: z
    .array(
      z.object({
        document_id: z.number().int().positive(),
        // Leave out to send the document's current revision.
        revision_id: z.number().int().positive().optional(),
      })
    )
    .min(1, 'A transmittal needs at least one document'),
});

module.exports = {
  idParam,
  revParams,
  documentFilters,
  documentListQuery,
  createDocument,
  updateDocument,
  createRevision,
  reviewRevision,
  createTransmittal,
};
