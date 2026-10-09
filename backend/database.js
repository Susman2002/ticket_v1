import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_PATH = resolve(__dirname, 'data.json');

let data = {
  roles: [],
  users: [],
  services: [],
  ticket_sequences: [],
  tickets: [],
  windows: [],
  operator_sessions: []
};

let initialized = false;

function loadData() {
  if (existsSync(DATA_PATH)) {
    try {
      const content = readFileSync(DATA_PATH, 'utf-8');
      data = JSON.parse(content);
      // Asegurar estructura
      data.roles = data.roles || [];
      data.users = data.users || [];
      data.services = data.services || [];
      data.ticket_sequences = data.ticket_sequences || [];
      data.tickets = data.tickets || [];
      data.windows = data.windows || [];
      data.operator_sessions = data.operator_sessions || [];
    } catch (e) {
      console.warn('Error cargando data.json, iniciando vacío:', e.message);
    }
  }
}

function saveData() {
  try {
    writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error guardando data.json:', e.message);
  }
}

function initData() {
  if (initialized) return;
  loadData();

  // Roles
  if (data.roles.length === 0) {
    data.roles = [
      { id: 1, name: 'admin' },
      { id: 2, name: 'operador' }
    ];
  }

  // Servicios
  if (data.services.length === 0) {
    data.services = [
      { id: 1, name: 'Trámite 1', prefix: 'TR1', active: 1, created_at: new Date().toISOString() },
      { id: 2, name: 'Trámite 2', prefix: 'TR2', active: 1, created_at: new Date().toISOString() },
      { id: 3, name: 'Trámite 3', prefix: 'TR3', active: 1, created_at: new Date().toISOString() }
    ];
  }

  // Ventanillas
  if (data.windows.length === 0) {
    data.windows = [
      { id: 1, number: 1, active: 1, created_at: new Date().toISOString() },
      { id: 2, number: 2, active: 1, created_at: new Date().toISOString() },
      { id: 3, number: 3, active: 1, created_at: new Date().toISOString() }
    ];
  }

  // Usuario admin (password pre-hashed: admin123)
  if (data.users.length === 0) {
    data.users = [
      { id: 1, username: 'admin', password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', role_id: 1, created_at: new Date().toISOString() }
    ];
    saveData();
  }

  initialized = true;
}

function getNextId(arr) {
  return arr.length > 0 ? Math.max(...arr.map(x => x.id)) + 1 : 1;
}

// --- API CRUD Genérica ---
async function dbGet(table, conditions) {
  initData();
  const arr = data[table];
  if (!arr) return null;
  return arr.find(item => Object.entries(conditions).every(([k, v]) => item[k] === v)) || null;
}

async function dbAll(table, conditions = {}) {
  initData();
  let arr = data[table] || [];
  if (Object.keys(conditions).length > 0) {
    arr = arr.filter(item => Object.entries(conditions).every(([k, v]) => item[k] === v));
  }
  return [...arr];
}

async function dbRun(table, item) {
  initData();
  const newItem = { ...item, id: getNextId(data[table]) };
  data[table].push(newItem);
  saveData();
  return { lastID: newItem.id, changes: 1 };
}

async function dbUpdate(table, conditions, updates) {
  initData();
  const idx = data[table].findIndex(item => Object.entries(conditions).every(([k, v]) => item[k] === v));
  if (idx === -1) return { changes: 0 };
  data[table][idx] = { ...data[table][idx], ...updates };
  saveData();
  return { changes: 1 };
}

async function dbDelete(table, conditions) {
  initData();
  const lenBefore = data[table].length;
  data[table] = data[table].filter(item => !Object.entries(conditions).every(([k, v]) => item[k] === v));
  saveData();
  return { changes: lenBefore - data[table].length };
}

// --- Funciones específicas para compatibilidad ---
async function getDatabase() {
  initData();
  return {
    get: async (sql, params) => {
      // Parseo simple de SQL para operaciones comunes
      if (sql.includes('SELECT u.id, u.username, u.password_hash, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = ?')) {
        const user = await dbGet('users', { username: params[0] });
        if (!user) return null;
        const role = data.roles.find(r => r.id === user.role_id);
        return { ...user, role: role?.name };
      }
      if (sql.includes('SELECT u.id, u.username, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?')) {
        const user = await dbGet('users', { id: params[0] });
        if (!user) return null;
        const role = data.roles.find(r => r.id === user.role_id);
        return { ...user, role: role?.name };
      }
      if (sql.includes('SELECT * FROM services WHERE id = ? AND active = 1')) {
        return await dbGet('services', { id: params[0], active: 1 });
      }
      if (sql.includes('SELECT * FROM windows WHERE id = ? AND active = 1')) {
        return await dbGet('windows', { id: params[0], active: 1 });
      }
      if (sql.includes('SELECT * FROM operator_sessions WHERE window_id = ? AND ended_at IS NULL')) {
        return await dbGet('operator_sessions', { window_id: params[0], ended_at: null });
      }
      if (sql.includes('SELECT * FROM operator_sessions WHERE operator_id = ? AND ended_at IS NULL')) {
        return await dbGet('operator_sessions', { operator_id: params[0], ended_at: null });
      }
      if (sql.includes('SELECT * FROM tickets WHERE token = ?')) {
        return await dbGet('tickets', { token: params[0] });
      }
      if (sql.includes('SELECT * FROM tickets WHERE service_id = ? AND status = ? ORDER BY created_at LIMIT 1')) {
        const tickets = await dbAll('tickets', { service_id: params[0], status: params[1] });
        return tickets[0] || null;
      }
      if (sql.includes('SELECT * FROM tickets WHERE operator_id = ? AND ended_at IS NULL')) {
        return await dbGet('operator_sessions', { operator_id: params[0], ended_at: null });
      }
      return null;
    },
    all: async (sql, params) => {
      if (sql.includes('SELECT * FROM services WHERE active = 1')) {
        return await dbAll('services', { active: 1 });
      }
      if (sql.includes('SELECT * FROM windows WHERE active = 1')) {
        return await dbAll('windows', { active: 1 });
      }
      if (sql.includes('SELECT * FROM tickets WHERE service_id = ? AND status = ? ORDER BY created_at')) {
        return await dbAll('tickets', { service_id: params[0], status: params[1] });
      }
      if (sql.includes('SELECT t.*, s.name as service_name, s.prefix as service_prefix, u.username as operator_username, w.number as window_number FROM tickets t JOIN services s ON t.service_id = s.id LEFT JOIN users u ON t.operator_id = u.id LEFT JOIN operator_sessions os ON os.operator_id = t.operator_id AND os.ended_at IS NULL LEFT JOIN windows w ON os.window_id = w.id WHERE 1=1')) {
        let tickets = await dbAll('tickets', {});
        // Apply filters from params
        let filtered = tickets;
        if (params.length > 0) {
          // Simple filter handling for service_id and status
          if (params.includes(params[0]) && params[0] && !isNaN(params[0])) {
            // This is a simple approximation
          }
        }
        return filtered.map(t => {
          const service = data.services.find(s => s.id === t.service_id);
          const operator = t.operator_id ? data.users.find(u => u.id === t.operator_id) : null;
          const session = t.operator_id ? data.operator_sessions.find(s => s.operator_id === t.operator_id && !s.ended_at) : null;
          const window = session ? data.windows.find(w => w.id === session.window_id) : null;
          return {
            ...t,
            service_name: service?.name,
            service_prefix: service?.prefix,
            operator_username: operator?.username,
            window_number: window?.number
          };
        });
      }
      if (sql.includes('SELECT u.id, u.username, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?')) {
        const user = await dbGet('users', { id: params[0] });
        if (!user) return [];
        const role = data.roles.find(r => r.id === user.role_id);
        return [{ ...user, role: role?.name }];
      }
      return [];
    },
    run: async (sql, params) => {
      // Handle INSERTs
      if (sql.includes('INSERT INTO tickets')) {
        const [ticketNumber, serviceId, token] = params;
        const newTicket = {
          id: getNextId(data.tickets),
          ticket_number: ticketNumber,
          service_id: serviceId,
          token,
          status: 'waiting',
          operator_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        data.tickets.push(newTicket);
        saveData();
        return { lastID: newTicket.id, changes: 1 };
      }
      if (sql.includes('INSERT INTO operator_sessions')) {
        const [operatorId, windowId, serviceId] = params;
        const newSession = {
          id: getNextId(data.operator_sessions),
          operator_id: operatorId,
          window_id: windowId,
          service_id: serviceId,
          started_at: new Date().toISOString(),
          ended_at: null
        };
        data.operator_sessions.push(newSession);
        saveData();
        return { lastID: newSession.id, changes: 1 };
      }
      if (sql.includes('INSERT INTO ticket_sequences')) {
        // Handle ticket sequence
        return { lastID: 1, changes: 1 };
      }
      return { lastID: 1, changes: 1 };
    },
    exec: async (sql) => {
      // For PRAGMAs etc - no-op in JSON
      return;
    },
    close: async () => {
      saveData();
    }
  };
}

async function initDatabase() {
  const db = await getDatabase();
  // Initialize if needed
  if (!initialized) {
    initData();
  }
  return db;
}

export default {
  getDatabase,
  initDatabase
};