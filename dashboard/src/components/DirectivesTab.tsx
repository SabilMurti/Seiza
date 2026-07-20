import { useState, useEffect } from 'react';
import { LucideSave, FileCode, CheckCircle2 } from 'lucide-react';

interface AgentData {
  name: string;
  filename: string;
  description: string;
  model: string;
  tools: string;
  systemPrompt: string;
  fullContent: string;
}

export function DirectivesTab() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [activeAgent, setActiveAgent] = useState<AgentData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [globalRules, setGlobalRules] = useState<string>('');
  const [workspaceRules, setWorkspaceRules] = useState<string>('');
  const [rulesActive, setRulesActive] = useState<boolean>(false);
  const [rulesTab, setRulesTab] = useState<'global'|'workspace'>('global');
  const [savingRules, setSavingRules] = useState(false);
  const [savedRules, setSavedRules] = useState(false);

  useEffect(() => {
    fetchRules();
    fetchAgents();
  }, []);


  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      if (data.agents && data.agents.length > 0) {
        setAgents(data.agents);
        setActiveAgent(data.agents[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/rules');
      const data = await res.json();
      setGlobalRules(data.globalRules || '');
      setWorkspaceRules(data.workspaceRules || '');
    } catch (e) {
      console.error(e);
    }
  };


  const handleTabClick = (name: string) => {
    setRulesActive(false);
    const agent = agents.find(a => a.name === name);
    if (agent) {
      setActiveAgent(agent);
      setSaved(false);
    }
  };

  const handleRulesTabClick = () => {
    setRulesActive(true);
    setActiveAgent(null);
  };

  const handleSaveRules = async () => {
    setSavingRules(true);
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalRules, workspaceRules })
      });
      if (res.ok) {
        setSavedRules(true);
        setTimeout(() => setSavedRules(false), 3000);
      }
    } catch(e) {
      console.error(e);
    }
    setSavingRules(false);
  };


  const handleSave = async () => {
    if (!activeAgent) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${activeAgent.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeAgent.model,
          description: activeAgent.description,
          tools: activeAgent.tools,
          systemPrompt: activeAgent.systemPrompt
        })
      });
      const data = await res.json();
      if (data.success && data.agent) {
        setAgents(agents.map(a => a.name === activeAgent.name ? data.agent : a));
        setActiveAgent(data.agent);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert('Failed to save directive: ' + data.error);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to save directive');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeAgent) return;
    if (!confirm(`Are you sure you want to delete agent "${activeAgent.name}"?`)) return;
    try {
      const res = await fetch(`/api/agents/${activeAgent.name}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        const remaining = agents.filter(a => a.name !== activeAgent.name);
        setAgents(remaining);
        setActiveAgent(remaining.length > 0 ? remaining[0] : null);
      } else {
        alert('Failed to delete agent: ' + data.error);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to delete agent');
    }
  };

  const handleAddAgent = () => {
    const name = prompt('Enter new agent name (e.g. architect):');
    if (!name) return;
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!cleanName) return;
    if (agents.find(a => a.name === cleanName)) {
      alert('Agent already exists');
      return;
    }
    const newAgent: AgentData = {
      name: cleanName,
      filename: `${cleanName}.md`,
      description: 'A new subagent',
      model: '9router/ag/gemini-3.1-pro-low',
      tools: '',
      systemPrompt: 'You are a helpful subagent.',
      fullContent: ''
    };
    const updated = [...agents, newAgent];
    setAgents(updated);
    setActiveAgent(newAgent);
  };

  if (agents.length === 0) {
    return <div className="p-8 text-zinc-400">Loading agents...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#121215] border border-[#27272a] rounded-lg overflow-hidden">
      {/* Horizontal Tabs */}
      <div className="flex border-b border-[#27272a] bg-zinc-950 overflow-x-auto custom-scrollbar">
        {agents.map(agent => (
          <button
            key={agent.name}
            onClick={() => handleTabClick(agent.name)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeAgent?.name === agent.name
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span className="capitalize">{agent.name}</span>
          </button>
        ))}
        <button
          onClick={handleRulesTabClick}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
            rulesActive
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>System &amp; Project Rules</span>
        </button>
      </div>
      <div className="p-2 border-b border-[#27272a] bg-[#09090b]">
         <button onClick={handleAddAgent} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
            + Add New Agent
         </button>
      </div>
      <div className="flex-1 flex flex-col min-h-0 relative">
        {rulesActive ? (
          <div className="flex flex-col h-full bg-[#09090b]">
            <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
              <div className="flex gap-4">
                <button
                  onClick={() => setRulesTab('global')}
                  className={`px-3 py-1.5 text-sm rounded ${rulesTab === 'global' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Global Rules (~/.seiza/RULES.md)
                </button>
                <button
                  onClick={() => setRulesTab('workspace')}
                  className={`px-3 py-1.5 text-sm rounded ${rulesTab === 'workspace' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Workspace Rules (AGENTS.md / RULES.md)
                </button>
              </div>
              <button
                onClick={handleSaveRules}
                disabled={savingRules}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-all duration-300 ${
                  savedRules 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 border border-emerald-500/50'
                }`}
              >
                {savedRules ? (
                  <><CheckCircle2 className="w-4 h-4" /> Saved</>
                ) : (
                  <><LucideSave className="w-4 h-4" /> {savingRules ? 'Saving...' : 'Save Rules'}</>
                )}
              </button>
            </div>
            <div className="flex-1 p-4">
              {rulesTab === 'global' ? (
                <textarea
                  value={globalRules}
                  onChange={(e) => setGlobalRules(e.target.value)}
                  className="w-full h-full bg-[#121215] text-zinc-300 p-4 font-mono text-sm resize-none focus:outline-none border border-[#27272a] rounded shadow-inner"
                  spellCheck={false}
                  placeholder="# Global Rules\n\nAdd cross-project rules here..."
                />
              ) : (
                <textarea
                  value={workspaceRules}
                  onChange={(e) => setWorkspaceRules(e.target.value)}
                  className="w-full h-full bg-[#121215] text-zinc-300 p-4 font-mono text-sm resize-none focus:outline-none border border-[#27272a] rounded shadow-inner"
                  spellCheck={false}
                  placeholder="# Workspace Rules\n\nAdd project-specific rules here..."
                />
              )}
            </div>
          </div>
        ) : (
        <>
        {/* Header bar for agent */}
        {activeAgent && (
          <div className="flex flex-col p-4 border-b border-[#27272a] bg-[#09090b] gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-emerald-400" />
                <span className="font-mono font-medium text-zinc-200 capitalize">{activeAgent.name}</span>
                <span className="text-zinc-500 font-mono text-xs">({activeAgent.filename})</span>
              </div>
              <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-300 px-3 py-1 rounded hover:bg-red-950 transition-colors">
                Delete Agent
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500 font-mono">Model</label>
                <input
                  type="text"
                  value={activeAgent.model}
                  onChange={e => {
                    setActiveAgent({ ...activeAgent, model: e.target.value });
                    setSaved(false);
                  }}
                  placeholder="e.g. 9router/ag/gemini-3.1-pro-low"
                  className="bg-[#121215] border border-[#27272a] rounded px-3 py-1.5 text-sm font-mono text-zinc-200 focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500 font-mono">Description</label>
                <input
                  type="text"
                  value={activeAgent.description}
                  onChange={e => {
                    setActiveAgent({ ...activeAgent, description: e.target.value });
                    setSaved(false);
                  }}
                  className="bg-[#121215] border border-[#27272a] rounded px-3 py-1.5 text-sm font-mono text-zinc-200 focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="text-xs text-zinc-500 font-mono">Tools (comma separated)</label>
                <input
                  type="text"
                  value={activeAgent.tools}
                  onChange={e => {
                    setActiveAgent({ ...activeAgent, tools: e.target.value });
                    setSaved(false);
                  }}
                  placeholder="read, write, bash"
                  className="bg-[#121215] border border-[#27272a] rounded px-3 py-1.5 text-sm font-mono text-zinc-200 focus:border-emerald-400 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        <textarea
          value={activeAgent?.systemPrompt || ''}
          onChange={e => {
            if (activeAgent) {
              setActiveAgent({ ...activeAgent, systemPrompt: e.target.value });
              setSaved(false);
            }
          }}
          className="flex-1 w-full p-4 bg-transparent text-zinc-200 font-mono text-sm resize-none focus:outline-none custom-scrollbar"
          spellCheck={false}
          placeholder="Agent directive markdown..."
          disabled={!activeAgent}
        />
        
        {/* Floating Save Button */}
        <div className="absolute bottom-6 right-6 flex items-center gap-3">
           {saved && <span className="text-emerald-400 text-sm flex items-center gap-1 animate-in fade-in"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
           <button 
             onClick={handleSave}
             disabled={saving}
             className="bg-emerald-600 hover:bg-emerald-500 text-zinc-100 px-4 py-2 rounded shadow-lg shadow-black/50 font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
           >
             <LucideSave className="w-4 h-4" />
             {saving ? 'Saving...' : 'Save Directive & Model'}
           </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
