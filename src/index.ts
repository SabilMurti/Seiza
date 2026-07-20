#!/usr/bin/env node
import { Command } from 'commander';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { startServer } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('seiza')
  .description('Seiza MCP Server and Dashboard')
  .version('0.1.0')
  .option('--data-dir <path>', 'custom data directory', path.join(os.homedir(), '.seiza'))
  .option('--http', 'enable HTTP/SSE server mode', true)
  .option('--no-dashboard', 'disable HTTP Web Dashboard server')
  .option('-p, --port <number>', 'port number', (val) => parseInt(val, 10), 3456)
  .option('-d, --daemon', 'run server in background daemon mode', false);

program.parse(process.argv);

const options = program.opts();
const isHttpEnabled = options.dashboard !== false && options.http !== false;

async function main() {
  const dataDir = options.dataDir;
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (options.daemon) {
    if (!isHttpEnabled) {
      console.error('Error: Daemon mode requires dashboard to be enabled.');
      process.exit(1);
    }
    
    console.log(`Starting Seiza daemon on port ${options.port}...`);
    
    const logFile = path.join(dataDir, 'seiza.log');
    const errFile = path.join(dataDir, 'seiza.err');
    
    const out = fs.openSync(logFile, 'a');
    const err = fs.openSync(errFile, 'a');
    
    // Determine the absolute path to this script
    // If run globally via npm, it might be in a different location, but __filename works.
    const scriptPath = __filename;
    
    const child = spawn(process.execPath, [scriptPath, '--http', '--port', options.port.toString(), '--data-dir', dataDir], {
      detached: true,
      stdio: ['ignore', out, err]
    });
    
    child.unref();
    console.log(`Daemon started (PID: ${child.pid}). Logs are in ${dataDir}`);
    process.exit(0);
  } else {
    await startServer({
      dataDir: options.dataDir,
      http: isHttpEnabled,
      port: options.port
    });
  }
}

main().catch((err) => {
  console.error('Failed to start Seiza:', err);
  process.exit(1);
});
export * from "./core/router.js";
export * from "./core/agent.js";
export * from "./tools/index.js";
