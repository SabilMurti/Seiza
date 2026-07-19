import { ConfigManager, Config } from "./config.js";
import { MCPBridgeManager } from "./core/bridge.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from 'express';
import cors from 'cors';
import path from 'path';
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DAGRunner, Task } from "./core/dag.js";
import { eventBroker } from "./core/events.js";
import { NineRouterClient } from "./core/router.js";
import type { AgentProfile } from "./core/agent.js";
import { Agent } from "./core/agent.js";
import { hitlManager } from "./core/hitl.js";

let activeTasks: Task[] = [];
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerConfig {
  dataDir: string;
  http: boolean;
  port: number;
}

export async function startServer(config: ServerConfig) {
  const configManager = new ConfigManager(config.dataDir);
  const bridgeManager = new MCPBridgeManager(configManager);
  await bridgeManager.initializeAll();
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
              dag: { type: "array", items: { type: "object" }, description: "Optional pre-planned DAG" }
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
              cwd: { type: "string", description: "Optional working directory" }
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
        }
      ]
    };
  });

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const name = request.params.name;
    const args = request.params.arguments || {};

    if (name === "run_seiza_task") {
      const prompt = args.prompt as string;
      if (!prompt) {
        throw new Error("Prompt is required");
      }
      
      const agentsDir = path.join(__dirname, "..", "agents");
      let parsedTasks: Task[];

      if (Array.isArray(args.dag) && args.dag.length > 0) {
        parsedTasks = args.dag as Task[];
      } else {
        const profilePath = path.join(agentsDir, "planner.md");
        let profile: AgentProfile;
        if (fs.existsSync(profilePath)) {
           profile = Agent.loadFromFile(profilePath);
        } else {
           profile = { name: "planner", model: "auto", tools: [], systemPrompt: "You are a planner." };
        }
        
        const client = new NineRouterClient({ apiKey: process.env.OPENROUTER_API_KEY || '' });
        const planner = new Agent(profile, client, bridgeManager);
        const plannerResult = await planner.run(prompt);
        try {
            const match = plannerResult.match(/```json\n([\s\S]*?)\n```/);
            const jsonString = match ? match[1] : plannerResult;
            parsedTasks = JSON.parse(jsonString) as Task[];
        } catch (e) {
            throw new Error("Failed to parse Planner output as JSON DAG: " + String(e) + "\nOutput was: " + plannerResult);
        }
      }
      
      const runner = new DAGRunner(parsedTasks, agentsDir, args.model as string, args.cwd as string);
      activeTasks = runner.getTasks();
      
      const finalTasks = await runner.run();
      activeTasks = finalTasks;

      return {
        content: [{
          type: "text",
          text: `Task completed. Results:\n${JSON.stringify(finalTasks, null, 2)}`
        }]
      };
    }

    if (name === "run_single_agent") {
      const agentName = args.agentName as string;
      const prompt = args.prompt as string;
      const modelOverride = args.model as string | undefined;
      const cwdOverride = args.cwd as string | undefined;

      const agentsDir = path.join(__dirname, "..", "agents");
      const profilePath = path.join(agentsDir, `${agentName}.md`);
      if (!fs.existsSync(profilePath)) {
        throw new Error(`Agent ${agentName} not found.`);
      }
      const profile = Agent.loadFromFile(profilePath);
      if (modelOverride) {
        profile.model = modelOverride;
      }
      const client = new NineRouterClient({ apiKey: process.env.OPENROUTER_API_KEY || '' });
      const agent = new Agent(profile, client, bridgeManager, cwdOverride);
      const result = await agent.run(prompt);
      return {
        content: [{ type: "text", text: result }]
      };
    }

    if (name === "list_seiza_agents") {
      const agentsDir = path.join(__dirname, "..", "agents");
      let agents: unknown[] = [];
      try {
        const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
        agents = files.map(f => Agent.loadFromFile(path.join(agentsDir, f)));
      } catch (e) {
        console.error("Failed to list agents", e);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(agents, null, 2) }]
      };
    }

    if (name === "list_seiza_models") {
       const models = [
          "9router/ag/gemini-3.1-pro-low",
          "9router/ag/gemini-3.1-flash-lite",
          "9router/ag/gemini-3-flash",
          "9router/ag/claude-sonnet-4-6"
       ];
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
       const taskId = args.taskId as string | undefined;
       let result = activeTasks;
       if (taskId) {
         result = activeTasks.filter(t => t.id === taskId);
       }
       return {
         content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
       };
    }

    if (name === "list_bridge_tools") {
       const serverName = args.serverName as string | undefined;
       const tools = bridgeManager.listAllTools();
       let result = tools;
       if (serverName) {
          result = tools.filter(t => t.server === serverName);
       }
       return {
         content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
       };
    }

    if (name === "call_bridge_tool") {
       const serverName = args.serverName as string;
       const toolName = args.toolName as string;
       const toolArgs = args.arguments as Record<string, unknown>;
       const result = await bridgeManager.callTool(serverName, toolName, toolArgs);
       return {
         content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
       };
    }
    throw new Error(`Unknown tool: ${name}`);
  });

  if (config.http) {
    const app = express();
    app.use(cors());
    app.use(express.json());

    let sseTransport: SSEServerTransport | null = null;

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

    // HITL Approval Endpoint
    app.post('/api/tasks/:id/approve', (req, res) => {
      const { id } = req.params;
      const { action } = req.body;
      
      if (action !== 'approve' && action !== 'reject') {
        return res.status(400).json({ error: 'Action must be "approve" or "reject"' });
      }

      const resolved = hitlManager.resolveApproval(id, action === 'approve');
      
      if (resolved) {
        res.json({ success: true, message: `Task ${id} ${action}d` });
      } else {
        res.status(404).json({ error: 'Task not found or not waiting for approval' });
      }
    });
    // Config Endpoints
    app.get("/api/config", (req, res) => {
      res.json(configManager.getConfig());
    });
    app.post("/api/config", (req, res) => {
      configManager.updateConfig(req.body as Partial<Config>);
      res.json({ success: true, config: configManager.getConfig() });
    });

    // Bridge Servers Endpoints
    app.get("/api/bridge/servers", (req, res) => {
      res.json(configManager.getConfig().bridgeServers);
    });
    app.post("/api/bridge/servers", async (req, res) => {
      const servers = req.body as Config["bridgeServers"];
      configManager.updateConfig({ bridgeServers: servers });
      
      // Optional: re-initialize the newly enabled servers here,
      // or just require a restart. We'll do a simple re-init.
      // Note: Full bridge dynamic reload would require closing old clients.
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

      const onTaskStarted = (data: unknown) => { res.write(`event: task_started\ndata: ${JSON.stringify(data)}\n\n`); };
      const onTaskCompleted = (data: unknown) => { res.write(`event: task_completed\ndata: ${JSON.stringify(data)}\n\n`); };
      const onTaskFailed = (data: unknown) => { res.write(`event: task_failed\ndata: ${JSON.stringify(data)}\n\n`); };

      eventBroker.on('task_started', onTaskStarted);
      eventBroker.on('task_completed', onTaskCompleted);
      eventBroker.on('task_failed', onTaskFailed);

      req.on("close", () => {
        eventBroker.off('task_started', onTaskStarted);
        eventBroker.off('task_completed', onTaskCompleted);
        eventBroker.off('task_failed', onTaskFailed);
      });
    });

    app.get("/api/tasks", (req, res) => {
      res.json({ tasks: activeTasks });
    });

    app.get("/api/agents", (req, res) => {
      const agentsDir = path.join(__dirname, "..", "agents");
      try {
        const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
        const agents = files.map(f => {
          return {
            name: f.replace('.md', ''),
            content: fs.readFileSync(path.join(agentsDir, f), 'utf-8')
          };
        });
        res.json({ agents });
      } catch (e) {
        console.error("Error reading agents:", e);
        res.json({ agents: [] });
      }
    });

    app.post("/api/agents/:name", (req, res) => {
      const agentsDir = path.join(__dirname, "..", "agents");
      const name = req.params.name;
      const { content } = req.body;
      try {
        if (!fs.existsSync(agentsDir)) {
           fs.mkdirSync(agentsDir, { recursive: true });
        }
        fs.writeFileSync(path.join(agentsDir, `${name}.md`), content);
        res.json({ success: true });
      } catch (e) {
         console.error("Error writing agent:", e);
         res.status(500).json({ success: false, error: String(e) });
      }
    });

    app.post("/api/tasks/clear", (req, res) => {
      activeTasks = [];
      res.json({ success: true });
    });

    app.get("/api/config", (req, res) => {
      res.json({ dataDir: config.dataDir, port: config.port });
    });

    // Serve Dashboard
    // Assuming we build in root/dist and dashboard builds in root/dashboard/dist
    // __dirname in dist is root/dist. Dashboard is at root/dashboard/dist.
    const dashboardPath = path.join(__dirname, '..', 'dashboard', 'dist');
    if (fs.existsSync(dashboardPath)) {
      app.use(express.static(dashboardPath));
      app.get("*", (req, res) => {
        // Only serve index.html for non-api routes
        if (!req.path.startsWith('/api') && !req.path.startsWith('/messages')) {
          res.sendFile(path.join(dashboardPath, 'index.html'));
        } else {
          res.status(404).json({ error: "Not found" });
        }
      });
    } else {
      console.warn(`Warning: Dashboard dist not found at ${dashboardPath}`);
    }

    app.listen(config.port, () => {
      console.log(`Seiza HTTP server running on port ${config.port}`);
      console.log(`Data directory: ${config.dataDir}`);
      console.log(`SSE Endpoint: http://localhost:${config.port}/messages`);
    });
  } else {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error("Seiza MCP Server running on stdio"); // Using stderr for logs in stdio mode
  }
}
