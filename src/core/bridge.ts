import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ConfigManager, Config } from "../config.js";

export class MCPBridgeManager {
  private configManager: ConfigManager;
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, any> = new Map();

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  public async connectServer(serverConfig: Config['bridgeServers'][0]) {
    if (!serverConfig.enabled) return;

    try {
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
      });

      const client = new Client(
        { name: `bridge-client-${serverConfig.id}`, version: "1.0.0" },
        { capabilities: {} }
      );

      await client.connect(transport);
      this.clients.set(serverConfig.id, client);

      const toolsList = await client.listTools();
      if (toolsList?.tools) {
        for (const tool of toolsList.tools) {
          this.tools.set(`${serverConfig.id}:${tool.name}`, tool);
        }
      }
      console.log(`Connected bridge server: ${serverConfig.name}`);
    } catch (e) {
      console.error(`Failed to connect bridge server ${serverConfig.name}`, e);
    }
  }

  public async callTool(serverName: string, toolName: string, args: unknown) {
    const serverConfig = this.configManager.getConfig().bridgeServers.find(s => s.name === serverName || s.id === serverName);
    if (!serverConfig) throw new Error(`Server ${serverName} not found`);

    const client = this.clients.get(serverConfig.id);
    if (!client) throw new Error(`Client for ${serverName} not connected`);

    return await client.callTool({ name: toolName, arguments: args as Record<string, unknown> });
  }

  public listAllTools() {
    return Array.from(this.tools.values());
  }

  public async initializeAll() {
    const config = this.configManager.getConfig();
    for (const server of config.bridgeServers) {
      await this.connectServer(server);
    }
  }
}
