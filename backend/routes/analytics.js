'use strict';
/**
 * backend/routes/analytics.js — HTTP layer saja
 * Business logic di controllers/analyticsController.js
 */
const { success, error } = require('../utils/response');
const { requireRole }    = require('../middleware/auth');
const { resolveUser, extractToken } = require('../middleware/auth');
const ctrl = require('../controllers/analyticsController');
const db   = require('../services/db');

async function getAnalytics(req, res) {
  const dbObj = db.isMySQL ? await db.readDb() : db.readDb();
  if (!requireRole(['boss','staff'])(req, res, dbObj)) return;
  const analytics = await ctrl.getFullAnalytics();
  return success(res, { analytics });
}

async function getDailyChart(req, res) {
  const dbObj = db.isMySQL ? await db.readDb() : db.readDb();
  if (!requireRole(['boss','staff'])(req, res, dbObj)) return;
  const days  = Math.min(Number(new URL(req.url, 'http://localhost').searchParams.get('days')||7), 30);
  const daily = await ctrl.getDailyRevenue(days);
  return success(res, { daily });
}

async function getUnitPerformance(req, res) {
  const dbObj = db.isMySQL ? await db.readDb() : db.readDb();
  if (!requireRole(['boss','staff'])(req, res, dbObj)) return;
  const units = await ctrl.getUnitPerformance();
  return success(res, { units });
}

module.exports = { getAnalytics, getDailyChart, getUnitPerformance };
