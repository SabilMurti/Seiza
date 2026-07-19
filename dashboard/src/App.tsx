import { useEffect, useState, useRef } from 'react';
import { Play, RotateCcw, Trash2, Cpu, Activity, LayoutDashboard, Terminal, CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AgentConfig {
  name: string;
  content: string;
}

interface Task {
  id: string;
  agent: 'planner' | 'coder' | 'reviewer';
  prompt: string;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'hitl_paused';
  result?: string;
  error?: string;
}

interface LogEvent {
  id: string;
  timestamp: Date;
  type: 'info' | 'error' | 'success';
  agent?: string;
  message: string;
}

function App() {
  const [config, setConfig] = useState<{dataDir?: string, port?: number} | null>(null);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [activeAgentIndex, setActiveAgentIndex] = useState(0);
  const [agentContent, setAgentContent] = useState("");
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [metrics] = useState({
    planner: { spent: 0.12, tokens: 4200 },
    coder: { spent: 1.45, tokens: 18500 },
    reviewer: { spent: 0.05, tokens: 1200 }
  });

  // Setup SSE & Initial fetch
  useEffect(() => {
    fetch('/api/config').then(res => res.json()).then(setConfig).catch(console.error);
    
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        if (data.agents && data.agents.length > 0) {
          setAgents(data.agents);
          setAgentContent(data.agents[0].content);
        }
      })
      .catch(console.error);

    fetch('/api/tasks')
      .then(res => res.json())
      .then(data => {
        if (data.tasks) setTasks(data.tasks);
      })
      .catch(console.error);

    const eventSource = new EventSource('/api/events');
    
    eventSource.addEventListener('task_started', (e) => {
      const data = JSON.parse(e.data);
      addLog({
        type: 'info',
        agent: data.task.agent,
        message: `Task ${data.task.id} started.`
      });
      updateTask(data.task);
    });
    
    eventSource.addEventListener('task_completed', (e) => {
      const data = JSON.parse(e.data);
      addLog({
        type: 'success',
        agent: data.task.agent,
        message: `Task ${data.task.id} completed.`
      });
      updateTask(data.task);
    });
    
    eventSource.addEventListener('task_failed', (e) => {
      const data = JSON.parse(e.data);
      addLog({
        type: 'error',
        agent: data.task.agent,
        message: `Task ${data.task.id} failed: ${data.task.error}`
      });
      updateTask(data.task);
    });

    return () => eventSource.close();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const updateTask = (updatedTask: Task) => {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === updatedTask.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedTask;
        return next;
      }
      return [...prev, updatedTask];
    });
  };

  const addLog = (log: Omit<LogEvent, 'id' | 'timestamp'>) => {
    setLogs(prev => [...prev, { ...log, id: Math.random().toString(36).substr(2, 9), timestamp: new Date() }]);
  };

  const saveAgent = async () => {
    if (!agents[activeAgentIndex]) return;
    const name = agents[activeAgentIndex].name;
    try {
      const res = await fetch(`/api/agents/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: agentContent })
      });
      if (res.ok) {
        const updatedAgents = [...agents];
        updatedAgents[activeAgentIndex].content = agentContent;
        setAgents(updatedAgents);
        addLog({ type: 'success', message: `Saved agent config: ${name}.md` });
      }
    } catch (e) {
      addLog({ type: 'error', message: `Failed to save ${name}.md` });
    }
  };

  const clearTasks = async () => {
    await fetch('/api/tasks/clear', { method: 'POST' });
    setTasks([]);
    setLogs([]);
    addLog({ type: 'info', message: 'Task history cleared.' });
  };

  const mockTrigger = async () => {
    addLog({ type: 'info', message: 'Triggered mock run...' });
    // Wait for real MCP trigger to test properly
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 grid-rows-[auto_1fr_auto] min-h-[calc(100vh-4rem)]">
        
        {/* HEADER */}
        <header className="lg:col-span-12 flex items-center justify-between bg-zinc-900/60 backdrop-blur-md border border-zinc-800 rounded-xl p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100 tracking-tight leading-none">SEIZA</h1>
              <p className="text-xs text-zinc-500 mt-1 font-mono">Agentic Workflow Engine</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-zinc-400">System <span className="text-emerald-400 font-medium">Healthy</span></span>
            </div>
            <div className="hidden sm:block h-4 w-px bg-zinc-800" />
            <div className="hidden sm:flex items-center gap-2 font-mono text-zinc-400 text-xs">
              <span>PORT: {config?.port || '----'}</span>
            </div>
          </div>
        </header>

        {/* LEFT COLUMN: DAG & LOGS */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* DAG VISUALIZER */}
          <div className="bg-zinc-900/60 backdrop-blur-md border border-zinc-800 rounded-xl flex flex-col min-h-[250px] shadow-lg overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-zinc-400" />
                Live Pipeline
              </h2>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-[10px] font-mono text-zinc-400 border border-zinc-700">
                  {tasks.length} tasks
                </span>
              </div>
            </div>
            <div className="p-6 flex-1 overflow-x-auto">
              {tasks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-3">
                  <Circle className="w-8 h-8 opacity-20" />
                  <p className="text-sm">No active tasks</p>
                </div>
              ) : (
                <div className="flex items-center gap-4 flex-nowrap">
                  {tasks.map((task, i) => (
                    <div key={task.id} className="flex items-center shrink-0">
                      <div className={cn(
                        "p-4 rounded-lg border min-w-[200px] transition-all",
                        task.status === 'completed' ? "bg-emerald-500/5 border-emerald-500/20" :
                        task.status === 'running' ? "bg-blue-500/5 border-blue-500/30 ring-1 ring-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]" :
                        task.status === 'hitl_paused' ? "bg-amber-500/10 border-amber-500/30 ring-1 ring-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]" :
                        task.status === 'failed' ? "bg-red-500/5 border-red-500/20" :
                        "bg-zinc-900 border-zinc-800"
                      )}>
                        <div className="flex items-center gap-3 mb-2">
                          {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                          {task.status === 'running' && <Clock className="w-4 h-4 text-blue-400 animate-pulse" />}
                          {task.status === 'hitl_paused' && <AlertCircle className="w-4 h-4 text-amber-400 animate-pulse" />}
                          {task.status === 'failed' && <AlertCircle className="w-4 h-4 text-red-400" />}
                          {task.status === 'pending' && <Circle className="w-4 h-4 text-zinc-500" />}
                          <span className={cn(
                            "text-xs font-bold uppercase tracking-wider",
                            task.status === 'completed' ? "text-emerald-400" :
                            task.status === 'running' ? "text-blue-400" :
                            task.status === 'hitl_paused' ? "text-amber-400" :
                            task.status === 'failed' ? "text-red-400" :
                            "text-zinc-500"
                          )}>{task.agent}</span>
                        </div>
                        <div className="text-xs text-zinc-400 truncate max-w-[160px] font-mono" title={task.prompt}>
                          {task.prompt}
                        </div>
                        {task.status === 'hitl_paused' && (
                          <div className="mt-3 flex gap-2">
                            <button 
                              onClick={() => fetch(`http://localhost:${(config?.port || 3000) + 1}/api/tasks/${task.id}/approve`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'approve' })
                              })}
                              className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] rounded hover:bg-emerald-500/30"
                            >Approve</button>
                            <button 
                              onClick={() => fetch(`http://localhost:${(config?.port || 3000) + 1}/api/tasks/${task.id}/approve`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'reject' })
                              })}
                              className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] rounded hover:bg-red-500/30"
                            >Reject</button>
                          </div>
                        )}
                      </div>
                      {i < tasks.length - 1 && (
                        <div className="w-8 h-px bg-zinc-700 mx-2" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* LIVE LOGS */}
          <div className="bg-zinc-900/60 backdrop-blur-md border border-zinc-800 rounded-xl flex-1 flex flex-col min-h-[300px] shadow-lg overflow-hidden">
             <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-zinc-400" />
                Console Output
              </h2>
              <button onClick={() => setLogs([])} className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto font-mono text-xs bg-[#0a0a0a]">
              {logs.length === 0 ? (
                <div className="text-zinc-600 flex items-center gap-2">
                  <span className="animate-pulse">_</span> waiting for events...
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.map(log => (
                    <div key={log.id} className="flex gap-3 hover:bg-zinc-900/50 p-1 rounded transition-colors group">
                      <span className="text-zinc-600 shrink-0 select-none">
                        [{log.timestamp.toLocaleTimeString([], { hour12: false })}]
                      </span>
                      {log.agent && (
                        <span className="shrink-0 w-20 text-blue-400/80 uppercase text-[10px] tracking-wider pt-0.5">
                          {log.agent}
                        </span>
                      )}
                      <span className={cn(
                        "break-words",
                        log.type === 'error' ? "text-red-400" :
                        log.type === 'success' ? "text-emerald-400" :
                        "text-zinc-300"
                      )}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: METRICS & CONFIG */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* METRICS */}
          <div className="bg-zinc-900/60 backdrop-blur-md border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/80">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-zinc-400" />
                Metrics
              </h2>
            </div>
            <div className="p-4 space-y-4">
              {Object.entries(metrics).map(([agent, data]) => (
                <div key={agent} className="flex justify-between items-center bg-zinc-800/30 p-3 rounded-lg border border-zinc-700/30">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-1">{agent}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">{data.tokens.toLocaleString()} tokens</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono text-emerald-400">${data.spent.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CONFIG EDITOR */}
          <div className="bg-zinc-900/60 backdrop-blur-md border border-zinc-800 rounded-xl shadow-lg flex-1 flex flex-col overflow-hidden min-h-[300px]">
             <div className="p-2 border-b border-zinc-800 bg-zinc-900/80 flex flex-wrap gap-1">
               {agents.map((ag, idx) => (
                 <button
                   key={ag.name}
                   onClick={() => {
                     setActiveAgentIndex(idx);
                     setAgentContent(ag.content);
                   }}
                   className={cn(
                     "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                     activeAgentIndex === idx ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                   )}
                 >
                   {ag.name}.md
                 </button>
               ))}
             </div>
             <div className="flex-1 p-2 relative group">
                <textarea
                  value={agentContent}
                  onChange={(e) => setAgentContent(e.target.value)}
                  className="w-full h-full bg-zinc-950 text-zinc-300 p-4 font-mono text-xs rounded border border-zinc-800 focus:outline-none focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 resize-none transition-colors"
                  spellCheck={false}
                />
             </div>
             <div className="p-3 border-t border-zinc-800 bg-zinc-900/80 flex justify-end gap-2">
               <button onClick={saveAgent} className="px-4 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-xs font-semibold rounded transition-all active:scale-[0.98] border border-emerald-500/20">
                 Save Changes
               </button>
             </div>
          </div>

          {/* ACTIONS */}
          <div className="flex gap-3">
            <button onClick={mockTrigger} className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-100 hover:bg-white text-zinc-900 rounded-lg text-sm font-semibold transition-all active:scale-[0.98]">
              <Play className="w-4 h-4 fill-current" />
              Run Task
            </button>
            <button onClick={clearTasks} className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-all active:scale-[0.98] border border-zinc-700">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
