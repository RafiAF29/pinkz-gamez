'use strict';
/**
 * backend/routes/menu.js
 * GET    /api/menu          — semua menu
 * POST   /api/menu          — tambah menu baru (staff/boss)
 * PUT    /api/menu/:id      — update menu (staff/boss)
 * DELETE /api/menu/:id      — hapus menu (staff/boss)
 */
const { readBody }   = require('../utils/readBody');
const { validateMenuBody } = require('../utils/validation');
const { sanitizeStr, sanitizeInt } = require('../utils/sanitize');
const { success, error }   = require('../utils/response');
const db  = require('../services/db');
const { requireRole } = require('../middleware/auth');
const IS_MYSQL = db.isMySQL;

async function getMenu(req, res) {
  if (IS_MYSQL) {
    const [rows] = await db.pool.execute('SELECT * FROM menu_items ORDER BY kategori, nama');
    return success(res, { menu: rows });
  }
  return success(res, { menu: db.readDb().menu });
}

async function createMenu(req, res) {
  const dbObj = IS_MYSQL ? await db.readDb() : db.readDb();
  const user  = requireRole(['staff','boss'])(req, res, dbObj);
  if (!user) return;

  let body; try { body = await readBody(req); } catch(e){ return error(res, e.message, 400); }
  const errs = validateMenuBody(body);
  if (errs.length) return error(res, errs[0], 400, errs);

  const id   = body.id || (body.kategori[0].toLowerCase() + Date.now());
  const nama = sanitizeStr(body.nama, 100);
  const ico  = sanitizeStr(body.ico || '', 10);
  const kat  = body.kategori;
  const harga = sanitizeInt(body.harga, 0, 0);
  const stok  = sanitizeInt(body.stok, 0, 0);
  const aktif = body.aktif !== false;

  if (IS_MYSQL) {
    await db.pool.execute(
      'INSERT INTO menu_items (id, nama, ico, kategori, harga, stok, aktif) VALUES (?,?,?,?,?,?,?)',
      [id, nama, ico, kat, harga, stok, aktif ? 1 : 0]
    );
    const [rows] = await db.pool.execute('SELECT * FROM menu_items WHERE id=?', [id]);
    return success(res, { menu: rows[0] }, 201);
  }

  const d = db.readDb();
  if (d.menu.some(m => m.id === id)) return error(res, 'ID menu sudah ada', 409);
  const newItem = { id, nama, ico, kategori: kat, harga, stok, aktif };
  d.menu.push(newItem);
  db.writeDb(d);
  return success(res, { menu: newItem }, 201);
}

async function updateMenu(req, res, id) {
  const dbObj = IS_MYSQL ? await db.readDb() : db.readDb();
  const user  = requireRole(['staff','boss'])(req, res, dbObj);
  if (!user) return;

  let body; try { body = await readBody(req); } catch(e){ return error(res, e.message, 400); }

  if (IS_MYSQL) {
    const [rows] = await db.pool.execute('SELECT * FROM menu_items WHERE id=?', [id]);
    if (!rows.length) return error(res, 'Menu tidak ditemukan', 404);
    const m = rows[0];
    const nama  = body.nama  !== undefined ? sanitizeStr(body.nama, 100)   : m.nama;
    const ico   = body.ico   !== undefined ? sanitizeStr(body.ico, 10)     : m.ico;
    const kat   = body.kategori !== undefined ? body.kategori               : m.kategori;
    const harga = body.harga !== undefined ? sanitizeInt(body.harga, 0, 0) : m.harga;
    const stok  = body.stok  !== undefined ? sanitizeInt(body.stok,  0, 0) : m.stok;
    const aktif = body.aktif !== undefined ? (body.aktif ? 1 : 0)          : m.aktif;
    await db.pool.execute(
      'UPDATE menu_items SET nama=?, ico=?, kategori=?, harga=?, stok=?, aktif=? WHERE id=?',
      [nama, ico, kat, harga, stok, aktif, id]
    );
    const [updated] = await db.pool.execute('SELECT * FROM menu_items WHERE id=?', [id]);
    return success(res, { menu: updated[0] });
  }

  const d = db.readDb();
  const idx = d.menu.findIndex(m => m.id === id);
  if (idx === -1) return error(res, 'Menu tidak ditemukan', 404);
  if (body.nama     !== undefined) d.menu[idx].nama     = sanitizeStr(body.nama, 100);
  if (body.ico      !== undefined) d.menu[idx].ico      = sanitizeStr(body.ico, 10);
  if (body.kategori !== undefined) d.menu[idx].kategori = body.kategori;
  if (body.harga    !== undefined) d.menu[idx].harga    = sanitizeInt(body.harga, 0, 0);
  if (body.stok     !== undefined) d.menu[idx].stok     = sanitizeInt(body.stok, 0, 0);
  if (body.aktif    !== undefined) d.menu[idx].aktif    = !!body.aktif;
  db.writeDb(d);
  return success(res, { menu: d.menu[idx] });
}

async function deleteMenu(req, res, id) {
  const dbObj = IS_MYSQL ? await db.readDb() : db.readDb();
  const user  = requireRole(['staff','boss'])(req, res, dbObj);
  if (!user) return;

  if (IS_MYSQL) {
    const [rows] = await db.pool.execute('SELECT id FROM menu_items WHERE id=?', [id]);
    if (!rows.length) return error(res, 'Menu tidak ditemukan', 404);
    await db.pool.execute('DELETE FROM menu_items WHERE id=?', [id]);
    return success(res, { deleted: id });
  }

  const d = db.readDb();
  const idx = d.menu.findIndex(m => m.id === id);
  if (idx === -1) return error(res, 'Menu tidak ditemukan', 404);
  d.menu.splice(idx, 1);
  db.writeDb(d);
  return success(res, { deleted: id });
}

async function toggleMenu(req, res, id) {
  const dbObj = IS_MYSQL ? await db.readDb() : db.readDb();
  const user  = requireRole(['staff','boss'])(req, res, dbObj);
  if (!user) return;

  if (IS_MYSQL) {
    const [rows] = await db.pool.execute('SELECT * FROM menu_items WHERE id=?', [id]);
    if (!rows.length) return error(res, 'Menu tidak ditemukan', 404);
    const newAktif = rows[0].aktif ? 0 : 1;
    await db.pool.execute('UPDATE menu_items SET aktif=? WHERE id=?', [newAktif, id]);
    return success(res, { menu: { ...rows[0], aktif: !!newAktif } });
  }

  const d = db.readDb();
  const idx = d.menu.findIndex(m => m.id === id);
  if (idx === -1) return error(res, 'Menu tidak ditemukan', 404);
  d.menu[idx].aktif = !d.menu[idx].aktif;
  db.writeDb(d);
  return success(res, { menu: d.menu[idx] });
}

module.exports = { getMenu, createMenu, updateMenu, deleteMenu, toggleMenu };
