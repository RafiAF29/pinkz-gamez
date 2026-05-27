#!/usr/bin/env node
'use strict';
/**
 * backend/schema/migrate_json_to_mysql.js
 * ══════════════════════════════════════════════════════════════
 * Migrasi data dari data/db.json ke MySQL.
 *
 * CARA PAKAI:
 *   1. Pastikan MySQL (XAMPP) sudah jalan
 *   2. Import schema dulu: mysql < backend/schema/mysql.sql
 *   3. Set DB_* di .env atau environment variables
 *   4. Jalankan: node backend/schema/migrate_json_to_mysql.js
 *
 * Script ini IDEMPOTENT — aman dijalankan ulang, data duplikat
 * akan di-skip (menggunakan INSERT IGNORE).
 * ══════════════════════════════════════════════════════════════
 */

const fs   = require('fs');
const path = require('path');

// Load .env jika ada
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const t = line.trim(); if (!t || t.startsWith('#')) return;
    const eq = t.indexOf('='); if (eq === -1) return;
    const k = t.slice(0,eq).trim(), v = t.slice(eq+1).trim().replace(/^["']|["']$/g,'');
    if (!process.env[k]) process.env[k] = v;
  });
}

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_NAME = process.env.DB_NAME || 'pinkz_gamez_rental';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';

let mysql;
try { mysql = require('mysql2/promise'); }
catch(e) { console.error('❌ mysql2 tidak ditemukan. Jalankan: npm install mysql2'); process.exit(1); }

const DB_FILE = path.join(__dirname, '../../data/db.json');
if (!fs.existsSync(DB_FILE)) {
  console.error('❌ data/db.json tidak ditemukan. Jalankan server dalam JSON mode dulu.');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

async function main() {
  const conn = await mysql.createConnection({ host:DB_HOST, port:DB_PORT, database:DB_NAME, user:DB_USER, password:DB_PASS, multipleStatements:false });
  console.log(`✅ Terhubung ke MySQL: ${DB_HOST}:${DB_PORT}/${DB_NAME}\n`);

  let ok = 0, skip = 0;

  // ── USERS ──
  console.log('→ Migrasi users...');
  for (const u of raw.users || []) {
    try {
      await conn.execute(
        'INSERT INTO users (email, name, pass_hash, role, active, created_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE pass_hash=VALUES(pass_hash), role=VALUES(role)',
        [u.email, u.name, u.passHash||u.pass_hash, u.role, u.active?1:0, u.createdAt||new Date().toISOString()]
      );
      console.log(`  ✓ user: ${u.email}`); ok++;
    } catch(e) { console.log(`  ⚠ skip user ${u.email}: ${e.message}`); skip++; }
  }

  // ── STAFF ──
  console.log('→ Migrasi staff...');
  for (const s of raw.staff || []) {
    try {
      await conn.execute(
        'INSERT INTO staff (id, nama, email, role, aktif, joined) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE nama=VALUES(nama), role=VALUES(role), aktif=VALUES(aktif)',
        [s.id, s.nama, s.email, s.role, s.aktif?1:0, s.joined||new Date().toISOString().slice(0,10)]
      );
      console.log(`  ✓ staff: ${s.nama}`); ok++;
    } catch(e) { console.log(`  ⚠ skip staff ${s.id}: ${e.message}`); skip++; }
  }

  // ── UNITS ──
  console.log('→ Migrasi units...');
  for (const u of raw.units || []) {
    try {
      await conn.execute(
        'INSERT INTO units (id, nama, kategori, nomor, status_unit) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE nama=VALUES(nama), status_unit=VALUES(status_unit)',
        [u.id, u.nama, u.kategori, u.nomor||1, u.status_unit||'available']
      );
      console.log(`  ✓ unit: ${u.nama}`); ok++;
    } catch(e) { console.log(`  ⚠ skip unit ${u.id}: ${e.message}`); skip++; }
  }

  // ── MENU ──
  console.log('→ Migrasi menu...');
  for (const m of raw.menu || []) {
    try {
      await conn.execute(
        'INSERT INTO menu_items (id, nama, ico, kategori, harga, stok, aktif) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE harga=VALUES(harga), stok=VALUES(stok), aktif=VALUES(aktif)',
        [m.id, m.nama, m.ico||'', m.kategori, m.harga||0, m.stok||0, m.aktif?1:0]
      );
      console.log(`  ✓ menu: ${m.nama}`); ok++;
    } catch(e) { console.log(`  ⚠ skip menu ${m.id}: ${e.message}`); skip++; }
  }

  // ── SESSIONS ──
  console.log('→ Migrasi sessions...');
  for (const [token, ses] of Object.entries(raw.sessions || {})) {
    if (!ses.email || ses.expiresAt < Date.now()) continue; // skip expired
    try {
      await conn.execute(
        'INSERT IGNORE INTO sessions (token, email, expires_at) VALUES (?,?,?)',
        [token, ses.email, new Date(ses.expiresAt)]
      );
      ok++;
    } catch(e) { skip++; }
  }
  console.log(`  ✓ ${Object.keys(raw.sessions||{}).length} sessions diproses`);

  // ── BOOKINGS ──
  console.log('→ Migrasi bookings...');
  for (const bk of raw.bookings || []) {
    try {
      const slots = JSON.stringify(bk.slots || []);
      await conn.execute(
        `INSERT INTO bookings (id,unit_id,unit_nama,kategori,tgl,tgl_str,time_range,dur,jam_main,bonus_jam,
         is_weekend,harga,nama,wa,email,catatan,total_ps,total_fnb,total,payment_status,booking_status,
         tipe_booking,metode,expires_at,transferred_at,paid_at,rejected_at,reject_reason,approved_by,
         rejected_by,struk,slots,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE payment_status=VALUES(payment_status), paid_at=VALUES(paid_at)`,
        [bk.id, bk.unitId||bk.unit_id, bk.unitNama||bk.unit_nama, bk.kategori,
         bk.tgl, bk.tglStr||bk.tgl_str||null, bk.timeRange||bk.time_range,
         bk.dur||1, bk.jamMain||bk.jam_main||bk.dur||1, bk.bonusJam||bk.bonus_jam||0,
         (bk.isWeekend||bk.is_weekend)?1:0, bk.harga||0, bk.nama, bk.wa,
         bk.email||'', bk.catatan||'', bk.total_ps||0, bk.total_fnb||0, bk.total||0,
         bk.payment_status||'pending', bk.booking_status||'pending',
         bk.tipe_booking||'online', bk.metode||'QRIS',
         bk.expires_at||null, bk.transferred_at||null, bk.paid_at||null,
         bk.rejected_at||null, bk.reject_reason||null,
         bk.approved_by||null, bk.rejected_by||null, bk.struk||null,
         slots, bk.created_at||new Date().toISOString()]
      );

      // FnB items
      for (const f of bk.fnb || []) {
        await conn.execute(
          'INSERT IGNORE INTO booking_fnb_items (booking_id, menu_id, nama, ico, harga, qty, subtotal) VALUES (?,?,?,?,?,?,?)',
          [bk.id, f.id, f.nama, f.ico||'', f.harga||0, f.qty||1, (f.harga||0)*(f.qty||1)]
        );
      }

      // booking_slots dari bookedSlots dan pendingSlots
      const slots_arr = bk.slots || [];
      if (slots_arr.length && (bk.payment_status === 'paid' || bk.payment_status === 'pending')) {
        const status = bk.payment_status === 'paid' ? 'booked' : 'pending';
        for (const slot of slots_arr) {
          try {
            await conn.execute(
              'INSERT IGNORE INTO booking_slots (booking_id, unit_id, tgl, slot, status) VALUES (?,?,?,?,?)',
              [bk.id, bk.unitId||bk.unit_id, bk.tgl, slot, status]
            );
          } catch(e2) { /* duplicate ok */ }
        }
      }
      console.log(`  ✓ booking: ${bk.id} (${bk.payment_status})`); ok++;
    } catch(e) { console.log(`  ⚠ skip booking ${bk.id}: ${e.message}`); skip++; }
  }

  // ── LAPORAN ──
  console.log('→ Migrasi laporan...');
  for (const l of raw.laporan || []) {
    try {
      await conn.execute(
        `INSERT IGNORE INTO laporan (id,booking_id,nama,email,unit,kategori,tgl,tgl_str,time_range,
         dur,jam_main,bonus_jam,is_weekend,total_ps,total_fnb,total,metode,tipe,paid_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [l.id, l.booking_id, l.nama, l.email||'', l.unit, l.kategori,
         l.tgl, l.tglStr||l.tgl_str||null, l.timeRange||l.time_range,
         l.dur||1, l.jamMain||l.jam_main||l.dur||1, l.bonusJam||l.bonus_jam||0,
         (l.isWeekend||l.is_weekend)?1:0, l.total_ps||0, l.total_fnb||0, l.total||0,
         l.metode||'QRIS', l.tipe||'online', l.paid_at||new Date().toISOString()]
      );
      console.log(`  ✓ laporan: ${l.id}`); ok++;
    } catch(e) { console.log(`  ⚠ skip laporan ${l.id}: ${e.message}`); skip++; }
  }

  await conn.end();
  console.log(`\n✅ Migrasi selesai: ${ok} berhasil, ${skip} di-skip`);
  console.log('   Ubah STORAGE_MODE=mysql di .env dan restart server.');
}

main().catch(err => {
  console.error('\n❌ Migrasi gagal:', err.message);
  if (err.code === 'ER_NO_SUCH_TABLE') console.error('   Pastikan schema sudah diimport: mysql < backend/schema/mysql.sql');
  if (err.code === 'ECONNREFUSED')     console.error('   Pastikan MySQL (XAMPP) sudah jalan di port', DB_PORT);
  process.exit(1);
});
