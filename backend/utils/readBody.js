'use strict';
/**
 * backend/utils/readBody.js
 * Parse request body JSON dengan size limit.
 */
const MAX_BYTES = 500_000; // 500KB

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (Buffer.byteLength(data) > MAX_BYTES) {
        reject(new Error('Payload terlalu besar (max 500KB)'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('Body bukan JSON yang valid')); }
    });
    req.on('error', reject);
  });
}

module.exports = { readBody };
