'use strict';
/**
 * backend/utils/validation.js
 * Backend validation rules — mirror dari frontend validate*() functions.
 * Semua validasi dilakukan di backend, frontend hanya UX.
 */

const SLOT_PATTERN = /^\d{2}:\d{2}–\d{2}:\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function validateLoginBody(body) {
  const errors = [];
  if (!body.email || !EMAIL_PATTERN.test(String(body.email).trim())) errors.push('Email tidak valid');
  if (!body.password || String(body.password).length < 6) errors.push('Password minimal 6 karakter');
  return errors;
}

function validateRegisterBody(body) {
  const errors = [];
  if (!body.name || String(body.name).trim().length < 2) errors.push('Nama minimal 2 karakter');
  if (!body.email || !EMAIL_PATTERN.test(String(body.email).trim())) errors.push('Email tidak valid');
  if (!body.password || String(body.password).length < 6) errors.push('Password minimal 6 karakter');
  return errors;
}

function validateBookingBody(bk) {
  const errors = [];
  if (!bk.id)                             errors.push('Booking ID wajib ada');
  if (!bk.unitId)                         errors.push('Unit ID wajib ada');
  if (!bk.tgl || !DATE_PATTERN.test(bk.tgl)) errors.push('Tanggal tidak valid (format YYYY-MM-DD)');
  if (bk.tgl && bk.tgl < today())        errors.push('Tanggal tidak boleh di masa lalu');
  if (!Array.isArray(bk.slots) || !bk.slots.length) errors.push('Slots wajib diisi');
  if (bk.slots && bk.slots.length > 16)  errors.push('Maksimal 16 slot per booking');
  if (bk.slots) {
    for (const s of bk.slots) {
      if (!SLOT_PATTERN.test(s)) { errors.push(`Format slot tidak valid: ${s}`); break; }
    }
  }
  if (!bk.nama || String(bk.nama).trim().length < 2) errors.push('Nama pelanggan minimal 2 karakter');
  if (!bk.wa   || String(bk.wa).replace(/\D/g,'').length < 9) errors.push('Nomor WA tidak valid');
  if (bk.total  === undefined || bk.total  < 0) errors.push('Total tidak valid');
  return errors;
}

function validateUnitBody(body) {
  const errors = [];
  if (!body.nama || String(body.nama).trim().length < 2) errors.push('Nama unit minimal 2 karakter');
  if (!['available','maintenance'].includes(body.status_unit)) errors.push('Status unit tidak valid');
  return errors;
}

function validateMenuBody(body) {
  const errors = [];
  if (!body.nama || String(body.nama).trim().length < 2) errors.push('Nama menu minimal 2 karakter');
  if (!['Makanan','Minuman','Cemilan'].includes(body.kategori)) errors.push('Kategori menu tidak valid');
  if (body.harga === undefined || Number(body.harga) < 0) errors.push('Harga tidak valid');
  if (body.stok  !== undefined && Number(body.stok) < 0) errors.push('Stok tidak boleh negatif');
  return errors;
}

module.exports = {
  validateLoginBody,
  validateRegisterBody,
  validateBookingBody,
  validateUnitBody,
  validateMenuBody,
  today,
};
