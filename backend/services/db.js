'use strict';
/**
 * backend/services/db.js  — v8.1.3
 * ════════════════════════════════════════════════════════════════
 * Dual-mode storage: JSON (dev) atau MySQL (production).
 * Set STORAGE_MODE di .env untuk memilih mode.
 *
 *   STORAGE_MODE=json   → data/db.json  (default, tanpa dependency)
 *   STORAGE_MODE=mysql  → MySQL via mysql2 connection pool
 *
 * Semua route hanya memanggil fungsi dari file ini.
 * Untuk migrasi: hanya file ini yang perlu diubah.
 *
 * CONCURRENCY:
 *   JSON mode  → Promise chain (withDbLock) — single-threaded safe
 *   MySQL mode → Transaction + SELECT FOR UPDATE — ACID safe
 * ════════════════════════════════════════════════════════════════
 */
const fs   = require('fs');
const path = require('path');
const cfg  = require('../config');
const { hashPassword } = require('../utils/crypto');

const STORAGE_MODE = cfg.STORAGE_MODE;

/* ════════════════════════════════════════
   DEFAULT DATA (sama untuk kedua mode)
════════════════════════════════════════ */
const DEFAULT_UNITS = [
  { id:'rb1',  nama:'Reguler B1',      kategori:'REGULAR',  nomor:1, status_unit:'available'   },
  { id:'rb2',  nama:'Reguler B2',      kategori:'REGULAR',  nomor:2, status_unit:'available'   },
  { id:'rb3',  nama:'Reguler B3',      kategori:'REGULAR',  nomor:3, status_unit:'available'   },
  { id:'rb4',  nama:'Reguler B4',      kategori:'REGULAR',  nomor:4, status_unit:'available'   },
  { id:'rb5',  nama:'Reguler B5',      kategori:'REGULAR',  nomor:5, status_unit:'available'   },
  { id:'rb6',  nama:'Reguler B6',      kategori:'REGULAR',  nomor:6, status_unit:'available'   },
  { id:'vip1', nama:'VIP Room 1',      kategori:'VIP',      nomor:1, status_unit:'available'   },
  { id:'vip2', nama:'VIP Room 2',      kategori:'VIP',      nomor:2, status_unit:'available'   },
  { id:'ns1',  nama:'Nintendo Switch', kategori:'NINTENDO', nomor:1, status_unit:'available'   },
  { id:'vr1',  nama:'VR PlayStation',  kategori:'VR',       nomor:1, status_unit:'maintenance' },
];
const DEFAULT_MENU = [
  { id:'m1', nama:'Indomie Goreng',  ico:'🍜', kategori:'Makanan', harga:8000,  stok:20, aktif:true },
  { id:'m2', nama:'Indomie Kuah',    ico:'🍜', kategori:'Makanan', harga:8000,  stok:20, aktif:true },
  { id:'m3', nama:'Pop Mie',         ico:'🍜', kategori:'Makanan', harga:7000,  stok:15, aktif:true },
  { id:'m4', nama:'Nasi Goreng',     ico:'🍳', kategori:'Makanan', harga:15000, stok:10, aktif:true },
  { id:'d1', nama:'Es Teh',          ico:'🥤', kategori:'Minuman', harga:3000,  stok:30, aktif:true },
  { id:'d2', nama:'Teh Panas',       ico:'☕',  kategori:'Minuman', harga:3000,  stok:30, aktif:true },
  { id:'d3', nama:'Es Jeruk',        ico:'🍊', kategori:'Minuman', harga:5000,  stok:25, aktif:true },
  { id:'d4', nama:'Pop Ice',         ico:'🧃', kategori:'Minuman', harga:5000,  stok:20, aktif:true },
  { id:'d5', nama:'NutriSari',       ico:'🍹', kategori:'Minuman', harga:4000,  stok:20, aktif:true },
  { id:'d6', nama:'Good Day Freeze', ico:'☕',  kategori:'Minuman', harga:6000,  stok:15, aktif:true },
  { id:'c1', nama:'Nabati',          ico:'🍪', kategori:'Cemilan', harga:3000,  stok:25, aktif:true },
  { id:'c2', nama:'Tanggo',          ico:'🍫', kategori:'Cemilan', harga:3000,  stok:25, aktif:true },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ════════════════════════════════════════════════════════════
   JSON MODE
════════════════════════════════════════════════════════════ */
if (STORAGE_MODE !== 'mysql') {

  const DATA_DIR = path.join(cfg.ROOT, 'data');
  const DB_FILE  = path.join(DATA_DIR, 'db.json');

  function buildDefaultDb() {
    const td = todayStr();
    return {
      users: [
        { email:'staff@spacex.id',     passHash:hashPassword('staff123'), role:'staff', name:'Admin 1',    active:true, createdAt:new Date().toISOString() },
        { email:'boss@spacex.id',      passHash:hashPassword('boss123'),  role:'boss',  name:'Bos Rental', active:true, createdAt:new Date().toISOString() },
        { email:'user@spacex.id',      passHash:hashPassword('user123'),  role:'user',  name:'Lindra',      active:true, createdAt:new Date().toISOString() },
        { email:'pelanggan@spacex.id', passHash:hashPassword('12345'),    role:'user',  name:'Pelanggan',   active:true, createdAt:new Date().toISOString() },
      ],
      staff: [
        { id:'sf1', nama:'Admin 1',    email:'staff@spacex.id', role:'staff', aktif:true, joined:'2026-01-01' },
        { id:'sf2', nama:'Bos Rental', email:'boss@spacex.id',  role:'boss',  aktif:true, joined:'2025-01-01' },
      ],
      units:        DEFAULT_UNITS,
      menu:         DEFAULT_MENU,
      bookings:     [],
      bookedSlots:  { rb1:{ [td]:['09:00–10:00','10:00–11:00'] }, rb3:{ [td]:['14:00–15:00','15:00–16:00','16:00–17:00'] }, vip1:{ [td]:['13:00–14:00','14:00–15:00'] } },
      pendingSlots: {},
      laporan:      [],
      sessions:     {},
    };
  }

  function readDb() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE))  fs.writeFileSync(DB_FILE, JSON.stringify(buildDefaultDb(), null, 2));
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const def = buildDefaultDb();
    return {
      users:        raw.users        ?? def.users,
      staff:        raw.staff        ?? def.staff,
      units:        raw.units        ?? DEFAULT_UNITS,
      menu:         raw.menu         ?? DEFAULT_MENU,
      bookings:     raw.bookings     ?? [],
      bookedSlots:  raw.bookedSlots  ?? {},
      pendingSlots: raw.pendingSlots ?? {},
      laporan:      raw.laporan      ?? [],
      sessions:     raw.sessions     ?? {},
    };
  }

  function writeDb(db) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }

  /* withDbLock — Promise chain untuk JSON mode */
  let _lockChain = Promise.resolve();
  function withDbLock(fn) {
    const result = _lockChain.then(async () => {
      const db  = readDb();
      const ret = await fn(db);
      if (ret && ret.db) writeDb(ret.db);
      return ret;
    });
    _lockChain = result.catch(() => {});
    return result;
  }

  function cleanupExpiredPending(db) {
    const now = Date.now();
    let changed = false;
    for (const bk of db.bookings) {
      if (bk.payment_status === 'pending' && !bk.transferred_at && bk.expires_at && Date.parse(bk.expires_at) < now) {
        bk.payment_status = 'expired';
        bk.booking_status = 'cancelled';
        bk.reject_reason  = 'Waktu pembayaran habis (15 menit)';
        bk.expired_at     = new Date().toISOString();
        _removeSlots(db.pendingSlots, bk.unitId, bk.tgl, bk.slots || []);
        changed = true;
      }
    }
    return changed;
  }

  function cleanupSessions(db) {
    const now = Date.now();
    let changed = false;
    for (const token of Object.keys(db.sessions)) {
      if (db.sessions[token].expiresAt < now) { delete db.sessions[token]; changed = true; }
    }
    return changed;
  }

  function publicState(db) {
    return { units:db.units, menu:db.menu, bookings:db.bookings, bookedSlots:db.bookedSlots, pendingSlots:db.pendingSlots, laporan:db.laporan, staff:db.staff };
  }

  /* Slot helpers (internal) */
  function _addSlots(map, unitId, tgl, slots) {
    map[unitId] ??= {}; map[unitId][tgl] ??= [];
    for (const s of slots) if (!map[unitId][tgl].includes(s)) map[unitId][tgl].push(s);
  }
  function _removeSlots(map, unitId, tgl, slots) {
    if (!map[unitId]?.[tgl]) return;
    map[unitId][tgl] = map[unitId][tgl].filter(s => !slots.includes(s));
    if (!map[unitId][tgl].length) delete map[unitId][tgl];
    if (!Object.keys(map[unitId]).length) delete map[unitId];
  }
  function _hasConflict(db, unitId, tgl, slots) {
    return slots.some(s => db.bookedSlots[unitId]?.[tgl]?.includes(s) || db.pendingSlots[unitId]?.[tgl]?.includes(s));
  }
  function _buildLaporanRow(bk) {
    return { id:'TRX-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), booking_id:bk.id, nama:bk.nama, email:bk.email||'', unit:bk.unitNama, kategori:bk.kategori, tgl:bk.tgl, tglStr:bk.tglStr, timeRange:bk.timeRange, dur:bk.dur, jamMain:bk.jamMain||bk.dur, bonusJam:bk.bonusJam||0, total_ps:bk.total_ps, total_fnb:bk.total_fnb||0, total:bk.total, isWeekend:bk.isWeekend||false, metode:bk.metode||'QRIS', tipe:bk.tipe_booking||'online', paid_at:bk.paid_at||new Date().toISOString() };
  }

  module.exports = {
    readDb, writeDb, withDbLock, publicState,
    addSlots: _addSlots, removeSlots: _removeSlots,
    hasSlotConflict: _hasConflict,
    cleanupExpiredPending, cleanupSessions,
    buildLaporanRow: _buildLaporanRow,
    DEFAULT_UNITS, DEFAULT_MENU,
    isMySQL: false,
  };

/* ════════════════════════════════════════════════════════════
   MYSQL MODE
════════════════════════════════════════════════════════════ */
} else {

  let pool;
  try {
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({
      host:            cfg.DB.host,
      port:            cfg.DB.port,
      database:        cfg.DB.name,
      user:            cfg.DB.user,
      password:        cfg.DB.pass,
      waitForConnections: true,
      connectionLimit:    cfg.DB.poolMax,
      queueLimit:         0,
      timezone:           '+00:00',
      charset:            'utf8mb4',
    });
    console.log(`[DB] MySQL pool ready → ${cfg.DB.host}:${cfg.DB.port}/${cfg.DB.name}`);
  } catch (e) {
    console.error('[DB] mysql2 tidak tersedia. Install dengan: npm install mysql2');
    process.exit(1);
  }

  /* ──────────────────────────────────────
     withDbLock — MySQL TRANSACTION mode
     Lebih kuat dari Promise chain:
     - ACID guaranteed
     - SELECT FOR UPDATE cegah race condition di level DB
     - Auto rollback jika fn() throw
  ────────────────────────────────────── */
  async function withDbLock(fn) {
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /* ──────────────────────────────────────
     readDb — baca seluruh state dari MySQL
     Dipakai oleh resolveUser, guardHtml, syncState.
     Untuk operasi yang butuh konsistensi, pakai
     withDbLock(conn => ...) dan query langsung.
  ────────────────────────────────────── */
  async function readDb() {
    const [users]    = await pool.execute('SELECT * FROM users');
    const [staff]    = await pool.execute('SELECT * FROM staff');
    const [units]    = await pool.execute('SELECT * FROM units');
    const [menu]     = await pool.execute('SELECT * FROM menu_items');
    const [bookings] = await pool.execute('SELECT * FROM bookings ORDER BY created_at DESC');
    const [laporan]  = await pool.execute('SELECT * FROM laporan ORDER BY paid_at DESC');
    const [sessions] = await pool.execute('SELECT * FROM sessions WHERE expires_at > NOW()');

    // Reconstruct bookedSlots dan pendingSlots dari booking_slots
    const [slots] = await pool.execute(
      "SELECT * FROM booking_slots WHERE status IN ('booked','pending')"
    );
    const bookedSlots  = {};
    const pendingSlots = {};
    for (const s of slots) {
      const tgl = s.tgl instanceof Date ? s.tgl.toISOString().slice(0,10) : String(s.tgl);
      const map = s.status === 'booked' ? bookedSlots : pendingSlots;
      map[s.unit_id]      ??= {};
      map[s.unit_id][tgl] ??= [];
      map[s.unit_id][tgl].push(s.slot);
    }

    // Reconstruct bookings dengan fnb
    const [fnbRows] = await pool.execute('SELECT * FROM booking_fnb_items');
    for (const bk of bookings) {
      bk.fnb = fnbRows.filter(f => f.booking_id === bk.id).map(f => ({
        id: f.menu_id, nama: f.nama, ico: f.ico||'', harga: f.harga, qty: f.qty
      }));
      bk.slots     = bk.slots     ? JSON.parse(bk.slots)     : [];
      bk.isWeekend = !!bk.is_weekend;
      bk.unitId    = bk.unit_id;   bk.unitNama = bk.unit_nama;
      bk.tglStr    = bk.tgl_str;   bk.timeRange = bk.time_range;
      bk.total_ps  = bk.total_ps;  bk.total_fnb = bk.total_fnb;
      bk.tipeBooking = bk.tipe_booking;
    }

    // sessions → object { token: { email, expiresAt } }
    const sessionsObj = {};
    for (const s of sessions) {
      sessionsObj[s.token] = { email: s.email, expiresAt: new Date(s.expires_at).getTime() };
    }

    // menu: aktif field
    for (const m of menu) { m.aktif = !!m.aktif; }

    // laporan: camelCase compat
    for (const l of laporan) {
      l.tglStr   = l.tgl_str;   l.timeRange = l.time_range;
      l.total_ps = l.total_ps;  l.total_fnb = l.total_fnb;
      l.jamMain  = l.jam_main;  l.bonusJam  = l.bonus_jam;
      l.isWeekend = !!l.is_weekend;
      l.booking_id = l.booking_id;
    }

    // staff: aktif field
    for (const s of staff) { s.aktif = !!s.aktif; }

    return { users, staff, units, menu, bookings, bookedSlots, pendingSlots, laporan, sessions:sessionsObj };
  }

  /* writeDb tidak relevan di MySQL — setiap operasi langsung query */
  function writeDb() { /* no-op di MySQL mode */ }

  /* publicState — ambil dari DB secara langsung */
  async function publicState() {
    const db = await readDb();
    return { units:db.units, menu:db.menu, bookings:db.bookings, bookedSlots:db.bookedSlots, pendingSlots:db.pendingSlots, laporan:db.laporan, staff:db.staff };
  }

  /* ──────────────────────────────────────
     Slot helpers untuk MySQL mode
  ────────────────────────────────────── */
  async function addSlots(conn, unitId, tgl, slots, status = 'pending', bookingId) {
    for (const slot of slots) {
      await conn.execute(
        'INSERT IGNORE INTO booking_slots (booking_id, unit_id, tgl, slot, status) VALUES (?,?,?,?,?)',
        [bookingId, unitId, tgl, slot, status]
      );
    }
  }

  async function removeSlots(conn, unitId, tgl, slots) {
    if (!slots.length) return;
    const placeholders = slots.map(() => '?').join(',');
    await conn.execute(
      `UPDATE booking_slots SET status='released' WHERE unit_id=? AND tgl=? AND slot IN (${placeholders})`,
      [unitId, tgl, ...slots]
    );
  }

  async function hasSlotConflict(conn, unitId, tgl, slots) {
    const placeholders = slots.map(() => '?').join(',');
    const [rows] = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM booking_slots
       WHERE unit_id=? AND tgl=? AND slot IN (${placeholders}) AND status IN ('pending','booked')
       FOR UPDATE`,
      [unitId, tgl, ...slots]
    );
    return rows[0].cnt > 0;
  }

  /* ──────────────────────────────────────
     Cleanup untuk MySQL mode
  ────────────────────────────────────── */
  async function cleanupExpiredPending() {
    return withDbLock(async conn => {
      // Expire booking yang sudah lewat batas waktu
      const [expired] = await conn.execute(
        `SELECT id, unit_id, tgl, slots FROM bookings
         WHERE payment_status='pending' AND transferred_at IS NULL
           AND expires_at IS NOT NULL AND expires_at < NOW()`
      );
      for (const bk of expired) {
        const slots = bk.slots ? JSON.parse(bk.slots) : [];
        await conn.execute(
          `UPDATE bookings SET payment_status='expired', booking_status='cancelled',
           reject_reason='Waktu pembayaran habis (15 menit)', expired_at=NOW()
           WHERE id=?`,
          [bk.id]
        );
        if (slots.length) {
          const ph = slots.map(() => '?').join(',');
          await conn.execute(
            `UPDATE booking_slots SET status='released'
             WHERE booking_id=? AND slot IN (${ph})`,
            [bk.id, ...slots]
          );
        }
      }
      return {};
    });
  }

  async function cleanupSessions() {
    await pool.execute('DELETE FROM sessions WHERE expires_at < NOW()');
  }

  /* ──────────────────────────────────────
     buildLaporanRow — MySQL mode
  ────────────────────────────────────── */
  function buildLaporanRow(bk) {
    return {
      id:         'TRX-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),
      booking_id: bk.id,
      nama:       bk.nama,
      email:      bk.email||'',
      unit:       bk.unitNama,
      kategori:   bk.kategori,
      tgl:        bk.tgl,
      tglStr:     bk.tglStr,
      timeRange:  bk.timeRange,
      dur:        bk.dur,
      jamMain:    bk.jamMain||bk.dur,
      bonusJam:   bk.bonusJam||0,
      total_ps:   bk.total_ps,
      total_fnb:  bk.total_fnb||0,
      total:      bk.total,
      isWeekend:  bk.isWeekend||false,
      metode:     bk.metode||'QRIS',
      tipe:       bk.tipe_booking||'online',
      paid_at:    bk.paid_at||new Date().toISOString(),
    };
  }

  module.exports = {
    readDb, writeDb, withDbLock, publicState, pool,
    addSlots, removeSlots, hasSlotConflict,
    cleanupExpiredPending, cleanupSessions,
    buildLaporanRow,
    DEFAULT_UNITS, DEFAULT_MENU,
    isMySQL: true,
  };
}
