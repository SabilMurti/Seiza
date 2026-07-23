#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";
import { spawn as spawn2 } from "child_process";
import path8 from "path";
import fs8 from "fs";
import os3 from "os";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/config.ts
import * as fs from "fs";
import * as path from "path";
var DEFAULT_CONFIG = {
  nineRouter: { apiKey: "free", baseUrl: "http://localhost:20128/v1", enableFallback: true, fallbackModel: "FREE", maxIterations: 15 },
  modelRoles: { planner: "", coder: "", reviewer: "", scout: "" },
  sandbox: { driver: "local", dockerImage: "ubuntu:latest", timeoutMs: 3e5 },
  consensus: { maxRetries: 3, strictMode: false },
  hitl: { autoApproveSafeCommands: false },
  bridgeServers: []
};
var ConfigManager = class {
  configPath;
  config;
  constructor(dataDir) {
    this.configPath = path.join(dataDir, "config.json");
    this.config = this.loadConfig();
  }
  loadConfig() {
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
  getConfig() {
    return this.config;
  }
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  }
  saveConfig() {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to save config", e);
    }
  }
};

// src/core/skills.ts
import fs2 from "fs";
import path2 from "path";
import { execSync } from "child_process";
import os from "os";
import yaml from "yaml";
var SkillManager = class {
  globalSkillsDir;
  workspaceSkillsDir;
  constructor(workspaceDir = process.cwd()) {
    this.globalSkillsDir = path2.join(os.homedir(), ".seiza", "skills");
    this.workspaceSkillsDir = path2.join(workspaceDir, "skills");
    this.ensureDirs();
  }
  ensureDirs() {
    if (!fs2.existsSync(this.globalSkillsDir)) {
      fs2.mkdirSync(this.globalSkillsDir, { recursive: true });
    }
    if (!fs2.existsSync(this.workspaceSkillsDir)) {
      fs2.mkdirSync(this.workspaceSkillsDir, { recursive: true });
    }
  }
  parseSkillMd(filePath, isGlobal) {
    if (!fs2.existsSync(filePath)) return null;
    const content = fs2.readFileSync(filePath, "utf-8");
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (match) {
      const frontmatterStr = match[1];
      const body = match[2].trim();
      try {
        const data = yaml.parse(frontmatterStr);
        if (!data.name || !data.description) return null;
        return {
          name: data.name,
          description: data.description,
          version: data.version,
          author: data.author,
          path: path2.dirname(filePath),
          isGlobal,
          instructions: body
        };
      } catch (e) {
        console.error(`Failed to parse frontmatter in ${filePath}`, e);
        return null;
      }
    }
    return null;
  }
  discoverSkillsInDir(dirPath, isGlobal) {
    const skills = [];
    if (!fs2.existsSync(dirPath)) return skills;
    const entries = fs2.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const itemPath = path2.join(dirPath, entry.name);
        const skillPath = path2.join(itemPath, "SKILL.md");
        const skill = this.parseSkillMd(skillPath, isGlobal);
        if (skill) {
          skills.push(skill);
        }
        const subSkillsDir = path2.join(itemPath, "skills");
        if (fs2.existsSync(subSkillsDir) && fs2.statSync(subSkillsDir).isDirectory()) {
          const nested = this.discoverSkillsInDir(subSkillsDir, isGlobal);
          skills.push(...nested);
        }
      }
    }
    return skills;
  }
  listSkills() {
    const globalSkills = this.discoverSkillsInDir(this.globalSkillsDir, true);
    const workspaceSkills = this.discoverSkillsInDir(this.workspaceSkillsDir, false);
    const skillMap = /* @__PURE__ */ new Map();
    for (const skill of globalSkills) {
      skillMap.set(skill.name, skill);
    }
    for (const skill of workspaceSkills) {
      skillMap.set(skill.name, skill);
    }
    return Array.from(skillMap.values());
  }
  installSkillFromGithub(repoSource) {
    let repoUrl = repoSource;
    if (repoSource.startsWith("github:")) {
      repoUrl = `https://github.com/${repoSource.substring(7)}.git`;
    } else if (!repoSource.startsWith("http") && repoSource.includes("/")) {
      repoUrl = `https://github.com/${repoSource}.git`;
    }
    const repoName = repoSource.split("/").pop()?.replace(".git", "") || "unknown-skill";
    const targetDir = path2.join(this.globalSkillsDir, repoName);
    if (fs2.existsSync(targetDir)) {
      this.deleteSkill(repoName);
    }
    console.log(`Cloning ${repoUrl} to ${targetDir}`);
    execSync(`git clone ${repoUrl} ${targetDir}`, { stdio: "inherit" });
  }
  installSkillFromPath(localPath) {
    const resolvedPath = path2.resolve(localPath);
    if (!fs2.existsSync(resolvedPath)) {
      throw new Error(`Path ${localPath} does not exist`);
    }
    const skillName = path2.basename(resolvedPath);
    const targetDir = path2.join(this.globalSkillsDir, skillName);
    if (fs2.existsSync(targetDir)) {
      this.deleteSkill(skillName);
    }
    execSync(`cp -R ${resolvedPath} ${targetDir}`);
  }
  installSkill(source) {
    if (source.startsWith("github:") || source.startsWith("http") || source.includes("/") && !fs2.existsSync(source)) {
      this.installSkillFromGithub(source);
    } else {
      this.installSkillFromPath(source);
    }
  }
  deleteSkill(name) {
    const safeName = path2.basename(name);
    if (!safeName || safeName === "." || safeName === ".." || !/^[a-zA-Z0-9_.-]+$/.test(safeName)) {
      throw new Error("Invalid skill name format");
    }
    const targetDir = path2.join(this.globalSkillsDir, safeName);
    if (!targetDir.startsWith(this.globalSkillsDir)) {
      throw new Error("Invalid skill path traversal attempt");
    }
    if (fs2.existsSync(targetDir)) {
      fs2.rmSync(targetDir, { recursive: true, force: true });
    } else {
      throw new Error(`Skill ${safeName} not found in global skills dir`);
    }
  }
  getSkillInstructions(name) {
    const skills = this.listSkills();
    const skill = skills.find((s) => s.name === name);
    return skill ? skill.instructions : null;
  }
};

// src/core/bridge.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
var MCPBridgeManager = class {
  configManager;
  clients = /* @__PURE__ */ new Map();
  tools = /* @__PURE__ */ new Map();
  constructor(configManager) {
    this.configManager = configManager;
  }
  async connectServer(serverConfig) {
    if (!serverConfig.enabled) return;
    try {
      let transport;
      if (serverConfig.serverUrl) {
        transport = new SSEClientTransport(new URL(serverConfig.serverUrl));
      } else {
        let cmd = serverConfig.command || "npx";
        let args = serverConfig.args || [];
        if (cmd === "wsl.exe" && process.platform === "linux") {
          if (args.length > 0 && args[0] === "-e") {
            const linuxArgs = args.slice(1);
            if (linuxArgs.length > 0 && linuxArgs[0] === "env") {
              cmd = linuxArgs[linuxArgs.length - 1];
              args = [];
            } else if (linuxArgs.length > 0) {
              cmd = linuxArgs[0];
              args = linuxArgs.slice(1);
            }
          }
        }
        transport = new StdioClientTransport({
          command: cmd,
          args
        });
      }
      const client = new Client(
        { name: `bridge-client-${serverConfig.id}`, version: "1.0.0" },
        { capabilities: {} }
      );
      await client.connect(transport);
      this.clients.set(serverConfig.id, client);
      const toolsList = await client.listTools();
      if (toolsList?.tools) {
        for (const tool of toolsList.tools) {
          this.tools.set(`${serverConfig.id}:${tool.name}`, { ...tool, server: serverConfig.id });
        }
      }
      console.error(`Connected bridge server: ${serverConfig.name}`);
    } catch (e) {
      console.error(`Failed to connect bridge server ${serverConfig.name}`, e);
    }
  }
  async callTool(serverName, toolName, args) {
    const serverConfig = this.configManager.getConfig().bridgeServers.find((s) => s.name === serverName || s.id === serverName);
    if (!serverConfig) throw new Error(`Bridge server '${serverName}' is not configured.`);
    let client = this.clients.get(serverConfig.id);
    if (!client) {
      console.error(`Client for ${serverName} not connected. Attempting auto-reconnect...`);
      await this.connectServer(serverConfig);
      client = this.clients.get(serverConfig.id);
    }
    if (!client) throw new Error(`Client for bridge server '${serverName}' could not connect.`);
    try {
      return await client.callTool({ name: toolName, arguments: args });
    } catch (err) {
      console.error(`Error executing bridge tool '${toolName}' on '${serverName}'. Reconnecting client...`, err);
      this.clients.delete(serverConfig.id);
      await this.connectServer(serverConfig);
      const reconnectedClient = this.clients.get(serverConfig.id);
      if (!reconnectedClient) throw err;
      return await reconnectedClient.callTool({ name: toolName, arguments: args });
    }
  }
  listAllTools() {
    return Array.from(this.tools.values());
  }
  async initializeAll() {
    const config = this.configManager.getConfig();
    for (const server of config.bridgeServers) {
      await this.connectServer(server);
    }
  }
};

// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import path7 from "path";

// src/core/agent.ts
import * as fs5 from "fs";

// src/tools/index.ts
import * as fs3 from "fs";
import * as path3 from "path";
import { exec } from "child_process";
var NativeToolsEngine = class {
  projectRoot;
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
  }
  resolvePath(relativePath) {
    return path3.resolve(this.projectRoot, relativePath);
  }
  async read(filePath) {
    const absolutePath = this.resolvePath(filePath);
    try {
      return await fs3.promises.readFile(absolutePath, "utf-8");
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(`Failed to read file ${filePath}: ${e.message}`);
      }
      throw e;
    }
  }
  async write(filePath, content) {
    const absolutePath = this.resolvePath(filePath);
    try {
      await fs3.promises.mkdir(path3.dirname(absolutePath), { recursive: true });
      await fs3.promises.writeFile(absolutePath, content, "utf-8");
      return `Successfully wrote to ${filePath}`;
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(`Failed to write file ${filePath}: ${e.message}`);
      }
      throw e;
    }
  }
  async edit(filePath, find, replace) {
    const absolutePath = this.resolvePath(filePath);
    try {
      const content = await fs3.promises.readFile(absolutePath, "utf-8");
      if (!content.includes(find)) {
        return `Error: The string to find was not found in ${filePath}`;
      }
      const newContent = content.replace(find, replace);
      await fs3.promises.writeFile(absolutePath, newContent, "utf-8");
      return `Successfully edited ${filePath}`;
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(`Failed to edit file ${filePath}: ${e.message}`);
      }
      throw e;
    }
  }
  async grep(filePath, query) {
    const absolutePath = this.resolvePath(filePath);
    try {
      const content = await fs3.promises.readFile(absolutePath, "utf-8");
      const lines = content.split("\n");
      const regex = new RegExp(query);
      const matches = [];
      lines.forEach((line, index) => {
        if (regex.test(line)) {
          matches.push(`${index + 1}: ${line}`);
        }
      });
      if (matches.length === 0) {
        return `No matches found for ${query} in ${filePath}`;
      }
      return matches.join("\n");
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(`Failed to grep file ${filePath}: ${e.message}`);
      }
      throw e;
    }
  }
  async bash(command, timeoutMs = 3e4) {
    return new Promise((resolve2) => {
      exec(command, { cwd: this.projectRoot, timeout: timeoutMs }, (error, stdout, stderr) => {
        let output = "";
        if (stdout) output += stdout;
        if (stderr) output += `
STDERR:
${stderr}`;
        if (error) {
          if (error.killed) {
            output += `
Command timed out after ${timeoutMs}ms.`;
          } else {
            output += `
Exit code: ${error.code}`;
          }
        }
        resolve2(output.trim() || "(no output)");
      });
    });
  }
};

// src/core/rules.ts
import * as fs4 from "fs";
import * as path4 from "path";
import * as os2 from "os";
var RuleManager = class {
  static globalRulesPath = path4.join(os2.homedir(), ".seiza", "RULES.md");
  static ensureGlobalRulesExist() {
    if (!fs4.existsSync(this.globalRulesPath)) {
      const defaultContent = `# SEIZA AI AGENT CORE DIRECTIVES

## 1. Mandatory MCP-First Protocol
All sub-agents MUST prioritize calling bridged MCP tools over raw file system scanning:
- **Code Discovery & Architecture:** Use \`codebase-memory-mcp\` (\`search_graph\`, \`trace_path\`, \`get_architecture\`, \`get_code_snippet\`, \`query_graph\`) to inspect structures. This saves 80-95% of LLM tokens.
- **Library & Framework Documentation:** Query \`context7\` (\`resolve-library-id\`, \`query-docs\`) for latest package syntax and breaking changes.
- **Memory & Facts:** Query \`amneshia\` (\`search_memory\`, \`read_graph\`, \`create_entities\`, \`add_observations\`) for user preferences and project architectural decisions.
- **GitHub Integration:** Use \`github-mcp-server\` for PRs, issues, and repository operations.

## 2. Professional Engineering Standards
- **Zero-Placeholder Policy:** NEVER output \`// TODO\`, placeholders, or truncated code. Produce 100% full, production-ready implementations.
- **Library Over Re-Invention:** Always research and prefer established, secure packages (e.g., Spatie, Zod, React Query) over writing complex logic from scratch.
- **Security-by-Default:** Treat all user input as untrusted. Enforce strict input validation, parameterized queries (SQL injection prevention), XSS escaping, CSRF protection, and environment variable secrets (\`.env\`).
- **KISS & YAGNI:** Prefer simple, battle-tested solutions over unnecessary abstractions.
- **Consensus & Self-Verification:** Always verify code logic and edge cases before outputting \`<finish>\`.
`;
      const dir = path4.dirname(this.globalRulesPath);
      if (!fs4.existsSync(dir)) {
        fs4.mkdirSync(dir, { recursive: true });
      }
      fs4.writeFileSync(this.globalRulesPath, defaultContent, "utf-8");
    }
  }
  static getGlobalRules() {
    this.ensureGlobalRulesExist();
    try {
      return fs4.readFileSync(this.globalRulesPath, "utf-8");
    } catch (e) {
      return "";
    }
  }
  static setGlobalRules(content) {
    const dir = path4.dirname(this.globalRulesPath);
    if (!fs4.existsSync(dir)) {
      fs4.mkdirSync(dir, { recursive: true });
    }
    fs4.writeFileSync(this.globalRulesPath, content, "utf-8");
  }
  static getWorkspaceRulesPath(cwd = process.cwd()) {
    const agentsMdPath = path4.join(cwd, "AGENTS.md");
    if (fs4.existsSync(agentsMdPath)) {
      return agentsMdPath;
    }
    return path4.join(cwd, "RULES.md");
  }
  static getWorkspaceRules(cwd = process.cwd()) {
    const p = this.getWorkspaceRulesPath(cwd);
    if (fs4.existsSync(p)) {
      try {
        return fs4.readFileSync(p, "utf-8");
      } catch (e) {
        return "";
      }
    }
    return "";
  }
  static setWorkspaceRules(content, cwd = process.cwd()) {
    const p = this.getWorkspaceRulesPath(cwd);
    fs4.writeFileSync(p, content, "utf-8");
  }
  static getCombinedRules(cwd = process.cwd()) {
    const globalRules = this.getGlobalRules();
    const workspaceRules = this.getWorkspaceRules(cwd);
    let combined = "";
    if (globalRules.trim()) {
      combined += "=== GLOBAL RULES ===\n" + globalRules.trim() + "\n\n";
    }
    if (workspaceRules.trim()) {
      combined += "=== WORKSPACE RULES ===\n" + workspaceRules.trim() + "\n\n";
    }
    return combined.trim();
  }
};

// src/core/agent.ts
var Agent = class {
  profile;
  client;
  toolsEngine;
  history = [];
  bridgeManager;
  maxIterations = 15;
  constructor(profile, client, bridgeManager, cwdOverride, maxIterations) {
    this.profile = { ...profile };
    this.client = client;
    this.bridgeManager = bridgeManager;
    this.toolsEngine = new NativeToolsEngine(cwdOverride);
    if (maxIterations !== void 0) {
      this.maxIterations = maxIterations;
    }
    const combinedRules = RuleManager.getCombinedRules(cwdOverride);
    if (combinedRules) {
      this.profile.systemPrompt += `

# SYSTEM & PROJECT RULES
${combinedRules}`;
    }
    this.history.push({
      role: "system",
      content: this.profile.systemPrompt
    });
  }
  static loadFromFile(filePath) {
    const content = fs5.readFileSync(filePath, "utf-8");
    const parts = content.split("---");
    let frontmatter = "";
    let systemPrompt = content;
    if (parts.length >= 3) {
      frontmatter = parts[1];
      systemPrompt = parts.slice(2).join("---").trim();
    }
    const profile = {
      name: "Unknown Agent",
      model: "9router/ag/gemini-3.1-flash-lite",
      tools: [],
      systemPrompt
    };
    const lines = frontmatter.split("\n");
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim();
        if (key === "name") profile.name = value.replace(/^["']|["']$/g, "");
        if (key === "description") profile.description = value.replace(/^["']|["']$/g, "");
        if (key === "model") profile.model = value.replace(/^["']|["']$/g, "");
        if (key === "tools") {
          profile.tools = value.replace(/[\[\]"']/g, "").split(",").map((t) => t.trim()).filter(Boolean);
        }
      }
    }
    return profile;
  }
  async parseAndExecuteTools(response) {
    const results = [];
    const readRegex = /<read\s+path=["']([^"']+)["']\s*\/>/g;
    let match;
    while ((match = readRegex.exec(response)) !== null) {
      const filePath = match[1];
      try {
        const result = await this.toolsEngine.read(filePath);
        results.push(`[Result of read ${filePath}]:
${result}`);
      } catch (e) {
        results.push(`[Error reading ${filePath}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const writeRegex = /<write\s+path=["']([^"']+)["']>([\s\S]*?)<\/write>/g;
    while ((match = writeRegex.exec(response)) !== null) {
      const filePath = match[1];
      const content = match[2];
      try {
        const result = await this.toolsEngine.write(filePath, content);
        results.push(`[Result of write ${filePath}]:
${result}`);
      } catch (e) {
        results.push(`[Error writing ${filePath}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const editRegex = /<edit\s+path=["']([^"']+)["']>\s*<find>([\s\S]*?)<\/find>\s*<replace>([\s\S]*?)<\/replace>\s*<\/edit>/g;
    while ((match = editRegex.exec(response)) !== null) {
      const filePath = match[1];
      const find = match[2];
      const replace = match[3];
      try {
        const result = await this.toolsEngine.edit(filePath, find, replace);
        results.push(`[Result of edit ${filePath}]:
${result}`);
      } catch (e) {
        results.push(`[Error editing ${filePath}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const grepRegex = /<grep\s+path=["']([^"']+)["']\s+query=["']([^"']+)["']\s*\/>/g;
    while ((match = grepRegex.exec(response)) !== null) {
      const filePath = match[1];
      const query = match[2];
      try {
        const result = await this.toolsEngine.grep(filePath, query);
        results.push(`[Result of grep ${query} in ${filePath}]:
${result}`);
      } catch (e) {
        results.push(`[Error grepping ${filePath}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const bashRegex = /<bash>([\s\S]*?)<\/bash>/g;
    while ((match = bashRegex.exec(response)) !== null) {
      const command = match[1];
      try {
        const result = await this.toolsEngine.bash(command);
        results.push(`[Result of bash: ${command}]:
${result}`);
      } catch (e) {
        results.push(`[Error running bash ${command}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return results;
  }
  async run(initialUserMessage) {
    this.history.push({
      role: "user",
      content: initialUserMessage
    });
    let iteration = 0;
    while (iteration < this.maxIterations) {
      iteration++;
      console.error(`
--- Agent ${this.profile.name} Iteration ${iteration} ---`);
      const response = await this.client.createChatCompletion({
        model: this.profile.model,
        messages: this.history,
        stream: true
      });
      this.history.push({
        role: "assistant",
        content: response
      });
      if (response.includes("<finish>")) {
        console.error(`
Agent ${this.profile.name} finished successfully.`);
        return response;
      }
      const mcpRegex = /<mcp_call\s+server="([^"]+)"\s+tool="([^"]+)">([\s\S]*?)<\/mcp_call>/g;
      let mcpMatch;
      let mcpResults = [];
      while ((mcpMatch = mcpRegex.exec(response)) !== null) {
        const [fullMatch, server, tool, argsStr] = mcpMatch;
        try {
          const args = JSON.parse(argsStr.trim());
          if (this.bridgeManager) {
            console.error(`Executing MCP call: ${server}.${tool}`);
            const res = await this.bridgeManager.callTool(server, tool, args);
            mcpResults.push(`MCP call ${server}.${tool} result:
${JSON.stringify(res, null, 2)}`);
          } else {
            mcpResults.push(`MCP call ${server}.${tool} failed: bridgeManager is not initialized.`);
          }
        } catch (e) {
          mcpResults.push(`MCP call ${server}.${tool} error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const toolResults = await this.parseAndExecuteTools(response);
      if (toolResults.length > 0 || mcpResults.length > 0) {
        const allResults = [...mcpResults, ...toolResults].join("\n\n");
        this.history.push({
          role: "user",
          content: `Here are the results of your tool executions:

${allResults}`
        });
      } else {
        this.history.push({
          role: "user",
          content: "You didn't use any tools and didn't include the <finish> tag. Please continue or output <finish> to end."
        });
      }
    }
    return "Agent execution terminated due to reaching max iterations.";
  }
};

// src/core/events.ts
import { EventEmitter } from "events";
var eventBroker = new EventEmitter();

// src/core/router.ts
var NineRouterClient = class {
  apiKey;
  baseUrl;
  totalTokensUsed = 0;
  enableFallback;
  fallbackModel;
  constructor(options2) {
    this.baseUrl = options2?.baseUrl && options2.baseUrl.trim().length > 0 ? options2.baseUrl : process.env.NINE_ROUTER_BASE_URL || "http://localhost:20128/v1";
    this.apiKey = options2?.apiKey && options2.apiKey.trim().length > 0 ? options2.apiKey : process.env.NINE_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "free";
    this.enableFallback = options2?.enableFallback !== false;
    this.fallbackModel = options2?.fallbackModel || "FREE";
  }
  async listModels() {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { "Authorization": `Bearer ${this.apiKey}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.data)) {
          return data.data.map((m) => m.id);
        }
      }
    } catch (err) {
      console.error(`Failed to fetch models from 9router daemon: ${err instanceof Error ? err.message : String(err)}`);
    }
    return [];
  }
  async createChatCompletion(request, retryCount = 0) {
    const url = `${this.baseUrl}/chat/completions`;
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`
    };
    const isStreaming = request.stream === true;
    if (!request.model || request.model.trim().length === 0) {
      const available = await this.listModels();
      request.model = available[0] || "ag/gemini-3-flash";
    }
    if (request.model.startsWith("9router/")) {
      request.model = request.model.slice(8);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12e4);
    try {
      if (isStreaming) {
        let response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
            signal: controller.signal
          });
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
        if (!response.ok) {
          clearTimeout(timeoutId);
          const errorText = await response.text();
          if (this.enableFallback && [404, 429, 500, 502, 503, 504].includes(response.status) && retryCount < 3) {
            const nextModel = await this.getNextFallbackModel(request.model);
            if (nextModel && nextModel !== request.model) {
              console.error(`[NineRouterClient] Model '${request.model}' returned HTTP ${response.status}. Retrying with fallback '${nextModel}' (attempt ${retryCount + 1}/3)...`);
              await new Promise((r) => setTimeout(r, 1e3 * Math.pow(2, retryCount)));
              return this.createChatCompletion({ ...request, model: nextModel }, retryCount + 1);
            }
          }
          throw new Error(`9Router API error (${response.status}): ${errorText}`);
        }
        if (!response.body) {
          clearTimeout(timeoutId);
          throw new Error("Response body is null, cannot stream");
        }
        const result = await this.handleStream(response.body);
        clearTimeout(timeoutId);
        return result;
      } else {
        let response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
            signal: controller.signal
          });
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
        clearTimeout(timeoutId);
        if (!response.ok) {
          const errorText = await response.text();
          if (this.enableFallback && [404, 429, 500, 502, 503, 504].includes(response.status) && retryCount < 3) {
            const nextModel = await this.getNextFallbackModel(request.model);
            if (nextModel && nextModel !== request.model) {
              console.error(`[NineRouterClient] Model '${request.model}' returned HTTP ${response.status}. Retrying with fallback '${nextModel}' (attempt ${retryCount + 1}/3)...`);
              await new Promise((r) => setTimeout(r, 1e3 * Math.pow(2, retryCount)));
              return this.createChatCompletion({ ...request, model: nextModel }, retryCount + 1);
            }
          }
          throw new Error(`9Router API error (${response.status}): ${errorText}`);
        }
        const data = await response.json();
        if (data.usage?.total_tokens) {
          this.totalTokensUsed += data.usage.total_tokens;
        } else {
          const estimated = JSON.stringify(request.messages).length / 4 + (data.choices[0]?.message?.content?.length || 0) / 4;
          this.totalTokensUsed += Math.ceil(estimated);
        }
        return data.choices[0]?.message?.content || "";
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error(`9Router API request timed out after 120s for model '${request.model}'`);
      }
      throw err;
    }
  }
  async handleStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullContent = "";
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (!trimmed.startsWith("data: ")) {
            try {
              const obj = JSON.parse(trimmed);
              const content = obj.choices?.[0]?.message?.content || obj.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                process.stderr.write(content);
              }
              if (obj.usage?.total_tokens) {
                this.totalTokensUsed += obj.usage.total_tokens;
              }
            } catch (e) {
            }
            continue;
          }
          const dataStr = trimmed.replace("data: ", "").trim();
          if (dataStr === "[DONE]") continue;
          try {
            const chunk = JSON.parse(dataStr);
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              fullContent += content;
              process.stderr.write(content);
            }
            if (chunk.usage?.total_tokens) {
              this.totalTokensUsed += chunk.usage.total_tokens;
            }
          } catch (e) {
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    process.stderr.write("\n");
    if (this.totalTokensUsed === 0 && fullContent.length > 0) {
      this.totalTokensUsed += Math.ceil(fullContent.length / 4);
    }
    return fullContent;
  }
  async getNextFallbackModel(currentModel) {
    if (!this.enableFallback) return null;
    if (this.fallbackModel && this.fallbackModel !== "FREE") {
      return this.fallbackModel === currentModel ? null : this.fallbackModel;
    }
    let models = [];
    try {
      models = await this.listModels();
    } catch {
      models = ["ag/gemini-3-flash", "ag/gemini-3.1-pro-low", "ag/claude-sonnet-4-6"];
    }
    return models.find((m) => m !== currentModel && !m.includes(currentModel)) || models[0] || null;
  }
};

// src/core/dag.ts
import fs6 from "fs";
import path6 from "path";

// src/core/hitl.ts
var HITLManager = class {
  pendingApprovals = /* @__PURE__ */ new Map();
  async requestApproval(task) {
    eventBroker.emit("hitl_paused", {
      taskId: task.id,
      prompt: task.prompt
    });
    eventBroker.emit("task_updated", {
      ...task,
      status: "hitl_paused"
    });
    return new Promise((resolve2) => {
      this.pendingApprovals.set(task.id, resolve2);
    });
  }
  resolveApproval(taskId, approved) {
    const resolveFn = this.pendingApprovals.get(taskId);
    if (resolveFn) {
      resolveFn(approved);
      this.pendingApprovals.delete(taskId);
      return true;
    }
    return false;
  }
};
var hitlManager = new HITLManager();

// src/core/abstraction.ts
import Database from "better-sqlite3";
import path5 from "path";
var SessionLogger = class {
  db;
  constructor(config) {
    const dbPath = path5.join(config.dataDir, "sessions.db");
    this.db = new Database(dbPath);
    try {
      this.db.exec("PRAGMA foreign_keys = OFF;");
    } catch {
    }
    this.initSchema();
  }
  initSchema() {
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
  logSessionStart(sessionId) {
    const stmt = this.db.prepare("INSERT INTO sessions (id, status) VALUES (?, ?)");
    stmt.run(sessionId, "running");
  }
  logSessionEnd(sessionId, status) {
    const stmt = this.db.prepare("UPDATE sessions SET end_time = CURRENT_TIMESTAMP, status = ? WHERE id = ?");
    stmt.run(status, sessionId);
  }
  logTaskStart(taskId, sessionId, prompt) {
    const stmt = this.db.prepare("INSERT INTO tasks (id, session_id, prompt, status) VALUES (?, ?, ?, ?)");
    stmt.run(taskId, sessionId, prompt, "running");
  }
  logTaskEnd(taskId, status) {
    const stmt = this.db.prepare("UPDATE tasks SET end_time = CURRENT_TIMESTAMP, status = ? WHERE id = ?");
    stmt.run(status, taskId);
  }
  logEvent(taskId, type, agent, message) {
    const stmt = this.db.prepare("INSERT INTO logs (task_id, type, agent, message) VALUES (?, ?, ?, ?)");
    stmt.run(taskId, type, agent, message);
  }
  logConversation(taskId, agent, role, content) {
    const stmt = this.db.prepare("INSERT INTO agent_conversations (task_id, agent, role, content) VALUES (?, ?, ?, ?)");
    stmt.run(taskId, agent, role, content);
  }
};
var instance = null;
function initLogger(config) {
  if (!instance) {
    instance = new SessionLogger(config);
  }
  return instance;
}
function getLogger() {
  if (!instance) {
    throw new Error("SessionLogger not initialized. Call initLogger first.");
  }
  return instance;
}

// src/core/consensus.ts
var ConsensusManager = class {
  constructor(coder, reviewer) {
    this.coder = coder;
    this.reviewer = reviewer;
  }
  coder;
  reviewer;
  maxRetries = 3;
  async coordinate(task, diffOrContent) {
    let currentIteration = 0;
    let currentDiff = diffOrContent;
    if (task.prompt.includes("#butuh-manusia") || this.isHighRisk(currentDiff)) {
      const approved = await hitlManager.requestApproval(task);
      if (!approved) {
        return { success: false, verdict: "Rejected by human in the loop." };
      }
    }
    while (currentIteration < this.maxRetries) {
      currentIteration++;
      eventBroker.emit("log", {
        type: "info",
        agent: "reviewer",
        message: `Review iteration ${currentIteration}/${this.maxRetries} started.`
      });
      const REVIEWER_TIMEOUT_MS = 6e4;
      const reviewerResponsePromise = this.reviewer.run(`Review the following changes for task: ${task.prompt}

Changes:
${currentDiff}

Provide your verdict. If there are issues, list them clearly. If approved, reply with EXACTLY "APPROVED".`);
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("Reviewer timeout")), REVIEWER_TIMEOUT_MS)
      );
      let reviewerResponse;
      try {
        reviewerResponse = await Promise.race([reviewerResponsePromise, timeoutPromise]);
      } catch (e) {
        console.error("[ConsensusManager] Reviewer call timed out or failed, auto-approving:", e);
        return { success: true, verdict: "Auto-approved: reviewer timed out." };
      }
      const cleanResponse = reviewerResponse.trim().toUpperCase().replace(/[*'"_`.]/g, "");
      if (cleanResponse === "APPROVED" || reviewerResponse.includes("<finish>")) {
        return { success: true, verdict: "Changes approved by reviewer." };
      }
      if (currentIteration >= this.maxRetries) {
        return { success: false, verdict: `Review failed after ${this.maxRetries} attempts. Last feedback: ${reviewerResponse}` };
      }
      eventBroker.emit("log", {
        type: "info",
        agent: "coder",
        message: `Addressing review feedback (Iteration ${currentIteration}).`
      });
      const coderResponse = await this.coder.run(`The reviewer found issues with the previous implementation. Please fix them.

Original Task: ${task.prompt}

Reviewer Feedback: ${reviewerResponse}`);
      currentDiff = coderResponse;
    }
    return { success: false, verdict: "Max retries exceeded." };
  }
  isHighRisk(content) {
    const riskKeywords = ["rm -rf", "docker", "drop table", "truncate"];
    return riskKeywords.some((keyword) => content.toLowerCase().includes(keyword));
  }
};

// src/core/dag.ts
var DAGRunner = class {
  tasks = /* @__PURE__ */ new Map();
  agentsDir;
  modelOverride;
  cwdOverride;
  bridgeManager;
  nineRouterOptions;
  constructor(tasks, agentsDir, modelOverride, cwdOverride, bridgeManager, nineRouterOptions) {
    this.tasks = /* @__PURE__ */ new Map();
    this.agentsDir = agentsDir;
    this.modelOverride = modelOverride;
    this.cwdOverride = cwdOverride;
    this.bridgeManager = bridgeManager;
    this.nineRouterOptions = nineRouterOptions;
    for (const task of tasks) {
      if (this.tasks.has(task.id)) {
        throw new Error(`Duplicate task ID: ${task.id}`);
      }
      this.tasks.set(task.id, { ...task, status: "pending" });
    }
    this.validateDAG();
  }
  validateDAG() {
    const visited = /* @__PURE__ */ new Set();
    const recStack = /* @__PURE__ */ new Set();
    const dfs = (taskId) => {
      if (recStack.has(taskId)) {
        throw new Error(`Cycle detected in DAG involving task: ${taskId}`);
      }
      if (visited.has(taskId)) {
        return;
      }
      visited.add(taskId);
      recStack.add(taskId);
      const task = this.tasks.get(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found in provided task list.`);
      }
      for (const depId of task.dependencies) {
        if (!this.tasks.has(depId)) {
          throw new Error(`Task ${taskId} depends on non-existent task ${depId}`);
        }
        dfs(depId);
      }
      recStack.delete(taskId);
    };
    for (const taskId of this.tasks.keys()) {
      dfs(taskId);
    }
  }
  getTasks() {
    return Array.from(this.tasks.values());
  }
  async run() {
    const promises2 = [];
    const executionMap = /* @__PURE__ */ new Map();
    const checkReadyAndRun = () => {
      let madeProgress = false;
      for (const task of this.tasks.values()) {
        if (task.status === "pending") {
          const depsCompleted = task.dependencies.every((depId) => this.tasks.get(depId)?.status === "completed");
          if (depsCompleted) {
            task.status = "running";
            madeProgress = true;
            eventBroker.emit("task_started", { task: { ...task } });
            const p = this.executeTask(task).catch((err) => {
              task.status = "failed";
              task.error = err instanceof Error ? err.message : String(err);
            }).finally(() => {
              checkReadyAndRun();
            });
            executionMap.set(task.id, p);
            promises2.push(p);
          }
        }
      }
      return madeProgress;
    };
    checkReadyAndRun();
    while (Array.from(this.tasks.values()).some((t) => t.status === "pending" || t.status === "running")) {
      const runningPromises = Array.from(executionMap.values());
      if (runningPromises.length === 0) {
        const pending = Array.from(this.tasks.values()).filter((t) => t.status === "pending").map((t) => t.id);
        throw new Error(`Deadlock detected. Pending tasks: ${pending.join(", ")}`);
      }
      try {
        await Promise.race(runningPromises);
      } catch (e) {
      }
      for (const [id, task] of this.tasks.entries()) {
        if (task.status === "completed" || task.status === "failed") {
          executionMap.delete(id);
        }
      }
      checkReadyAndRun();
    }
    await Promise.allSettled(promises2);
    return Array.from(this.tasks.values());
  }
  async executeTask(task) {
    const logger = getLogger();
    try {
      try {
        logger.logTaskStart(task.id, "session_mock", task.prompt);
      } catch (logErr) {
        console.warn("[executeTask] Warning: Failed to log task start to SQLite database:", logErr);
      }
      if (task.prompt.includes("#butuh-manusia")) {
        const approved = await hitlManager.requestApproval(task);
        if (!approved) {
          throw new Error("Task rejected by human in the loop.");
        }
        task.status = "running";
        eventBroker.emit("task_updated", { ...task });
      }
      const profilePath = path6.join(this.agentsDir, `${task.agent}.md`);
      let profile;
      if (fs6.existsSync(profilePath)) {
        profile = Agent.loadFromFile(profilePath);
      } else {
        profile = { name: task.agent, model: "auto", tools: [], systemPrompt: `You are a ${task.agent} agent.` };
      }
      const client = new NineRouterClient({
        apiKey: process.env.OPENROUTER_API_KEY || "",
        ...this.nineRouterOptions
      });
      if (this.modelOverride) {
        profile.model = this.modelOverride;
      }
      const agent = new Agent(profile, client, this.bridgeManager, this.cwdOverride, this.nineRouterOptions?.maxIterations);
      let result = await agent.run(task.prompt);
      if (task.agent === "coder") {
        const reviewerProfilePath = path6.join(this.agentsDir, `reviewer.md`);
        if (fs6.existsSync(reviewerProfilePath)) {
          let reviewerProfile = Agent.loadFromFile(reviewerProfilePath);
          if (this.modelOverride) {
            reviewerProfile.model = this.modelOverride;
          }
          const reviewerAgent = new Agent(reviewerProfile, client, this.bridgeManager, this.cwdOverride, this.nineRouterOptions?.maxIterations);
          const consensus = new ConsensusManager(agent, reviewerAgent);
          const consensusResult = await consensus.coordinate(task, result);
          if (!consensusResult.success) {
            throw new Error(`Consensus failed: ${consensusResult.verdict}`);
          }
          try {
            logger.logEvent(task.id, "info", "consensus", `Consensus reached: ${consensusResult.verdict}`);
          } catch (logErr) {
            console.warn("[executeTask] Warning: Failed to log consensus event to SQLite database:", logErr);
          }
        } else {
          try {
            logger.logEvent(task.id, "info", "consensus", "No reviewer.md found \u2014 skipping consensus step.");
          } catch (logErr) {
            console.warn("[executeTask] Warning: Failed to log consensus skip event to SQLite database:", logErr);
          }
        }
      }
      task.result = result;
      task.status = "completed";
      eventBroker.emit("task_completed", { task: { ...task } });
      try {
        logger.logTaskEnd(task.id, "completed");
      } catch (logErr) {
        console.warn("[executeTask] Warning: Failed to log task end to SQLite database:", logErr);
      }
    } catch (e) {
      task.error = e instanceof Error ? e.message : String(e);
      task.status = "failed";
      eventBroker.emit("task_failed", { task: { ...task } });
      try {
        logger.logEvent(task.id, "error", task.agent, task.error);
        logger.logTaskEnd(task.id, "failed");
      } catch (logErr) {
        console.warn("[executeTask] Warning: Failed to log task failure to SQLite database:", logErr);
      }
      throw e;
    }
  }
};

// src/server.ts
import { fileURLToPath } from "url";
import fs7 from "fs";
var activeTasks = [];
var __filename = fileURLToPath(import.meta.url);
var __dirname = path7.dirname(__filename);
async function startServer(config) {
  const configManager = new ConfigManager(config.dataDir);
  initLogger({ dataDir: config.dataDir });
  const bridgeManager = new MCPBridgeManager(configManager);
  await bridgeManager.initializeAll();
  const skillManager = new SkillManager(process.cwd());
  const nineRouterClient = new NineRouterClient({
    baseUrl: configManager.getConfig().nineRouter?.baseUrl,
    apiKey: configManager.getConfig().nineRouter?.apiKey
  });
  const syncTaskLocal = (data) => {
    if (data && data.task) {
      const incomingTask = data.task;
      const idx = activeTasks.findIndex((t) => t.id === incomingTask.id);
      if (idx !== -1) {
        activeTasks[idx] = incomingTask;
      } else {
        activeTasks.push(incomingTask);
      }
    }
  };
  eventBroker.on("task_started", syncTaskLocal);
  eventBroker.on("task_updated", syncTaskLocal);
  eventBroker.on("task_completed", syncTaskLocal);
  eventBroker.on("task_failed", syncTaskLocal);
  const mcpServer = new Server({
    name: "seiza",
    version: "0.1.0"
  }, {
    capabilities: {
      tools: {}
    }
  });
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "run_seiza_task",
          description: "Run a delegated seiza task",
          inputSchema: {
            type: "object",
            properties: {
              prompt: { type: "string" },
              model: { type: "string", description: "Optional model override e.g. '9router/ag/gemini-3.1-pro-low'" },
              cwd: { type: "string", description: "Optional working directory" },
              dag: { type: "array", items: { type: "object" }, description: "Optional pre-planned DAG" },
              skills: { type: "array", items: { type: "string" }, description: "Optional list of skill names to inject into the context" }
            },
            required: ["prompt"]
          }
        },
        {
          name: "run_single_agent",
          description: "Runs a single specific agent directly",
          inputSchema: {
            type: "object",
            properties: {
              agentName: { type: "string" },
              prompt: { type: "string" },
              model: { type: "string", description: "Optional model override" },
              cwd: { type: "string", description: "Optional working directory" },
              skills: { type: "array", items: { type: "string" }, description: "Optional list of skill names to inject into the context" }
            },
            required: ["agentName", "prompt"]
          }
        },
        {
          name: "list_seiza_agents",
          description: "Returns list of all available agent templates in ./agents/ with their names, descriptions, models, and allowed tools",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "list_seiza_models",
          description: "Returns list of available 9router models and current role assignments from ConfigManager",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "get_task_status",
          description: "Returns live status, steps, and logs of active or completed tasks",
          inputSchema: {
            type: "object",
            properties: {
              taskId: { type: "string" }
            }
          }
        },
        {
          name: "list_bridge_tools",
          description: "Returns all tools exposed by connected bridge servers",
          inputSchema: {
            type: "object",
            properties: {
              serverName: { type: "string" }
            }
          }
        },
        {
          name: "call_bridge_tool",
          description: "Directly proxies a tool execution to a downstream bridged MCP server",
          inputSchema: {
            type: "object",
            properties: {
              serverName: { type: "string" },
              toolName: { type: "string" },
              arguments: { type: "object", additionalProperties: true }
            },
            required: ["serverName", "toolName", "arguments"]
          }
        },
        {
          name: "list_seiza_skills",
          description: "Returns list of all installed skills",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "install_seiza_skill",
          description: "Installs a skill from GitHub or local path",
          inputSchema: {
            type: "object",
            properties: {
              source: { type: "string", description: "github:owner/repo, owner/repo, full git URL, or local path" }
            },
            required: ["source"]
          }
        }
      ]
    };
  });
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments || {};
    if (name === "run_seiza_task") {
      const prompt = args.prompt;
      if (!prompt) {
        throw new Error("Prompt is required");
      }
      const agentsDir = path7.join(__dirname, "..", "agents");
      let parsedTasks;
      if (Array.isArray(args.dag) && args.dag.length > 0) {
        parsedTasks = args.dag;
      } else {
        parsedTasks = [{
          id: `task-${Date.now()}`,
          agent: "coder",
          prompt,
          dependencies: [],
          status: "pending"
        }];
      }
      let injectedSkillsContext = "";
      if (Array.isArray(args.skills)) {
        const skillsArr = args.skills;
        skillsArr.forEach((skillName) => {
          const ins = skillManager.getSkillInstructions(skillName);
          if (ins) {
            injectedSkillsContext += `

--- SKILL: ${skillName} ---
${ins}`;
          }
        });
      }
      if (injectedSkillsContext && parsedTasks.length > 0) {
        parsedTasks.forEach((task) => {
          task.prompt += injectedSkillsContext;
        });
      }
      const runner = new DAGRunner(
        parsedTasks,
        agentsDir,
        args.model,
        args.cwd,
        bridgeManager,
        configManager.getConfig().nineRouter
      );
      activeTasks = runner.getTasks();
      let finalTasks;
      try {
        finalTasks = await runner.run();
      } finally {
      }
      activeTasks = finalTasks;
      return {
        content: [{
          type: "text",
          text: `Task completed. Results:
${JSON.stringify(finalTasks, null, 2)}`
        }]
      };
    }
    if (name === "run_single_agent") {
      const agentName = args.agentName;
      const prompt = args.prompt;
      const modelOverride = args.model;
      const cwdOverride = args.cwd;
      const agentsDir = path7.join(__dirname, "..", "agents");
      const profilePath = path7.join(agentsDir, `${agentName}.md`);
      if (!fs7.existsSync(profilePath)) {
        throw new Error(`Agent ${agentName} not found.`);
      }
      const profile = Agent.loadFromFile(profilePath);
      if (modelOverride) {
        profile.model = modelOverride;
      }
      const cfg = configManager.getConfig();
      const client = new NineRouterClient({
        apiKey: cfg.nineRouter.apiKey,
        baseUrl: cfg.nineRouter.baseUrl,
        enableFallback: cfg.nineRouter.enableFallback,
        fallbackModel: cfg.nineRouter.fallbackModel
      });
      let injectedSkillsContext = "";
      if (Array.isArray(args.skills)) {
        const skillsArr = args.skills;
        skillsArr.forEach((skillName) => {
          const ins = skillManager.getSkillInstructions(skillName);
          if (ins) {
            injectedSkillsContext += `

--- SKILL: ${skillName} ---
${ins}`;
          }
        });
      }
      if (injectedSkillsContext) {
        profile.systemPrompt += injectedSkillsContext;
      }
      const dummyTask = {
        id: `single-${Date.now()}`,
        agent: agentName,
        prompt,
        dependencies: [],
        status: "running"
      };
      const idx = activeTasks.findIndex((t) => t.id === dummyTask.id);
      if (idx !== -1) {
        activeTasks[idx] = dummyTask;
      } else {
        activeTasks.push(dummyTask);
      }
      eventBroker.emit("task_started", { task: dummyTask });
      const agent = new Agent(profile, client, bridgeManager, cwdOverride, cfg.nineRouter.maxIterations);
      let result;
      try {
        result = await agent.run(prompt);
        dummyTask.status = "completed";
        dummyTask.result = result;
        eventBroker.emit("task_completed", { task: dummyTask });
      } catch (err) {
        dummyTask.status = "failed";
        dummyTask.error = String(err);
        eventBroker.emit("task_failed", { task: dummyTask });
        throw err;
      }
      return {
        content: [{ type: "text", text: result }]
      };
    }
    if (name === "list_seiza_agents") {
      const agentsDir = path7.join(__dirname, "..", "agents");
      let agents = [];
      try {
        const files = fs7.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
        agents = files.map((f) => Agent.loadFromFile(path7.join(agentsDir, f)));
      } catch (e) {
        console.error("Failed to list agents", e);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(agents, null, 2) }]
      };
    }
    if (name === "list_seiza_models") {
      const models = await nineRouterClient.listModels();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            models,
            roles: configManager.getConfig().modelRoles
          }, null, 2)
        }]
      };
    }
    if (name === "get_task_status") {
      const taskId = args.taskId;
      let result = activeTasks;
      if (taskId) {
        result = activeTasks.filter((t) => t.id === taskId);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    if (name === "list_bridge_tools") {
      const serverName = args.serverName;
      const tools = bridgeManager.listAllTools();
      let result = tools;
      if (serverName) {
        result = tools.filter((t) => t.server === serverName);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    if (name === "call_bridge_tool") {
      const serverName = args.serverName;
      const toolName = args.toolName;
      const toolArgs = args.arguments;
      const result = await bridgeManager.callTool(serverName, toolName, toolArgs);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    if (name === "list_seiza_skills") {
      return {
        content: [{ type: "text", text: JSON.stringify(skillManager.listSkills(), null, 2) }]
      };
    }
    if (name === "install_seiza_skill") {
      const source = args.source;
      try {
        skillManager.installSkill(source);
        return {
          content: [{ type: "text", text: `Successfully installed skill from ${source}` }]
        };
      } catch (e) {
        throw new Error(`Failed to install skill from ${source}: ${String(e)}`);
      }
    }
    throw new Error(`Unknown tool: ${name}`);
  });
  if (config.http) {
    const app = express();
    app.disable("x-powered-by");
    app.use(cors());
    app.use(express.json({ limit: "10mb" }));
    app.use((req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("X-XSS-Protection", "1; mode=block");
      next();
    });
    let sseTransport = null;
    app.get("/messages", async (req, res) => {
      sseTransport = new SSEServerTransport("/messages/endpoint", res);
      await mcpServer.connect(sseTransport);
    });
    app.post("/messages/endpoint", async (req, res) => {
      if (sseTransport) {
        await sseTransport.handlePostMessage(req, res);
      } else {
        res.status(503).json({ error: "SSE Transport not connected" });
      }
    });
    app.post("/api/tasks/:id/approve", (req, res) => {
      const { id } = req.params;
      const { action } = req.body;
      if (action !== "approve" && action !== "reject") {
        return res.status(400).json({ error: 'Action must be "approve" or "reject"' });
      }
      const resolved = hitlManager.resolveApproval(id, action === "approve");
      if (resolved) {
        res.json({ success: true, message: `Task ${id} ${action}d` });
      } else {
        res.status(404).json({ error: "Task not found or not waiting for approval" });
      }
    });
    app.get("/api/config", (req, res) => {
      res.json(configManager.getConfig());
    });
    app.post("/api/config", (req, res) => {
      configManager.updateConfig(req.body);
      res.json({ success: true, config: configManager.getConfig() });
    });
    app.get("/api/bridge/servers", (req, res) => {
      res.json(configManager.getConfig().bridgeServers);
    });
    app.post("/api/bridge/servers", async (req, res) => {
      const servers = req.body;
      configManager.updateConfig({ bridgeServers: servers });
      res.json({ success: true, servers: configManager.getConfig().bridgeServers });
    });
    app.get("/api/bridge/tools", (req, res) => {
      res.json(bridgeManager.listAllTools());
    });
    app.get("/api/events", (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      const onTaskStarted = (data) => {
        res.write(`event: task_started
data: ${JSON.stringify(data)}

`);
      };
      const onTaskCompleted = (data) => {
        res.write(`event: task_completed
data: ${JSON.stringify(data)}

`);
      };
      const onTaskFailed = (data) => {
        res.write(`event: task_failed
data: ${JSON.stringify(data)}

`);
      };
      eventBroker.on("task_started", onTaskStarted);
      eventBroker.on("task_completed", onTaskCompleted);
      eventBroker.on("task_failed", onTaskFailed);
      req.on("close", () => {
        eventBroker.off("task_started", onTaskStarted);
        eventBroker.off("task_completed", onTaskCompleted);
        eventBroker.off("task_failed", onTaskFailed);
      });
    });
    app.get("/api/tasks", (req, res) => {
      res.json({ tasks: activeTasks });
    });
    app.post("/api/tasks/sync", (req, res) => {
      const { tasks } = req.body;
      if (Array.isArray(tasks)) {
        for (const incomingTask of tasks) {
          const idx = activeTasks.findIndex((t) => t.id === incomingTask.id);
          const previousTask = idx !== -1 ? activeTasks[idx] : null;
          if (idx !== -1) {
            activeTasks[idx] = incomingTask;
          } else {
            activeTasks.push(incomingTask);
          }
          if (!previousTask || previousTask.status !== incomingTask.status) {
            if (incomingTask.status === "running") {
              eventBroker.emit("task_started", { task: incomingTask });
            } else if (incomingTask.status === "completed") {
              eventBroker.emit("task_completed", { task: incomingTask });
            } else if (incomingTask.status === "failed") {
              eventBroker.emit("task_failed", { task: incomingTask });
            }
          }
        }
      }
      res.json({ success: true });
    });
    app.get("/api/rules", (req, res) => {
      res.json({
        globalRules: RuleManager.getGlobalRules(),
        workspaceRules: RuleManager.getWorkspaceRules()
      });
    });
    app.post("/api/rules", (req, res) => {
      const { globalRules, workspaceRules } = req.body;
      if (globalRules !== void 0) {
        RuleManager.setGlobalRules(globalRules);
      }
      if (workspaceRules !== void 0) {
        RuleManager.setWorkspaceRules(workspaceRules);
      }
      res.json({ success: true });
    });
    app.get("/api/agents", (req, res) => {
      const agentsDir = path7.join(__dirname, "..", "agents");
      try {
        const files = fs7.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
        const agents = files.map((f) => {
          const filePath = path7.join(agentsDir, f);
          const content = fs7.readFileSync(filePath, "utf-8");
          let name = f.replace(".md", "");
          let description = "";
          let model = "";
          let tools = "";
          let systemPrompt = content;
          if (content.startsWith("---")) {
            const endFrontmatter = content.indexOf("---", 3);
            if (endFrontmatter !== -1) {
              const frontmatter = content.substring(3, endFrontmatter).trim();
              systemPrompt = content.substring(endFrontmatter + 3).trim();
              frontmatter.split("\n").forEach((line) => {
                const [key, ...values] = line.split(":");
                if (key && values.length > 0) {
                  const val = values.join(":").trim();
                  const cleanVal = val.replace(/^\[|\]$/g, "").replace(/^"|"$/g, "").replace(/^'|'$/g, "");
                  if (key.trim() === "name") name = cleanVal;
                  if (key.trim() === "description") description = cleanVal;
                  if (key.trim() === "model") model = cleanVal;
                  if (key.trim() === "tools") tools = cleanVal;
                }
              });
            }
          }
          return {
            name,
            filename: f,
            description,
            model,
            tools,
            systemPrompt,
            fullContent: content
          };
        });
        res.json({ agents });
      } catch (e) {
        console.error("Error reading agents:", e);
        res.json({ agents: [] });
      }
    });
    app.post("/api/agents/:name", (req, res) => {
      const agentsDir = path7.join(__dirname, "..", "agents");
      const name = req.params.name;
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        return res.status(400).json({ success: false, error: "Invalid agent name format." });
      }
      const { model, description, tools, systemPrompt } = req.body;
      try {
        if (!fs7.existsSync(agentsDir)) {
          fs7.mkdirSync(agentsDir, { recursive: true });
        }
        const content = `---
name: ${name}
description: ${description || ""}
model: ${model || ""}
tools: [${tools || ""}]
---

${systemPrompt || ""}`;
        const targetPath = path7.join(agentsDir, `${name}.md`);
        if (!targetPath.startsWith(agentsDir)) {
          return res.status(400).json({ success: false, error: "Path traversal rejected." });
        }
        fs7.writeFileSync(targetPath, content);
        res.json({ success: true, agent: { name, filename: `${name}.md`, description, model, tools, systemPrompt, fullContent: content } });
      } catch (e) {
        console.error("Error writing agent:", e);
        res.status(500).json({ success: false, error: String(e) });
      }
    });
    app.delete("/api/agents/:name", (req, res) => {
      const agentsDir = path7.join(__dirname, "..", "agents");
      const name = req.params.name;
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        return res.status(400).json({ success: false, error: "Invalid agent name format." });
      }
      try {
        const files = fs7.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
        if (files.length <= 1) {
          return res.status(400).json({ success: false, error: "Cannot delete the last agent." });
        }
        const filePath = path7.join(agentsDir, `${name}.md`);
        if (!filePath.startsWith(agentsDir)) {
          return res.status(400).json({ success: false, error: "Path traversal rejected." });
        }
        if (fs7.existsSync(filePath)) {
          fs7.unlinkSync(filePath);
        }
        res.json({ success: true });
      } catch (e) {
        console.error("Error deleting agent:", e);
        res.status(500).json({ success: false, error: String(e) });
      }
    });
    app.get("/api/models", async (req, res) => {
      try {
        const models = await nineRouterClient.listModels();
        res.json({ models });
      } catch (e) {
        res.status(500).json({ error: String(e) });
      }
    });
    app.post("/api/tasks/clear", (req, res) => {
      activeTasks = [];
      res.json({ success: true });
    });
    app.get("/api/skills", (req, res) => {
      res.json({ skills: skillManager.listSkills() });
    });
    app.post("/api/skills/install", (req, res) => {
      const { source } = req.body;
      if (!source) {
        return res.status(400).json({ error: "Source is required" });
      }
      try {
        skillManager.installSkill(source);
        res.json({ success: true, message: `Installed skill from ${source}` });
      } catch (e) {
        res.status(500).json({ error: String(e) });
      }
    });
    app.delete("/api/skills/:name", (req, res) => {
      try {
        skillManager.deleteSkill(req.params.name);
        res.json({ success: true });
      } catch (e) {
        res.status(500).json({ error: String(e) });
      }
    });
    app.get("/api/skills/:name", (req, res) => {
      const skills = skillManager.listSkills();
      const skill = skills.find((s) => s.name === req.params.name);
      if (skill) {
        res.json({ skill });
      } else {
        res.status(404).json({ error: "Skill not found" });
      }
    });
    app.get("/api/config", (req, res) => {
      res.json({ dataDir: config.dataDir, port: config.port });
    });
    const dashboardPath = path7.join(__dirname, "..", "dashboard", "dist");
    if (fs7.existsSync(dashboardPath)) {
      app.use(express.static(dashboardPath));
      app.get("*", (req, res) => {
        if (!req.path.startsWith("/api") && !req.path.startsWith("/messages")) {
          res.sendFile(path7.join(dashboardPath, "index.html"));
        } else {
          res.status(404).json({ error: "Not found" });
        }
      });
    } else {
      console.warn(`Warning: Dashboard dist not found at ${dashboardPath}`);
    }
    const server = app.listen(config.port, () => {
      console.error(`Seiza HTTP Dashboard running on port ${config.port}`);
      console.error(`Data directory: ${config.dataDir}`);
      console.error(`SSE Endpoint: http://localhost:${config.port}/messages`);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`Port ${config.port} is already in use by another active Seiza instance.`);
      } else {
        console.error(`Express server error: ${err.message}`);
      }
    });
  }
  if (!process.argv.includes("--daemon")) {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error("Seiza MCP Server running on stdio");
  }
}

// src/index.ts
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = path8.dirname(__filename2);
var program = new Command();
program.name("seiza").description("Seiza MCP Server and Dashboard").version("0.1.0").option("--data-dir <path>", "custom data directory", path8.join(os3.homedir(), ".seiza")).option("--http", "enable HTTP/SSE server mode", true).option("--no-dashboard", "disable HTTP Web Dashboard server").option("-p, --port <number>", "port number", (val) => parseInt(val, 10), 3456).option("-d, --daemon", "run server in background daemon mode", false);
program.parse(process.argv);
var options = program.opts();
var isHttpEnabled = options.dashboard !== false && options.http !== false;
async function main() {
  const dataDir = options.dataDir;
  if (!fs8.existsSync(dataDir)) {
    fs8.mkdirSync(dataDir, { recursive: true });
  }
  if (options.daemon) {
    if (!isHttpEnabled) {
      console.error("Error: Daemon mode requires dashboard to be enabled.");
      process.exit(1);
    }
    console.log(`Starting Seiza daemon on port ${options.port}...`);
    const logFile = path8.join(dataDir, "seiza.log");
    const errFile = path8.join(dataDir, "seiza.err");
    const out = fs8.openSync(logFile, "a");
    const err = fs8.openSync(errFile, "a");
    const scriptPath = __filename2;
    const child = spawn2(process.execPath, [scriptPath, "--http", "--port", options.port.toString(), "--data-dir", dataDir], {
      detached: true,
      stdio: ["ignore", out, err]
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
  console.error("Failed to start Seiza:", err);
  process.exit(1);
});
export {
  Agent,
  NativeToolsEngine,
  NineRouterClient
};
