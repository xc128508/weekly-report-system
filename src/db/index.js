const fs = require('fs');
const path = require('path');

function createJsonDb({ dbPath, ensure, beforeWrite = [] }) {
  if (!dbPath) throw new Error('dbPath is required');

  function ensureReady() {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (typeof ensure === 'function') ensure();
  }

  function read() {
    ensureReady();
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  }

  function write(db) {
    ensureReady();
    for (const hook of beforeWrite) {
      if (typeof hook === 'function') hook(db);
    }
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  }

  return { read, write };
}

module.exports = { createJsonDb };
