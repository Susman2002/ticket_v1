import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = `${__dirname}/turnos.db`;
// Ruta local al archivo WASM de sql.js
const WASM_PATH = resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');

let dbInstance = null;
let isInitialized = false;

async function getDatabase() {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs({
    locateFile: () => WASM_PATH
  });

  let db;
  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
    // Crear directorio si no existe
    const dir = dirname(DB_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  dbInstance = db;
  return db;
}

function saveDatabase() {
  if (dbInstance) {
    const data = dbInstance.export();
    writeFileSync(DB_PATH, Buffer.from(data));
  }
}

function run(sql, params = []) {
  const db = getDatabaseSync();
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const result = [];
    while (stmt.step()) {
      result.push(stmt.getAsObject());
    }
    stmt.free();
    saveDatabase();
    return result;
  } catch (err) {
    throw new Error(`SQL Error: ${err.message}`);
  }
}

function get(sql, params = []) {
  const results = run(sql, params);
  return results[0] || null;
}

function all(sql, params = []) {
  return run(sql, params);
}

function exec(sql) {
  const db = getDatabaseSync();
  try {
    db.exec(sql);
    saveDatabase();
  } catch (err) {
    throw new Error(`SQL Exec Error: ${err.message}`);
  }
}

function prepare(sql) {
  const db = getDatabaseSync();
  const stmt = db.prepare(sql);
  return {
    bind: (params = []) => {
      stmt.bind(params);
      return stmt;
    },
    step: () => stmt.step(),
    getAsObject: () => stmt.getAsObject(),
    free: () => stmt.free(),
    run: (params = []) => {
      stmt.bind(params);
      const result = { changes: 0, lastInsertRowid: 0 };
      while (stmt.step()) {
        result.changes++;
        // Para INSERT, obtener el lastInsertRowid
        const obj = stmt.getAsObject();
        if (obj.id) result.lastInsertRowid = obj.id;
      }
      stmt.reset();
      saveDatabase();
      return result;
    },
    get: (params = []) => {
      stmt.bind(params);
      if (stmt.step()) {
        const obj = stmt.getAsObject();
        stmt.reset();
        return obj;
      }
      stmt.reset();
      return null;
    },
    all: (params = []) => {
      stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.reset();
      return results;
    }
  };
}

function transaction(callback) {
  const db = getDatabaseSync();
  try {
    db.exec('BEGIN IMMEDIATE TRANSACTION');
    const result = callback();
    db.exec('COMMIT');
    saveDatabase();
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function close() {
  if (dbInstance) {
    saveDatabase();
    dbInstance.close();
    dbInstance = null;
  }
}

// Wrappers síncronos para compatibilidad con código existente
let syncDb = null;

function getDatabaseSync() {
  if (syncDb) return syncDb;

  const SQL = require('sql.js');
  const fileBuffer = existsSync(DB_PATH) ? readFileSync(DB_PATH) : new Uint8Array();
  syncDb = new SQL.Database(fileBuffer);
  return syncDb;
}

function saveDatabaseSync() {
  if (syncDb) {
    const data = syncDb.export();
    writeFileSync(DB_PATH, Buffer.from(data));
  }
}

// Wrappers síncronos para compatibilidad
const syncRun = (sql, params = []) => {
  const db = getDatabaseSync();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const result = [];
  while (stmt.step()) {
    result.push(stmt.getAsObject());
  }
  stmt.free();
  saveDatabaseSync();
  return result;
};

const syncGet = (sql, params = []) => {
  const results = syncRun(sql, params);
  return results[0] || null;
};

const syncAll = (sql, params = []) => syncRun(sql, params);

const syncExec = (sql) => {
  const db = getDatabaseSync();
  db.exec(sql);
  saveDatabaseSync();
};

const syncPrepare = (sql) => {
  const db = getDatabaseSync();
  const stmt = db.prepare(sql);
  return {
    bind: (params = []) => stmt.bind(params),
    step: () => stmt.step(),
    getAsObject: () => stmt.getAsObject(),
    free: () => stmt.free(),
    run: (params = []) => {
      stmt.bind(params);
      const result = { changes: 0, lastInsertRowid: 0 };
      while (stmt.step()) {
        result.changes++;
        const obj = stmt.getAsObject();
        if (obj.id) result.lastInsertRowid = obj.id;
      }
      stmt.reset();
      saveDatabaseSync();
      return result;
    },
    get: (params = []) => {
      stmt.bind(params);
      if (stmt.step()) {
        const obj = stmt.getAsObject();
        stmt.reset();
        return obj;
      }
      stmt.reset();
      return null;
    },
    all: (params = []) => {
      stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.reset();
      return results;
    }
  };
};

const syncTransaction = (callback) => {
  const db = getDatabaseSync();
  try {
    db.exec('BEGIN IMMEDIATE TRANSACTION');
    const result = callback();
    db.exec('COMMIT');
    saveDatabaseSync();
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

const syncClose = () => {
  if (syncDb) {
    saveDatabaseSync();
    syncDb.close();
    syncDb = null;
  }
};

// Exportar interfaz compatible con better-sqlite3
export const Database = {
  prepare: syncPrepare,
  exec: syncExec,
  transaction: syncTransaction,
  close: syncClose,
  pragma: (sql) => syncExec(sql),
  // Para compatibilidad con código que usa `new Database()`
  constructor: function(path) {
    return {
      prepare: syncPrepare,
      exec: syncExec,
      transaction: syncTransaction,
      close: syncClose,
      pragma: (sql) => syncExec(sql)
    };
  }
};

export default Database;