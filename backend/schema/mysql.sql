-- ═══════════════════════════════════════════════════════════════
-- Pinkz Gamez PS Rental — MySQL Schema v1
-- ═══════════════════════════════════════════════════════════════
-- Cara import: mysql -u root -p pinkz_gamez_rental < mysql.sql
-- Atau via phpMyAdmin: Import > pilih file ini
--
-- Kompatibel dengan:
--   MySQL 8.0+ / MariaDB 10.5+
--   phpMyAdmin (semua versi modern)
-- ═══════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────
-- TABLE: users
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(255)  NOT NULL UNIQUE,
  name        VARCHAR(100)  NOT NULL,
  pass_hash   VARCHAR(200)  NOT NULL COMMENT 'PBKDF2 salt:hash',
  role        ENUM('user','staff','boss') NOT NULL DEFAULT 'user',
  active      TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role  (role)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- TABLE: sessions
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
  token       CHAR(64)      NOT NULL PRIMARY KEY,
  email       VARCHAR(255)  NOT NULL,
  expires_at  DATETIME      NOT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email   (email),
  INDEX idx_expires (expires_at),
  FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- TABLE: units
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS units;
CREATE TABLE units (
  id              VARCHAR(20)   NOT NULL PRIMARY KEY COMMENT 'rb1, vip1, ns1, vr1, ...',
  nama            VARCHAR(100)  NOT NULL,
  kategori        ENUM('REGULAR','VIP','NINTENDO','VR') NOT NULL,
  nomor           TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status_unit     ENUM('available','maintenance') NOT NULL DEFAULT 'available',
  updated_at      DATETIME      DEFAULT NULL,
  updated_by      VARCHAR(255)  DEFAULT NULL,
  maintenance_since DATETIME    DEFAULT NULL,
  INDEX idx_kategori     (kategori),
  INDEX idx_status       (status_unit)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- TABLE: menu_items  (F&B)
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS menu_items;
CREATE TABLE menu_items (
  id          VARCHAR(20)   NOT NULL PRIMARY KEY,
  nama        VARCHAR(100)  NOT NULL,
  ico         VARCHAR(10)   DEFAULT NULL,
  kategori    ENUM('Makanan','Minuman','Cemilan') NOT NULL,
  harga       INT UNSIGNED  NOT NULL DEFAULT 0,
  stok        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  aktif       TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kategori (kategori),
  INDEX idx_aktif    (aktif)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- TABLE: bookings
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS bookings;
CREATE TABLE bookings (
  id              VARCHAR(50)   NOT NULL PRIMARY KEY COMMENT 'BK-timestamp',
  unit_id         VARCHAR(20)   NOT NULL,
  unit_nama       VARCHAR(100)  NOT NULL,
  kategori        ENUM('REGULAR','VIP','NINTENDO','VR') NOT NULL,
  tgl             DATE          NOT NULL COMMENT 'Tanggal bermain',
  tgl_str         VARCHAR(40)   DEFAULT NULL,
  time_range      VARCHAR(30)   NOT NULL COMMENT '07:00–09:00',
  dur             TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Jam bayar',
  jam_main        TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Jam main (termasuk bonus)',
  bonus_jam       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_weekend      TINYINT(1)    NOT NULL DEFAULT 0,
  harga           INT UNSIGNED  NOT NULL DEFAULT 0,
  nama            VARCHAR(100)  NOT NULL COMMENT 'Nama pelanggan',
  wa              VARCHAR(20)   NOT NULL COMMENT 'Nomor WhatsApp',
  email           VARCHAR(255)  DEFAULT NULL,
  catatan         TEXT          DEFAULT NULL,
  total_ps        INT UNSIGNED  NOT NULL DEFAULT 0,
  total_fnb       INT UNSIGNED  NOT NULL DEFAULT 0,
  total           INT UNSIGNED  NOT NULL DEFAULT 0,
  payment_status  ENUM('pending','paid','rejected','expired','cancelled') NOT NULL DEFAULT 'pending',
  booking_status  ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  tipe_booking    ENUM('online','walkin') NOT NULL DEFAULT 'online',
  metode          VARCHAR(50)   DEFAULT 'QRIS',
  expires_at      DATETIME      DEFAULT NULL COMMENT 'Waktu kadaluarsa pending',
  transferred_at  DATETIME      DEFAULT NULL,
  paid_at         DATETIME      DEFAULT NULL,
  rejected_at     DATETIME      DEFAULT NULL,
  expired_at      DATETIME      DEFAULT NULL,
  reject_reason   VARCHAR(200)  DEFAULT NULL,
  rejected_by     VARCHAR(255)  DEFAULT NULL,
  approved_by     VARCHAR(255)  DEFAULT NULL,
  struk           TEXT          DEFAULT NULL COMMENT 'Receipt text',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tgl            (tgl),
  INDEX idx_unit_tgl       (unit_id, tgl),
  INDEX idx_payment_status (payment_status),
  INDEX idx_booking_status (booking_status),
  INDEX idx_created        (created_at),
  FOREIGN KEY (unit_id) REFERENCES units(id) ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- TABLE: booking_slots
-- Setiap row = 1 slot jam per booking
-- Memungkinkan overlap check via SQL
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS booking_slots;
CREATE TABLE booking_slots (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id  VARCHAR(50)  NOT NULL,
  unit_id     VARCHAR(20)  NOT NULL,
  tgl         DATE         NOT NULL,
  slot        VARCHAR(20)  NOT NULL COMMENT '07:00–08:00',
  status      ENUM('pending','booked','released') NOT NULL DEFAULT 'pending',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_unit_tgl_slot (unit_id, tgl, slot) COMMENT 'Anti double booking',
  INDEX idx_booking  (booking_id),
  INDEX idx_unit_tgl (unit_id, tgl),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id)    REFERENCES units(id)    ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- TABLE: booking_fnb_items
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS booking_fnb_items;
CREATE TABLE booking_fnb_items (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id  VARCHAR(50)      NOT NULL,
  menu_id     VARCHAR(20)      NOT NULL,
  nama        VARCHAR(100)     NOT NULL,
  ico         VARCHAR(10)      DEFAULT NULL,
  harga       INT UNSIGNED     NOT NULL DEFAULT 0,
  qty         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  subtotal    INT UNSIGNED     NOT NULL DEFAULT 0,
  INDEX idx_booking (booking_id),
  INDEX idx_menu    (menu_id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- TABLE: transactions  (Laporan — hanya paid)
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS transactions;
CREATE TABLE transactions (
  id          VARCHAR(30)   NOT NULL PRIMARY KEY COMMENT 'TRX-timestamp-random',
  booking_id  VARCHAR(50)   NOT NULL UNIQUE,
  nama        VARCHAR(100)  NOT NULL,
  email       VARCHAR(255)  DEFAULT NULL,
  unit        VARCHAR(100)  NOT NULL,
  kategori    VARCHAR(20)   NOT NULL,
  tgl         DATE          NOT NULL,
  tgl_str     VARCHAR(40)   DEFAULT NULL,
  time_range  VARCHAR(30)   NOT NULL,
  dur         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  jam_main    TINYINT UNSIGNED NOT NULL DEFAULT 1,
  bonus_jam   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_weekend  TINYINT(1)    NOT NULL DEFAULT 0,
  total_ps    INT UNSIGNED  NOT NULL DEFAULT 0,
  total_fnb   INT UNSIGNED  NOT NULL DEFAULT 0,
  total       INT UNSIGNED  NOT NULL DEFAULT 0,
  metode      VARCHAR(50)   DEFAULT 'QRIS',
  tipe        ENUM('online','walkin') DEFAULT 'online',
  paid_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tgl      (tgl),
  INDEX idx_paid_at  (paid_at),
  INDEX idx_kategori (kategori),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- TABLE: maintenance_logs
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS maintenance_logs;
CREATE TABLE maintenance_logs (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  unit_id     VARCHAR(20)  NOT NULL,
  action      ENUM('set_maintenance','set_available') NOT NULL,
  changed_by  VARCHAR(255) NOT NULL,
  note        TEXT         DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unit (unit_id),
  FOREIGN KEY (unit_id) REFERENCES units(id) ON UPDATE CASCADE
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- ─────────────────────────────────────────
-- DEFAULT DATA
-- ─────────────────────────────────────────
INSERT IGNORE INTO units (id, nama, kategori, nomor, status_unit) VALUES
('ps4-1','PS4 - 1','PS4',1,'available'),
('ps4-2','PS4 - 2','PS4',2,'available'),
('ps4-3','PS4 - 3','PS4',3,'available'),
('ps5-1','PS5 - 1','PS5',1,'available'),
('ps5-2','PS5 - 2','PS5',2,'available'),
('ps5-3','PS5 - 3','PS5',3,'available'),
('ps5-4','PS5 - 4','PS5',4,'available'),
('ps5-5','PS5 - 5','PS5',5,'available'),
('ps5-6','PS5 - 6','PS5',6,'available'),
('ps5-7','PS5 - 7','PS5',7,'available');

INSERT IGNORE INTO menu_items (id, nama, ico, kategori, harga, stok, aktif) VALUES
('m1', 'Indomie Goreng',        '🍜','Makanan', 8000,20,1),
('m2', 'Indomie Goreng 2 Bks', '🍜','Makanan',14000,20,1),
('m3', 'Indomie Kuah',          '🍜','Makanan', 8000,20,1),
('m4', 'Indomie Kuah 2 Bks',   '🍜','Makanan',14000,20,1),
('m5', 'Pop Mie',               '🍜','Makanan',10000,15,1),
('m6', '+ Telor (tambahan)',    '🥚','Makanan', 5000,20,1),
('d1', 'Es Teh',                '🥤','Minuman', 6000,30,1),
('d2', 'NutriSari',             '🍹','Minuman', 7000,20,1),
('d3', 'Es Coklat',             '🍫','Minuman', 8000,20,1),
('d4', 'Air Mineral',           '💧','Minuman', 6000,30,1),
('s1', 'Nabati Keju Coklat',    '🍪','Cemilan', 2500,20,1),
('s2', 'Chocolatos',            '🍫','Cemilan', 2500,20,1),
('s3', 'Malkist Coklat / Keju','🍘','Cemilan', 3000,20,1),
('s4', 'Oreo',                  '🍪','Cemilan', 3000,20,1),
('s5', 'Taro Seaweed',          '🌊','Cemilan', 3000,20,1),
('s6', 'Choki',                 '🍫','Cemilan', 3000,20,1),
('s7', 'Chiki Snack',           '🍟','Cemilan', 3000,20,1),
('s8', 'Jet-Z',                 '🍬','Cemilan', 4000,20,1),
('s9', 'Chitato',               '🥔','Cemilan', 4000,20,1),
('s10','Beng-Beng',             '🍫','Cemilan', 5000,20,1),
('s11','Good Time',             '🍪','Cemilan', 5000,20,1);

-- Note: users diinsert via aplikasi (password di-hash PBKDF2, bukan plaintext)
-- Gunakan POST /api/auth/register atau tambahkan manual via aplikasi

-- ─────────────────────────────────────────
-- VIEWS untuk analytics (MySQL-ready)
-- ─────────────────────────────────────────

CREATE OR REPLACE VIEW v_daily_revenue AS
SELECT
  DATE(paid_at) AS tgl,
  COUNT(*)       AS jumlah_transaksi,
  SUM(total)     AS total_revenue,
  SUM(total_ps)  AS revenue_sewa,
  SUM(total_fnb) AS revenue_fnb
FROM transactions
GROUP BY DATE(paid_at)
ORDER BY tgl DESC;

CREATE OR REPLACE VIEW v_unit_performance AS
SELECT
  t.unit,
  t.kategori,
  COUNT(*)       AS total_booking,
  SUM(t.total_ps) AS total_revenue
FROM transactions t
GROUP BY t.unit, t.kategori
ORDER BY total_booking DESC;

CREATE OR REPLACE VIEW v_pending_bookings AS
SELECT
  b.id, b.nama, b.wa, b.unit_nama, b.tgl,
  b.time_range, b.total, b.expires_at, b.created_at
FROM bookings b
WHERE b.payment_status = 'pending'
ORDER BY b.created_at ASC;

-- Query untuk cek slot conflict (pakai ini saat migrasi):
-- SELECT COUNT(*) FROM booking_slots
-- WHERE unit_id = ? AND tgl = ? AND slot IN (?) AND status IN ('pending','booked');


-- ─────────────────────────────────────────
-- TABLE: staff  (tambahan v8.1.3)
-- Terpisah dari users untuk manajemen akun internal
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS staff;
CREATE TABLE staff (
  id          VARCHAR(30)  NOT NULL PRIMARY KEY,
  nama        VARCHAR(100) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  role        ENUM('staff','boss') NOT NULL DEFAULT 'staff',
  aktif       TINYINT(1)   NOT NULL DEFAULT 1,
  joined      DATE         NOT NULL,
  INDEX idx_email (email),
  INDEX idx_role  (role),
  FOREIGN KEY (email) REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- TABLE: laporan  (tambahan v8.1.3)
-- Alias dari transactions untuk laporan boss
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS laporan;
CREATE TABLE laporan (
  id          VARCHAR(30)   NOT NULL PRIMARY KEY,
  booking_id  VARCHAR(50)   NOT NULL,
  nama        VARCHAR(100)  NOT NULL,
  email       VARCHAR(255)  DEFAULT NULL,
  unit        VARCHAR(100)  NOT NULL,
  kategori    VARCHAR(20)   NOT NULL,
  tgl         DATE          NOT NULL,
  tgl_str     VARCHAR(40)   DEFAULT NULL,
  time_range  VARCHAR(30)   NOT NULL,
  dur         TINYINT       NOT NULL DEFAULT 1,
  jam_main    TINYINT       NOT NULL DEFAULT 1,
  bonus_jam   TINYINT       NOT NULL DEFAULT 0,
  is_weekend  TINYINT(1)    NOT NULL DEFAULT 0,
  total_ps    INT UNSIGNED  NOT NULL DEFAULT 0,
  total_fnb   INT UNSIGNED  NOT NULL DEFAULT 0,
  total       INT UNSIGNED  NOT NULL DEFAULT 0,
  metode      VARCHAR(50)   DEFAULT 'QRIS',
  tipe        ENUM('online','walkin') DEFAULT 'online',
  paid_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tgl     (tgl),
  INDEX idx_paid_at (paid_at),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON UPDATE CASCADE
) ENGINE=InnoDB;
