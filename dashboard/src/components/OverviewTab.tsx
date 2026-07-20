import { useEffect, useState } from 'react';
import { Network, Terminal, Activity, CheckCircle2, Clock, Cpu, Play } from 'lucide-react';

interface LogEvent {
  id: string;
  timestamp: number;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  agent: string;
}

interface TaskItem {
  id: string;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting_approval';
  startTime: number;
  agent?: string;
  model?: string;
}

export function OverviewTab() {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [activeTasks, setActiveTasks] = useState<TaskItem[]>([]);
  const [stats] = useState({ totalTasks: 0, activeAgents: 8, uptime: 'Online' });

  useEffect(() => {
    // Fetch initial task state
    const fetchTasks = async () => {
      try {
        const res = await fetch('/api/tasks');
        if (res.ok) {
          const data = await res.json();
          if (data.tasks) {
            setActiveTasks(data.tasks);
          }
        }
      } catch (e) {
        console.error('Failed to fetch tasks', e);
      }
    };

    fetchTasks();
    const interval = setInterval(fetchTasks, 4000);

    // SSE Stream
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.type === 'log') {
          setLogs(prev => [
            {
              id: Math.random().toString(),
              timestamp: Date.now(),
              type: 'info',
              message: parsed.message || JSON.stringify(parsed),
              agent: parsed.agent || 'system'
            },
            ...prev.slice(0, 199)
          ]);
        }
      } catch (err) {
        console.error(err);
      }
    };

    return () => {
      clearInterval(interval);
      es.close();
    };
  }, []);

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Top Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#121215] border border-[#27272a] rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-zinc-400">Total System Tasks</div>
            <div className="text-2xl font-bold font-mono text-zinc-100 mt-1">{activeTasks.length}</div>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121215] border border-[#27272a] rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-zinc-400">Sub-Agent Directives</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{stats.activeAgents} Registered</div>
          </div>
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-lg">
            <Cpu className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121215] border border-[#27272a] rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-zinc-400">Daemon Status</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{stats.uptime}</div>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121215] border border-[#27272a] rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-zinc-400">Active Pipeline DAG</div>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
              {activeTasks.filter(t => t.status === 'running').length} Active
            </div>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main DAG & Live Log Split */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* DAG Task Pipeline Status */}
        <div className="bg-[#121215] border border-[#27272a] rounded-lg p-5 flex flex-col">
          <h2 className="text-lg font-bold font-mono text-zinc-100 flex items-center gap-2 mb-4">
            <Network className="w-5 h-5 text-emerald-400" />
            Active DAG Execution Pipeline
          </h2>

          <div className="flex-1 overflow-y-auto space-y-3">
            {activeTasks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-[#27272a] rounded-lg bg-[#09090b]/50">
                <Network className="w-10 h-10 text-zinc-600 mb-3 animate-pulse" />
                <h3 className="text-sm font-mono font-medium text-zinc-300">No Active DAG Pipeline</h3>
                <p className="text-xs font-mono text-zinc-500 mt-1 max-w-xs">
                  Trigger tasks via Antigravity IDE using <code className="text-emerald-400">run_seiza_task</code> or REST API.
                </p>
              </div>
            ) : (
              activeTasks.map((t) => (
                <div key={t.id} className="p-3.5 bg-[#09090b] border border-[#27272a] rounded-lg font-mono text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-emerald-400 font-bold">Task #{t.id.slice(0, 8)}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                      t.status === 'running' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      t.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                  <p className="text-zinc-300 line-clamp-2">{t.prompt}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Stream Terminal Logs */}
        <div className="lg:col-span-2 bg-[#121215] border border-[#27272a] rounded-lg p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold font-mono text-zinc-100 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-emerald-400" />
              Live Output & Event Stream
            </h2>
            <button
              onClick={() => setLogs([])}
              className="text-xs font-mono text-zinc-400 hover:text-zinc-200 px-2 py-1 bg-[#18181b] border border-[#27272a] rounded"
            >
              Clear Terminal
            </button>
          </div>

          <div className="flex-1 bg-[#09090b] rounded-lg border border-[#27272a] p-4 font-mono text-xs overflow-y-auto space-y-2">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500">
                <Play className="w-8 h-8 text-zinc-600 mb-2 opacity-60" />
                <p className="text-xs font-mono">Listening for live SSE events and logs...</p>
                <p className="text-[11px] text-zinc-600 mt-1">Output from parallel sub-agents will stream here in real-time.</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="py-1 border-b border-[#27272a]/40 flex gap-3">
                  <span className="text-zinc-500 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="text-emerald-400 font-bold shrink-0">[{log.agent}]</span>
                  <span className="text-zinc-300 break-all">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
