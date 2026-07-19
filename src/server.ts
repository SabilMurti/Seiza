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
              prompt: {
                type: "string",
                description: "Detailed instructions for the task"
              }
            },
            required: ["prompt"]
          }
        }
      ]
    };
  });

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    if (request.params.name === "run_seiza_task") {
      const prompt = request.params.arguments?.prompt as string;
      if (!prompt) {
        throw new Error("Prompt is required");
      }
      
      const agentsDir = path.join(__dirname, "..", "agents");
      
      const profilePath = path.join(agentsDir, "planner.md");
      const profileContent = fs.readFileSync(profilePath, 'utf8');
      const parts = profileContent.split('---');
      let profile: AgentProfile;
      if (parts.length >= 3) {
          profile = JSON.parse(parts[1]) as AgentProfile;
          profile.systemPrompt = parts.slice(2).join('---').trim();
      } else {
          profile = { name: "planner", model: "auto", tools: [], systemPrompt: profileContent };
      }
      
      const client = new NineRouterClient({ apiKey: process.env.OPENROUTER_API_KEY || '' });
      
      const planner = new Agent(profile, client);
      
      const plannerResult = await planner.run(prompt);
      let parsedTasks: Task[];
      try {
          const match = plannerResult.match(/```json\n([\s\S]*?)\n```/);
          const jsonString = match ? match[1] : plannerResult;
          parsedTasks = JSON.parse(jsonString) as Task[];
      } catch (e) {
          throw new Error("Failed to parse Planner output as JSON DAG: " + String(e) + "\nOutput was: " + plannerResult);
      }
      
      const runner = new DAGRunner(parsedTasks, agentsDir);
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
    throw new Error(`Unknown tool: ${request.params.name}`);
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
