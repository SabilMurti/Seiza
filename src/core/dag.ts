import { Agent, AgentProfile } from './agent.js';
import { eventBroker } from './events.js';
import { NineRouterClient } from './router.js';
import fs from 'fs';
import path from 'path';
import { hitlManager } from "./hitl.js";
import { getLogger } from "./abstraction.js";
import { ConsensusManager } from "./consensus.js";

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'hitl_paused';

export interface Task {
  id: string;
  agent: 'planner' | 'coder' | 'reviewer';
  prompt: string;
  dependencies: string[];
  status: TaskStatus;
  result?: string;
  error?: string;
}

export class DAGRunner {
  private tasks: Map<string, Task> = new Map();
  private agentsDir: string;
  private modelOverride?: string;
  private cwdOverride?: string;
  private bridgeManager?: any;

  private nineRouterOptions?: any;

  constructor(tasks: Task[], agentsDir: string, modelOverride?: string, cwdOverride?: string, bridgeManager?: any, nineRouterOptions?: any) {
    this.tasks = new Map<string, Task>();
    this.agentsDir = agentsDir;
    this.modelOverride = modelOverride;
    this.cwdOverride = cwdOverride;
    this.bridgeManager = bridgeManager;
    this.nineRouterOptions = nineRouterOptions;
    for (const task of tasks) {
      if (this.tasks.has(task.id)) {
        throw new Error(`Duplicate task ID: ${task.id}`);
      }
      this.tasks.set(task.id, { ...task, status: 'pending' });
    }
    this.validateDAG();
  }

  private validateDAG() {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (taskId: string) => {
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

  public getTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  public async run(): Promise<Task[]> {
    const promises: Promise<void>[] = [];
    const executionMap = new Map<string, Promise<void>>();

    const checkReadyAndRun = () => {
      let madeProgress = false;
      for (const task of this.tasks.values()) {
        if (task.status === 'pending') {
          const depsCompleted = task.dependencies.every(depId => this.tasks.get(depId)?.status === 'completed');
          if (depsCompleted) {
            task.status = 'running';
            madeProgress = true;
            eventBroker.emit('task_started', { task: { ...task } });
            
            const p = this.executeTask(task)
              .catch((err) => {
                // Ensure task status is marked as failed even if setup/execution throws
                task.status = 'failed';
                task.error = err instanceof Error ? err.message : String(err);
              })
              .finally(() => {
                checkReadyAndRun(); // Trigger dependents
              });
            executionMap.set(task.id, p);
            promises.push(p);
          }
        }
      }
      return madeProgress;
    };

    checkReadyAndRun();

    while (Array.from(this.tasks.values()).some(t => t.status === 'pending' || t.status === 'running')) {
       // Await any of the currently running promises
       const runningPromises = Array.from(executionMap.values());
       if (runningPromises.length === 0) {
           const pending = Array.from(this.tasks.values()).filter(t => t.status === 'pending').map(t => t.id);
           throw new Error(`Deadlock detected. Pending tasks: ${pending.join(', ')}`);
       }
       try {
           await Promise.race(runningPromises);
       } catch (e) {
           // We don't want the whole runner to fail on one task failure immediately,
           // or maybe we do? Let's just catch and the status will be 'failed'.
           // Dependent tasks will simply never become ready.
       }

       // Clean up completed promises from executionMap
       for (const [id, task] of this.tasks.entries()) {
           if (task.status === 'completed' || task.status === 'failed') {
               executionMap.delete(id);
           }
       }
       checkReadyAndRun();
    }

    await Promise.allSettled(promises);
    return Array.from(this.tasks.values());
  }

  private async executeTask(task: Task): Promise<void> {
    const logger = getLogger();

    try {
      try {
        logger.logTaskStart(task.id, 'session_mock', task.prompt); // 'session_mock' needs to be replaced later with actual session id if passed to DAGRunner
      } catch (logErr) {
        console.warn("[executeTask] Warning: Failed to log task start to SQLite database:", logErr);
      }

      if (task.prompt.includes('#butuh-manusia')) {
        const approved = await hitlManager.requestApproval(task);
        if (!approved) {
           throw new Error("Task rejected by human in the loop.");
        }
        task.status = 'running';
        eventBroker.emit('task_updated', { ...task });
      }

      const profilePath = path.join(this.agentsDir, `${task.agent}.md`);
      let profile: AgentProfile;
      if (fs.existsSync(profilePath)) {
        profile = Agent.loadFromFile(profilePath);
      } else {
        profile = { name: task.agent, model: "auto", tools: [], systemPrompt: `You are a ${task.agent} agent.` };
      }

      const client = new NineRouterClient({ 
        apiKey: process.env.OPENROUTER_API_KEY || '',
        ...this.nineRouterOptions
      });
      if (this.modelOverride) {
        profile.model = this.modelOverride;
      }
      const agent = new Agent(profile, client, this.bridgeManager, this.cwdOverride, this.nineRouterOptions?.maxIterations);
      
      // If the task is a coder task, we might want to run consensus
      let result = await agent.run(task.prompt);
      
      if (task.agent === 'coder') {
        // Setup reviewer — only run consensus if a proper reviewer.md profile exists
        const reviewerProfilePath = path.join(this.agentsDir, `reviewer.md`);
        if (fs.existsSync(reviewerProfilePath)) {
          let reviewerProfile: AgentProfile = Agent.loadFromFile(reviewerProfilePath);
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
            logger.logEvent(task.id, 'info', 'consensus', `Consensus reached: ${consensusResult.verdict}`);
          } catch (logErr) {
            console.warn("[executeTask] Warning: Failed to log consensus event to SQLite database:", logErr);
          }
        } else {
          try {
            logger.logEvent(task.id, 'info', 'consensus', 'No reviewer.md found — skipping consensus step.');
          } catch (logErr) {
            console.warn("[executeTask] Warning: Failed to log consensus skip event to SQLite database:", logErr);
          }
        }
      }

      task.result = result;
      task.status = 'completed';
      eventBroker.emit('task_completed', { task: { ...task } });
      try {
        logger.logTaskEnd(task.id, 'completed');
      } catch (logErr) {
        console.warn("[executeTask] Warning: Failed to log task end to SQLite database:", logErr);
      }
    } catch (e) {
      task.error = e instanceof Error ? e.message : String(e);
      task.status = 'failed';
      eventBroker.emit('task_failed', { task: { ...task } });
      try {
        logger.logEvent(task.id, 'error', task.agent, task.error);
        logger.logTaskEnd(task.id, 'failed');
      } catch (logErr) {
        console.warn("[executeTask] Warning: Failed to log task failure to SQLite database:", logErr);
      }
      throw e;
    }
  }
}
