// Allowed values used across validation, the database and the docs.
const DISCIPLINES = ['Architectural', 'Structural', 'MEP', 'Civil'];
const DOC_TYPES = ['Drawing', 'Method Statement', 'Material Submittal', 'Report', 'Specification'];
const STATUSES = ['Pending', 'Approved', 'Code B', 'Rejected'];
const PURPOSES = ['For Approval', 'For Information', 'For Construction'];

// Columns the list endpoint can be sorted by. Prefix with "-" for descending.
const SORT_FIELDS = ['doc_no', 'title', 'discipline', 'type', 'status', 'current_rev', 'created_at', 'updated_at'];

module.exports = { DISCIPLINES, DOC_TYPES, STATUSES, PURPOSES, SORT_FIELDS };
