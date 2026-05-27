'use strict';
/**
 * backend/utils/crypto.js
 * Password hashing (PBKDF2) dan token generation.
 * MySQL-ready: hash tersimpan di kolom users.pass_hash (VARCHAR 200)
 */
const crypto = require('crypto');

const ITERATIONS = 120_000;
const KEY_LEN    = 32;
const DIGEST     = 'sha256';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, ITERATIONS, KEY_LEN, DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, encoded) {
  const [salt, expected] = String(encoded || '').split(':');
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).split(':')[1];
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashPassword, verifyPassword, randomToken };
