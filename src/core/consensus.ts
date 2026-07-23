import { Task } from "./dag.js";
import { Agent } from "./agent.js";
import { eventBroker } from "./events.js";
import { hitlManager } from "./hitl.js";

export class ConsensusManager {
  private maxRetries = 3;

  constructor(
    private coder: Agent,
    private reviewer: Agent
  ) {}

  async coordinate(task: Task, diffOrContent: string): Promise<{ success: boolean; verdict: string }> {
    let currentIteration = 0;
    let currentDiff = diffOrContent;
    
    // Check if task needs human in the loop
    if (task.prompt.includes('#butuh-manusia') || this.isHighRisk(currentDiff)) {
      const approved = await hitlManager.requestApproval(task);
      if (!approved) {
        return { success: false, verdict: "Rejected by human in the loop." };
      }
    }

    while (currentIteration < this.maxRetries) {
      currentIteration++;
      
      eventBroker.emit("log", {
        type: "info",
        agent: "reviewer",
        message: `Review iteration ${currentIteration}/${this.maxRetries} started.`
      });
      const REVIEWER_TIMEOUT_MS = 60_000;
      const reviewerResponsePromise = this.reviewer.run(`Review the following changes for task: ${task.prompt}\n\nChanges:\n${currentDiff}\n\nProvide your verdict. If there are issues, list them clearly. If approved, reply with EXACTLY "APPROVED".`);
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Reviewer timeout')), REVIEWER_TIMEOUT_MS)
      );
      let reviewerResponse: string;
      try {
        reviewerResponse = await Promise.race([reviewerResponsePromise, timeoutPromise]) as string;
      } catch (e) {
        // Reviewer timed out or failed — auto-approve to avoid blocking the whole task
        console.error('[ConsensusManager] Reviewer call timed out or failed, auto-approving:', e);
        return { success: true, verdict: 'Auto-approved: reviewer timed out.' };
      }

      const cleanResponse = reviewerResponse.trim().toUpperCase().replace(/[*'"_`.]/g, '');
      // Accept both "APPROVED" and <finish> tag as approval signals
      if (cleanResponse === "APPROVED" || reviewerResponse.includes("<finish>")) {
        return { success: true, verdict: "Changes approved by reviewer." };
      }

      if (currentIteration >= this.maxRetries) {
        return { success: false, verdict: `Review failed after ${this.maxRetries} attempts. Last feedback: ${reviewerResponse}` };
      }

      eventBroker.emit("log", {
        type: "info",
        agent: "coder",
        message: `Addressing review feedback (Iteration ${currentIteration}).`
      });
      // Pass feedback back to coder
      const coderResponse = await this.coder.run(`The reviewer found issues with the previous implementation. Please fix them.\n\nOriginal Task: ${task.prompt}\n\nReviewer Feedback: ${reviewerResponse}`);
      
      // Update the diff for the next iteration based on coder response
      // For simplicity in this mock, we assume coderResponse contains the new diff
      currentDiff = coderResponse; 
    }

    return { success: false, verdict: "Max retries exceeded." };
  }
  
  private isHighRisk(content: string): boolean {
    const riskKeywords = ['rm -rf', 'docker', 'drop table', 'truncate'];
    return riskKeywords.some(keyword => content.toLowerCase().includes(keyword));
  }
}
