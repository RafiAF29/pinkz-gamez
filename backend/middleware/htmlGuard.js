'use strict';
/**
 * backend/middleware/htmlGuard.js
 *
 * Server-side HTML route protection.
 * Mencegah akses langsung ke halaman admin/bos
 * tanpa session yang valid dan role yang sesuai.
 *
 * CARA KERJA:
 * 1. Browser request /admin/dashboard.html
 * 2. Server baca cookie sx_token (HANYA cookie, bukan query string)
 * 3. Jika tidak valid → redirect ke /admin/login.html?redirect=<url>
 * 4. Jika role tidak sesuai → redirect ke /403.html
 *
 * KENAPA TOKEN TIDAK BOLEH DI QUERY STRING:
 * - Token di URL masuk ke server access log (bocor ke siapapun yang baca log)
 * - Masuk ke browser history (bocor jika device sharing)
 * - Dikirim sebagai Referer header ke third-party (Google Analytics, dll)
 * - Bisa disalin dan dikirim via WA/email sebagai "link" → session hijacking
 *
 * Flow yang benar setelah login:
 *   Login → storeSession() set cookie → redirect → server baca cookie → OK
 *   (cookie tidak pernah muncul di URL)
 *
 * MySQL-ready: ganti resolveUser(token, db) dengan
 *   SELECT u.* FROM sessions s JOIN users u ON s.email=u.email
 *   WHERE s.token=? AND s.expires_at > NOW() AND u.active=1
 */
const { resolveUser } = require('./auth');
const { readDb }       = require('../services/db');

/** Parse cookies dari Cookie header */
function parseCookies(req) {
  const cookies = {};
  const header  = req.headers.cookie || '';
  header.split(';').forEach(part => {
    const [k, ...rest] = part.trim().split('=');
    if (k) cookies[k.trim()] = decodeURIComponent(rest.join('=').trim());
  });
  return cookies;
}

/**
 * Extract token dari cookie sx_token SAJA.
 * Query string ?token= sengaja tidak didukung — lihat komentar di atas.
 */
function extractTokenFromRequest(req) {
  const cookies = parseCookies(req);
  return cookies.sx_token || null;
}

/**
 * guardHtml(req, res, allowedRoles)
 * Cek token dari cookie, validasi ke DB, cek role.
 * @returns {boolean} true = izinkan serve HTML, false = sudah redirect
 */
async function guardHtml(req, res, allowedRoles) {
  const token = extractTokenFromRequest(req);

  if (!token) {
    redirectToLogin(res, req.url, allowedRoles);
    return false;
  }

  // readDb() bisa async (MySQL) atau sync (JSON) — await aman untuk keduanya
  const db   = await Promise.resolve(readDb());
  const user = resolveUser(token, db);

  if (!user) {
    // Token invalid atau expired → clear cookie + redirect login
    redirectToLogin(res, req.url, allowedRoles, true);
    return false;
  }

  if (!allowedRoles.includes(user.role)) {
    res.writeHead(302, { Location: '/403.html' });
    res.end();
    return false;
  }

  return true;
}

/**
 * Redirect ke halaman login yang sesuai.
 * @param {boolean} clearCookie - set expired cookie agar browser hapus token lama
 */
function redirectToLogin(res, originalUrl, roles, clearCookie = false) {
  const loginPage = roles.some(r => ['staff', 'boss'].includes(r))
    ? '/admin/login.html'
    : '/login.html';

  const headers = {
    Location: `${loginPage}?redirect=${encodeURIComponent(originalUrl)}`,
  };

  // Hapus cookie expired jika token tidak valid
  if (clearCookie) {
    headers['Set-Cookie'] = 'sx_token=; Path=/; Max-Age=0; SameSite=Strict';
  }

  res.writeHead(302, headers);
  res.end();
}

module.exports = { guardHtml, parseCookies, extractTokenFromRequest };
