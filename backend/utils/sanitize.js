'use strict';
/**
 * backend/utils/sanitize.js
 * Input sanitization — strip HTML tags, trim, limit length.
 * Dipakai di semua controller sebelum data masuk ke storage.
 */

function stripHtml(str) {
  return String(str || '').replace(/<[^>]*>/g, '').trim();
}

function sanitizeStr(val, maxLen = 500) {
  return stripHtml(String(val || '')).slice(0, maxLen);
}

function sanitizeEmail(val) {
  return String(val || '').trim().toLowerCase().slice(0, 255);
}

function sanitizeInt(val, def = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function sanitizeBooking(raw) {
  return {
    id:          sanitizeStr(raw.id,          50),
    unitId:      sanitizeStr(raw.unitId,      20),
    unitNama:    sanitizeStr(raw.unitNama,    100),
    kategori:    sanitizeStr(raw.kategori,    30),
    tgl:         sanitizeStr(raw.tgl,         10),
    tglStr:      sanitizeStr(raw.tglStr,      40),
    slots:       Array.isArray(raw.slots) ? raw.slots.map(s => sanitizeStr(s, 20)).slice(0, 20) : [],
    timeRange:   sanitizeStr(raw.timeRange,   30),
    dur:         sanitizeInt(raw.dur,         1, 1, 16),
    jamMain:     sanitizeInt(raw.jamMain,     1, 1, 17),
    bonusJam:    sanitizeInt(raw.bonusJam,    0, 0, 5),
    isWeekend:   !!raw.isWeekend,
    nama:        sanitizeStr(raw.nama,        100),
    wa:          sanitizeStr(raw.wa,          20),
    email:       sanitizeEmail(raw.email),
    catatan:     sanitizeStr(raw.catatan,     500),
    fnb:         Array.isArray(raw.fnb) ? raw.fnb.map(f => ({
      id:    sanitizeStr(f.id,   20),
      nama:  sanitizeStr(f.nama, 100),
      ico:   sanitizeStr(f.ico,  10),
      harga: sanitizeInt(f.harga, 0, 0),
      qty:   sanitizeInt(f.qty,   1, 1, 100),
    })).slice(0, 20) : [],
    total_ps:    sanitizeInt(raw.total_ps,    0, 0),
    total_fnb:   sanitizeInt(raw.total_fnb,   0, 0),
    total:       sanitizeInt(raw.total,       0, 0),
    harga:       sanitizeInt(raw.harga,       0, 0),
    tipe_booking:['online','walkin'].includes(raw.tipe_booking) ? raw.tipe_booking : 'online',
    metode:      sanitizeStr(raw.metode,      50),
    payment_status: 'pending',
    booking_status: 'pending',
    expires_at:  null,
    created_at:  new Date().toISOString(),
    transferred_at: null,
  };
}

module.exports = { stripHtml, sanitizeStr, sanitizeEmail, sanitizeInt, sanitizeBooking };
