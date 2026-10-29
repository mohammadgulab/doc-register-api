const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

module.exports = { nowIso, today };
