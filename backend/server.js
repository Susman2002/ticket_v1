import http from 'http';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID, randomBytes } from 'crypto';

const app = express();
const PORT = 3000;
const JWT_SECRET = 'turnos-secret-key-2024';

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const db = new Database('turnos.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const clients = new Map();

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload, filterFn = null) {
  for (const [ws, meta] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      if (!filterFn || filterFn(meta, ws)) {
        ws.send(JSON.stringify(payload));
      }
    }
  }
}

function emitTicketEvent(eventType, ticketPayload) {
  for (const [ws, meta] of clients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;

    if (meta.channel === 'ticket' && meta.ticketToken === ticketPayload.token) {
      sendJson(ws, { event: eventType, data: ticketPayload });
      continue;
    }

    if (meta.channel === 'operator') {
      sendJson(ws, { event: eventType, data: ticketPayload });
      continue;
    }

    if (meta.channel === 'display' && ['ticket_called', 'ticket_transferred'].includes(eventType)) {
      const { token, ...displayTicket } = ticketPayload;
      sendJson(ws, { event: eventType, data: displayTicket });
    }
  }
}

function parseClientMeta(reqUrl) {
  try {
    const url = new URL(reqUrl, 'http://localhost');
    const channel = url.searchParams.get('channel') || 'display';
    const token = url.searchParams.get('token');
    const ticketToken = url.searchParams.get('ticketToken');

    let user = null;
    if (token) {
      try {
        user = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        user = null;
      }
    }

    return {
      channel,
      ticketToken: ticketToken || null,
      user
    };
  } catch (err) {
    return {
      channel: 'display',
      ticketToken: null,
      user: null
    };
  }
}

wss.on('connection', (ws, req) => {
  const meta = parseClientMeta(req.url);

  if (meta.channel === 'operator' && !meta.user) {
    sendJson(ws, { event: 'error', data: { message: 'Autenticación requerida para canal de operador' } });
    ws.close(1008, 'Token no válido');
    return;
  }

  clients.set(ws, meta);

  sendJson(ws, {
    event: 'connected',
    data: {
      channel: meta.channel,
      ticketToken: meta.ticketToken,
      user: meta.user ? { id: meta.user.id, username: meta.user.username, role: meta.user.role } : null
    }
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.action === 'ping') {
        sendJson(ws, { event: 'pong', timestamp: Date.now() });
        return;
      }

      if (msg.action === 'subscribe_ticket' && msg.ticketToken) {
        meta.channel = 'ticket';
        meta.ticketToken = msg.ticketToken;
        clients.set(ws, meta);
        sendJson(ws, { event: 'subscribed', data: { channel: 'ticket', ticketToken: msg.ticketToken } });
        return;
      }

      if (msg.action === 'subscribe_display') {
        meta.channel = 'display';
        meta.ticketToken = null;
        clients.set(ws, meta);
        sendJson(ws, { event: 'subscribed', data: { channel: 'display' } });
        return;
      }

      if (msg.action === 'subscribe_operator') {
        if (!msg.token) {
          sendJson(ws, { event: 'error', data: { message: 'Token requerido para suscribirse a operador' } });
          return;
        }

        try {
          const user = jwt.verify(msg.token, JWT_SECRET);
          meta.channel = 'operator';
          meta.user = user;
          clients.set(ws, meta);
          sendJson(ws, {
            event: 'subscribed',
            data: { channel: 'operator', user: { id: user.id, username: user.username, role: user.role } }
          });
        } catch (err) {
          sendJson(ws, { event: 'error', data: { message: 'Token de operador inválido o expirado' } });
        }
      }
    } catch (err) {
      sendJson(ws, { event: 'error', data: { message: 'Formato de mensaje inválido' } });
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', () => {
    clients.delete(ws);
  });
});

// ============================================
// SISTEMA DE QR ROTATIVO PARA KIOSKO
// ============================================
const QR_ROTATION_INTERVAL = 90000; // 90 segundos
let qrState = {
  currentToken: null,
  currentTokenCreatedAt: null,
  previousToken: null,
  previousTokenCreatedAt: null
};

function generateQrToken() {
  return randomBytes(8).toString('hex');
}

function rotateQrToken() {
  const now = Date.now();
  
  // Mover token actual a anterior (gracia de 1 ciclo)
  qrState.previousToken = qrState.currentToken;
  qrState.previousTokenCreatedAt = qrState.currentTokenCreatedAt;
  
  // Generar nuevo token
  qrState.currentToken = generateQrToken();
  qrState.currentTokenCreatedAt = now;
  
  console.log(`[QR] Token rotado: ${qrState.currentToken} (expira en ${QR_ROTATION_INTERVAL / 1000}s)`);
  
  // Emitir a todas las pantallas de sala (display)
  broadcast({
    event: 'QR_ROTATED',
    data: {
      token: qrState.currentToken,
      expiresIn: QR_ROTATION_INTERVAL / 1000,
      rotatedAt: new Date(now).toISOString()
    }
  }, (meta) => meta.channel === 'display');
}

// Inicializar primer token y empezar rotación
rotateQrToken();
setInterval(rotateQrToken, QR_ROTATION_INTERVAL);

// Función para validar un token QR
function isValidQrToken(token) {
  const now = Date.now();
  
  // Verificar token actual
  if (qrState.currentToken === token) {
    const age = now - qrState.currentTokenCreatedAt;
    if (age <= QR_ROTATION_INTERVAL) {
      return true;
    }
  }
  
  // Verificar token anterior (gracia de 1 ciclo)
  if (qrState.previousToken === token) {
    const age = now - qrState.previousTokenCreatedAt;
    if (age <= QR_ROTATION_INTERVAL * 2) {
      return true;
    }
  }
  
  return false;
}

// Endpoint para validar token QR
app.get('/api/qr/validate/:token', (req, res) => {
  const { token } = req.params;
  const valid = isValidQrToken(token);
  res.json({ valid });
});

// Obtener token QR actual (para debugging/admin)
app.get('/api/qr/current', (req, res) => {
  const now = Date.now();
  res.json({
    token: qrState.currentToken,
    expiresIn: Math.max(0, Math.ceil((QR_ROTATION_INTERVAL - (now - qrState.currentTokenCreatedAt)) / 1000)),
    rotatedAt: new Date(qrState.currentTokenCreatedAt).toISOString()
  });
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }
    req.user = user;
    next();
  });
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No autorizado para este rol' });
    }
    next();
  };
};

function getTicketDetailsByToken(token) {
  return db.prepare(`
    SELECT t.*, s.name as service_name, s.prefix as service_prefix,
           u.username as operator_username, w.number as window_number
    FROM tickets t
    JOIN services s ON t.service_id = s.id
    LEFT JOIN users u ON t.operator_id = u.id
    LEFT JOIN operator_sessions os ON os.operator_id = t.operator_id AND os.ended_at IS NULL
    LEFT JOIN windows w ON os.window_id = w.id
    WHERE t.token = ?
  `).get(token);
}

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const user = db.prepare(`
    SELECT u.id, u.username, u.password_hash, r.name as role
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.username = ?
  `).get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role }
  });
});

app.get('/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.username, r.name as role
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = ?
  `).get(req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  res.json(user);
});

app.get('/services', authenticateToken, (req, res) => {
  const services = db.prepare('SELECT * FROM services WHERE active = 1').all();
  res.json(services);
});

app.get('/windows', authenticateToken, (req, res) => {
  const windows = db.prepare('SELECT * FROM windows WHERE active = 1').all();
  res.json(windows);
});

// ============================================
// ENDPOINTS DE ADMINISTRACIÓN (solo admin)
// ============================================

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores' });
  }
  next();
};

// Obtener roles
app.get('/roles', authenticateToken, requireAdmin, (req, res) => {
  const roles = db.prepare('SELECT * FROM roles').all();
  res.json(roles);
});

// Obtener todos los usuarios
app.get('/auth/users', authenticateToken, requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, r.name as role, u.created_at
    FROM users u
    JOIN roles r ON u.role_id = r.id
  `).all();
  res.json(users);
});

// Crear usuario
app.post('/auth/users', authenticateToken, requireAdmin, (req, res) => {
  const { username, password, role_id } = req.body;
  
  if (!username || !password || !role_id) {
    return res.status(400).json({ error: 'username, password y role_id requeridos' });
  }
  
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'El usuario ya existe' });
  }
  
  const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(role_id);
  if (!role) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  
  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, role_id)
    VALUES (?, ?, ?)
    RETURNING id, username, role_id, created_at
  `).run(username, hashedPassword, role_id);
  
  res.status(201).json({
    id: result.lastInsertRowid,
    username,
    role_id,
    created_at: new Date().toISOString()
  });
});

// Eliminar usuario
app.delete('/auth/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const userId = parseInt(id);
  
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'No puede eliminarse a sí mismo' });
  }
  
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }
  
  res.json({ message: 'Usuario eliminado correctamente' });
});

// Servicios - obtener todos (incluye inactivos para admin)
app.get('/services/all', authenticateToken, requireAdmin, (req, res) => {
  const services = db.prepare('SELECT * FROM services ORDER BY id').all();
  res.json(services);
});

// Crear servicio
app.post('/services', authenticateToken, requireAdmin, (req, res) => {
  const { name, prefix, active = 1 } = req.body;
  
  if (!name || !prefix) {
    return res.status(400).json({ error: 'name y prefix requeridos' });
  }
  
  const existing = db.prepare('SELECT id FROM services WHERE prefix = ?').get(prefix);
  if (existing) {
    return res.status(400).json({ error: 'El prefijo ya existe' });
  }
  
  const result = db.prepare(`
    INSERT INTO services (name, prefix, active)
    VALUES (?, ?, ?)
    RETURNING id, name, prefix, active, created_at
  `).run(name, prefix, active);
  
  res.status(201).json({
    id: result.lastInsertRowid,
    name,
    prefix,
    active,
    created_at: new Date().toISOString()
  });
});

// Actualizar servicio
app.put('/services/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, prefix, active } = req.body;
  
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!service) {
    return res.status(404).json({ error: 'Servicio no encontrado' });
  }
  
  if (prefix && prefix !== service.prefix) {
    const existing = db.prepare('SELECT id FROM services WHERE prefix = ?').get(prefix);
    if (existing) {
      return res.status(400).json({ error: 'El prefijo ya existe' });
    }
  }
  
  db.prepare(`
    UPDATE services
    SET name = COALESCE(?, name), prefix = COALESCE(?, prefix), active = COALESCE(?, active)
    WHERE id = ?
  `).run(name, prefix, active, id);
  
  const updated = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  res.json(updated);
});

// Eliminar servicio
app.delete('/services/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  
  // Verificar si hay tickets asociados
  const tickets = db.prepare('SELECT COUNT(*) as count FROM tickets WHERE service_id = ?').get(id);
  if (tickets.count > 0) {
    return res.status(400).json({ error: 'No se puede eliminar un servicio con tickets asociados. Desactívelo en su lugar.' });
  }
  
  const result = db.prepare('DELETE FROM services WHERE id = ?').run(id);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Servicio no encontrado' });
  }
  
  res.json({ message: 'Servicio eliminado correctamente' });
});

// Ventanillas - obtener todas (incluye inactivas para admin)
app.get('/windows/all', authenticateToken, requireAdmin, (req, res) => {
  const windows = db.prepare('SELECT * FROM windows ORDER BY number').all();
  res.json(windows);
});

// Crear ventanilla
app.post('/windows', authenticateToken, requireAdmin, (req, res) => {
  const { number, active = 1 } = req.body;
  
  if (!number) {
    return res.status(400).json({ error: 'number requerido' });
  }
  
  const existing = db.prepare('SELECT id FROM windows WHERE number = ?').get(number);
  if (existing) {
    return res.status(400).json({ error: 'El número de ventanilla ya existe' });
  }
  
  const result = db.prepare(`
    INSERT INTO windows (number, active)
    VALUES (?, ?)
    RETURNING id, number, active, created_at
  `).run(number, active);
  
  res.status(201).json({
    id: result.lastInsertRowid,
    number,
    active,
    created_at: new Date().toISOString()
  });
});

// Actualizar ventanilla
app.put('/windows/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { number, active } = req.body;
  
  const window = db.prepare('SELECT * FROM windows WHERE id = ?').get(id);
  if (!window) {
    return res.status(404).json({ error: 'Ventanilla no encontrada' });
  }
  
  if (number && number !== window.number) {
    const existing = db.prepare('SELECT id FROM windows WHERE number = ?').get(number);
    if (existing) {
      return res.status(400).json({ error: 'El número de ventanilla ya existe' });
    }
  }
  
  db.prepare(`
    UPDATE windows
    SET number = COALESCE(?, number), active = COALESCE(?, active)
    WHERE id = ?
  `).run(number, active, id);
  
  const updated = db.prepare('SELECT * FROM windows WHERE id = ?').get(id);
  res.json(updated);
});

// Eliminar ventanilla
app.delete('/windows/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  
  // Verificar si hay sesiones activas
  const sessions = db.prepare('SELECT COUNT(*) as count FROM operator_sessions WHERE window_id = ? AND ended_at IS NULL').get(id);
  if (sessions.count > 0) {
    return res.status(400).json({ error: 'No se puede eliminar una ventanilla con sesión activa. Finalice la sesión primero.' });
  }
  
  const result = db.prepare('DELETE FROM windows WHERE id = ?').run(id);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Ventanilla no encontrada' });
  }
  
  res.json({ message: 'Ventanilla eliminada correctamente' });
});

const generateTicketNumber = (servicePrefix, date) => {
  const tx = db.transaction(() => {
    const seq = db.prepare(`
      INSERT INTO ticket_sequences (service_id, date, current_number)
      VALUES (?, ?, 1)
      ON CONFLICT(service_id, date) DO UPDATE SET current_number = current_number + 1
      RETURNING current_number
    `).get(servicePrefix, date);
    return seq.current_number;
  });
  return tx();
};

app.post('/tickets', (req, res) => {
  const { service_id, qr_token } = req.body;

  if (!service_id) {
    return res.status(400).json({ error: 'service_id requerido' });
  }

  if (!qr_token) {
    return res.status(400).json({ error: 'qr_token requerido' });
  }

  if (!isValidQrToken(qr_token)) {
    return res.status(403).json({ error: 'El código QR ha expirado o no es válido. Por favor escanea el código que se muestra en la pantalla de la sala.' });
  }

  const service = db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(service_id);
  if (!service) {
    return res.status(404).json({ error: 'Servicio no encontrado o inactivo' });
  }

  const today = new Date().toISOString().split('T')[0];
  const number = generateTicketNumber(service_id, today);
  const ticketNumber = `${service.prefix}-${String(number).padStart(3, '0')}`;
  const token = randomUUID();

  const ticket = db.prepare(`
    INSERT INTO tickets (ticket_number, service_id, token, status)
    VALUES (?, ?, ?, 'waiting')
    RETURNING id, ticket_number, service_id, token, status, created_at
  `).run(ticketNumber, service_id, token);

  const fullTicket = getTicketDetailsByToken(token);
  const position = db.prepare(`
    SELECT COUNT(*) as count
    FROM tickets
    WHERE service_id = ? AND status = 'waiting' AND created_at <= ?
  `).get(service_id, fullTicket.created_at).count;

  const payload = { ...fullTicket, position };
  emitTicketEvent('ticket_created', payload);

  res.status(201).json({
    id: ticket.lastInsertRowid,
    ticket_number: ticketNumber,
    service_id,
    token,
    status: 'waiting',
    position,
    created_at: fullTicket.created_at
  });
});

app.get('/tickets/:token', (req, res) => {
  const { token } = req.params;

  const ticket = getTicketDetailsByToken(token);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }

  let position = null;
  if (ticket.status === 'waiting') {
    position = db.prepare(`
      SELECT COUNT(*) as count
      FROM tickets
      WHERE service_id = ? AND status = 'waiting' AND created_at <= ?
    `).get(ticket.service_id, ticket.created_at).count;
  }

  res.json({ ...ticket, position });
});

app.get('/tickets', authenticateToken, requireRole('operador', 'admin'), (req, res) => {
  const { service_id, status, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT t.*, s.name as service_name, s.prefix as service_prefix,
           u.username as operator_username, w.number as window_number
    FROM tickets t
    JOIN services s ON t.service_id = s.id
    LEFT JOIN users u ON t.operator_id = u.id
    LEFT JOIN operator_sessions os ON os.operator_id = t.operator_id AND os.ended_at IS NULL
    LEFT JOIN windows w ON os.window_id = w.id
    WHERE 1=1
  `;
  const params = [];

  if (service_id) {
    query += ' AND t.service_id = ?';
    params.push(service_id);
  }
  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }

  query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const tickets = db.prepare(query).all(...params);
  res.json(tickets);
});

app.put('/tickets/:token/status', authenticateToken, requireRole('operador', 'admin'), (req, res) => {
  const { token } = req.params;
  const { status } = req.body;

  const validStatuses = ['waiting', 'called', 'in_service', 'completed', 'cancelled', 'transferred'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  const ticket = db.prepare('SELECT * FROM tickets WHERE token = ?').get(token);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }

  db.prepare(`
    UPDATE tickets
    SET status = ?, operator_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `).run(status, req.user.id, token);

  const updated = getTicketDetailsByToken(token);
  emitTicketEvent('ticket_updated', updated);

  res.json(updated);
});

app.put('/tickets/:token/transfer', authenticateToken, requireRole('operador'), (req, res) => {
  const { token } = req.params;
  const { target_operator_id } = req.body;

  if (!target_operator_id) {
    return res.status(400).json({ error: 'target_operator_id requerido' });
  }

  const targetOperator = db.prepare(`
    SELECT u.id, u.username, r.name as role
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = ? AND r.name = 'operador'
  `).get(target_operator_id);

  if (!targetOperator) {
    return res.status(404).json({ error: 'Operador destino no encontrado' });
  }

  const targetSession = db.prepare(`
    SELECT os.*, w.number as window_number
    FROM operator_sessions os
    JOIN windows w ON os.window_id = w.id
    WHERE os.operator_id = ? AND os.ended_at IS NULL
  `).get(target_operator_id);

  if (!targetSession) {
    return res.status(400).json({ error: 'El operador destino no tiene una sesión activa' });
  }

  const ticket = db.prepare('SELECT * FROM tickets WHERE token = ?').get(token);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }

  if (ticket.status !== 'in_service' && ticket.status !== 'called') {
    return res.status(400).json({ error: 'Solo se pueden transferir tickets en atención o llamados' });
  }

  if (req.user.role === 'operador' && ticket.operator_id !== req.user.id) {
    return res.status(403).json({ error: 'Solo puede transferir tickets asignados a usted' });
  }

  const sourceSession = db.prepare(`
    SELECT window_id FROM operator_sessions WHERE operator_id = ? AND ended_at IS NULL
  `).get(req.user.id);

  if (sourceSession && sourceSession.window_id === targetSession.window_id) {
    return res.status(400).json({ error: 'La transferencia debe dirigirse a otra ventanilla' });
  }

  db.prepare(`
    UPDATE tickets
    SET status = 'transferred', operator_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `).run(target_operator_id, token);

  const updated = getTicketDetailsByToken(token);
  const transferPayload = {
    ...updated,
    target_operator_id,
    target_operator_username: targetOperator.username,
    window_number: targetSession.window_number
  };

  emitTicketEvent('ticket_transferred', transferPayload);

  res.json(transferPayload);
});

app.post('/operator/sessions', authenticateToken, requireRole('operador'), (req, res) => {
  const { window_id, service_id } = req.body;

  if (!window_id || !service_id) {
    return res.status(400).json({ error: 'window_id y service_id requeridos' });
  }

  const window = db.prepare('SELECT * FROM windows WHERE id = ? AND active = 1').get(window_id);
  if (!window) {
    return res.status(404).json({ error: 'Ventanilla no encontrada o inactiva' });
  }

  const existingSession = db.prepare(`
    SELECT * FROM operator_sessions WHERE window_id = ? AND ended_at IS NULL
  `).get(window_id);
  if (existingSession) {
    return res.status(400).json({ error: 'La ventanilla ya está ocupada por otro operador' });
  }

  const operatorSession = db.prepare(`
    SELECT * FROM operator_sessions WHERE operator_id = ? AND ended_at IS NULL
  `).get(req.user.id);
  if (operatorSession) {
    return res.status(400).json({ error: 'El operador ya tiene una sesión activa' });
  }

  const service = db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(service_id);
  if (!service) {
    return res.status(404).json({ error: 'Servicio no encontrado o inactivo' });
  }

  const session = db.prepare(`
    INSERT INTO operator_sessions (operator_id, window_id, service_id)
    VALUES (?, ?, ?)
    RETURNING id, operator_id, window_id, service_id, started_at
  `).run(req.user.id, window_id, service_id);

  const sessionData = {
    id: session.lastInsertRowid,
    operator_id: req.user.id,
    window_id,
    window_number: window.number,
    service_id,
    service_name: service.name,
    started_at: new Date().toISOString()
  };

  broadcast({
    event: 'operator_session_started',
    data: sessionData
  }, (meta) => meta.channel === 'operator' || meta.channel === 'display');

  res.status(201).json(sessionData);
});

app.delete('/operator/sessions', authenticateToken, requireRole('operador'), (req, res) => {
  const session = db.prepare(`
    SELECT * FROM operator_sessions WHERE operator_id = ? AND ended_at IS NULL
  `).get(req.user.id);

  if (!session) {
    return res.status(404).json({ error: 'No hay sesión activa para este operador' });
  }

  db.prepare(`
    UPDATE operator_sessions SET ended_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(session.id);

  broadcast({
    event: 'operator_session_ended',
    data: {
      operator_id: req.user.id,
      window_id: session.window_id,
      service_id: session.service_id
    }
  }, (meta) => meta.channel === 'operator' || meta.channel === 'display');

  res.json({ message: 'Sesión finalizada correctamente' });
});

app.get('/operator/sessions/current', authenticateToken, requireRole('operador'), (req, res) => {
  const session = db.prepare(`
    SELECT os.*, w.number as window_number, s.name as service_name, s.prefix as service_prefix
    FROM operator_sessions os
    JOIN windows w ON os.window_id = w.id
    JOIN services s ON os.service_id = s.id
    WHERE os.operator_id = ? AND os.ended_at IS NULL
  `).get(req.user.id);

  if (!session) {
    return res.status(404).json({ error: 'No hay sesión activa' });
  }

  res.json(session);
});

app.get('/queues/:service_id', authenticateToken, requireRole('operador', 'admin'), (req, res) => {
  const { service_id } = req.params;

  const service = db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(service_id);
  if (!service) {
    return res.status(404).json({ error: 'Servicio no encontrado' });
  }

  const queue = db.prepare(`
    SELECT t.*, s.name as service_name, s.prefix as service_prefix,
           ROW_NUMBER() OVER (ORDER BY t.created_at) as position
    FROM tickets t
    JOIN services s ON t.service_id = s.id
    WHERE t.service_id = ? AND t.status = 'waiting'
    ORDER BY t.created_at
  `).all(service_id);

  res.json({ service, queue });
});

app.post('/tickets/call-next', authenticateToken, requireRole('operador'), (req, res) => {
  const { service_id } = req.body;

  if (!service_id) {
    return res.status(400).json({ error: 'service_id requerido' });
  }

  const session = db.prepare(`
    SELECT * FROM operator_sessions WHERE operator_id = ? AND ended_at IS NULL
  `).get(req.user.id);

  if (!session) {
    return res.status(400).json({ error: 'El operador no tiene una sesión activa' });
  }

  if (session.service_id != service_id) {
    return res.status(400).json({ error: 'El operador no está atendiendo este trámite en su sesión actual' });
  }

  const nextTicket = db.prepare(`
    SELECT * FROM tickets
    WHERE service_id = ? AND status = 'waiting'
    ORDER BY created_at
    LIMIT 1
  `).get(service_id);

  if (!nextTicket) {
    return res.status(404).json({ error: 'No hay tickets en espera para este trámite' });
  }

  db.prepare(`
    UPDATE tickets
    SET status = 'called', operator_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `).run(req.user.id, nextTicket.token);

  const updated = getTicketDetailsByToken(nextTicket.token);
  emitTicketEvent('ticket_called', updated);

  res.json(updated);
});

app.put('/tickets/:token/start', authenticateToken, requireRole('operador'), (req, res) => {
  const { token } = req.params;

  const ticket = db.prepare('SELECT * FROM tickets WHERE token = ?').get(token);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }

  if (ticket.operator_id !== req.user.id) {
    return res.status(403).json({ error: 'Este ticket no está asignado a usted' });
  }

  if (ticket.status !== 'called' && ticket.status !== 'transferred') {
    return res.status(400).json({ error: 'Solo se puede iniciar un ticket llamado o transferido a usted' });
  }

  db.prepare(`
    UPDATE tickets
    SET status = 'in_service', updated_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `).run(token);

  const updated = getTicketDetailsByToken(token);
  emitTicketEvent('ticket_updated', updated);

  res.json(updated);
});

app.put('/tickets/:token/complete', authenticateToken, requireRole('operador'), (req, res) => {
  const { token } = req.params;

  const ticket = db.prepare('SELECT * FROM tickets WHERE token = ?').get(token);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }

  if (ticket.operator_id !== req.user.id) {
    return res.status(403).json({ error: 'Este ticket no está asignado a usted' });
  }

  if (ticket.status !== 'in_service') {
    return res.status(400).json({ error: 'Solo se puede completar un ticket en atención' });
  }

  db.prepare(`
    UPDATE tickets
    SET status = 'completed', updated_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `).run(token);

  const updated = getTicketDetailsByToken(token);
  emitTicketEvent('ticket_updated', updated);

  res.json(updated);
});

app.put('/tickets/:token/cancel', authenticateToken, requireRole('operador', 'admin'), (req, res) => {
  const { token } = req.params;

  const ticket = db.prepare('SELECT * FROM tickets WHERE token = ?').get(token);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }

  if (ticket.status === 'completed' || ticket.status === 'cancelled') {
    return res.status(400).json({ error: 'No se puede cancelar un ticket ya finalizado' });
  }

  db.prepare(`
    UPDATE tickets
    SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `).run(token);

  const updated = getTicketDetailsByToken(token);
  emitTicketEvent('ticket_updated', updated);

  res.json(updated);
});

server.listen(PORT, () => {
  console.log(`Servidor HTTP y WebSocket corriendo en http://localhost:${PORT}`);
});