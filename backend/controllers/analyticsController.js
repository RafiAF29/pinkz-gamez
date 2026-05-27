'use strict';
/**
 * backend/controllers/analyticsController.js
 * Business logic untuk analytics & laporan boss.
 * Thin wrapper atas analytics service — bisa tambahkan caching di sini nanti.
 */
const db  = require('../services/db');
const svc = require('../services/analytics');

async function getFullAnalytics() {
  const dbObj = db.isMySQL ? await db.readDb() : db.readDb();
  return svc.getFullAnalytics(dbObj);
}

async function getDailyRevenue(days = 7) {
  const dbObj = db.isMySQL ? await db.readDb() : db.readDb();
  return svc.getDailyRevenue(dbObj.laporan, Math.min(days, 30));
}

async function getUnitPerformance() {
  const dbObj = db.isMySQL ? await db.readDb() : db.readDb();
  return svc.getUnitStats(dbObj.laporan);
}

module.exports = { getFullAnalytics, getDailyRevenue, getUnitPerformance };
