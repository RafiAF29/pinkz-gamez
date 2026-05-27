'use strict';
/**
 * server.js — Pinkz Gamez PS Rental v8.2
 * Full backend mode — semua data dari MySQL/JSON, bukan localStorage.
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const cfg     = require('./backend/config');

if (cfg.STORAGE_MODE === 'json' && cfg.NODE_ENV === 'production') {
  console.warn('\n⚠️  WARNING: STORAGE_MODE=json di production!');
  console.warn('   Data akan HILANG setiap kali server restart.');
  console.warn('   Set STORAGE_MODE=mysql untuk Railway deployment.\n');
}
const { applySecurityHeaders }   = require('./backend/middleware/headers');
const { globalLimit }            = require('./backend/middleware/rateLimit');
const { guardHtml }              = require('./backend/middleware/htmlGuard');
const { error: sendError }       = require('./backend/utils/response');
const { readDb, writeDb, withDbLock, cleanupExpiredPending, cleanupSessions } = require('./backend/services/db');

const authRoutes      = require('./backend/routes/auth');
const bookingRoutes   = require('./backend/routes/bookings');
const unitRoutes      = require('./backend/routes/units');
const menuRoutes      = require('./backend/routes/menu');
const staffRoutes     = require('./backend/routes/staff');
const analyticsRoutes = require('./backend/routes/analytics');
const stateRoutes     = require('./backend/routes/state');

/* HTML Guard rules */
const HTML_GUARDS = [
  { prefix: '/bos/',   roles: ['boss'] },
  { prefix: '/admin/', roles: ['staff', 'boss'], except: ['/admin/login.html'] },
];
function getHtmlGuard(pathname) {
  for (const rule of HTML_GUARDS) {
    if (!pathname.startsWith(rule.prefix)) continue;
    if (rule.except?.some(ex => pathname === ex)) continue;
    return { roles: rule.roles };
  }
  return null;
}

const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon',
  '.woff2':'font/woff2', '.woff':'font/woff',
};

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(cfg.ROOT, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(cfg.ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  const rel = path.relative(cfg.ROOT, file);
  const BLOCKED = ['backend','data','logs','.env','node_modules'];
  if (BLOCKED.some(b => rel === b || rel.startsWith(b + path.sep) || rel.startsWith(b + '/'))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': file.endsWith('.html') ? 'no-store' : 'public, max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
}

async function apiRouter(req, res, pathname) {
  if (!globalLimit(req, res)) return;
  const method = req.method;
  const parts  = pathname.split('/').filter(Boolean);

  /* AUTH */
  if (method==='POST' && pathname==='/api/auth/login')    return authRoutes.handleLogin(req, res);
  if (method==='POST' && pathname==='/api/auth/logout')   return authRoutes.handleLogout(req, res);
  if (method==='POST' && pathname==='/api/auth/register') return authRoutes.handleRegister(req, res);
  if (method==='GET'  && pathname==='/api/auth/verify')   return authRoutes.handleVerify(req, res);

  /* CONFIG — WA number dan setting publik */
  if (method==='GET' && pathname==='/api/config') {
    const { success } = require('./backend/utils/response');
    return success(res, { wa_admin: cfg.WA_ADMIN });
  }

  /* STATE */
  if (method==='GET' && pathname==='/api/state')                return stateRoutes.getState(req, res);
  if (method==='PUT' && parts[1]==='state' && parts[2])         return stateRoutes.putState(req, res, parts[2]);

  /* BOOKINGS */
  if (method==='GET'    && pathname==='/api/bookings')           return bookingRoutes.getBookings(req, res);
  if (method==='POST'   && pathname==='/api/bookings')           return bookingRoutes.createBooking(req, res);
  if (method==='POST'   && pathname==='/api/bookings/search')               return bookingRoutes.searchBookings(req, res);
  if (method==='GET'    && parts[1]==='bookings' && parts[2] && !parts[3]) return bookingRoutes.getBookingById(req, res, decodeURIComponent(parts[2]));
  if (method==='PATCH'  && parts[1]==='bookings' && parts[2] && !parts[3]) return bookingRoutes.patchBooking(req, res, decodeURIComponent(parts[2]));
  if (method==='POST'   && parts[1]==='bookings' && parts[3]==='approve')  return bookingRoutes.approveBooking(req, res, decodeURIComponent(parts[2]));
  if (method==='POST'   && parts[1]==='bookings' && parts[3]==='reject')   return bookingRoutes.rejectBooking(req, res, decodeURIComponent(parts[2]));

  /* UNITS */
  if (method==='GET' && pathname==='/api/units')                return unitRoutes.getUnits(req, res);
  if (method==='PUT' && parts[1]==='units' && parts[2])         return unitRoutes.updateUnit(req, res, decodeURIComponent(parts[2]));

  /* MENU */
  if (method==='GET'    && pathname==='/api/menu')               return menuRoutes.getMenu(req, res);
  if (method==='POST'   && pathname==='/api/menu')               return menuRoutes.createMenu(req, res);
  if (method==='PUT'    && parts[1]==='menu' && parts[2] && !parts[3]) return menuRoutes.updateMenu(req, res, decodeURIComponent(parts[2]));
  if (method==='DELETE' && parts[1]==='menu' && parts[2])        return menuRoutes.deleteMenu(req, res, decodeURIComponent(parts[2]));
  if (method==='POST'   && parts[1]==='menu' && parts[3]==='toggle') return menuRoutes.toggleMenu(req, res, decodeURIComponent(parts[2]));

  /* STAFF */
  if (method==='GET'    && pathname==='/api/staff')              return staffRoutes.getStaff(req, res);
  if (method==='POST'   && pathname==='/api/staff')              return staffRoutes.createStaff(req, res);
  if (method==='PUT'    && parts[1]==='staff' && parts[2])       return staffRoutes.updateStaff(req, res, decodeURIComponent(parts[2]));
  if (method==='DELETE' && parts[1]==='staff' && parts[2])       return staffRoutes.deleteStaff(req, res, decodeURIComponent(parts[2]));

  /* ANALYTICS */
  if (method==='GET' && pathname==='/api/analytics')             return analyticsRoutes.getAnalytics(req, res);
  if (method==='GET' && pathname==='/api/analytics/daily')       return analyticsRoutes.getDailyChart(req, res);
  if (method==='GET' && pathname==='/api/analytics/units')       return analyticsRoutes.getUnitPerformance(req, res);

  return sendError(res, 'Endpoint tidak ditemukan', 404);
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  const pathname = new URL(req.url, 'http://localhost').pathname;

  /* Cleanup per-interval sudah handle ini, tapi tetap jaga-jaga */
  if (pathname.startsWith('/api/')) {
    try { await apiRouter(req, res, pathname); }
    catch (err) {
      console.error('[API Error]', req.method, pathname, err.message);
      if (!res.headersSent) sendError(res, 'Terjadi kesalahan server', 500);
    }
    return;
  }

  const guard = getHtmlGuard(pathname);
  if (guard) {
    const allowed = await guardHtml(req, res, guard.roles);
    if (!allowed) return;
  }

  serveStatic(req, res, pathname);
});

server.listen(cfg.PORT, '0.0.0.0', () => {
  console.log(`\n🎮 Pinkz Gamez PS Rental v8.2`);
  console.log(`   http://localhost:${cfg.PORT}`);
  console.log(`   Mode    : ${cfg.STORAGE_MODE}`);
  console.log(`   Env     : ${cfg.NODE_ENV}`);
  console.log(`   Auth    : Server-side HTML guard aktif\n`);
});

/* Background cleanup — lewat withDbLock agar tidak race condition */
setInterval(async () => {
  try {
    await withDbLock(db => {
      const c1 = cleanupExpiredPending(db);
      const c2 = cleanupSessions(db);
      return (c1 || c2) ? { db } : {};
    });
  } catch (err) { console.error('[Cleanup Error]', err.message); }
}, 60_000);

process.on('SIGINT',  () => { console.log('\n👋 Server stopped.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n👋 Server stopped.'); process.exit(0); });
