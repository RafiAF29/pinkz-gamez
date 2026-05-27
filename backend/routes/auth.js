'use strict';
/**
 * backend/routes/auth.js — HTTP layer saja
 * Business logic di controllers/authController.js
 */
const { readBody }   = require('../utils/readBody');
const { validateLoginBody, validateRegisterBody } = require('../utils/validation');
const { sanitizeEmail } = require('../utils/sanitize');
const { success, error } = require('../utils/response');
const { loginLimit } = require('../middleware/rateLimit');
const { extractToken } = require('../middleware/auth');
const ctrl = require('../controllers/authController');

async function handleLogin(req, res) {
  if (!loginLimit(req, res)) return;
  let body; try { body = await readBody(req); } catch(e) { return error(res, e.message, 400); }
  const errs = validateLoginBody(body);
  if (errs.length) return error(res, errs[0], 400, errs);

  const result = await ctrl.login(body.email, body.password);
  if (!result.ok) return error(res, result.message, result.code);
  return success(res, { token: result.token, user: result.user });
}

async function handleLogout(req, res) {
  const token = extractToken(req);
  await ctrl.logout(token);
  return success(res, { message: 'Logout berhasil' });
}

async function handleRegister(req, res) {
  if (!loginLimit(req, res)) return;
  let body; try { body = await readBody(req); } catch(e) { return error(res, e.message, 400); }
  const errs = validateRegisterBody(body);
  if (errs.length) return error(res, errs[0], 400, errs);

  const result = await ctrl.register(body.email, body.password, body.name);
  if (!result.ok) return error(res, result.message, result.code);
  return success(res, { token: result.token, user: result.user }, 201);
}

async function handleVerify(req, res) {
  const token  = extractToken(req);
  const result = await ctrl.verifyToken(token);
  if (!result.ok) return error(res, result.message, result.code);
  return success(res, { valid: true, user: result.user });
}

module.exports = { handleLogin, handleLogout, handleRegister, handleVerify };
