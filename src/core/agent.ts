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
}
