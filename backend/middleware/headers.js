'use strict';
/**
 * backend/middleware/headers.js
 * Security headers untuk setiap response.
 */
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options',    'nosniff');
  res.setHeader('X-Frame-Options',           'DENY');
  res.setHeader('X-XSS-Protection',          '1; mode=block');
  res.setHeader('Referrer-Policy',           'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy',        'geolocation=(), camera=(), microphone=()');
  // CSP dasar — sesuaikan untuk production
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' fonts.googleapis.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com fonts.gstatic.com; font-src fonts.gstatic.com; img-src 'self' data:;"
  );
}

module.exports = { applySecurityHeaders };
