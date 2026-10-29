const { DISCIPLINES, DOC_TYPES, STATUSES, PURPOSES, SORT_FIELDS } = require('./constants');
const pkg = require('../package.json');

// Small helpers to keep the spec readable.
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const idParam = (name = 'id', description = 'Document id') => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'integer', minimum: 1 },
});
const errors = {
  400: { description: 'Validation failed', ...json(ref('ValidationError')) },
  404: { description: 'Not found', ...json(ref('Error')) },
};

const filterParams = [
  { name: 'q', in: 'query', description: 'Search in document number and title', schema: { type: 'string' } },
  { name: 'status', in: 'query', schema: { type: 'string', enum: STATUSES } },
  { name: 'discipline', in: 'query', schema: { type: 'string', enum: DISCIPLINES } },
  { name: 'type', in: 'query', schema: { type: 'string', enum: DOC_TYPES } },
  {
    name: 'sort',
    in: 'query',
    description: `One of ${SORT_FIELDS.join(', ')}. Prefix with - for descending, for example -updated_at.`,
    schema: { type: 'string', default: 'doc_no' },
  },
];

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Document Register API',
    version: pkg.version,
    description:
      'REST API for a construction project document register: documents, revisions, review status and transmittals. Sample project: Harbor View Residences, Jeddah (fictional).',
    license: { name: 'MIT' },
    contact: { name: 'Mohammad Gulab', url: 'https://mohammadgulab.github.io/' },
  },
  tags: [
    { name: 'Documents', description: 'Register entries and their revisions' },
    { name: 'Transmittals', description: 'Formal issue of documents to other parties' },
    { name: 'Stats', description: 'Summary counts' },
    { name: 'Health' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Service health check',
        responses: { 200: { description: 'Service is up', ...json(ref('Health')) } },
      },
    },
    '/api/documents': {
      get: {
        tags: ['Documents'],
        summary: 'List documents with search, filters, sorting and paging',
        parameters: [
          ...filterParams,
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: 'A page of documents',
            ...json({
              type: 'object',
              properties: {
                data: { type: 'array', items: ref('Document') },
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
              },
            }),
          },
          400: errors[400],
        },
      },
      post: {
        tags: ['Documents'],
        summary: 'Register a new document (creates its first revision)',
        requestBody: { required: true, ...json(ref('NewDocument')) },
        responses: {
          201: { description: 'Created', ...json(ref('DocumentWithRevisions')) },
          400: errors[400],
          409: { description: 'Document number already exists', ...json(ref('Error')) },
        },
      },
    },
    '/api/documents/export.csv': {
      get: {
        tags: ['Documents'],
        summary: 'Download the register as CSV (same filters as the list)',
        parameters: filterParams,
        responses: {
          200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } },
          400: errors[400],
        },
      },
    },
    '/api/documents/{id}': {
      parameters: [idParam()],
      get: {
        tags: ['Documents'],
        summary: 'Get one document with its revision history',
        responses: { 200: { description: 'Document', ...json(ref('DocumentWithRevisions')) }, ...errors },
      },
      patch: {
        tags: ['Documents'],
        summary: 'Update document details',
        description: 'Status and current revision are managed through the revision endpoints.',
        requestBody: { required: true, ...json(ref('DocumentUpdate')) },
        responses: {
          200: { description: 'Updated', ...json(ref('DocumentWithRevisions')) },
          ...errors,
          409: { description: 'Document number already exists', ...json(ref('Error')) },
        },
      },
      delete: {
        tags: ['Documents'],
        summary: 'Delete a document',
        responses: {
          204: { description: 'Deleted' },
          ...errors,
          409: { description: 'Document is on a transmittal', ...json(ref('Error')) },
        },
      },
    },
    '/api/documents/{id}/revisions': {
      parameters: [idParam()],
      get: {
        tags: ['Documents'],
        summary: 'List revisions of a document',
        responses: {
          200: {
            description: 'Revisions, oldest first',
            ...json({ type: 'object', properties: { data: { type: 'array', items: ref('Revision') } } }),
          },
          ...errors,
        },
      },
      post: {
        tags: ['Documents'],
        summary: 'Submit a new revision',
        description: 'The new revision becomes the current revision and the document goes back to Pending.',
        requestBody: { required: true, ...json(ref('NewRevision')) },
        responses: {
          201: { description: 'Created', ...json(ref('Revision')) },
          ...errors,
          409: { description: 'Revision code already used', ...json(ref('Error')) },
        },
      },
    },
    '/api/documents/{id}/revisions/{revId}': {
      parameters: [idParam(), idParam('revId', 'Revision id')],
      patch: {
        tags: ['Documents'],
        summary: 'Record the review result of a revision',
        description: 'If the revision is the current one, the document status is updated to match.',
        requestBody: { required: true, ...json(ref('Review')) },
        responses: {
          200: {
            description: 'Reviewed',
            ...json({
              type: 'object',
              properties: { revision: ref('Revision'), document: ref('Document') },
            }),
          },
          ...errors,
        },
      },
    },
    '/api/transmittals': {
      get: {
        tags: ['Transmittals'],
        summary: 'List transmittals, newest first',
        responses: {
          200: {
            description: 'Transmittals',
            ...json({
              type: 'object',
              properties: {
                data: { type: 'array', items: ref('TransmittalSummary') },
                total: { type: 'integer' },
              },
            }),
          },
        },
      },
      post: {
        tags: ['Transmittals'],
        summary: 'Issue a transmittal (number is assigned automatically)',
        requestBody: { required: true, ...json(ref('NewTransmittal')) },
        responses: { 201: { description: 'Created', ...json(ref('Transmittal')) }, 400: errors[400] },
      },
    },
    '/api/transmittals/{id}': {
      parameters: [idParam('id', 'Transmittal id')],
      get: {
        tags: ['Transmittals'],
        summary: 'Get one transmittal with its documents',
        responses: { 200: { description: 'Transmittal', ...json(ref('Transmittal')) }, ...errors },
      },
    },
    '/api/stats': {
      get: {
        tags: ['Stats'],
        summary: 'Document counts by status, discipline and type',
        responses: { 200: { description: 'Counts', ...json(ref('Stats')) } },
      },
    },
  },
  components: {
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      ValidationError: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Validation failed' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'discipline' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      Health: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          project: { type: 'string' },
          uptime: { type: 'integer' },
          time: { type: 'string', format: 'date-time' },
        },
      },
      Document: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          doc_no: { type: 'string', example: 'HVR-STR-DWG-0001' },
          title: { type: 'string', example: 'Foundation Layout Plan' },
          discipline: { type: 'string', enum: DISCIPLINES },
          type: { type: 'string', enum: DOC_TYPES },
          originator: { type: 'string', example: 'Mizan Structural Consultants' },
          current_rev: { type: 'string', example: 'C01' },
          status: { type: 'string', enum: STATUSES },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      DocumentWithRevisions: {
        allOf: [ref('Document'), { type: 'object', properties: { revisions: { type: 'array', items: ref('Revision') } } }],
      },
      NewDocument: {
        type: 'object',
        required: ['doc_no', 'title', 'discipline', 'type', 'originator'],
        properties: {
          doc_no: { type: 'string', example: 'HVR-ARC-DWG-0100' },
          title: { type: 'string', example: 'Level 3 Floor Plan' },
          discipline: { type: 'string', enum: DISCIPLINES },
          type: { type: 'string', enum: DOC_TYPES },
          originator: { type: 'string', example: 'Desert Line Architects' },
          rev: { type: 'string', example: 'P01', default: 'P01' },
          submitted_on: { type: 'string', format: 'date' },
        },
      },
      DocumentUpdate: {
        type: 'object',
        properties: {
          doc_no: { type: 'string' },
          title: { type: 'string' },
          discipline: { type: 'string', enum: DISCIPLINES },
          type: { type: 'string', enum: DOC_TYPES },
          originator: { type: 'string' },
        },
      },
      Revision: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          document_id: { type: 'integer' },
          rev: { type: 'string', example: 'P02' },
          status: { type: 'string', enum: STATUSES },
          submitted_on: { type: 'string', format: 'date' },
          reviewed_on: { type: 'string', format: 'date', nullable: true },
          remarks: { type: 'string', nullable: true },
        },
      },
      NewRevision: {
        type: 'object',
        required: ['rev'],
        properties: {
          rev: { type: 'string', example: 'P02' },
          submitted_on: { type: 'string', format: 'date' },
          remarks: { type: 'string' },
        },
      },
      Review: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: STATUSES, example: 'Code B' },
          remarks: { type: 'string', example: 'Approved with comments. Revise rebar schedule and resubmit.' },
          reviewed_on: { type: 'string', format: 'date' },
        },
      },
      TransmittalSummary: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          number: { type: 'string', example: 'TR-0001' },
          to_party: { type: 'string' },
          subject: { type: 'string' },
          purpose: { type: 'string', enum: PURPOSES },
          issued_on: { type: 'string', format: 'date' },
          created_at: { type: 'string', format: 'date-time' },
          item_count: { type: 'integer' },
        },
      },
      Transmittal: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          number: { type: 'string', example: 'TR-0001' },
          to_party: { type: 'string' },
          subject: { type: 'string' },
          purpose: { type: 'string', enum: PURPOSES },
          issued_on: { type: 'string', format: 'date' },
          created_at: { type: 'string', format: 'date-time' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                document_id: { type: 'integer' },
                revision_id: { type: 'integer' },
                doc_no: { type: 'string' },
                title: { type: 'string' },
                rev: { type: 'string' },
                rev_status: { type: 'string', enum: STATUSES },
              },
            },
          },
        },
      },
      NewTransmittal: {
        type: 'object',
        required: ['to_party', 'subject', 'purpose', 'items'],
        properties: {
          to_party: { type: 'string', example: 'Mizan Structural Consultants' },
          subject: { type: 'string', example: 'Structural drawings for review' },
          purpose: { type: 'string', enum: PURPOSES },
          issued_on: { type: 'string', format: 'date' },
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['document_id'],
              properties: {
                document_id: { type: 'integer', example: 1 },
                revision_id: { type: 'integer', description: 'Defaults to the current revision' },
              },
            },
          },
        },
      },
      Stats: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          by_status: { type: 'object', additionalProperties: { type: 'integer' } },
          by_discipline: { type: 'object', additionalProperties: { type: 'integer' } },
          by_type: { type: 'object', additionalProperties: { type: 'integer' } },
          transmittals: { type: 'integer' },
        },
      },
    },
  },
};
