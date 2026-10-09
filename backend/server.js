import http from 'http';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabase, initDatabase } from './database.js';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID, randomBytes } from 'crypto';

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'turnos-secret-key-2024';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

const app = express();
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let db = null;

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
}

async function getTicketDetailsByToken(token) {
  return await db.get(`
    SELECT t.*, s.name as service_name, s.prefix as service_prefix,
           u.username as operator_username, w.number as window_number
    FROM tickets t
    JOIN services s ON t.service_id = s.id
    LEFT JOIN users u ON t.operator_id = u.id
    LEFT JOIN operator_sessions os ON os.operator_id = t.operator_id AND os.ended_at IS NULL
    LEFT JOIN windows w ON os.window_id = w.id
    WHERE t.token = ?
  `, [token]);
}

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const user = await db.get(`
    SELECT u.id, u.username, u.password_hash, r.name as role
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.username = ?
  `, [username]);

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

app.get('/auth/me', authenticateToken, async (req, res) => {
  const user = await db.get(`
    SELECT u.id, u.username, r.name as role
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = ?
  `, [req.user.id]);

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  res.json(user);
});

app.get('/services', authenticateToken, async (req, res) => {
  const services = await db.all('SELECT * FROM services WHERE active = 1');
  res.json(services);
});

app.get('/windows', authenticateToken, async (req, res) => {
  const windows = await db.all('SELECT * FROM windows WHERE active = 1');
  res.json(windows);
});

const generateTicketNumber = async (serviceId, date) => {
  const result = await db.run(`
    INSERT INTO ticket_sequences (service_id, date, current_number)
    VALUES (?, ?, 1)
    ON CONFLICT(service_id, date) DO UPDATE SET current_number = current_number + 1
    RETURNING current_number
  `, [serviceId, date]);
  return result.current_number;
};

app.post('/tickets', async (req, res) => {
  const { service_id } = req.body;

  if (!service_id) {
    return res.status(400).json({ error: 'service_id requerido' });
  }

  const service = await db.get('SELECT * FROM services WHERE id = ? AND active = 1', [service_id]);
  if (!service) {
    return res.status(404).json({ error: 'Servicio no encontrado o inactivo' });
  }

  const today = new Date().toISOString().split('T')[0];
  const number = await generateTicketNumber(service_id, today);
  const ticketNumber = `${service.prefix}-${String(number).padStart(3, '0')}`;
  const token = randomUUID();

  await db.run(`
    INSERT INTO tickets (ticket_number, service_id, token, status)
    VALUES (?, ?, ?, 'waiting')
  `, [ticketNumber, service_id, token]);

  const fullTicket = await getTicketDetailsByToken(token);
  const position = await db.get(`
    SELECT COUNT(*) as count
    FROM tickets
    WHERE service_id = ? AND status = 'waiting' AND created_at <= ?
  `, [service_id, fullTicket.created_at]);

  const payload = { ...fullTicket, position: position.count };
  emitTicketEvent('ticket_created', payload);

  res.status(201).json({
    id: fullTicket.id,
    ticket_number: ticketNumber,
    service_id,
    token,
    status: 'waiting',
    position: position.count,
    created_at: fullTicket.created_at
  });
});

app.get('/tickets/:token', async (req, res) => {
  const { token } = req.params;

  const ticket = await getTicketDetailsByToken(token);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }

  let position = null;
  if (ticket.status === 'waiting') {
    const pos = await db.get(`
      SELECT COUNT(*) as count
      FROM tickets
      WHERE service_id = ? AND status = 'waiting' AND created_at <= ?
    `, [ticket.service_id, ticket.created_at]);
    position = pos.count;
  }

  res.json({ ...ticket, position });
});

app.get('/tickets', authenticateToken, requireRole('operador', 'admin'), async (req, res) => {
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

  const tickets = await db.all(query, params);
  res.json(tickets);
});

app.put('/tickets/:token/status', authenticateToken, requireRole('operador', 'admin'), async (req, res) => {
  const { token } = req.params;
  const { status } = req.body;

  const validStatuses = ['waiting', 'called', 'in_service', 'completed', 'cancelled', 'transferred'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  const ticket = await db.get('SELECT * FROM tickets WHERE token = ?', [token]);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }

  await db.run(`
    UPDATE tickets
    SET status = ?, operator_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `, [status, req.user.id, token]);

  const updated = await getTicketDetailsByToken(token);
  emitTicketEvent('ticket_updated', updated);

  res.json(updated);
});

app.put('/tickets/:token/transfer', authenticateToken, requireRole('operador'), async (req, res) => {
  const { token } = req.params;
  const { target_operator_id } = req.body;

  if (!target_operator_id) {
    return res.status(400).json({ error: 'target_operator_id requerido' });
  }

  const targetOperator = await db.get(`
    SELECT u.id, u.username, r.name as role
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = ? AND r.name = 'operador'
  `, [target_operator_id]);

  if (!targetOperator) {
    return res.status(404).json({ error: 'Operador destino no encontrado' });
  }

  const targetSession = await db.get(`
    SELECT os.*, w.number as window_number
    FROM operator_sessions os
    JOIN windows w ON os.window_id = w.id
    WHERE os.operator_id = ? AND os.ended_at IS NULL
  `, [target_operator_id]);

  if (!targetSession) {
    return res.status(400).json({ error: 'El operador destino no tiene una sesión activa' });
  }

  const ticket = await db.get('SELECT * FROM tickets WHERE token = ?', [token]);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }

  if (ticket.status !== 'in_service' && ticket.status !== 'called') {
    return res.status(400).json({ error: 'Solo se pueden transferir tickets en atención o llamados' });
  }

  if (req.user.role === 'operador' && ticket.operator_id !== req.user.id) {
    return res.status(403).json({ error: 'Solo puede transferir tickets asignados a usted' });
  }

  const sourceSession = await db.get(`
    SELECT window_id FROM operator_sessions WHERE operator_id = ? AND ended_at IS NULL
  `, [req.user.id]);

  if (sourceSession && sourceSession.window_id === targetSession.window_id) {
    return res.status(400).json({ error: 'La transferencia debe dirigirse a otra ventanilla' });
  }

  await db.run(`
    UPDATE tickets
    SET status = 'transferred', operator_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `, [target_operator_id, token]);

  const updated = await getTicketDetailsByToken(token);
  const transferPayload = {
    ...updated,
    target_operator_id,
    target_operator_username: targetOperator.username,
    window_number: targetSession.window_number
  };

  emitTicketEvent('ticket_transferred', transferPayload);

  res.json(transferPayload);
});

app.post('/operator/sessions', authenticateToken, requireRole('operador'), async (req, res) => {
  const { window_id, service_id } = req.body;

  if (!window_id || !service_id) {
    return res.status(400).json({ error: 'window_id y service_id requeridos' });
  }

  const window = await db.get('SELECT * FROM windows WHERE id = ? AND active = 1', [window_id]);
  if (!window) {
    return res.status(404).json({ error: 'Ventanilla no encontrada o inactiva' });
  }

  const existingSession = await db.get(`
    SELECT * FROM operator_sessions WHERE window_id = ? AND ended_at IS NULL
  `, [window_id]);
  if (existingSession) {
    return res.status(400).json({ error: 'La ventanilla ya está ocupada por otro operador' });
  }

  const operatorSession = await db.get(`
    SELECT * FROM operator_sessions WHERE operator_id = ? AND ended_at IS NULL
  `, [req.user.id]);
  if (operatorSession) {
    return res.status(400).json({ error: 'El operador ya tiene una sesión activa' });
  }

  const service = await db.get('SELECT * FROM services WHERE id = ? AND active = 1', [service_id]);
  if (!service) {
    return res.status(404).json({ error: 'Servicio no encontrado o inactivo' });
  }

  const result = await db.run(`
    INSERT INTO operator_sessions (operator_id, window_id, service_id)
    VALUES (?, ?, ?)
  `, [req.user.id, window_id, service_id]);

  const sessionData = {
    id: result.lastID,
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

app.delete('/operator/sessions', authenticateToken, requireRole('operador'), async (req, res) => {
  const session = await db.get(`
    SELECT * FROM operator_sessions WHERE operator_id = ? AND ended_at IS NULL
  `, [req.user.id]);

  if (!session) {
    return res.status(404).json({ error: 'No hay sesión activa para este operador' });
  }

  await db.run(`
    UPDATE operator_sessions SET ended_at = CURRENT_TIMESTAMP WHERE id = ?
  `, [session.id]);

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

app.get('/operator/sessions/current', authenticateToken, requireRole('operador'), async (req, res) => {
  const session = await db.get(`
    SELECT os.*, w.number as window_number, s.name as service_name, s.prefix as service_prefix
    FROM operator_sessions os
    JOIN windows w ON os.window_id = w.id
    JOIN services s ON os.service_id = s.id
    WHERE os.operator_id = ? AND os.ended_at IS NULL
  `, [req.user.id]);

  if (!session) {
    return res.status(404).json({ error: 'No hay sesión activa' });
  }

  res.json(session);
});

app.get('/queues/:service_id', authenticateToken, requireRole('operador', 'admin'), async (req, res) => {
  const { service_id } = req.params;

  const service = await db.get('SELECT * FROM services WHERE id = ? AND active = 1', [service_id]);
  if (!service) {
    return res.status(404).json({ error: 'Servicio no encontrado' });
  }

  const queue = await db.all(`
    SELECT t.*, s.name as service_name, s.prefix as service_prefix,
           ROW_NUMBER() OVER (ORDER BY t.created_at) as position
    FROM tickets t
    JOIN services s ON t.service_id = s.id
    WHERE t.service_id = ? AND t.status = 'waiting'
    ORDER BY t.created_at
  `, [service_id]);

  res.json({ service, queue });
});

app.post('/tickets/call-next', authenticateToken, requireRole('operador'), async (req, res) => {
  const { service_id } = req.body;

  if (!service_id) {
    return res.status(400).json({ error: 'service_id requerido' });
  }

  const session = await db.get(`
    SELECT * FROM operator_sessions WHERE operator_id = ? AND ended_at IS NULL
  `, [req.user.id]);

  if (!session) {
    return res.status(400).json({ error: 'El operador no tiene una sesión activa' });
  }

  if (session.service_id != service_id) {
    return res.status(400).json({ error: 'El operador no está atendiendo este trámite en su sesión actual' });
  }

  const nextTicket = await db.get(`
    SELECT * FROM tickets
    WHERE service_id = ? AND status = 'waiting'
    ORDER BY created_at
    LIMIT 1
  `, [service_id]);

  if (!nextTicket) {
    return res.status(404).json({ error: 'No hay tickets en espera para este trámite' });
  }

  await db.run(`
    UPDATE tickets
    SET status = 'called', operator_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `, [req.user.id, nextTicket.token]);

  const updated = await getTicketDetailsByToken(nextTicket.token);
  emitTicketEvent('ticket_called', updated);

  res.json(updated);
});

app.put('/tickets/:token/start', authenticateToken, requireRole('operador'), async (req, res) => {
  const { token } = req.params;

  const ticket = await db.get('SELECT * FROM tickets WHERE token = ?', [token]);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }

  if (ticket.operator_id !== req.user.id) {
    return res.status(403).json({ error: 'Este ticket no está asignado a usted' });
  }

  if (ticket.status !== 'called' && ticket.status !== 'transferred') {
    return res.status(400).json({ error: 'Solo se puede iniciar un ticket llamado o transferido a usted' });
  }

  await db.run(`
    UPDATE tickets
    SET status = 'in_service', updated_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `, [token]);

  const updated = await getTicketDetailsByToken(token);
  emitTicketEvent('ticket_updated', updated);

  res.json(updated);
});

app.put('/tickets/:token/complete', authenticateToken, requireRole('operador'), async (req, res) => {
  const { token } = req.params;

  const ticket = await db.get('SELECT * FROM tickets WHERE token = ?', [token]);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }

  if (ticket.operator_id !== req.user.id) {
    return res.status(403).json({ error: 'Este ticket no está asignado a usted' });
  }

  if (ticket.status !== 'in_service') {
    return res.status(400).json({ error: 'Solo se puede completar un ticket en atención' });
  }

  await db.run(`
    UPDATE tickets
    SET status = 'completed', updated_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `, [token]);

  const updated = await getTicketDetailsByToken(token);
  emitTicketEvent('ticket_updated', updated);

  res.json(updated);
});

app.put('/tickets/:token/cancel', authenticateToken, requireRole('operador', 'admin'), async (req, res) => {
  const { token } = req.params;

  const ticket = await db.get('SELECT * FROM tickets WHERE token = ?', [token]);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }

  if (ticket.status === 'completed' || ticket.status === 'cancelled') {
    return res.status(400).json({ error: 'No se puede cancelar un ticket ya finalizado' });
  }

  await db.run(`
    UPDATE tickets
    SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `, [token]);

  const updated = await getTicketDetailsByToken(token);
  emitTicketEvent('ticket_updated', updated);

  res.json(updated);
});

async function startServer() {
  try {
    db = await initDatabase();
    console.log('Base de datos conectada');

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Servidor HTTP y WebSocket corriendo en puerto ${PORT}`);
    });
  } catch (err) {
    console.error('Error al iniciar servidor:', err);
    process.exit(1);
  }
}

startServer();