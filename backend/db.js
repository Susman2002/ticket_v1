import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const db = new Database('turnos.db');

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    prefix TEXT UNIQUE NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ticket_sequences (
    service_id INTEGER NOT NULL REFERENCES services(id),
    date TEXT NOT NULL,
    current_number INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (service_id, date)
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_number TEXT NOT NULL,
    service_id INTEGER NOT NULL REFERENCES services(id),
    token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    operator_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS windows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER UNIQUE NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS operator_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER NOT NULL REFERENCES users(id),
    window_id INTEGER REFERENCES windows(id),
    service_id INTEGER REFERENCES services(id),
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    UNIQUE(operator_id, ended_at)
  );
`);

const insertRole = db.prepare('INSERT OR IGNORE INTO roles (name) VALUES (?)');
insertRole.run('admin');
insertRole.run('operador');

const adminRole = db.prepare('SELECT id FROM roles WHERE name = ?').get('admin');
const hashedPassword = bcrypt.hashSync('admin123', 10);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, password_hash, role_id) VALUES (?, ?, ?)
`);
insertUser.run('admin', hashedPassword, adminRole.id);

const services = [
  { name: 'Trámite 1', prefix: 'TR1' },
  { name: 'Trámite 2', prefix: 'TR2' },
  { name: 'Trámite 3', prefix: 'TR3' }
];

const insertService = db.prepare(`
  INSERT OR IGNORE INTO services (name, prefix) VALUES (?, ?)
`);

for (const svc of services) {
  insertService.run(svc.name, svc.prefix);
}

const windows = [1, 2, 3];
const insertWindow = db.prepare('INSERT OR IGNORE INTO windows (number) VALUES (?)');
for (const w of windows) {
  insertWindow.run(w);
}

console.log('Base de datos inicializada correctamente');
console.log('Roles: admin, operador');
console.log('Servicios: Trámite 1 (TR1), Trámite 2 (TR2), Trámite 3 (TR3)');
console.log('Ventanillas: 1, 2, 3');
console.log('Usuario admin / admin123 creado');

db.close();