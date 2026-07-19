import { useState, useEffect } from 'react';
import { LucideSave, FileCode, CheckCircle2 } from 'lucide-react';

interface AgentData {
  name: string;
  content: string;
}

export function DirectivesTab() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      if (data.agents && data.agents.length > 0) {
        setAgents(data.agents);
        setActiveAgent(data.agents[0].name);
        setContent(data.agents[0].content);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTabClick = (name: string) => {
    setActiveAgent(name);
    const agent = agents.find(a => a.name === name);
    if (agent) {
      setContent(agent.content);
      setSaved(false);
    }
  };

  const handleSave = async () => {
    if (!activeAgent) return;
    setSaving(true);
    try {
      await fetch(`/api/agents/${activeAgent}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      // update local state
      setAgents(agents.map(a => a.name === activeAgent ? { ...a, content } : a));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
      alert('Failed to save directive');
    } finally {
      setSaving(false);
    }
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
              activeAgent === agent.name
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span className="capitalize">{agent.name}</span>
          </button>
        ))}
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        <textarea
          value={content}
          onChange={e => {
            setContent(e.target.value);
            setSaved(false);
          }}
          className="flex-1 w-full p-4 bg-transparent text-zinc-200 font-mono text-sm resize-none focus:outline-none custom-scrollbar"
          spellCheck={false}
          placeholder="Agent directive markdown..."
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
             {saving ? 'Saving...' : 'Save Directive'}
           </button>
        </div>
      </div>
    </div>
  );
}
