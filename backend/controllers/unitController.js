'use strict';
/**
 * backend/controllers/unitController.js
 * Business logic untuk unit management & maintenance.
 */
const db = require('../services/db');
const { sanitizeStr } = require('../utils/sanitize');

async function getAll() {
  if (db.isMySQL) {
    const [units] = await db.pool.execute('SELECT * FROM units ORDER BY kategori, nomor');
    return units;
  }
  return db.readDb().units;
}

async function updateUnit(unitId, { nama, status_unit }, updatedBy) {
  if (db.isMySQL) {
    const [rows] = await db.pool.execute('SELECT * FROM units WHERE id=?', [unitId]);
    if (!rows.length) return { ok: false, code: 404, message: 'Unit tidak ditemukan' };
    const unit    = rows[0];
    const newNama = nama ? sanitizeStr(nama, 100) : unit.nama;
    const newSt   = status_unit || unit.status_unit;
    const maintSince = newSt === 'maintenance' ? 'NOW()' : 'NULL';
    await db.pool.execute(
      `UPDATE units SET nama=?,status_unit=?,updated_by=?,updated_at=NOW(),maintenance_since=${maintSince} WHERE id=?`,
      [newNama, newSt, updatedBy, unitId]
    );
    const [updated] = await db.pool.execute('SELECT * FROM units WHERE id=?', [unitId]);
    return { ok: true, unit: updated[0] };
  }

  const dbObj = db.readDb();
  const unit  = dbObj.units.find(u => u.id === unitId);
  if (!unit) return { ok: false, code: 404, message: 'Unit tidak ditemukan' };
  if (nama)        unit.nama        = sanitizeStr(nama, 100);
  if (status_unit) {
    unit.status_unit  = status_unit;
    unit.updatedAt    = new Date().toISOString();
    unit.updatedBy    = updatedBy;
    if (status_unit === 'maintenance') unit.maintenanceSince = new Date().toISOString();
    else delete unit.maintenanceSince;
  }
  db.writeDb(dbObj);
  return { ok: true, unit };
}

module.exports = { getAll, updateUnit };
