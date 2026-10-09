import { randomUUID } from 'crypto';

// Base de datos completamente en memoria - sin sistema de archivos
let data = {
  roles: [
    { id: 1, name: 'admin' },
    { id: 2, name: 'operador' }
  ],
  users: [
    { id: 1, username: 'admin', password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', role_id: 1, created_at: new Date().toISOString() },
    { id: 2, username: 'operador1', password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', role_id: 2, created_at: new Date().toISOString() }
  ],
  services: [
    { id: 1, name: 'Trámite 1', prefix: 'TR1', active: 1, created_at: new Date().toISOString() },
    { id: 2, name: 'Trámite 2', prefix: 'TR2', active: 1, created_at: new Date().toISOString() },
    { id: 3, name: 'Trámite 3', prefix: 'TR3', active: 1, created_at: new Date().toISOString() }
  ],
  ticket_sequences: [],
  tickets: [],
  windows: [
    { id: 1, number: 1, active: 1, created_at: new Date().toISOString() },
    { id: 2, number: 2, active: 1, created_at: new Date().toISOString() },
    { id: 3, number: 3, active: 1, created_at: new Date().toISOString() }
  ],
  operator_sessions: []
};

function getNextId(arr) {
  return arr.length > 0 ? Math.max(...arr.map(x => x.id)) + 1 : 1;
}

function dbGet(table, conditions) {
  const arr = data[table];
  if (!arr) return null;
  return arr.find(item => Object.entries(conditions).every(([k, v]) => item[k] === v)) || null;
}

function dbAll(table, conditions = {}) {
  let arr = data[table] || [];
  if (Object.keys(conditions).length > 0) {
    arr = arr.filter(item => Object.entries(conditions).every(([k, v]) => item[k] === v));
  }
  return [...arr];
}

function dbRun(table, item) {
  const newItem = { ...item, id: getNextId(data[table]) };
  data[table].push(newItem);
  return { lastID: newItem.id, changes: 1 };
}

function dbUpdate(table, conditions, updates) {
  const idx = data[table].findIndex(item => Object.entries(conditions).every(([k, v]) => item[k] === v));
  if (idx === -1) return { changes: 0 };
  data[table][idx] = { ...data[table][idx], ...updates };
  return { changes: 1 };
}

async function getDatabase() {
  return {
    get: async (sql, params) => {
      // Login
      if (sql.includes('SELECT u.id, u.username, u.password_hash, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = ?')) {
        const user = data.users.find(u => u.username === params[0]);
        if (!user) return null;
        const role = data.roles.find(r => r.id === user.role_id);
        return { ...user, role: role?.name };
      }
      // Get user by ID
      if (sql.includes('SELECT u.id, u.username, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?')) {
        const user = data.users.find(u => u.id === params[0]);
        if (!user) return null;
        const role = data.roles.find(r => r.id === user.role_id);
        return { ...user, role: role?.name };
      }
      // Services
      if (sql.includes('SELECT * FROM services WHERE id = ? AND active = 1')) {
        return data.services.find(s => s.id === params[0] && s.active === 1) || null;
      }
      if (sql.includes('SELECT * FROM services WHERE active = 1')) {
        return data.services.filter(s => s.active === 1);
      }
      // Windows
      if (sql.includes('SELECT * FROM windows WHERE id = ? AND active = 1')) {
        return data.windows.find(w => w.id === params[0] && w.active === 1) || null;
      }
      if (sql.includes('SELECT * FROM windows WHERE active = 1')) {
        return data.windows.filter(w => w.active === 1);
      }
      // Operator sessions
      if (sql.includes('SELECT * FROM operator_sessions WHERE window_id = ? AND ended_at IS NULL')) {
        return data.operator_sessions.find(s => s.window_id === params[0] && !s.ended_at) || null;
      }
      if (sql.includes('SELECT * FROM operator_sessions WHERE operator_id = ? AND ended_at IS NULL')) {
        return data.operator_sessions.find(s => s.operator_id === params[0] && !s.ended_at) || null;
      }
      // Tickets
      if (sql.includes('SELECT * FROM tickets WHERE token = ?')) {
        return data.tickets.find(t => t.token === params[0]) || null;
      }
      if (sql.includes('SELECT * FROM tickets WHERE service_id = ? AND status = ? ORDER BY created_at LIMIT 1')) {
        const tickets = data.tickets
          .filter(t => t.service_id === params[0] && t.status === params[1])
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        return tickets[0] || null;
      }
      // Ticket details with joins
      if (sql.includes('SELECT t.*, s.name as service_name, s.prefix as service_prefix, u.username as operator_username, w.number as window_number FROM tickets t')) {
        const tickets = data.tickets.map(t => {
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
        // Apply filters
        if (params.length > 0) {
          // Simple filter by service_id and status if provided
        }
        return tickets;
      }
      // User by ID for /auth/me
      if (sql.includes('SELECT u.id, u.username, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?')) {
        const user = data.users.find(u => u.id === params[0]);
        if (!user) return null;
        const role = data.roles.find(r => r.id === user.role_id);
        return { ...user, role: role?.name };
      }
      return null;
    },
    all: async (sql, params) => {
      if (sql.includes('SELECT * FROM services WHERE active = 1')) {
        return data.services.filter(s => s.active === 1);
      }
      if (sql.includes('SELECT * FROM windows WHERE active = 1')) {
        return data.windows.filter(w => w.active === 1);
      }
      if (sql.includes('SELECT t.*, s.name as service_name, s.prefix as service_prefix, u.username as operator_username, w.number as window_number FROM tickets t JOIN services s ON t.service_id = s.id LEFT JOIN users u ON t.operator_id = u.id LEFT JOIN operator_sessions os ON os.operator_id = t.operator_id AND os.ended_at IS NULL LEFT JOIN windows w ON os.window_id = w.id WHERE 1=1')) {
        return data.tickets.map(t => {
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
        const user = data.users.find(u => u.id === params[0]);
        if (!user) return [];
        const role = data.roles.find(r => r.id === user.role_id);
        return [{ ...user, role: role?.name }];
      }
      return [];
    },
    run: async (sql, params) => {
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
        return { lastID: newSession.id, changes: 1 };
      }
      if (sql.includes('INSERT INTO ticket_sequences')) {
        return { lastID: 1, changes: 1 };
      }
      return { lastID: 1, changes: 1 };
    },
    exec: async (sql) => {
      // No-op for PRAGMAs
      return;
    },
    close: async () => {
      // No-op
      return;
    }
  };
}

function getNextId(arr) {
  return arr.length > 0 ? Math.max(...arr.map(x => x.id)) + 1 : 1;
}

async function getDatabase() {
  return await getDatabase();
}

async function initDatabase() {
  console.log('Base de datos en memoria inicializada');
  return await getDatabase();
}

export default {
  getDatabase,
  initDatabase
};