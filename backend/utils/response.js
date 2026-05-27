'use strict';
/**
 * backend/utils/response.js
 * Consistent JSON response format untuk semua endpoint.
 * Format: { ok, data, error, meta }
 */

function success(res, data = {}, statusCode = 200, meta = {}) {
  const body = JSON.stringify({ ok: true, ...data, ...( Object.keys(meta).length ? { meta } : {} ) });
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function error(res, message, statusCode = 400, details = null) {
  const body = JSON.stringify({ ok: false, error: message, ...(details ? { details } : {}) });
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

module.exports = { success, error };
