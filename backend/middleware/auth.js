'use strict';
/**
 * backend/middleware/auth.js
 * Session/token validation — satu-satunya source of truth untuk auth.
 *
 * SECURITY NOTES:
 * - Token diextract dari header Authorization: Bearer <token>
 * - Role TIDAK diambil dari frontend/localStorage
 * - Setiap request ke protected endpoint divalidasi ulang ke db
 * - MySQL-ready: ganti readDb() dengan SELECT FROM sessions JOIN users
 */
const { error } = require('../utils/response');

/**
 * Extract bearer token dari request header.
 * Support Authorization: Bearer <token>
 * Support legacy X-Session-Token header
 */
function extractToken(req) {
  const auth = req.headers.authorization || '';
  const m    = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : (req.headers['x-session-token'] || '').trim() || null;
}

/**
 * Resolve user dari db berdasarkan token.
 * Role berasal dari db.users — TIDAK dari client/localStorage.
 * @returns {object|null} user object atau null jika tidak valid
 */
function resolveUser(token, db) {
  if (!token) return null;
  const ses = db.sessions[token];
  if (!ses || ses.expiresAt < Date.now()) return null;
  const user = db.users.find(u => u.email === ses.email && u.active !== false);
  if (!user) return null;
  return {
    email: user.email,
    name:  user.name,
    role:  user.role,   // <-- role dari DB, bukan frontend
    token,
  };
}

/**
 * requireRole(['staff','boss']) — middleware factory untuk route protection.
 * Dipanggil di awal setiap handler yang butuh role tertentu.
 * @returns {object|null} user atau null (response sudah dikirim jika null)
 */
function requireRole(roles) {
  return function check(req, res, db) {
    const token = extractToken(req);
    const user  = resolveUser(token, db);
    if (!user) {
      error(res, 'Sesi tidak valid atau sudah habis. Silakan login kembali.', 401);
      return null;
    }
    if (!roles.includes(user.role)) {
      error(res, `Akses ditolak. Diperlukan role: ${roles.join(' atau ')}.`, 403);
      return null;
    }
    return user;
  };
}

/**
 * requireAuth — cek login saja, tanpa cek role spesifik.
 */
function requireAuth(req, res, db) {
  const token = extractToken(req);
  const user  = resolveUser(token, db);
  if (!user) {
    error(res, 'Sesi tidak valid atau sudah habis. Silakan login kembali.', 401);
    return null;
  }
  return user;
}

module.exports = { extractToken, resolveUser, requireRole, requireAuth };
