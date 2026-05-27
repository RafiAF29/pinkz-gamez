'use strict';
/**
 * backend/services/analytics.js
 * Analytics & reporting service — data untuk dashboard boss.
 * MySQL-ready: semua query sudah disiapkan sebagai SQL-equivalent.
 *
 * Saat migrasi: ganti return statement dengan actual SQL query.
 */

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * Revenue summary — total, hari ini, per kategori
 * SQL-equivalent:
 *   SELECT SUM(total), SUM(total_ps), SUM(total_fnb),
 *          COUNT(*) FROM transactions WHERE paid_at IS NOT NULL
 */
function getRevenueSummary(laporan) {
  const td = todayStr();
  const all    = laporan;
  const today  = laporan.filter(l => l.tgl === td);
  return {
    total:        all.reduce((s,l)   => s + (l.total || 0), 0),
    total_ps:     all.reduce((s,l)   => s + (l.total_ps || 0), 0),
    total_fnb:    all.reduce((s,l)   => s + (l.total_fnb || 0), 0),
    count:        all.length,
    today_total:  today.reduce((s,l) => s + (l.total || 0), 0),
    today_count:  today.length,
  };
}

/**
 * Unit performance — booking count & revenue per unit
 * SQL-equivalent:
 *   SELECT unit_id, COUNT(*), SUM(total_ps) FROM transactions
 *   GROUP BY unit_id ORDER BY COUNT(*) DESC
 */
function getUnitStats(laporan) {
  const map = {};
  for (const l of laporan) {
    map[l.unit] ??= { unit:l.unit, kategori:l.kategori, count:0, revenue:0 };
    map[l.unit].count++;
    map[l.unit].revenue += (l.total_ps || 0);
  }
  return Object.values(map).sort((a,b) => b.count - a.count);
}

/**
 * Daily revenue — 7 hari terakhir
 * SQL-equivalent:
 *   SELECT DATE(paid_at), SUM(total) FROM transactions
 *   WHERE paid_at >= NOW() - INTERVAL 7 DAY GROUP BY DATE(paid_at)
 */
function getDailyRevenue(laporan, days = 7) {
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d  = new Date(now);
    d.setDate(d.getDate() - i);
    const tgl = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const day = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()];
    const rows = laporan.filter(l => l.tgl === tgl);
    result.push({ tgl, day, total: rows.reduce((s,l) => s + (l.total || 0), 0), count: rows.length });
  }
  return result;
}

/**
 * FnB breakdown — top FnB items
 * SQL-equivalent:
 *   SELECT fi.nama, SUM(fi.qty), SUM(fi.harga * fi.qty)
 *   FROM booking_fnb_items fi JOIN bookings b ON fi.booking_id = b.id
 *   WHERE b.payment_status = 'paid' GROUP BY fi.nama
 */
function getFnbStats(bookings) {
  const map = {};
  for (const bk of bookings) {
    if (bk.payment_status !== 'paid') continue;
    for (const f of bk.fnb || []) {
      map[f.nama] ??= { nama:f.nama, ico:f.ico||'', qty:0, revenue:0 };
      map[f.nama].qty     += (f.qty || 0);
      map[f.nama].revenue += (f.harga || 0) * (f.qty || 0);
    }
  }
  return Object.values(map).sort((a,b) => b.revenue - a.revenue);
}

/**
 * Booking status summary
 */
function getBookingStatusSummary(bookings) {
  const td = todayStr();
  return {
    pending:    bookings.filter(b => b.payment_status === 'pending').length,
    paid:       bookings.filter(b => b.payment_status === 'paid').length,
    rejected:   bookings.filter(b => b.payment_status === 'rejected').length,
    expired:    bookings.filter(b => b.payment_status === 'expired').length,
    today:      bookings.filter(b => b.tgl === td).length,
    today_paid: bookings.filter(b => b.tgl === td && b.payment_status === 'paid').length,
    online:     bookings.filter(b => b.tipe_booking === 'online').length,
    walkin:     bookings.filter(b => b.tipe_booking === 'walkin').length,
  };
}

/**
 * Unit slot usage hari ini
 */
function getUnitSlotUsage(units, bookedSlots, pendingSlots) {
  const td = todayStr();
  const ALL_SLOT_COUNT = 16;
  return units.map(u => {
    const booked  = bookedSlots[u.id]?.[td]  || [];
    const pending = pendingSlots[u.id]?.[td] || [];
    const usedSet = new Set([...booked, ...pending]);
    return {
      id:       u.id,
      nama:     u.nama,
      kategori: u.kategori,
      status:   u.status_unit,
      booked:   booked.length,
      pending:  pending.length,
      used:     usedSet.size,
      total:    ALL_SLOT_COUNT,
      pct:      Math.round((usedSet.size / ALL_SLOT_COUNT) * 100),
    };
  });
}

/**
 * Full analytics object untuk boss dashboard
 */
function getFullAnalytics(db) {
  return {
    revenue:       getRevenueSummary(db.laporan),
    unitStats:     getUnitStats(db.laporan),
    dailyRevenue:  getDailyRevenue(db.laporan, 7),
    fnbStats:      getFnbStats(db.bookings),
    bookingStatus: getBookingStatusSummary(db.bookings),
    unitUsage:     getUnitSlotUsage(db.units, db.bookedSlots, db.pendingSlots),
    recentTrx:     db.laporan.slice(0, 10),
    pendingList:   db.bookings.filter(b => b.payment_status === 'pending').slice(0, 10),
    maintUnits:    db.units.filter(u => u.status_unit === 'maintenance'),
    generatedAt:   new Date().toISOString(),
  };
}

module.exports = {
  getRevenueSummary, getUnitStats, getDailyRevenue,
  getFnbStats, getBookingStatusSummary, getUnitSlotUsage,
  getFullAnalytics,
};
