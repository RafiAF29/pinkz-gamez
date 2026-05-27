# Pinkz Gamez PS Rental — v8

Sistem web Rental PlayStation dengan 3 role: Pelanggan, Staff/Admin, Boss/Owner.

## Menjalankan

```bash
# 1. Copy .env
cp .env.example .env
# (edit .env sesuai kebutuhan)

# 2. Jalankan
node server.js
# atau:
npm start

# 3. Buka browser
# http://localhost:3000
```

## Akun demo
| Role    | Email               | Password  |
|---------|---------------------|-----------|
| Pelanggan | user@spacex.id    | user123   |
| Staff   | staff@spacex.id     | staff123  |
| Boss    | boss@spacex.id      | boss123   |

## Struktur Backend

```
backend/
├── config/index.js        — env config terpusat
├── middleware/
│   ├── auth.js            — session/token validation
│   ├── rateLimit.js       — per-IP rate limiting
│   └── headers.js         — security headers
├── routes/
│   ├── auth.js            — POST /api/auth/login|logout|register
│   ├── bookings.js        — CRUD + approve/reject
│   ├── units.js           — kelola unit & maintenance
│   ├── staff.js           — CRUD staff (boss only)
│   ├── analytics.js       — GET /api/analytics/*
│   └── state.js           — frontend state sync
├── services/
│   ├── db.js              — storage layer (JSON→MySQL ready)
│   └── analytics.js       — analytics computation
├── utils/
│   ├── crypto.js          — PBKDF2 hash, random token
│   ├── response.js        — consistent JSON format
│   ├── readBody.js        — body parser + size limit
│   ├── sanitize.js        — input sanitization + XSS
│   └── validation.js      — backend validation rules
└── schema/
    ├── mysql.sql          — MySQL schema lengkap
    └── migration_guide.md — panduan migrasi ke MySQL
```

## API Endpoints

| Method   | Path                           | Akses          |
|----------|--------------------------------|----------------|
| POST     | /api/auth/login                | Public         |
| POST     | /api/auth/logout               | Public         |
| POST     | /api/auth/register             | Public         |
| GET      | /api/state                     | Public         |
| PUT      | /api/state/:key                | Staff/Boss     |
| GET      | /api/bookings                  | Public         |
| POST     | /api/bookings                  | Public         |
| GET      | /api/bookings/:id              | Public         |
| PATCH    | /api/bookings/:id              | Public         |
| POST     | /api/bookings/:id/approve      | Staff/Boss     |
| POST     | /api/bookings/:id/reject       | Staff/Boss     |
| GET      | /api/units                     | Public         |
| PUT      | /api/units/:id                 | Staff/Boss     |
| GET      | /api/staff                     | Boss           |
| POST     | /api/staff                     | Boss           |
| PUT      | /api/staff/:id                 | Boss           |
| DELETE   | /api/staff/:id                 | Boss           |
| GET      | /api/analytics                 | Staff/Boss     |
| GET      | /api/analytics/daily           | Staff/Boss     |
| GET      | /api/analytics/units           | Staff/Boss     |

## Migrasi ke MySQL

Lihat: `backend/schema/migration_guide.md`

## Deployment

1. Set `NODE_ENV=production` di `.env`
2. Ganti `SESSION_SECRET` dengan string random panjang
3. Jalankan dengan process manager: `pm2 start server.js`
4. Gunakan Nginx/Caddy sebagai reverse proxy
