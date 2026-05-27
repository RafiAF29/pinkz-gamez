'use strict';
/**
 * backend/config/index.js
 * Centralized config - semua env var dibaca di sini.
 * Untuk MySQL: isi DB_* di .env
 */
const path = require('path');
const fs   = require('fs');

// Simple .env loader (tanpa dependency eksternal)
const envFile = path.join(__dirname, '../../.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const eq = t.indexOf('=');
    if (eq === -1) return;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  });
}

module.exports = {
  PORT:            Number(process.env.PORT)                      || 3000,
  NODE_ENV:        process.env.NODE_ENV                          || 'development',
  SESSION_SECRET:  process.env.SESSION_SECRET                    || 'change_me_in_production',
  PENDING_TTL_MS:  Number(process.env.PENDING_TTL_MINUTES || 15) * 60_000,
  SESSION_TTL_MS:  Number(process.env.SESSION_TTL_HOURS   || 8)  * 3_600_000,
  STORAGE_MODE:    process.env.STORAGE_MODE                      || 'json',
  WA_ADMIN:        process.env.WA_ADMIN_NUMBER                   || '6281234567890',
  RATE: {
    windowMs:    Number(process.env.RATE_LIMIT_WINDOW_MS)    || 60_000,
    maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 60,
    loginMax:    Number(process.env.RATE_LIMIT_LOGIN_MAX)    || 10,
  },
  DB: {
    host:    process.env.DB_HOST || 'localhost',
    port:    Number(process.env.DB_PORT) || 3306,
    name: process.env.DB_NAME || 'railway',
    user:    process.env.DB_USER || 'root',
    pass:    process.env.DB_PASS || '',
    poolMin: Number(process.env.DB_POOL_MIN) || 2,
    poolMax: Number(process.env.DB_POOL_MAX) || 10,
  },
  ROOT: path.join(__dirname, '../..'),
};
