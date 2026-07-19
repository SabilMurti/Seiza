import { Task } from "./dag.js";
import { eventBroker } from "./events.js";

type ResolveFn = (approved: boolean) => void;

class HITLManager {
  private pendingApprovals = new Map<string, ResolveFn>();

  async requestApproval(task: Task): Promise<boolean> {
    eventBroker.emit("hitl_paused", {
      taskId: task.id,
      prompt: task.prompt
    });
    
    eventBroker.emit("task_updated", {
        ...task,
        status: "hitl_paused"
    });

    return new Promise<boolean>((resolve) => {
      this.pendingApprovals.set(task.id, resolve);
    });
  }

  resolveApproval(taskId: string, approved: boolean): boolean {
    const resolveFn = this.pendingApprovals.get(taskId);
    if (resolveFn) {
      resolveFn(approved);
      this.pendingApprovals.delete(taskId);
      return true;
    }
    return false;
  }
}

export const hitlManager = new HITLManager();
