import { initDatabase, getDatabase } from './database.js';

await initDatabase();

const db = await getDatabase();

export default db;