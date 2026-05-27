'use strict';
/**
 * backend/middleware/rateLimit.js
 * In-memory rate limiter per IP.
 * MySQL-ready: saat production, ganti dengan Redis atau DB-based rate limit.
 */
const { error } = require('../utils/response');
const cfg = require('../config');

// Map: ip -> { count, resetAt }
const store = new Map();

// Bersihkan store setiap 5 menit (cegah memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of store) {
    if (data.resetAt < now) store.delete(ip);
  }
}, 5 * 60_000);

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Rate limit factory.
 * @param {number} maxRequests - max requests per window
 * @param {number} windowMs    - window in ms
 */
function rateLimit(maxRequests, windowMs) {
  return function check(req, res) {
    const ip  = getClientIp(req);
    const now = Date.now();
    const key = `${ip}`;
    let data  = store.get(key);

    if (!data || data.resetAt < now) {
      data = { count: 0, resetAt: now + windowMs };
      store.set(key, data);
    }

    data.count++;

    if (data.count > maxRequests) {
      const retryAfter = Math.ceil((data.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      error(res, `Terlalu banyak request. Coba lagi dalam ${retryAfter} detik.`, 429);
      return false;
    }
    return true;
  };
}

const globalLimit = rateLimit(cfg.RATE.maxRequests, cfg.RATE.windowMs);
const loginLimit  = rateLimit(cfg.RATE.loginMax, cfg.RATE.windowMs);

module.exports = { rateLimit, globalLimit, loginLimit, getClientIp };
