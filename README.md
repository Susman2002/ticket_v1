# Sistema de Gestión de Turnos y Kiosko Móvil con QR Dinámico

Sistema ligero y autónomo para gestión de colas y emisión de turnos en red local sin dependencia de internet, diseñado bajo principios de minimalismo operativo, consistencia transaccional y comunicación bidireccional reactiva.

---

## 1. Visión General de la Arquitectura

El sistema se compone de dos aplicaciones desacopladas comunicadas mediante HTTP REST y WebSockets sobre TCP local:

```
[ Ciudadano / Móvil ]       [ Pantalla Sala / TV ]       [ Operador / Admin ]
   /kiosk/:qr_token                 /display                  /operator, /admin
          │                             │                             │
          │ HTTP (POST Ticket)          │ WebSocket (Sub Display)     │ HTTP + WebSocket
          ▼                             ▼                             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Node.js HTTP & WS Server                          │
│                                 (Puerto 3000)                                │
│                                                                              │
│  ┌───────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐  │
│  │   Auth / JWT Layer    │  │  QR Rotation Engine  │  │   Event Broker    │  │
│  └───────────────────────┘  └──────────────────────┘  └───────────────────┘  │
│                                      │                                       │
│                                      ▼                                       │
│                         better-sqlite3 Engine (WAL)                          │
│                                (turnos.db)                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Base de Datos y Modelo de Concurrencia (SQLite WAL)

### Herramienta: `better-sqlite3`
Se seleccionó `better-sqlite3` en lugar de drivers asíncronos tradicionales (`sqlite3` con callbacks) por los siguientes motivos:
1. **Ejecución síncrona:** Elimina sobrecarga del event loop para operaciones atómicas de disco.
2. **Modo WAL (`PRAGMA journal_mode = WAL`):** Permite lecturas concurrentes sin bloquear escrituras y viceversa.
3. **Transacciones `BEGIN IMMEDIATE` nativas:** Garantiza exclusión mutua a nivel de proceso antes de escribir en disco, evitando condiciones de carrera (`SQLITE_BUSY`).

### Control de Concurrencia y Numeración Correlativa
La generación de turnos diarios (`TR1-001`, `TR2-001`, etc.) se ejecuta dentro de una transacción atómica:

```sql
INSERT INTO ticket_sequences (service_id, date, current_number)
VALUES (?, ?, 1)
ON CONFLICT(service_id, date) DO UPDATE SET current_number = current_number + 1
RETURNING current_number;
```

**Reglas de negocio garantizadas:**
- **No colisión:** Dos peticiones concurrentes en el mismo milisegundo obtienen correlativos consecutivos estrictos.
- **Sin retroceso:** Tickets cancelados o transferidos jamás decrementan el contador diario.
- **Persistencia por estados:** Registros nunca se borran físicamente en operación normal; transitan por: `waiting` → `called` → `in_service` → `completed` | `cancelled` | `transferred`.

---

## 3. Arquitectura del Backend (Node.js + Express + WS)

### Componentes y Dependencias Clave

| Módulo / Librería | Función en el Sistema | Justificación |
|---|---|---|
| `express` (v4) | Servidor HTTP REST | Manejo directo de endpoints, middlewares de autenticación y JSON parsing. |
| `ws` (v8) | Servidor WebSocket nativo | Ligero, sin abstracciones innecesarias (comparado con Socket.io), montado en el mismo puerto HTTP. |
| `jsonwebtoken` | Autenticación con JWT | Sesiones sin estado para roles `operador` y `admin` con validez de 8 horas. |
| `bcryptjs` | Cifrado unidireccional | Hasheo seguro de contraseñas de usuarios. |
| `crypto` (Nativo) | Generación de UUIDs y tokens criptográficos | Creación de tokens de tickets y tokens rotativos de sala. |

### Mecanismo de QR Rotativo de Sala (Anti-Fraude de Geolocalización)
Para garantizar que solo usuarios físicamente presentes en la sala soliciten turnos:
1. **Generación en memoria:** Un temporizador (`setInterval`) genera cada 90 segundos un token de 16 caracteres hexadecimales (`randomBytes(8).toString('hex')`).
2. **Grace Period (Período de Gracia):** Se mantiene el token actual y el del ciclo previo inmediato (vigencia total de hasta 180s para el token saliente) para no penalizar a usuarios en proceso de selección.
3. **Emisión de Evento:** Cada rotación dispara `QR_ROTATED` por WebSocket a clientes con canal `display`.
4. **Validación en Endpoint:** `POST /tickets` exige el campo `qr_token`. Si no es válido o expiró, retorna `403 Forbidden`.

---

## 4. Arquitectura Dirigida por Eventos (Event-Driven WebSocket)

El servidor WebSocket clasifica las conexiones en tres canales lógicos:

```
                  ┌────────────── WebSocket Broker ──────────────┐
                  │                                              │
                  ├─────────────────┬────────────────────────────┤
                  ▼                 ▼                            ▼
            Canal: display    Canal: operator              Canal: ticket
            (Público, TV)     (Privado, JWT)               (Público, por Token)
```

### Canales y Política de Privacidad

- **`display`:** Recibe `ticket_called`, `ticket_transferred` y `QR_ROTATED`. Los datos excluyen tokens privados de seguimiento para evitar suplantación.
- **`operator`:** Requiere autenticación JWT. Recibe todos los eventos de cola, creación, atención y cambios de sesión de ventanillas.
- **`ticket`:** Suscrito mediante `ticketToken`. Solo recibe eventos dirigidos exclusivamente al ticket del usuario móvil.

### Catálogo de Eventos

| Evento | Origen | Destinatarios | Payload Principal |
|---|---|---|---|
| `QR_ROTATED` | Timer (90s) | `display` | `token`, `expiresIn`, `rotatedAt` |
| `ticket_created` | `POST /tickets` | `operator`, `ticket` | Datos del ticket, posición inicial |
| `ticket_called` | `POST /tickets/call-next` | `display`, `operator`, `ticket` | Número, trámite, ventanilla destino |
| `ticket_updated` | Acciones de atención | `operator`, `ticket` | Nuevo estado (`in_service`, `completed`, `cancelled`) |
| `ticket_transferred` | `PUT /tickets/:token/transfer` | `display`, `operator`, `ticket` | Nuevo operador y nueva ventanilla |
| `operator_session_started` | `POST /operator/sessions` | `display`, `operator` | Operador, ventanilla y trámite activo |
| `operator_session_ended` | `DELETE /operator/sessions` | `display`, `operator` | Cierre de puesto |

---

## 5. Arquitectura del Frontend (Angular 18 Standalone + Tailwind CSS)

### Herramientas y Patrones

- **Angular 18 Standalone Components:** Se prescindió de `NgModule` para reducir sobrecarga y permitir Lazy Loading granular por ruta.
- **Tailwind CSS:** Diseño responsivo con arquitectura de utilidades sin CSS personalizado pesado.
- **Signals y RxJS:** Estado reactivo en servicios de autenticación y flujos HTTP/WS.
- **HTML5 Canvas / `qrcode`:** Renderizado nativo del QR en la vista `/display` sin peticiones a servicios externos.
- **Web Audio API sintetizada:** Alertas sonoras directas con WAVs codificados en Base64 para operar offline sin recursos multimedia externos.

### Módulos y Rutas Implementadas

| Ruta | Rol / Acceso | Funcionalidad |
|---|---|---|
| `/display` | Público | Pantalla de TV: muestra QR rotativo con cuenta regresiva de 90s y listado de últimos llamados en tiempo real. |
| `/kiosk` | Público | Bloqueado si se entra directamente sin token de sala. |
| `/kiosk/:token` | Público (Con QR) | Kiosko de auto-atención para emitir tickets del trámite seleccionado. Valida token contra el backend. |
| `/ticket/:token` | Público | Vista móvil del ciudadano con posición en cola, alerta sonora y actualización reactiva al ser llamado. |
| `/login` | Público | Autenticación con credenciales para Admin y Operadores. |
| `/operator` | `operador`, `admin` | Panel de puesto: apertura de sesión, ventanilla dinámica, llamado de turno y finalización de atención. |
| `/operator/panel` | `operador`, `admin` | Panel extendido con histórico reciente, control de atención y transferencias directas. |
| `/admin` | `admin` | Dashboard administrativo general y accesos directos. |
| `/admin/users` | `admin` | CRUD de operadores y administradores. |
| `/admin/services` | `admin` | CRUD y activación/desactivación de trámites y prefijos. |
| `/admin/windows` | `admin` | CRUD y activación/desactivación de ventanillas físicas. |

---

## 6. Guía de Despliegue y Ejecución Local

### Prerrequisitos
- Node.js versión 18 o superior.
- PowerShell o terminal compatible en el host local.

### 1. Inicializar Base de Datos (Solo primera vez o para reiniciar)
```powershell
cd backend
npm install
npm run init-db
```

### 2. Iniciar Backend
```powershell
cd backend
node server.js
```
*Servidor escuchando en `http://localhost:3000` (HTTP y WebSocket).*

### 3. Iniciar Frontend
En una segunda terminal:
```powershell
cd frontend
npm install
npm run start
```
*Aplicación disponible en `http://localhost:4200`.*

---

## 7. Credenciales In/iciales

- **Administrador:**
  - Usuario: `admin`
  - Contraseña: `admin123`
- **Operador Ejemplo:**
  - Usuario: `operador1`
  - Contraseña: `operador123`
