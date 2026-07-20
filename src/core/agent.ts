import { MCPBridgeManager } from "./bridge.js";
import * as fs from "fs";
import * as path from "path";
import { NineRouterClient, ChatMessage } from "./router.js";
import { NativeToolsEngine } from "../tools/index.js";
import { RuleManager } from "./rules.js";

export interface AgentProfile {
  name: string;
  description?: string;
  model: string;
  tools: string[];
  systemPrompt: string;
}

export class Agent {
  private profile: AgentProfile;
  private client: NineRouterClient;
  private toolsEngine: NativeToolsEngine;
  private history: ChatMessage[] = [];
  private bridgeManager?: MCPBridgeManager;

  constructor(profile: AgentProfile, client: NineRouterClient, bridgeManager?: MCPBridgeManager, cwdOverride?: string) {
    this.profile = { ...profile };
    this.client = client;
    this.bridgeManager = bridgeManager;
    this.toolsEngine = new NativeToolsEngine(cwdOverride);

    // Inject System & Project Rules
    const combinedRules = RuleManager.getCombinedRules(cwdOverride);
    if (combinedRules) {
      this.profile.systemPrompt += `\n\n# SYSTEM & PROJECT RULES\n${combinedRules}`;
    }

    this.history.push({
      role: "system",
      content: this.profile.systemPrompt
    });
  }

  public static loadFromFile(filePath: string): AgentProfile {
    const content = fs.readFileSync(filePath, "utf-8");
    const parts = content.split("---");
    let frontmatter = "";
    let systemPrompt = content;

    if (parts.length >= 3) {
      frontmatter = parts[1];
      systemPrompt = parts.slice(2).join("---").trim();
    }

    const profile: AgentProfile = {
      name: "Unknown Agent",
      model: "9router/ag/gemini-3.1-flash-lite",
      tools: [],
      systemPrompt: systemPrompt
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
          profile.tools = value.replace(/[\[\]"']/g, "").split(",").map(t => t.trim()).filter(Boolean);
        }
      }
    }

    return profile;
  }

  private async parseAndExecuteTools(response: string): Promise<string[]> {
    const results: string[] = [];

    // Parse <read path="...">
    const readRegex = /<read\s+path=["']([^"']+)["']\s*\/>/g;
    let match;
    while ((match = readRegex.exec(response)) !== null) {
      const filePath = match[1];
      try {
        const result = await this.toolsEngine.read(filePath);
        results.push(`[Result of read ${filePath}]:\n${result}`);
      } catch (e) {
        results.push(`[Error reading ${filePath}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Parse <write path="...">contents</write>
    const writeRegex = /<write\s+path=["']([^"']+)["']>([\s\S]*?)<\/write>/g;
    while ((match = writeRegex.exec(response)) !== null) {
      const filePath = match[1];
      const content = match[2];
      try {
        const result = await this.toolsEngine.write(filePath, content);
        results.push(`[Result of write ${filePath}]:\n${result}`);
      } catch (e) {
        results.push(`[Error writing ${filePath}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Parse <edit path="..."><find>...</find><replace>...</replace></edit>
    const editRegex = /<edit\s+path=["']([^"']+)["']>\s*<find>([\s\S]*?)<\/find>\s*<replace>([\s\S]*?)<\/replace>\s*<\/edit>/g;
    while ((match = editRegex.exec(response)) !== null) {
      const filePath = match[1];
      const find = match[2];
      const replace = match[3];
      try {
        const result = await this.toolsEngine.edit(filePath, find, replace);
        results.push(`[Result of edit ${filePath}]:\n${result}`);
      } catch (e) {
        results.push(`[Error editing ${filePath}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Parse <grep path="..." query="..." />
    const grepRegex = /<grep\s+path=["']([^"']+)["']\s+query=["']([^"']+)["']\s*\/>/g;
    while ((match = grepRegex.exec(response)) !== null) {
      const filePath = match[1];
      const query = match[2];
      try {
        const result = await this.toolsEngine.grep(filePath, query);
        results.push(`[Result of grep ${query} in ${filePath}]:\n${result}`);
      } catch (e) {
        results.push(`[Error grepping ${filePath}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Parse <bash>command</bash>
    const bashRegex = /<bash>([\s\S]*?)<\/bash>/g;
    while ((match = bashRegex.exec(response)) !== null) {
      const command = match[1];
      try {
        const result = await this.toolsEngine.bash(command);
        results.push(`[Result of bash: ${command}]:\n${result}`);
      } catch (e) {
        results.push(`[Error running bash ${command}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return results;
  }

  public async run(initialUserMessage: string): Promise<string> {
    this.history.push({
      role: "user",
      content: initialUserMessage
    });

    let iteration = 0;
    const maxIterations = 15;

    while (iteration < maxIterations) {
      iteration++;
      console.error(`\n--- Agent ${this.profile.name} Iteration ${iteration} ---`);

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
        console.error(`\nAgent ${this.profile.name} finished successfully.`);
        return response;
      }

      // Extract MCP tool calls
      const mcpRegex = /<mcp_call\s+server="([^"]+)"\s+tool="([^"]+)">([\s\S]*?)<\/mcp_call>/g;
      let mcpMatch;
      let mcpResults: string[] = [];
      while ((mcpMatch = mcpRegex.exec(response)) !== null) {
        const [fullMatch, server, tool, argsStr] = mcpMatch;
        try {
          const args = JSON.parse(argsStr.trim());
          if (this.bridgeManager) {
            console.error(`Executing MCP call: ${server}.${tool}`);
            const res = await this.bridgeManager.callTool(server, tool, args);
            mcpResults.push(`MCP call ${server}.${tool} result:\n${JSON.stringify(res, null, 2)}`);
          } else {
            mcpResults.push(`MCP call ${server}.${tool} failed: bridgeManager is not initialized.`);
          }
        } catch (e: unknown) {
          mcpResults.push(`MCP call ${server}.${tool} error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      const toolResults = await this.parseAndExecuteTools(response);

      if (toolResults.length > 0 || mcpResults.length > 0) {
        const allResults = [...mcpResults, ...toolResults].join("\n\n");
        this.history.push({
          role: "user",
          content: `Here are the results of your tool executions:\n\n${allResults}`
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
}
