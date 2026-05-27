'use strict';
/**
 * backend/controllers/bookingController.js v8.2
 * Struk di-generate di backend — tidak tergantung frontend.
 */
const db  = require('../services/db');
const cfg = require('../config');
const { hasSlotConflict, addSlots, removeSlots, buildLaporanRow, withDbLock } = db;

/* ── Struk builder (backend) ── */
const MON = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function Rp(n){ return 'Rp ' + Number(n).toLocaleString('id-ID'); }

function buildStruk(bk) {
  const tgl    = String(bk.tgl || '').slice(0, 10);
  const parts  = tgl.split('-');
  const d      = parts.length === 3 ? new Date(+parts[0], +parts[1]-1, +parts[2]) : new Date();
  const bonus  = Number(bk.bonus_jam || bk.bonusJam || 0);
  const isWE   = bk.is_weekend || bk.isWeekend || false;
  const tipeHari = isWE ? `Weekend (bonus +${bonus} jam)` : 'Weekday';
  const paidAt = bk.paid_at ? new Date(bk.paid_at) : new Date();
  const jamStr = paidAt.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
  const unitNama  = bk.unit_nama  || bk.unitNama  || '';
  const timeRange = bk.time_range || bk.timeRange || '';
  const dur       = bk.dur || 1;
  const jamMain   = bk.jam_main || bk.jamMain || dur;
  const totalPs   = bk.total_ps  || 0;
  const total     = bk.total     || 0;
  const metode    = bk.metode    || 'QRIS';

  let fnbLines = '';
  const fnbArr = bk.fnb || [];
  if (fnbArr.length) {
    fnbLines = '\nMakanan & Minuman:\n' +
      fnbArr.map(f => `  ${f.ico||''} ${f.nama} x${f.qty} = ${Rp(f.harga * f.qty)}`).join('\n');
  }

  return [
    '==============================',
    '     PINKZ GAMEZ PS RENTAL',
    '        Rungkut, Surabaya',
    '==============================',
    `Kode  : ${bk.id}`,
    `Tgl   : ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`,
    `Hari  : ${tipeHari}`,
    `Bayar : ${jamStr}`,
    '------------------------------',
    `Nama  : ${bk.nama}`,
    `WA    : ${bk.wa}`,
    `Unit  : ${unitNama}`,
    `Sesi  : ${timeRange}`,
    `Bayar : ${dur} Jam` + (bonus > 0 ? `\nBonus : +${bonus} Jam GRATIS` : ''),
    `Main  : ${jamMain} Jam`,
    '------------------------------',
    `Sewa  : ${Rp(totalPs)}` + fnbLines,
    '------------------------------',
    `TOTAL : ${Rp(total)}`,
    `Bayar : ${metode}`,
    'Status: ✅ LUNAS',
    '==============================',
    '  Terima kasih sudah main di',
    '  Pinkz Gamez PS Rental! 🎮',
    '=============================='
  ].join('\n');
}

function toMysqlDatetime(d) {
  return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
}

/* ── createBooking ── */
async function createBooking(bk) {
  const result = await withDbLock(async dbOrConn => {
    if (db.isMySQL) {
      const conn = dbOrConn;
      const [units] = await conn.execute('SELECT * FROM units WHERE id=? FOR UPDATE', [bk.unitId]);
      if (!units.length)                          return { err: [404, 'Unit tidak ditemukan'] };
      if (units[0].status_unit === 'maintenance') return { err: [409, 'Unit sedang maintenance'] };
      if (await hasSlotConflict(conn, bk.unitId, bk.tgl, bk.slots))
        return { err: [409, 'Slot sudah tidak tersedia — ada booking lain di jam tersebut'] };

      bk.expires_at = toMysqlDatetime(Date.now() + cfg.PENDING_TTL_MS);
      await conn.execute(
        `INSERT INTO bookings (id,unit_id,unit_nama,kategori,tgl,tgl_str,time_range,dur,jam_main,
         bonus_jam,is_weekend,harga,nama,wa,email,catatan,total_ps,total_fnb,total,
         payment_status,booking_status,tipe_booking,metode,expires_at,slots,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','pending',?,?,?,?,NOW())`,
        [bk.id, bk.unitId, bk.unitNama, bk.kategori, bk.tgl, bk.tglStr||'', bk.timeRange,
         bk.dur, bk.jamMain, bk.bonusJam, bk.isWeekend?1:0, bk.harga||0,
         bk.nama, bk.wa, bk.email||'', bk.catatan||'',
         bk.total_ps, bk.total_fnb||0, bk.total,
         bk.tipe_booking, bk.metode||'QRIS', bk.expires_at, JSON.stringify(bk.slots)]
      );
      for (const f of bk.fnb||[]) {
        await conn.execute(
          'INSERT INTO booking_fnb_items (booking_id,menu_id,nama,ico,harga,qty,subtotal) VALUES (?,?,?,?,?,?,?)',
          [bk.id, f.id, f.nama, f.ico||'', f.harga, f.qty, f.harga*f.qty]
        );
      }
      await addSlots(conn, bk.unitId, bk.tgl, bk.slots, 'pending', bk.id);
      return { bk };
    }
    /* JSON mode */
    const dbObj = dbOrConn;
    const unit  = dbObj.units.find(u => u.id === bk.unitId);
    if (!unit)                              return { err: [404, 'Unit tidak ditemukan'] };
    if (unit.status_unit === 'maintenance') return { err: [409, 'Unit sedang maintenance'] };
    if (hasSlotConflict(dbObj, bk.unitId, bk.tgl, bk.slots))
      return { err: [409, 'Slot sudah tidak tersedia'] };
    bk.expires_at = new Date(Date.now() + cfg.PENDING_TTL_MS).toISOString();
    dbObj.bookings.unshift(bk);
    addSlots(dbObj.pendingSlots, bk.unitId, bk.tgl, bk.slots);
    return { db: dbObj, bk };
  });
  if (result.err) return { ok: false, code: result.err[0], message: result.err[1] };
  return { ok: true, booking: result.bk };
}

/* ── approveBooking ── */
async function approveBooking(bookingId, approvedBy) {
  const result = await withDbLock(async dbOrConn => {
    if (db.isMySQL) {
      const conn = dbOrConn;
      const [rows] = await conn.execute('SELECT * FROM bookings WHERE id=? FOR UPDATE', [bookingId]);
      if (!rows.length) return { err: [404, 'Booking tidak ditemukan'] };
      const bk = rows[0];
      if (bk.payment_status !== 'pending')
        return { err: [400, `Booking tidak bisa di-approve (status: ${bk.payment_status})`] };

      const slots  = bk.slots ? JSON.parse(bk.slots) : [];
      const tglStr = bk.tgl instanceof Date ? bk.tgl.toISOString().slice(0,10) : String(bk.tgl);

      /* Cek conflict hanya dari booking LAIN yang sudah booked */
      let conflict = false;
      if (slots.length) {
        const ph = slots.map(() => '?').join(',');
        const [cr] = await conn.execute(
          `SELECT COUNT(*) AS cnt FROM booking_slots
           WHERE unit_id=? AND tgl=? AND slot IN (${ph}) AND status='booked' AND booking_id != ?`,
          [bk.unit_id, tglStr, ...slots, bookingId]
        );
        conflict = cr[0].cnt > 0;
      }
      if (conflict) {
        await conn.execute(
          `UPDATE bookings SET payment_status='rejected',booking_status='cancelled',
           reject_reason=?,rejected_at=NOW(),rejected_by=? WHERE id=?`,
          ['Slot sudah diisi booking lain', approvedBy, bookingId]
        );
        if (slots.length) await removeSlots(conn, bk.unit_id, tglStr, slots);
        return { autoRejected: true };
      }

      const paidAt = toMysqlDatetime(Date.now());

      /* Set slots ke booked */
      if (slots.length) {
        await conn.execute(`UPDATE booking_slots SET status='booked' WHERE booking_id=?`, [bookingId]);
      }

      /* Kurangi stok F&B */
      const [fnbItems] = await conn.execute('SELECT * FROM booking_fnb_items WHERE booking_id=?', [bookingId]);
      for (const f of fnbItems) {
        await conn.execute('UPDATE menu_items SET stok=GREATEST(0, stok-?) WHERE id=?', [f.qty, f.menu_id]);
      }

      /* Generate struk di backend */
      const struk = buildStruk({
        ...bk,
        fnb: fnbItems.map(f => ({ ico:f.ico||'', nama:f.nama, qty:f.qty, harga:f.harga })),
        paid_at: paidAt,
      });

      await conn.execute(
        `UPDATE bookings SET payment_status='paid',booking_status='confirmed',paid_at=?,approved_by=?,struk=? WHERE id=?`,
        [paidAt, approvedBy, struk, bookingId]
      );

      /* Tambah ke laporan */
      const [lapCheck] = await conn.execute('SELECT id FROM laporan WHERE booking_id=?', [bookingId]);
      if (!lapCheck.length) {
        const row = buildLaporanRow({
          ...bk, unitNama:bk.unit_nama, unitId:bk.unit_id,
          tglStr:bk.tgl_str, timeRange:bk.time_range,
          jamMain:bk.jam_main, bonusJam:bk.bonus_jam,
          total_ps:bk.total_ps, total_fnb:bk.total_fnb,
          tipe_booking:bk.tipe_booking, paid_at:paidAt
        });
        await conn.execute(
          `INSERT INTO laporan (id,booking_id,nama,email,unit,kategori,tgl,tgl_str,time_range,
           dur,jam_main,bonus_jam,is_weekend,total_ps,total_fnb,total,metode,tipe,paid_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [row.id, row.booking_id, row.nama, row.email||'', row.unit, row.kategori,
           row.tgl, row.tglStr||'', row.timeRange, row.dur, row.jamMain, row.bonusJam,
           row.isWeekend?1:0, row.total_ps, row.total_fnb, row.total, row.metode, row.tipe, row.paid_at]
        );
      }
      return { bk: { ...bk, payment_status:'paid', paid_at:paidAt, struk } };
    }

    /* JSON mode */
    const dbObj = dbOrConn;
    const bk    = dbObj.bookings.find(b => b.id === bookingId);
    if (!bk) return { err: [404, 'Booking tidak ditemukan'] };
    if (bk.payment_status !== 'pending')
      return { err: [400, `Booking tidak bisa di-approve (status: ${bk.payment_status})`] };

    const slotsBooked = (bk.slots||[]).filter(s => dbObj.bookedSlots[bk.unitId]?.[bk.tgl]?.includes(s));
    if (slotsBooked.length) {
      bk.payment_status='rejected'; bk.booking_status='cancelled';
      bk.reject_reason='Slot sudah diisi booking lain'; bk.rejected_at=new Date().toISOString();
      removeSlots(dbObj.pendingSlots, bk.unitId, bk.tgl, bk.slots||[]);
      return { db: dbObj, autoRejected: true };
    }

    const paidAt = new Date().toISOString();
    addSlots(dbObj.bookedSlots, bk.unitId, bk.tgl, bk.slots||[]);
    removeSlots(dbObj.pendingSlots, bk.unitId, bk.tgl, bk.slots||[]);
    for (const f of bk.fnb||[]) {
      const item = dbObj.menu.find(m => m.id === f.id);
      if (item) item.stok = Math.max(0, Number(item.stok||0) - Number(f.qty||0));
    }
    const struk = buildStruk({ ...bk, paid_at: paidAt });
    bk.payment_status='paid'; bk.booking_status='confirmed';
    bk.paid_at=paidAt; bk.approved_by=approvedBy; bk.struk=struk;
    if (!dbObj.laporan.some(l => l.booking_id === bk.id))
      dbObj.laporan.unshift(buildLaporanRow({ ...bk, paid_at:paidAt }));
    return { db: dbObj, bk };
  });

  if (result.err)          return { ok: false, code: result.err[0], message: result.err[1] };
  if (result.autoRejected) return { ok: false, code: 409, message: 'Slot sudah diisi booking lain', autoRejected: true };
  return { ok: true, booking: result.bk };
}

/* ── rejectBooking ── */
async function rejectBooking(bookingId, reason, rejectedBy) {
  const result = await withDbLock(async dbOrConn => {
    if (db.isMySQL) {
      const conn = dbOrConn;
      const [rows] = await conn.execute('SELECT * FROM bookings WHERE id=? FOR UPDATE', [bookingId]);
      if (!rows.length) return { err: [404, 'Booking tidak ditemukan'] };
      const bk    = rows[0];
      const slots = bk.slots ? JSON.parse(bk.slots) : [];
      if (!['pending','paid'].includes(bk.payment_status))
        return { err: [400, `Booking tidak bisa ditolak (status: ${bk.payment_status})`] };
      if (slots.length)
        await conn.execute(`UPDATE booking_slots SET status='released' WHERE booking_id=?`, [bookingId]);
      await conn.execute(
        `UPDATE bookings SET payment_status='rejected',booking_status='cancelled',
         reject_reason=?,rejected_at=NOW(),rejected_by=? WHERE id=?`,
        [reason, rejectedBy, bookingId]
      );
      return { bk: { ...bk, payment_status:'rejected', reject_reason:reason } };
    }
    const dbObj = dbOrConn;
    const bk    = dbObj.bookings.find(b => b.id === bookingId);
    if (!bk) return { err: [404, 'Booking tidak ditemukan'] };
    if (!['pending','paid'].includes(bk.payment_status))
      return { err: [400, `Booking tidak bisa ditolak (status: ${bk.payment_status})`] };
    removeSlots(dbObj.pendingSlots, bk.unitId, bk.tgl, bk.slots||[]);
    if (bk.payment_status === 'paid') removeSlots(dbObj.bookedSlots, bk.unitId, bk.tgl, bk.slots||[]);
    bk.payment_status='rejected'; bk.booking_status='cancelled';
    bk.reject_reason=reason; bk.rejected_at=new Date().toISOString(); bk.rejected_by=rejectedBy;
    return { db: dbObj, bk };
  });
  if (result.err) return { ok: false, code: result.err[0], message: result.err[1] };
  return { ok: true, booking: result.bk };
}

async function getBookingsByUser(callerEmail, callerRole) {
  const dbObj = db.isMySQL ? await db.readDb() : db.readDb();
  const all   = dbObj.bookings;
  return callerRole === 'user' ? all.filter(b => b.email === callerEmail) : all;
}

module.exports = { createBooking, approveBooking, rejectBooking, getBookingsByUser, buildStruk };
