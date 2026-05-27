'use strict';
/**
 * backend/routes/units.js — HTTP layer saja
 * Business logic di controllers/unitController.js
 */
const { readBody }   = require('../utils/readBody');
const { validateUnitBody } = require('../utils/validation');
const { success, error }   = require('../utils/response');
const { requireRole }      = require('../middleware/auth');
const ctrl = require('../controllers/unitController');
const db   = require('../services/db');

async function getUnits(req, res) {
  const units = await ctrl.getAll();
  return success(res, { units });
}

async function updateUnit(req, res, id) {
  const dbObj = db.isMySQL ? await db.readDb() : db.readDb();
  const user  = requireRole(['staff','boss'])(req, res, dbObj);
  if (!user) return;

  let body; try { body = await readBody(req); } catch(e) { return error(res, e.message, 400); }
  const errs = validateUnitBody({ nama: body.nama || 'x', status_unit: body.status_unit || 'available' });
  if (errs.length) return error(res, errs[0], 400, errs);

  const result = await ctrl.updateUnit(id, body, user.email);
  if (!result.ok) return error(res, result.message, result.code);

  const state = db.isMySQL ? await db.publicState() : db.publicState(db.readDb());
  return success(res, { unit: result.unit, state });
}

module.exports = { getUnits, updateUnit };
