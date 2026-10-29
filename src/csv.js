// Quotes a single CSV value when needed (commas, quotes or line breaks).
// Values that start with = + - @ get a leading apostrophe so spreadsheet
// apps do not treat them as formulas.
function csvValue(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvValue(c.label)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvValue(row[c.key])).join(','));
  }
  // CRLF line endings, as the CSV spec suggests.
  return lines.join('\r\n') + '\r\n';
}

module.exports = { csvValue, toCsv };
