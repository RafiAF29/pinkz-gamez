'use strict';
const { readBody }   = require('../utils/readBody');
const { success, error } = require('../utils/response');
const db  = require('../services/db');
const { requireRole } = require('../middleware/auth');
const IS_MYSQL = db.isMySQL;

const ALLOWED = { units:'units', menu:'menu', bookings:'bookings', bookedSlots:'bookedSlots', pendingSlots:'pendingSlots', laporan:'laporan', staff:'staff' };

async function getState(req, res) {
  const state = IS_MYSQL ? await db.publicState() : db.publicState(db.readDb());
  return success(res, { state });
}

async function putState(req, res, key) {
  const dbObj = IS_MYSQL ? await db.readDb() : db.readDb();
  const user  = requireRole(['staff','boss'])(req, res, dbObj);
  if (!user) return;
  if (!ALLOWED[key]) return error(res, 'State key tidak dikenal', 404);
  const body = await readBody(req);

  if (IS_MYSQL) {
    // MySQL: update masing-masing tabel sesuai key
    // Untuk simplicity, kita update via array replace
    // (di production sebaiknya ada endpoint spesifik per entity)
    // Untuk sekarang, state PUT hanya untuk JSON-mode sync
    return error(res, 'PUT /api/state tidak tersedia di MySQL mode. Gunakan endpoint spesifik.', 400);
  }

  const d = db.readDb();
  d[ALLOWED[key]] = body.value;
  if (key === 'staff') {
    const emails = new Set((body.value||[]).map(s=>String(s.email||'').toLowerCase()));
    for (const u of d.users) if ((u.role==='staff'||u.role==='boss')&&u.email!=='boss@spacex.id') u.active=emails.has(u.email);
    for (const st of body.value||[]) { const u=d.users.find(u=>u.email===String(st.email||'').toLowerCase()); if(u){u.name=st.nama;u.role=st.role;u.active=st.aktif!==false;} }
  }
  db.writeDb(d);
  return success(res, { state: db.publicState(db.readDb()) });
}

module.exports = { getState, putState };
