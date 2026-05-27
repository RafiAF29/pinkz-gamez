/* ═══════════════════════════════════════════════════
   Pinkz Gamez PS Rental — app.js v8.2
   FULL BACKEND MODE — localStorage hanya cache ringan
═══════════════════════════════════════════════════ */

const BRAND    = 'Pinkz Gamez';
let   WA_ADMIN = '6281234567890'; // akan di-fetch dari /api/config

/* ── API layer ── */
const API_ENABLED = location.protocol !== 'file:';

function apiToken(){ return localStorage.getItem('sx_token') || ''; }
function apiHeaders(){
  const h = { 'Content-Type':'application/json' };
  const t = apiToken();
  if (t) h.Authorization = 'Bearer ' + t;
  return h;
}
async function apiAsync(method, path, body){
  if (!API_ENABLED) return null;
  const res = await fetch(path, {
    method,
    headers: apiHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({ ok:false, error:'Respons tidak valid' }));
  if (!res.ok) throw new Error(data.error || 'Request gagal');
  return data;
}
function apiSync(method, path, body){
  if (!API_ENABLED) return null;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open(method, path, false);
    Object.entries(apiHeaders()).forEach(([k,v]) => xhr.setRequestHeader(k, v));
    xhr.send(body === undefined ? null : JSON.stringify(body));
    if (xhr.status < 200 || xhr.status >= 300) return null;
    return xhr.responseText ? JSON.parse(xhr.responseText) : null;
  } catch(e){ return null; }
}

/* Fetch WA number dari backend */
(async function fetchConfig(){
  if (!API_ENABLED) return;
  try {
    const d = await apiAsync('GET', '/api/config');
    if (d && d.wa_admin) WA_ADMIN = d.wa_admin;
  } catch {}
})();

/* ── AUTH ── */
function getSession(){
  return {
    role:  localStorage.getItem('sx_role'),
    name:  localStorage.getItem('sx_name'),
    email: localStorage.getItem('sx_email'),
  };
}
function storeSession(user, token){
  localStorage.setItem('sx_role',  user.role);
  localStorage.setItem('sx_name',  user.name);
  localStorage.setItem('sx_email', user.email);
  if (token){
    localStorage.setItem('sx_token', token);
    document.cookie = `sx_token=${token}; path=/; SameSite=Strict; max-age=${8*3600}`;
  }
}
async function verifySession(){
  const token = localStorage.getItem('sx_token');
  if (!token || !API_ENABLED) return getSession().role ? getSession() : null;
  try {
    const res = await fetch('/api/auth/verify', { headers: { Authorization:'Bearer '+token } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok || !data.user) return null;
    storeSession(data.user, token);
    return data.user;
  } catch { return null; }
}
function _root(){ return (location.pathname.includes('/admin/')||location.pathname.includes('/bos/')) ? '../' : ''; }
async function requireUserAsync(){
  const user = await verifySession();
  if (!user || user.role !== 'user'){
    sessionStorage.setItem('redirect_after_login', location.href);
    location.href = _root() + 'login.html'; return null;
  }
  return user;
}
async function requireAdminAsync(){
  const user = await verifySession();
  if (!user || (user.role !== 'staff' && user.role !== 'boss')){
    location.href = _root() + 'admin/login.html'; return null;
  }
  return user;
}
function requireUser(){ const s=getSession(); if(!s.role||s.role!=='user'){ location.href=_root()+'login.html'; return null; } return s; }
function requireAdmin(){ const s=getSession(); if(!s.role||(s.role!=='staff'&&s.role!=='boss')){ location.href=_root()+'admin/login.html'; return null; } return s; }

async function doLogout(){
  const token = localStorage.getItem('sx_token');
  if (token && API_ENABLED){
    try { await fetch('/api/auth/logout', { method:'POST', headers:{ Authorization:'Bearer '+token } }); } catch {}
  }
  ['sx_role','sx_name','sx_email','sx_token'].forEach(k => localStorage.removeItem(k));
  document.cookie = 'sx_token=; path=/; max-age=0; SameSite=Strict';
  const inBos   = location.pathname.includes('/bos/');
  const inAdmin = location.pathname.includes('/admin/');
  location.href = inBos ? '../admin/login.html' : inAdmin ? 'login.html' : _root()+'index.html';
}

/* ── DATA FETCHING — semua dari API ── */
async function fetchUnits(){
  if (!API_ENABLED) return DEFAULT_UNITS;
  try {
    const d = await apiAsync('GET', '/api/units');
    return d?.units || DEFAULT_UNITS;
  } catch { return DEFAULT_UNITS; }
}
async function fetchMenu(){
  if (!API_ENABLED) return DEFAULT_MENU;
  try {
    const d = await apiAsync('GET', '/api/menu');
    return d?.menu || DEFAULT_MENU;
  } catch { return DEFAULT_MENU; }
}
async function fetchBookings(){
  if (!API_ENABLED) return [];
  try {
    const d = await apiAsync('GET', '/api/bookings');
    return d?.bookings || [];
  } catch { return []; }
}
async function fetchBookingById(id){
  if (!API_ENABLED) return null;
  try {
    const d = await apiAsync('GET', '/api/bookings/' + encodeURIComponent(id));
    return d?.booking || null;
  } catch { return null; }
}
async function fetchState(){
  if (!API_ENABLED) return;
  try {
    const d = await apiAsync('GET', '/api/state');
    if (d?.state) _applyState(d.state);
  } catch {}
}

/* Cache ringan untuk slot rendering (bukan source of truth) */
function _applyState(state){
  if (state.units)       localStorage.setItem('sx_units',        JSON.stringify(state.units));
  if (state.menu)        localStorage.setItem('sx_menu',         JSON.stringify(state.menu));
  if (state.bookings)    localStorage.setItem('sx_all_bookings', JSON.stringify(state.bookings));
  if (state.bookedSlots) localStorage.setItem('sx_booked',       JSON.stringify(state.bookedSlots));
  if (state.pendingSlots)localStorage.setItem('sx_pending_slots',JSON.stringify(state.pendingSlots));
  if (state.laporan)     localStorage.setItem('sx_laporan',      JSON.stringify(state.laporan));
}

/* ── DEFAULT DATA (fallback offline) ── */
const DEFAULT_UNITS = [
  { id:'ps4-1', nama:'PS4 - 1', kategori:'PS4', lantai:1, nomor:1, status_unit:'available' },
  { id:'ps4-2', nama:'PS4 - 2', kategori:'PS4', lantai:1, nomor:2, status_unit:'available' },
  { id:'ps4-3', nama:'PS4 - 3', kategori:'PS4', lantai:1, nomor:3, status_unit:'available' },
  { id:'ps5-1', nama:'PS5 - 1', kategori:'PS5', lantai:2, nomor:1, status_unit:'available' },
  { id:'ps5-2', nama:'PS5 - 2', kategori:'PS5', lantai:2, nomor:2, status_unit:'available' },
  { id:'ps5-3', nama:'PS5 - 3', kategori:'PS5', lantai:2, nomor:3, status_unit:'available' },
  { id:'ps5-4', nama:'PS5 - 4', kategori:'PS5', lantai:2, nomor:4, status_unit:'available' },
  { id:'ps5-5', nama:'PS5 - 5', kategori:'PS5', lantai:2, nomor:5, status_unit:'available' },
  { id:'ps5-6', nama:'PS5 - 6', kategori:'PS5', lantai:2, nomor:6, status_unit:'available' },
  { id:'ps5-7', nama:'PS5 - 7', kategori:'PS5', lantai:2, nomor:7, status_unit:'available' },
];
const DEFAULT_MENU = [
  // Makanan
  {id:'m1',nama:'Indomie Goreng',       ico:'🍜',kategori:'Makanan',harga:8000, stok:20,aktif:true},
  {id:'m2',nama:'Indomie Goreng 2 Bks', ico:'🍜',kategori:'Makanan',harga:14000,stok:20,aktif:true},
  {id:'m3',nama:'Indomie Kuah',         ico:'🍜',kategori:'Makanan',harga:8000, stok:20,aktif:true},
  {id:'m4',nama:'Indomie Kuah 2 Bks',  ico:'🍜',kategori:'Makanan',harga:14000,stok:20,aktif:true},
  {id:'m5',nama:'Pop Mie',              ico:'🍜',kategori:'Makanan',harga:10000,stok:15,aktif:true},
  {id:'m6',nama:'+ Telor (tambahan)',   ico:'🥚',kategori:'Makanan',harga:5000, stok:20,aktif:true},
  // Minuman
  {id:'d1',nama:'Es Teh',    ico:'🥤',kategori:'Minuman',harga:6000,stok:30,aktif:true},
  {id:'d2',nama:'NutriSari', ico:'🍹',kategori:'Minuman',harga:7000,stok:20,aktif:true},
  {id:'d3',nama:'Es Coklat', ico:'🍫',kategori:'Minuman',harga:8000,stok:20,aktif:true},
  {id:'d4',nama:'Air Mineral',ico:'💧',kategori:'Minuman',harga:6000,stok:30,aktif:true},
  // Snack
  {id:'s1',nama:'Nabati Keju Coklat',   ico:'🍪',kategori:'Cemilan',harga:2500,stok:20,aktif:true},
  {id:'s2',nama:'Chocolatos',           ico:'🍫',kategori:'Cemilan',harga:2500,stok:20,aktif:true},
  {id:'s3',nama:'Malkist Coklat / Keju',ico:'🍘',kategori:'Cemilan',harga:3000,stok:20,aktif:true},
  {id:'s4',nama:'Oreo',                 ico:'🍪',kategori:'Cemilan',harga:3000,stok:20,aktif:true},
  {id:'s5',nama:'Taro Seaweed',         ico:'🌊',kategori:'Cemilan',harga:3000,stok:20,aktif:true},
  {id:'s6',nama:'Choki',                ico:'🍫',kategori:'Cemilan',harga:3000,stok:20,aktif:true},
  {id:'s7',nama:'Chiki Snack',          ico:'🍟',kategori:'Cemilan',harga:3000,stok:20,aktif:true},
  {id:'s8',nama:'Jet-Z',                ico:'🍬',kategori:'Cemilan',harga:4000,stok:20,aktif:true},
  {id:'s9',nama:'Chitato',              ico:'🥔',kategori:'Cemilan',harga:4000,stok:20,aktif:true},
  {id:'s10',nama:'Beng-Beng',           ico:'🍫',kategori:'Cemilan',harga:5000,stok:20,aktif:true},
  {id:'s11',nama:'Good Time',           ico:'🍪',kategori:'Cemilan',harga:5000,stok:20,aktif:true},
];

/* Cache getters — baca localStorage sebagai fallback ringan */
function getUnits(){ try{ return JSON.parse(localStorage.getItem('sx_units')||'null')||DEFAULT_UNITS; }catch{ return DEFAULT_UNITS; } }
function getMenu(){  try{ return JSON.parse(localStorage.getItem('sx_menu') ||'null')||DEFAULT_MENU;  }catch{ return DEFAULT_MENU;  } }
function getAllBookings(){ try{ return JSON.parse(localStorage.getItem('sx_all_bookings')||'[]'); }catch{ return []; } }
function getBookingById(id){ return getAllBookings().find(b=>b.id===id)||null; }
function getBookedSlots(){  try{ return JSON.parse(localStorage.getItem('sx_booked')||'{}');        }catch{ return {}; } }
function getPendingSlots(){ try{ return JSON.parse(localStorage.getItem('sx_pending_slots')||'{}'); }catch{ return {}; } }

/* ── HARGA ── */
const PRICE_TABLE = {
  PS4: { weekday:8000,  weekend:10000 },
  PS5: { weekday:10000, weekend:15000 },
};
const UNIT_META = {
  PS4: { icon:'🎮', label:'PS4', lantaiLabel:'Lantai 1', desc:'PlayStation 4 · TV LED · Kursi gaming · Earphone' },
  PS5: { icon:'🕹️', label:'PS5', lantaiLabel:'Lantai 2', desc:'PlayStation 5 · TV 4K · Kursi gaming · Earphone' },
};
function isWeekend(tgl){ const p=tgl.split('-'); return [0,6].includes(new Date(+p[0],+p[1]-1,+p[2]).getDay()); }
function getHarga(unit, tgl){ const we=tgl?isWeekend(tgl):false; const h=PRICE_TABLE[unit.kategori]||{weekday:15000,weekend:20000}; return we?h.weekend:h.weekday; }
function hitungSewa(unit, tgl, jumlahSlot){ const harga=getHarga(unit,tgl); const we=tgl?isWeekend(tgl):false; return {harga,jamBayar:jumlahSlot,jamMain:jumlahSlot,bonusJam:0,total:harga*jumlahSlot,isWeekend:we}; }

/* ── SLOTS ── */
const ALL_SLOTS = [
  '07:00–08:00','08:00–09:00','09:00–10:00','10:00–11:00',
  '11:00–12:00','12:00–13:00','13:00–14:00','14:00–15:00',
  '15:00–16:00','16:00–17:00','17:00–18:00','18:00–19:00',
  '19:00–20:00','20:00–21:00','21:00–22:00','22:00–23:00',
];
function isSlotBooked(uid,tgl,slot){ const b=getBookedSlots(); return !!(b[uid]&&b[uid][tgl]&&b[uid][tgl].includes(slot)); }
function isSlotPending(uid,tgl,slot){ const p=getPendingSlots(); return !!(p[uid]&&p[uid][tgl]&&p[uid][tgl].includes(slot)); }

/* ── BOOKING OPERATIONS — semua via API ── */
function addBookingToStore(bk){
  const fromServer = apiSync('POST', '/api/bookings', { booking:bk });
  if (fromServer && fromServer.state){ _applyState(fromServer.state); return true; }
  if (API_ENABLED){ toast('⚠️ Slot sudah tidak tersedia.', 'error'); return false; }
  return false;
}
function updateBooking(id, patch){
  apiSync('PATCH', '/api/bookings/'+encodeURIComponent(id), { patch });
}
function adminAccPayment(bookingId){
  const fromServer = apiSync('POST', '/api/bookings/'+encodeURIComponent(bookingId)+'/approve', {});
  if (fromServer){
    if (fromServer.state) _applyState(fromServer.state);
    if (fromServer.booking) localStorage.setItem('sx_last_payment', JSON.stringify(fromServer.booking));
    return true;
  }
  return false;
}
function adminRejectPayment(bookingId, alasan){
  const reason = alasan || 'Pembayaran tidak valid';
  const fromServer = apiSync('POST', '/api/bookings/'+encodeURIComponent(bookingId)+'/reject', { reason });
  if (fromServer){ if (fromServer.state) _applyState(fromServer.state); return true; }
  return false;
}

/* ── WHATSAPP ── */
function waLink(bk){
  const MON=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const tglStr = bk.tglStr || bk.tgl_str || bk.tgl || '';
  const unit   = bk.unitNama || bk.unit_nama || '';
  const time   = bk.timeRange || bk.time_range || '';
  const total  = Rp(bk.total || 0);
  const msg = `Halo Admin Pinkz Gamez 👋\n\nSaya ingin konfirmasi pembayaran booking.\n\nID Booking: ${bk.id}\nNama: ${bk.nama}\nUnit: ${unit}\nTanggal: ${tglStr}\nJam: ${time}\nTotal: ${total}\n\nBerikut saya kirim bukti transfer pembayaran.\n\nTerima kasih.`;
  return `https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(msg)}`;
}

/* ── STRUK — fetch dari backend ── */
async function getStruk(bookingId){
  try {
    const d = await apiAsync('GET', '/api/bookings/'+encodeURIComponent(bookingId));
    return d?.booking?.struk || null;
  } catch { return null; }
}

/* ── HELPERS ── */
function Rp(n){ return 'Rp '+Number(n||0).toLocaleString('id-ID'); }
function today(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function isValidBookingDate(tgl){ return tgl >= today(); }
function esc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function setText(id,val){ const el=document.getElementById(id); if(el) el.textContent=val; }

/* ── TOAST ── */
const _toastQ=[]; let _toastBusy=false;
function toast(msg,type='info',duration=3500){ _toastQ.push({msg,type,duration}); if(!_toastBusy)_nextToast(); }
function _nextToast(){
  if(!_toastQ.length){ _toastBusy=false; return; }
  _toastBusy=true;
  const {msg,type,duration}=_toastQ.shift();
  const el=document.getElementById('toast'); if(!el){ _toastBusy=false; return; }
  const icons={success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
  el.textContent=(icons[type]||'')+' '+msg;
  el.className='toast-on toast-'+type;
  setTimeout(()=>{ el.className=''; setTimeout(_nextToast,300); },duration);
}

/* ── UI HELPERS ── */
function setLoading(btnId,loading,text){ const btn=document.getElementById(btnId); if(!btn) return; btn.disabled=loading; if(text) btn.textContent=loading?'⏳ '+text+'...':text; }
function openM(id){ document.getElementById(id)?.classList.add('on'); }
function closeM(id){ document.getElementById(id)?.classList.remove('on'); }
function initMobSidebar(){
  document.getElementById('mob-btn')?.addEventListener('click',()=>{ document.querySelector('.sidebar')?.classList.toggle('open'); document.getElementById('sb-ov')?.classList.toggle('on'); });
  document.getElementById('sb-ov')?.addEventListener('click',()=>{ document.querySelector('.sidebar')?.classList.remove('open'); document.getElementById('sb-ov')?.classList.remove('on'); });
}
function fillAdminUser(s){
  setText('tb-name', s.name||'');
  setText('tb-avatar', (s.name||'?')[0].toUpperCase());
  const rb=document.getElementById('tb-role-badge');
  if(rb){ rb.textContent=s.role==='boss'?'👑 Boss':'👨‍💼 Staff'; if(s.role==='boss') rb.classList.add('boss'); }
}

/* ── STATUS BADGES ── */
const STATUS_CFG = {
  pending:    {cls:'badge-yellow',icon:'⏳',label:'Menunggu'},
  paid:       {cls:'badge-green', icon:'✅',label:'Lunas'},
  confirmed:  {cls:'badge-green', icon:'✅',label:'Dikonfirmasi'},
  rejected:   {cls:'badge-red',   icon:'❌',label:'Ditolak'},
  expired:    {cls:'badge-gray',  icon:'🕐',label:'Kedaluwarsa'},
  cancelled:  {cls:'badge-gray',  icon:'✖️',label:'Dibatalkan'},
  available:  {cls:'badge-green', icon:'✅',label:'Tersedia'},
  booked:     {cls:'badge-blue',  icon:'🎮',label:'Terisi'},
  maintenance:{cls:'badge-red',   icon:'🔧',label:'Maintenance'},
};
function statusBadge(status){ const c=STATUS_CFG[status]||{cls:'badge-blue',icon:'',label:status}; return `<span class="badge ${c.cls}">${c.icon} ${c.label}</span>`; }

/* ── SIDEBAR ── */
const STAFF_NAV = [
  {href:'dashboard.html',  icon:'📊',label:'Overview'},
  {href:'booking.html',    icon:'📅',label:'Booking'},
  {href:'pembayaran.html', icon:'💳',label:'Pembayaran'},
  {href:'units.html',      icon:'🎮',label:'Kelola Unit'},
  {href:'menu.html',       icon:'🍜',label:'Menu F&B'},
  {href:'pelanggan.html',  icon:'👥',label:'Pelanggan'},
];
const BOSS_NAV = [
  {href:'../bos/dashboard.html',icon:'📊',label:'Overview'},
  {href:'../bos/laporan.html',  icon:'📈',label:'Laporan'},
  {href:'../bos/staff.html',    icon:'👤',label:'Kelola Staff'},
];
function buildSidebar(role, currentFile){
  const nav=role==='boss'?BOSS_NAV:STAFF_NAV;
  const sb=document.getElementById('sb-nav'); if(!sb) return;
  sb.innerHTML='';
  nav.forEach(n=>{ const a=document.createElement('a'); a.href=n.href; a.textContent=n.icon+' '+n.label; if(currentFile&&(n.href.endsWith(currentFile)||n.href.includes('/'+currentFile))) a.className='active'; sb.appendChild(a); });
}
function buildPubNav(){
  // Customer tidak perlu login — tampilkan tombol Cek Booking saja
  const nr=document.getElementById('nav-right'); if(!nr) return;
  nr.innerHTML='';
  const a=document.createElement('a');
  a.href=_root()+'cek-booking.html';
  a.className='btn btn-ghost btn-pill';
  a.style.fontSize='.85rem';
  a.textContent='📋 Cek Booking';
  nr.appendChild(a);
}

/* ── CEK BOOKING (tanpa login) ── */
async function searchBookingsByWA(nama, wa){
  try {
    const d = await apiAsync('POST', '/api/bookings/search', { nama, wa });
    return d?.bookings || [];
  } catch(e) { return []; }
}

/* Init: fetch state dari server untuk update cache */
if (API_ENABLED) {
  fetchState().catch(()=>{});
}
