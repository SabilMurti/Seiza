import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execAsync = promisify(exec);

export interface Sandbox {
  execute(command: string): Promise<{ stdout: string; stderr: string; code: number }>;
}

export class LocalSandbox implements Sandbox {
  constructor(private cwd: string, private timeoutMs: number = 30000) {}

  async execute(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: this.cwd, timeout: this.timeoutMs });
      return { stdout, stderr, code: 0 };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error) {
         return { 
           stdout: 'stdout' in error && typeof error.stdout === 'string' ? error.stdout : '', 
           stderr: 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : String(error), 
           code: typeof error.code === 'number' ? error.code : 1 
         };
      }
      return { stdout: '', stderr: String(error), code: 1 };
    }
  }
}

export class DockerSandbox implements Sandbox {
  constructor(
    private image: string,
    private hostDir: string,
    private containerDir: string = "/workspace",
    private timeoutMs: number = 30000
  ) {}

  async execute(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    // Escape single quotes for the shell inside docker
    const safeCommand = command.replace(/'/g, "'\\''");
    
    const dockerCmd = `docker run --rm -v "${this.hostDir}":"${this.containerDir}" -w "${this.containerDir}" ${this.image} sh -c '${safeCommand}'`;
    
    try {
      const { stdout, stderr } = await execAsync(dockerCmd, { timeout: this.timeoutMs });
      return { stdout, stderr, code: 0 };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error) {
         return { 
           stdout: 'stdout' in error && typeof error.stdout === 'string' ? error.stdout : '', 
           stderr: 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : String(error), 
           code: typeof error.code === 'number' ? error.code : 1 
         };
      }
      return { stdout: '', stderr: String(error), code: 1 };
    }
  }
}
