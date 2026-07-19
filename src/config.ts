import * as fs from "fs";
import * as path from "path";

export interface Config {
  nineRouter: {
    apiKey: string;
    baseUrl: string;
  };
  modelRoles: {
    planner: string;
    coder: string;
    reviewer: string;
    scout: string;
  };
  sandbox: {
    driver: 'local' | 'docker';
    dockerImage: string;
    timeoutMs: number;
  };
  consensus: {
    maxRetries: number;
    strictMode: boolean;
  };
  hitl: {
    autoApproveSafeCommands: boolean;
  };
  bridgeServers: Array<{
    id: string;
    name: string;
    command?: string;
    args?: string[];
    serverUrl?: string;
    enabled: boolean;
  }>;
}

const DEFAULT_CONFIG: Config = {
  nineRouter: { apiKey: "free", baseUrl: "http://localhost:20128/v1" },
  modelRoles: { planner: "", coder: "", reviewer: "", scout: "" },
  sandbox: { driver: "local", dockerImage: "ubuntu:latest", timeoutMs: 300000 },
  consensus: { maxRetries: 3, strictMode: false },
  hitl: { autoApproveSafeCommands: false },
  bridgeServers: []
};

export const RECOMMENDED_BRIDGES = [
  {
    id: "amneshia",
    name: "amneshia",
    command: "wsl.exe",
    args: ["-e", "env", "PATH=/home/murtix/.local/share/fnm/node-versions/v24.18.0/installation/bin:/usr/bin:/bin", "/home/murtix/.local/share/fnm/node-versions/v24.18.0/installation/bin/amneshia"],
    enabled: true
  },
  {
    id: "codebase-memory-mcp",
    name: "codebase-memory-mcp",
    command: "wsl.exe",
    args: ["-e", "/home/murtix/.local/bin/codebase-memory-mcp"],
    enabled: true
  },
  {
    id: "context7",
    name: "context7",
    serverUrl: "https://mcp.context7.com/mcp",
    enabled: true
  }
];

export class ConfigManager {
  private configPath: string;
  private config: Config;

  constructor(dataDir: string) {
    this.configPath = path.join(dataDir, "config.json");
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    if (!fs.existsSync(this.configPath)) {
      return { ...DEFAULT_CONFIG };
    }
    try {
      const data = fs.readFileSync(this.configPath, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch (e) {
      console.error("Failed to load config, using defaults", e);
      return { ...DEFAULT_CONFIG };
    }
  }

  public getConfig(): Config {
    return this.config;
  }

  public updateConfig(newConfig: Partial<Config>) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  }

  public saveConfig() {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to save config", e);
    }
  }
}
