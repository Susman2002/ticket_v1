# AGENTS.md - Registro de Fases del Sistema de Turnos

## Fase 1: Base del Backend (COMPLETADA)
**Archivos creados:**
- `backend/package.json` - Dependencias: express, ws, better-sqlite3, bcryptjs, cors, uuid
- `backend/db.js` - Inicializador de SQLite con modo WAL

**Tablas creadas:**
- `roles` - admin, operador
- `users` - username, password_hash, role_id
- `services` - name, prefix (TR1, TR2, TR3), active
- `ticket_sequences` - service_id, date, current_number (PK compuesta para incremento atómico)
- `tickets` - ticket_number, service_id, token, status, operator_id, timestamps
- `windows` - number, active (1, 2, 3 iniciales)
- `operator_sessions` - operator_id, window_id, service_id, started_at, ended_at

**Semillas insertadas:**
- Roles: admin, operador
- Servicios: Trámite 1 (TR1), Trámite 2 (TR2), Trámite 3 (TR3)
- Ventanillas: 1, 2, 3
- Usuario: admin / admin123 (bcrypt hash)

---

## Fase 2: Servidor HTTP y Autenticación (COMPLETADA)
**Archivos creados:**
- `backend/server.js` - Servidor Express con CORS, JWT auth, middlewares

**Endpoints implementados:**
- `POST /auth/login` - Login con username/password, retorna JWT
- `GET /auth/me` - Obtener usuario autenticado (protegido)
- `GET /services` - Listar servicios activos (protegido)
- `GET /windows` - Listar ventanillas activas (protegido)

**Middlewares:**
- `authenticateToken` - Verifica JWT válido
- `requireRole(...roles)` - Autorización por rol (admin, operador)

**Pruebas manuales:**
```bash
# Login
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'

# Obtener usuario (con token)
curl http://localhost:3000/auth/me -H "Authorization: Bearer <token>"

# Servicios
curl http://localhost:3000/services -H "Authorization: Bearer <token>"

# Ventanillas
curl http://localhost:3000/windows -H "Authorization: Bearer <token>"
```

---

## Fase 3: API de Tickets (COMPLETADA)
**Endpoints implementados en `backend/server.js`:**
- `POST /tickets` - Emisión pública de ticket (sin auth), body: `{service_id}`, retorna `{ticket_number, token, status, position}`
- `GET /tickets/:token` - Consulta pública por token, incluye posición en cola si está `waiting`
- `GET /tickets` - Lista tickets (protegido operador/admin), filtros: `service_id`, `status`, `limit`, `offset`
- `PUT /tickets/:token/status` - Cambio de estado (protegido), body: `{status}` - estados: waiting, called, in_service, completed, cancelled, transferred
- `PUT /tickets/:token/transfer` - Transferir a otro operador (protegido), body: `{target_operator_id}`

**Numeración atómica:** Transacción `BEGIN IMMEDIATE` via `better-sqlite3` en tabla `ticket_sequences` (PK compuesta service_id + date). Formato: `TR1-001`, `TR2-001`, `TR3-001`. Contador no retrocede al cancelar.

**Estados válidos:** waiting, called, in_service, completed, cancelled, transferred (sin borrado físico).

**Pruebas manuales:**
```powershell
# Emitir ticket público
$ticket = Invoke-RestMethod -Uri http://localhost:3000/tickets -Method Post -ContentType "application/json" -Body '{"service_id":1}'

# Consultar por token (público)
Invoke-RestMethod -Uri http://localhost:3000/tickets/<token>

# Login operador
$login = Invoke-RestMethod -Uri http://localhost:3000/auth/login -Method Post -ContentType "application/json" -Body '{"username":"admin","password":"admin123"}'
$token = $login.token

# Listar tickets (protegido)
Invoke-RestMethod -Uri http://localhost:3000/tickets -Headers @{Authorization = "Bearer $token"}

# Cambiar estado
Invoke-RestMethod -Uri http://localhost:3000/tickets/<token>/status -Method Put -Headers @{Authorization = "Bearer $token"} -ContentType "application/json" -Body '{"status":"called"}'

# Transferir
Invoke-RestMethod -Uri http://localhost:3000/tickets/<token>/transfer -Method Put -Headers @{Authorization = "Bearer $token"} -ContentType "application/json" -Body '{"target_operator_id":3}'
```

---

## Fase 4: Operación de Turnos (COMPLETADA)
**Endpoints implementados en `backend/server.js`:**
- `POST /operator/sessions` - Iniciar sesión operador (requiere window_id, service_id), valida ventanilla libre
- `DELETE /operator/sessions` - Finalizar sesión operador
- `GET /operator/sessions/current` - Obtener sesión activa del operador
- `GET /queues/:service_id` - Cola de espera por trámite con posición
- `POST /tickets/call-next` - Llamar siguiente ticket del trámite (operador debe tener sesión activa en ese trámite)
- `PUT /tickets/:token/start` - Iniciar atención (in_service), solo si ticket está `called` y asignado al operador
- `PUT /tickets/:token/complete` - Completar atención, solo si está `in_service` y asignado al operador
- `PUT /tickets/:token/cancel` - Cancelar ticket (operador/admin), no permite cancelar completed/cancelled

**Reglas de negocio:**
- Operador selecciona ventanilla y trámite al iniciar sesión
- Una ventanilla solo puede ser ocupada por un operador a la vez
- Llamar siguiente solo permite el trámite de la sesión activa
- Transferencia (Fase 3) requiere operador destino con sesión activa en otra ventanilla

**Pruebas manuales:**
```powershell
# Login operador
$login = Invoke-RestMethod -Uri http://localhost:3000/auth/login -Method Post -ContentType "application/json" -Body '{"username":"operador1","password":"operador123"}'
$token = $login.token

# Iniciar sesión (ventanilla 1, trámite 1)
Invoke-RestMethod -Uri http://localhost:3000/operator/sessions -Method Post -Headers @{Authorization = "Bearer $token"} -ContentType "application/json" -Body '{"window_id":1,"service_id":1}'

# Ver cola de trámite 1
Invoke-RestMethod -Uri http://localhost:3000/queues/1 -Headers @{Authorization = "Bearer $token"}

# Llamar siguiente
Invoke-RestMethod -Uri http://localhost:3000/tickets/call-next -Method Post -Headers @{Authorization = "Bearer $token"} -ContentType "application/json" -Body '{"service_id":1}'

# Iniciar atención
Invoke-RestMethod -Uri http://localhost:3000/tickets/<token>/start -Method Put -Headers @{Authorization = "Bearer $token"}

# Completar atención
Invoke-RestMethod -Uri http://localhost:3000/tickets/<token>/complete -Method Put -Headers @{Authorization = "Bearer $token"}

# Cancelar ticket
Invoke-RestMethod -Uri http://localhost:3000/tickets/<token>/cancel -Method Put -Headers @{Authorization = "Bearer $token"}

# Finalizar sesión
Invoke-RestMethod -Uri http://localhost:3000/operator/sessions -Method Delete -Headers @{Authorization = "Bearer $token"}
```

---

## Fase 5: WebSocket y Eventos (COMPLETADA)
**Integración en `backend/server.js`:**
- Servidor WebSocket `ws` integrado con el servidor HTTP Express en el mismo puerto (3000).
- Conexión `ws://localhost:3000`; canales públicos `display` y `ticket`, canal `operator` autenticado con JWT.
- Mensajes JSON con forma `{ event, data }`.
- El canal `ticket` puede recibir el token en query `ticketToken` o suscribirse mediante `{ "action": "subscribe_ticket", "ticketToken": "..." }`.
- Canales suscribibles con `{ "action": "subscribe_display" }` y `{ "action": "subscribe_operator", "token": "JWT" }`.
- Heartbeat de aplicación: enviar `{ "action": "ping" }`, respuesta `{ "event": "pong" }`.

**Eventos emitidos:**
- `ticket_created` - ticket nuevo; se envía a operadores y al canal móvil que sigue ese ticket.
- `ticket_called` - ticket llamado; se envía a operadores, display y al canal móvil correspondiente.
- `ticket_updated` - transición de estado (inicio, completado, cancelación); se envía a operadores y móvil correspondiente.
- `ticket_transferred` - transferencia directa a operador con sesión activa en otra ventanilla; se envía a operadores, display y móvil.
- `operator_session_started`, `operator_session_ended` - inicio/cierre de sesión, emitidos a operadores y display.
- La pantalla display no recibe tokens secretos de seguimiento.

**Reglas:**
- Transferir requiere que el receptor sea operador con sesión/ventanilla activa y que sea otra ventanilla.
- El evento de transferencia incluye el número de destino; el receptor obtiene ticket con estado `transferred` y puede iniciar atención.

**Prueba manual:** abrir una consola WebSocket en navegador o cliente compatible y conectarse a `ws://localhost:3000?channel=display`; para operador usar `ws://localhost:3000?channel=operator&token=<JWT>`. Emitir/llamar ticket con la API y verificar eventos. Para móvil conectar `ws://localhost:3000?channel=ticket&ticketToken=<ticket-token>`.

---

## Fase 6: Base del Frontend Angular (COMPLETADA)
**Archivos creados en `frontend/`:**
- Proyecto Angular 18 standalone con Tailwind CSS configurado
- `src/app/core/` - Servicios compartidos: `ApiService`, `AuthService`, `WebSocketService`, interceptores, guards
- `src/app/features/` - Módulos por funcionalidad:
  - `auth/login` - Pantalla de login con validación
  - `kiosk` - Kiosco público con 3 botones de trámite, emisión de ticket y QR
  - `mobile/ticket-tracking` - Seguimiento móvil por token con WebSocket y alerta sonora
  - `display` - Pantalla de sala con turnos llamados, alerta sonora y QR general
  - `operator/dashboard` - Dashboard operador: seleccionar ventanilla/trámite, llamar siguiente, ver cola
  - `operator/panel` - Panel completo de atención: iniciar/completar/cancelar/transferir
  - `admin/dashboard` - Panel admin con accesos directos
  - `admin/users` - Gestión de usuarios (CRUD)
  - `admin/services` - Gestión de servicios/trámites (CRUD)
  - `admin/windows` - Gestión de ventanillas (CRUD)
- Rutas configuradas con lazy loading y guards de autenticación/rol
- Build verificado exitosamente

**Pruebas manuales:**
```bash
cd frontend
npm run start
# Abrir http://localhost:4200/kiosk - Kiosco público
# Abrir http://localhost:4200/display - Pantalla de sala
# Abrir http://localhost:4200/login - Login (admin/admin123 u operador1/operador123)
# Abrir http://localhost:4200/ticket/<token> - Seguimiento móvil
```

---

## Fase 7: Kiosco Público / (COMPLETADA - Implementada en Fase 6)
**Componente:** `frontend/src/app/features/kiosk/kiosk.component.ts`
- 3 botones de trámite (carga dinámica desde API)
- Emisión y muestra de ticket con número (ej. TR1-001)
- Navegación a `/ticket/:token` para seguimiento móvil (QR funcional)

---

## Fase 8: Seguimiento Móvil /ticket/:token (COMPLETADA - Implementada en Fase 6)
**Componente:** `frontend/src/app/features/mobile/ticket-tracking.component.ts`
- Estado del turno (esperando, llamado, en atención, completado, cancelado, transferido)
- Posición en cola en tiempo real
- Alerta sonora y visual al ser llamado/transferido
- WebSocket para actualizaciones en vivo

---

## Fase 9: Pantalla Sala /display (COMPLETADA - Implementada en Fase 6)
**Componente:** `frontend/src/app/features/display/display.component.ts`
- Sin login, acceso directo
- Lista de últimos 20 turnos llamados con destino (ventanilla)
- Alerta sonora automática al recibir `ticket_called` / `ticket_transferred`
- QR general para kiosco público
- Tiempo real vía WebSocket canal `display`

---

## Fase 10: Paneles Internos (COMPLETADA - Implementada en Fase 6)
**Operador:**
- `operator/dashboard` - Seleccionar ventanilla/trámite, iniciar sesión, llamar siguiente, ver cola
- `operator/panel` - Panel completo: iniciar/completar/cancelar/transferir turno activo, ver cola e historial

**Admin:**
- `admin/dashboard` - Accesos directos a gestión
- `admin/users` - CRUD usuarios (crear, eliminar, roles)
- `admin/services` - CRUD servicios/trámites (crear, editar, activar/desactivar, prefijos)
- `admin/windows` - CRUD ventanillas (crear, editar, activar/desactivar, numeración)