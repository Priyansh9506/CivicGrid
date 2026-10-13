/*
 * Practical - 8: CivicGrid database schema
 *
 *   users ──< sessions                     (login / auth)
 *   users ──< complaints >── zones         (complaint creation, image stored as LONGBLOB)
 *   complaints ──< complaint_status_history (every Kanban drag & drop / status change)
 */

const TABLES = [
    {
        name: 'users',
        sql: `CREATE TABLE IF NOT EXISTS users (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            first_name    VARCHAR(100) NOT NULL,
            last_name     VARCHAR(100) NOT NULL,
            mobile_number CHAR(10)     NOT NULL,
            aadhar_number CHAR(12)     NOT NULL UNIQUE,
            email         VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            address       TEXT         NOT NULL,
            created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    },
    {
        name: 'sessions',
        sql: `CREATE TABLE IF NOT EXISTS sessions (
            token      CHAR(64)  PRIMARY KEY,
            user_id    INT       NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME  NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    },
    {
        name: 'zones',
        sql: `CREATE TABLE IF NOT EXISTS zones (
            id   INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(50)  NOT NULL UNIQUE,
            lat  DECIMAL(9,6) NOT NULL,
            lng  DECIMAL(9,6) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    },
    {
        name: 'complaints',
        sql: `CREATE TABLE IF NOT EXISTS complaints (
            id                 INT AUTO_INCREMENT PRIMARY KEY,
            user_id            INT          NULL,
            zone_id            INT          NOT NULL,
            description        VARCHAR(500) NOT NULL,
            reporter_name      VARCHAR(200) NOT NULL,
            reporter_aadhar    CHAR(12)     NOT NULL,
            reporter_age       TINYINT UNSIGNED NOT NULL,
            reporter_gender    ENUM('Male','Female','Other') NOT NULL,
            reporter_residence VARCHAR(500) NOT NULL,
            status             ENUM('reported','inprogress','resolved') NOT NULL DEFAULT 'reported',
            location_label     VARCHAR(255) NULL,
            latitude           DECIMAL(9,6) NULL,
            longitude          DECIMAL(9,6) NULL,
            image              LONGBLOB     NULL,
            image_mime         VARCHAR(50)  NULL,
            image_name         VARCHAR(255) NULL,
            created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (zone_id) REFERENCES zones(id),
            INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    },
    {
        name: 'complaint_status_history',
        sql: `CREATE TABLE IF NOT EXISTS complaint_status_history (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            complaint_id INT NOT NULL,
            old_status   ENUM('reported','inprogress','resolved') NULL,
            new_status   ENUM('reported','inprogress','resolved') NOT NULL,
            changed_by   INT NULL,
            source       ENUM('create','kanban','list','seed') NOT NULL,
            changed_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
            FOREIGN KEY (changed_by)   REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    }
];

const ZONES = [
    ['North Zone', 23.0784, 72.5998],
    ['South Zone', 22.9904, 72.5936],
    ['East Zone',  23.0334, 72.6324],
    ['West Zone',  23.0366, 72.5456],
    ['Downtown',   23.0257, 72.5786]
];

// Same sample complaints the app used to ship in localStorage
const SAMPLE_COMPLAINTS = [
    ['Repair main water pipe leak',   'Downtown',   'reported'],
    ['Fix streetlights on 5th Avenue', 'North Zone', 'inprogress'],
    ['Clear garbage dump near park',  'South Zone', 'resolved'],
    ['Fill potholes on Highway 9',    'East Zone',  'reported']
];

module.exports = { TABLES, ZONES, SAMPLE_COMPLAINTS };
