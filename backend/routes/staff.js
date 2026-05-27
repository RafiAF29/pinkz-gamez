'use strict';
const { readBody }   = require('../utils/readBody');
const { sanitizeEmail, sanitizeStr } = require('../utils/sanitize');
const { success, error } = require('../utils/response');
const db  = require('../services/db');
const { requireRole } = require('../middleware/auth');
const { hashPassword } = require('../utils/crypto');
const IS_MYSQL = db.isMySQL;

async function getStaff(req, res) {
  const dbObj = IS_MYSQL ? await db.readDb() : db.readDb();
  const user  = requireRole(['boss'])(req, res, dbObj);
  if (!user) return;
  if (IS_MYSQL) {
    const [rows] = await db.pool.execute('SELECT * FROM staff ORDER BY joined DESC');
    return success(res, { staff: rows });
  }
  return success(res, { staff: dbObj.staff });
}

async function createStaff(req, res) {
  const dbObj = IS_MYSQL ? await db.readDb() : db.readDb();
  const user  = requireRole(['boss'])(req, res, dbObj);
  if (!user) return;
  let body; try { body = await readBody(req); } catch(e){ return error(res,e.message,400); }
  const email = sanitizeEmail(body.email);
  const name  = sanitizeStr(body.name||body.nama, 100);
  const role  = body.role==='boss' ? 'boss' : 'staff';
  if (!email||!name||!body.password||String(body.password).length<6)
    return error(res, 'Data staff tidak lengkap', 400);

  if (IS_MYSQL) {
    const [ex] = await db.pool.execute('SELECT id FROM users WHERE email=?', [email]);
    if (ex.length) return error(res, 'Email sudah terdaftar', 409);
    const joined = new Date().toISOString().slice(0,10);
    const id     = 'sf'+Date.now();
    await db.pool.execute('INSERT INTO users (email,name,pass_hash,role,active,created_at) VALUES (?,?,?,?,1,NOW())', [email,name,hashPassword(body.password),role]);
    await db.pool.execute('INSERT INTO staff (id,nama,email,role,aktif,joined) VALUES (?,?,?,?,1,?)', [id,name,email,role,joined]);
    return success(res, { staff:{id,nama:name,email,role,aktif:true,joined}, state: await db.publicState() }, 201);
  }

  const d = db.readDb();
  if (d.users.some(u=>u.email===email)) return error(res,'Email sudah terdaftar',409);
  const st = { id:'sf'+Date.now(), nama:name, email, role, aktif:true, joined:new Date().toISOString().slice(0,10) };
  d.staff.push(st);
  d.users.push({ email, name, role, active:true, passHash:hashPassword(body.password), createdAt:new Date().toISOString() });
  db.writeDb(d);
  return success(res, { staff:st, state:db.publicState(db.readDb()) }, 201);
}

async function updateStaff(req, res, id) {
  const dbObj = IS_MYSQL ? await db.readDb() : db.readDb();
  const user  = requireRole(['boss'])(req, res, dbObj);
  if (!user) return;
  let body; try { body = await readBody(req); } catch(e){ return error(res,e.message,400); }

  if (IS_MYSQL) {
    const [rows] = await db.pool.execute('SELECT * FROM staff WHERE id=?', [id]);
    if (!rows.length) return error(res,'Staff tidak ditemukan',404);
    const st = rows[0];
    const nama = sanitizeStr(body.nama||body.name||st.nama, 100);
    const role = body.role==='boss'?'boss':'staff';
    const aktif = body.aktif!==undefined ? (body.aktif?1:0) : st.aktif;
    await db.pool.execute('UPDATE staff SET nama=?,role=?,aktif=? WHERE id=?', [nama,role,aktif,id]);
    await db.pool.execute('UPDATE users SET name=?,role=?,active=? WHERE email=?', [nama,role,aktif,st.email]);
    return success(res, { staff:{...st,nama,role,aktif:!!aktif}, state: await db.publicState() });
  }

  const d  = db.readDb();
  const st = d.staff.find(s=>s.id===id);
  if (!st) return error(res,'Staff tidak ditemukan',404);
  if (body.nama||body.name) st.nama=sanitizeStr(body.nama||body.name,100);
  if (body.role)  st.role=body.role==='boss'?'boss':'staff';
  if (body.aktif!==undefined) st.aktif=!!body.aktif;
  const u=d.users.find(u=>u.email===st.email); if(u){u.name=st.nama;u.role=st.role;u.active=st.aktif;}
  db.writeDb(d);
  return success(res, { staff:st, state:db.publicState(db.readDb()) });
}

async function deleteStaff(req, res, id) {
  const dbObj = IS_MYSQL ? await db.readDb() : db.readDb();
  const user  = requireRole(['boss'])(req, res, dbObj);
  if (!user) return;

  if (IS_MYSQL) {
    const [rows] = await db.pool.execute('SELECT * FROM staff WHERE id=?', [id]);
    if (!rows.length) return error(res,'Staff tidak ditemukan',404);
    if (rows[0].email==='boss@spacex.id') return error(res,'Akun boss tidak bisa dihapus',403);
    await db.pool.execute('UPDATE users SET active=0 WHERE email=?', [rows[0].email]);
    await db.pool.execute('DELETE FROM staff WHERE id=?', [id]);
    return success(res, { state: await db.publicState() });
  }

  const d   = db.readDb();
  const idx = d.staff.findIndex(s=>s.id===id);
  if (idx===-1) return error(res,'Staff tidak ditemukan',404);
  if (d.staff[idx].email==='boss@spacex.id') return error(res,'Akun boss tidak bisa dihapus',403);
  const email = d.staff[idx].email;
  d.staff.splice(idx,1);
  const ui=d.users.findIndex(u=>u.email===email); if(ui!==-1) d.users[ui].active=false;
  db.writeDb(d);
  return success(res, { state:db.publicState(db.readDb()) });
}

module.exports = { getStaff, createStaff, updateStaff, deleteStaff };
