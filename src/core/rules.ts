import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export class RuleManager {
  private static readonly globalRulesPath = path.join(os.homedir(), ".seiza", "RULES.md");

  public static ensureGlobalRulesExist() {
    if (!fs.existsSync(this.globalRulesPath)) {
      const defaultContent = `# Global Rules

- ALWAYS use codebase-memory-mcp, context7, and amneshia for codebase discovery and documentation.
- DO NOT use standard file edit tools to create or modify files one by one.
- DO NOT reinvent the wheel. Prefer established libraries.
- strict Web Security by default.
- KISS and YAGNI.
`;
      const dir = path.dirname(this.globalRulesPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.globalRulesPath, defaultContent, "utf-8");
    }
  }

  public static getGlobalRules(): string {
    this.ensureGlobalRulesExist();
    try {
      return fs.readFileSync(this.globalRulesPath, "utf-8");
    } catch (e) {
      return "";
    }
  }

  public static setGlobalRules(content: string) {
    const dir = path.dirname(this.globalRulesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.globalRulesPath, content, "utf-8");
  }

  public static getWorkspaceRulesPath(cwd: string = process.cwd()): string {
    const agentsMdPath = path.join(cwd, "AGENTS.md");
    if (fs.existsSync(agentsMdPath)) {
      return agentsMdPath;
    }
    return path.join(cwd, "RULES.md");
  }

  public static getWorkspaceRules(cwd: string = process.cwd()): string {
    const p = this.getWorkspaceRulesPath(cwd);
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p, "utf-8");
      } catch (e) {
        return "";
      }
    }
    return "";
  }

  public static setWorkspaceRules(content: string, cwd: string = process.cwd()) {
    const p = this.getWorkspaceRulesPath(cwd);
    fs.writeFileSync(p, content, "utf-8");
  }

  public static getCombinedRules(cwd: string = process.cwd()): string {
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
}
