'use strict';
const { readBody }            = require('../utils/readBody');
const { validateBookingBody } = require('../utils/validation');
const { sanitizeBooking, sanitizeStr } = require('../utils/sanitize');
const { success, error }      = require('../utils/response');
const { requireRole, extractToken, resolveUser } = require('../middleware/auth');
const ctrl = require('../controllers/bookingController');
const db   = require('../services/db');

function getCaller(req, dbObj) {
  return resolveUser(extractToken(req), dbObj);
}

async function getDbObj() {
  return db.isMySQL ? await db.readDb() : db.readDb();
}

async function getState() {
  return db.isMySQL ? await db.publicState() : db.publicState(db.readDb());
}

async function getBookings(req, res) {
  const dbObj  = await getDbObj();
  const caller = getCaller(req, dbObj);
  if (!caller) return error(res, 'Login diperlukan', 401);
  const bookings = await ctrl.getBookingsByUser(caller.email, caller.role);
  return success(res, { bookings });
}

async function getBookingById(req, res, id) {
  const dbObj  = await getDbObj();
  const caller = getCaller(req, dbObj); // null untuk customer tanpa token

  if (db.isMySQL) {
    const [rows] = await db.pool.execute('SELECT * FROM bookings WHERE id=?', [id]);
    if (!rows.length) return error(res, 'Booking tidak ditemukan', 404);
    const bk = rows[0];
    if (caller.role === 'user' && bk.email !== caller.email)
      return error(res, 'Akses ditolak', 403);
    // Attach fnb
    const [fnb] = await db.pool.execute('SELECT * FROM booking_fnb_items WHERE booking_id=?', [id]);
    bk.fnb = fnb.map(f => ({ id:f.menu_id, nama:f.nama, ico:f.ico||'', harga:f.harga, qty:f.qty }));
    bk.slots     = bk.slots ? JSON.parse(bk.slots) : [];
    bk.unitNama  = bk.unit_nama;
    bk.timeRange = bk.time_range;
    return success(res, { booking: bk });
  }

  const bk = dbObj.bookings.find(b => b.id === id);
  if (!bk) return error(res, 'Booking tidak ditemukan', 404);
  if (caller && caller.role === 'user' && bk.email !== caller.email)
    return error(res, 'Akses ditolak', 403);
  return success(res, { booking: bk });
}

async function createBooking(req, res) {
  let body; try { body = await readBody(req); } catch(e){ return error(res, e.message, 400); }
  const bk   = sanitizeBooking(body.booking || body);
  const errs = validateBookingBody(bk);
  if (errs.length) return error(res, errs[0], 400, errs);

  const result = await ctrl.createBooking(bk);
  if (!result.ok) return error(res, result.message, result.code);
  return success(res, { booking: result.booking, state: await getState() }, 201);
}

async function patchBooking(req, res, id) {
  let body; try { body = await readBody(req); } catch(e){ return error(res, e.message, 400); }
  const patch  = body.patch || body;
  const dbObj  = await getDbObj();
  const caller = getCaller(req, dbObj);
  if (!caller) return error(res, 'Login diperlukan', 401);

  const USER_SAFE  = ['transferred_at','catatan','wa','metode','struk'];
  const ADMIN_SAFE = [...USER_SAFE, 'nama'];

  if (db.isMySQL) {
    const [rows] = await db.pool.execute('SELECT * FROM bookings WHERE id=?', [id]);
    if (!rows.length) return error(res, 'Booking tidak ditemukan', 404);
    const bk = rows[0];
    if (caller.role === 'user' && bk.email !== caller.email) return error(res, 'Akses ditolak', 403);
    const allowed = caller.role === 'user' ? USER_SAFE : ADMIN_SAFE;
    const updates = []; const vals = [];
    for (const k of allowed) { if (patch[k] !== undefined) { updates.push(`${k}=?`); vals.push(patch[k]); } }
    if (updates.length) { vals.push(id); await db.pool.execute(`UPDATE bookings SET ${updates.join(',')} WHERE id=?`, vals); }
    return success(res, { ok: true });
  }

  const result = await db.withDbLock(dbO => {
    const bk = dbO.bookings.find(b => b.id === id);
    if (!bk) return { err:[404,'Booking tidak ditemukan'] };
    if (caller.role === 'user' && bk.email !== caller.email) return { err:[403,'Akses ditolak'] };
    const allowed = caller.role === 'user' ? USER_SAFE : ADMIN_SAFE;
    let changed = false;
    for (const k of allowed) { if (patch[k] !== undefined) { bk[k]=patch[k]; changed=true; } }
    return changed ? { db:dbO, bk } : { bk };
  });
  if (result.err) return error(res, result.err[1], result.err[0]);
  return success(res, { booking: result.bk, state: db.publicState(db.readDb()) });
}

async function approveBooking(req, res, id) {
  const dbForAuth = await getDbObj();
  const user = requireRole(['staff','boss'])(req, res, dbForAuth);
  if (!user) return;
  const result = await ctrl.approveBooking(id, user.email);
  if (!result.ok && !result.autoRejected) return error(res, result.message, result.code);
  if (result.autoRejected) return error(res, result.message, 409);
  return success(res, { booking: result.booking, state: await getState() });
}

async function rejectBooking(req, res, id) {
  const dbForAuth = await getDbObj();
  const user = requireRole(['staff','boss'])(req, res, dbForAuth);
  if (!user) return;
  let body; try { body = await readBody(req); } catch(e){ return error(res, e.message, 400); }
  const reason = sanitizeStr(body.reason || 'Pembayaran tidak valid', 200);
  const result = await ctrl.rejectBooking(id, reason, user.email);
  if (!result.ok) return error(res, result.message, result.code);
  return success(res, { booking: result.booking, state: await getState() });
}



/* POST /api/bookings/search
   Customer cek booking pakai nama + nomor WA.
   Hanya return booking milik kombinasi nama+wa tersebut.
*/
async function searchBookings(req, res) {
  let body; try { body = await readBody(req); } catch(e){ return error(res, e.message, 400); }
  const nama = sanitizeStr(body.nama || '', 100).toLowerCase().trim();
  const wa   = sanitizeStr(body.wa   || '', 20).replace(/\D/g,'');
  if (!nama || wa.length < 9)
    return error(res, 'Masukkan nama dan nomor WhatsApp yang valid', 400);

  if (db.isMySQL) {
    // Cari booking dengan nama dan wa yang cocok
    const [rows] = await db.pool.execute(
      `SELECT b.*, GROUP_CONCAT(f.ico, ' ', f.nama, ' x', f.qty SEPARATOR ', ') as fnb_summary
       FROM bookings b
       LEFT JOIN booking_fnb_items f ON f.booking_id = b.id
       WHERE LOWER(b.nama)=? AND REPLACE(REPLACE(REPLACE(b.wa,' ',''),'-',''),'+','')=?
       GROUP BY b.id
       ORDER BY b.created_at DESC
       LIMIT 20`,
      [nama, wa]
    );
    return success(res, { bookings: rows });
  }

  const dbObj = db.isMySQL ? await db.readDb() : db.readDb();
  const all   = dbObj.bookings.filter(b =>
    b.nama.toLowerCase().trim() === nama &&
    b.wa.replace(/\D/g,'') === wa
  );
  return success(res, { bookings: all });
}

module.exports = { getBookings, createBooking, getBookingById, patchBooking, approveBooking, rejectBooking, searchBookings };
