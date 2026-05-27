'use strict';
/**
 * backend/controllers/authController.js
 * Business logic untuk auth — login, register, verify, logout.
 */
const db  = require('../services/db');
const cfg = require('../config');
const { hashPassword, verifyPassword, randomToken } = require('../utils/crypto');
const { sanitizeEmail, sanitizeStr } = require('../utils/sanitize');

async function login(email, password) {
  email = sanitizeEmail(email);
  let user;
  if (db.isMySQL) {
    const [rows] = await db.pool.execute('SELECT * FROM users WHERE email=? AND active=1', [email]);
    user = rows[0] || null;
  } else {
    const dbObj = db.readDb();
    user = dbObj.users.find(u => u.email === email && u.active !== false) || null;
  }

  // Timing-safe: selalu jalankan verifyPassword agar tidak timing attack
  const valid = user
    ? verifyPassword(password, user.passHash || user.pass_hash)
    : verifyPassword('x', 'dummy:dummy');

  if (!user || !valid) return { ok: false, code: 401, message: 'Email atau password salah' };

  const token  = randomToken();
  const expiry = new Date(Date.now() + cfg.SESSION_TTL_MS);

  if (db.isMySQL) {
    await db.pool.execute('INSERT INTO sessions (token, email, expires_at) VALUES (?,?,?)', [token, email, expiry]);
  } else {
    const dbObj = db.readDb();
    dbObj.sessions[token] = { email, expiresAt: expiry.getTime() };
    db.writeDb(dbObj);
  }

  return { ok: true, token, user: { email, role: user.role, name: user.name || user.nama } };
}

async function register(email, password, name) {
  email = sanitizeEmail(email);
  name  = sanitizeStr(name, 100);

  if (db.isMySQL) {
    const [ex] = await db.pool.execute('SELECT id FROM users WHERE email=?', [email]);
    if (ex.length) return { ok: false, code: 409, message: 'Email sudah terdaftar' };
    await db.pool.execute(
      'INSERT INTO users (email,name,pass_hash,role,active,created_at) VALUES (?,?,?,?,1,NOW())',
      [email, name, hashPassword(password), 'user']
    );
  } else {
    const dbObj = db.readDb();
    if (dbObj.users.some(u => u.email === email)) return { ok: false, code: 409, message: 'Email sudah terdaftar' };
    dbObj.users.push({ email, name, role:'user', active:true, passHash:hashPassword(password), createdAt:new Date().toISOString() });
    db.writeDb(dbObj);
  }

  const token  = randomToken();
  const expiry = new Date(Date.now() + cfg.SESSION_TTL_MS);

  if (db.isMySQL) {
    await db.pool.execute('INSERT INTO sessions (token, email, expires_at) VALUES (?,?,?)', [token, email, expiry]);
  } else {
    const dbObj = db.readDb();
    dbObj.sessions[token] = { email, expiresAt: expiry.getTime() };
    db.writeDb(dbObj);
  }

  return { ok: true, token, user: { email, name, role: 'user' } };
}

async function logout(token) {
  if (!token) return { ok: true };
  if (db.isMySQL) {
    await db.pool.execute('DELETE FROM sessions WHERE token=?', [token]);
  } else {
    const dbObj = db.readDb();
    delete dbObj.sessions[token];
    db.writeDb(dbObj);
  }
  return { ok: true };
}

async function verifyToken(token) {
  const dbObj = db.isMySQL ? await db.readDb() : db.readDb();
  const ses   = dbObj.sessions[token];
  if (!ses || ses.expiresAt < Date.now()) return { ok: false, code: 401, message: 'Sesi tidak valid' };

  const user  = dbObj.users.find(u => u.email === ses.email && u.active !== false);
  if (!user) return { ok: false, code: 401, message: 'Akun tidak ditemukan atau tidak aktif' };

  // Sliding window — perpanjang sesi
  const newExpiry = new Date(Date.now() + cfg.SESSION_TTL_MS);
  if (db.isMySQL) {
    await db.pool.execute('UPDATE sessions SET expires_at=? WHERE token=?', [newExpiry, token]);
  } else {
    const d = db.readDb();
    if (d.sessions[token]) { d.sessions[token].expiresAt = newExpiry.getTime(); db.writeDb(d); }
  }

  return { ok: true, user: { email: user.email, role: user.role, name: user.name || user.nama } };
}

module.exports = { login, register, logout, verifyToken };
