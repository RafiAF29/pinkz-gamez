# Panduan Migrasi JSON → MySQL

## Langkah-langkah

### 1. Setup database
```bash
mysql -u root -p -e "CREATE DATABASE pinkz_gamez_rental CHARACTER SET utf8mb4;"
mysql -u root -p pinkz_gamez_rental < backend/schema/mysql.sql
```

### 2. Install mysql2
```bash
npm install mysql2
```

### 3. Set .env
```
STORAGE_MODE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=pinkz_gamez_rental
DB_USER=root
DB_PASS=your_password
```

### 4. Migrate existing data dari db.json
```bash
node backend/schema/migrate_json_to_mysql.js
```

### 5. Yang perlu diubah di backend/services/db.js
Ganti fungsi `readDb()` dan `writeDb()` dengan query MySQL.
Contoh:
```js
// readDb() equivalent di MySQL:
const [rows] = await pool.query('SELECT * FROM bookings ORDER BY created_at DESC');

// writeDb() tidak diperlukan lagi — setiap operasi langsung ke DB
```

## Mapping JSON → MySQL

| JSON key          | MySQL table        |
|-------------------|--------------------|
| db.users          | users              |
| db.sessions       | sessions           |
| db.units          | units              |
| db.menu           | menu_items         |
| db.bookings       | bookings + booking_slots + booking_fnb_items |
| db.laporan        | transactions       |
| db.bookedSlots    | booking_slots (status='booked') |
| db.pendingSlots   | booking_slots (status='pending') |

## Anti double-booking di MySQL
```sql
-- Gunakan UNIQUE KEY di booking_slots:
UNIQUE KEY uq_unit_tgl_slot (unit_id, tgl, slot)

-- Lalu INSERT dengan ON CONFLICT akan otomatis gagal jika slot sudah ada
INSERT INTO booking_slots (booking_id, unit_id, tgl, slot, status)
VALUES (?, ?, ?, ?, 'pending');
-- Error 1062 = Duplicate entry = slot sudah terisi
```

## Session cleanup (cron job)
```sql
-- Jalankan setiap jam:
DELETE FROM sessions WHERE expires_at < NOW();
```

## Pending booking expiry (cron job)
```sql
-- Jalankan setiap menit:
UPDATE bookings 
SET payment_status='expired', booking_status='cancelled'
WHERE payment_status='pending' 
  AND transferred_at IS NULL 
  AND expires_at < NOW();

-- Kemudian release slot:
UPDATE booking_slots SET status='released'
WHERE booking_id IN (
  SELECT id FROM bookings WHERE payment_status='expired'
) AND status='pending';
```
