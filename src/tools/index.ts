import * as fs from "fs";
import * as path from "path";
import { exec, spawn } from "child_process";

export interface ToolResult {
  tool: string;
  result: string;
  error?: boolean;
}

export class NativeToolsEngine {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  private resolvePath(relativePath: string): string {
    return path.resolve(this.projectRoot, relativePath);
  }

  public async read(filePath: string): Promise<string> {
    const absolutePath = this.resolvePath(filePath);
    try {
      return await fs.promises.readFile(absolutePath, "utf-8");
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(`Failed to read file ${filePath}: ${e.message}`);
      }
      throw e;
    }
  }

  public async write(filePath: string, content: string): Promise<string> {
    const absolutePath = this.resolvePath(filePath);
    try {
      await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.promises.writeFile(absolutePath, content, "utf-8");
      return `Successfully wrote to ${filePath}`;
    } catch (e) {
       if (e instanceof Error) {
         throw new Error(`Failed to write file ${filePath}: ${e.message}`);
       }
       throw e;
    }
  }

  public async edit(filePath: string, find: string, replace: string): Promise<string> {
    const absolutePath = this.resolvePath(filePath);
    try {
      const content = await fs.promises.readFile(absolutePath, "utf-8");
      if (!content.includes(find)) {
        return `Error: The string to find was not found in ${filePath}`;
      }
      const newContent = content.replace(find, replace);
      await fs.promises.writeFile(absolutePath, newContent, "utf-8");
      return `Successfully edited ${filePath}`;
    } catch (e) {
       if (e instanceof Error) {
         throw new Error(`Failed to edit file ${filePath}: ${e.message}`);
       }
       throw e;
    }
  }

  public async grep(filePath: string, query: string): Promise<string> {
    const absolutePath = this.resolvePath(filePath);
    try {
      const content = await fs.promises.readFile(absolutePath, "utf-8");
      const lines = content.split("\n");
      const regex = new RegExp(query);
      const matches: string[] = [];
      
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

  public async bash(command: string, timeoutMs: number = 30000): Promise<string> {
    const { promise, resolve, reject } = Promise.withResolvers<string>();

    exec(command, { cwd: this.projectRoot, timeout: timeoutMs }, (error, stdout, stderr) => {
      let output = "";
      if (stdout) output += stdout;
      if (stderr) output += `\nSTDERR:\n${stderr}`;
      
      if (error) {
         if (error.killed) {
             output += `\nCommand timed out after ${timeoutMs}ms.`;
         } else {
             output += `\nExit code: ${error.code}`;
         }
      }
      
      resolve(output.trim() || "(no output)");
    });

    return promise;
  }
}
