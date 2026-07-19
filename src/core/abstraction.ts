import Database from 'better-sqlite3';
import path from 'path';

export interface SessionLoggerConfig {
  dataDir: string;
}

export class SessionLogger {
  private db: Database.Database;

  constructor(config: SessionLoggerConfig) {
    const dbPath = path.join(config.dataDir, 'sessions.db');
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME,
        status TEXT
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        prompt TEXT,
        status TEXT,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME,
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT,
        type TEXT,
        agent TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(task_id) REFERENCES tasks(id)
      );

      CREATE TABLE IF NOT EXISTS agent_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT,
        agent TEXT,
        role TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(task_id) REFERENCES tasks(id)
      );
    `);
  }

  logSessionStart(sessionId: string) {
    const stmt = this.db.prepare('INSERT INTO sessions (id, status) VALUES (?, ?)');
    stmt.run(sessionId, 'running');
  }

  logSessionEnd(sessionId: string, status: string) {
    const stmt = this.db.prepare('UPDATE sessions SET end_time = CURRENT_TIMESTAMP, status = ? WHERE id = ?');
    stmt.run(status, sessionId);
  }

  logTaskStart(taskId: string, sessionId: string, prompt: string) {
    const stmt = this.db.prepare('INSERT INTO tasks (id, session_id, prompt, status) VALUES (?, ?, ?, ?)');
    stmt.run(taskId, sessionId, prompt, 'running');
  }

  logTaskEnd(taskId: string, status: string) {
    const stmt = this.db.prepare('UPDATE tasks SET end_time = CURRENT_TIMESTAMP, status = ? WHERE id = ?');
    stmt.run(status, taskId);
  }

  logEvent(taskId: string, type: string, agent: string | null, message: string) {
    const stmt = this.db.prepare('INSERT INTO logs (task_id, type, agent, message) VALUES (?, ?, ?, ?)');
    stmt.run(taskId, type, agent, message);
  }

  logConversation(taskId: string, agent: string, role: string, content: string) {
    const stmt = this.db.prepare('INSERT INTO agent_conversations (task_id, agent, role, content) VALUES (?, ?, ?, ?)');
    stmt.run(taskId, agent, role, content);
  }
}

let instance: SessionLogger | null = null;

export function initLogger(config: SessionLoggerConfig): SessionLogger {
  if (!instance) {
    instance = new SessionLogger(config);
  }
  return instance;
}

export function getLogger(): SessionLogger {
  if (!instance) {
    throw new Error('SessionLogger not initialized. Call initLogger first.');
  }
  return instance;
}
