import React, { useState, useEffect } from 'react';
import { Zap, Download, Trash, BookOpen, ShieldCheck } from 'lucide-react';

interface Skill {
  name: string;
  description: string;
  version?: string;
  author?: string;
  path: string;
  isGlobal: boolean;
  instructions: string;
}

const PRESET_SKILLS = [
  { name: 'brandkit', label: 'Brand Kit', icon: '✨', repo: 'github:SabilMurti/skill-brandkit' },
  { name: 'design-taste-frontend', label: 'Frontend Design Taste', icon: '🎨', repo: 'github:SabilMurti/skill-design-taste-frontend' },
  { name: 'redesign-existing-projects', label: 'Redesign Projects', icon: '🔄', repo: 'github:SabilMurti/skill-redesign-existing-projects' },
  { name: 'high-end-visual-design', label: 'High-End Visuals', icon: '💎', repo: 'github:SabilMurti/skill-high-end-visual-design' },
  { name: 'codebase-memory', label: 'Codebase Memory', icon: '🧠', repo: 'github:SabilMurti/skill-codebase-memory' }
];

export const SkillsTab: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [installSource, setInstallSource] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [viewSkill, setViewSkill] = useState<Skill | null>(null);

  const fetchSkills = () => {
    fetch('/api/skills')
      .then(res => res.json())
      .then(data => {
         if (data.skills) setSkills(data.skills);
      })
      .catch(err => console.error("Failed to load skills", err));
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const handleInstall = async (source: string) => {
    if (!source) return;
    setIsInstalling(true);
    try {
      const res = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      });
      if (res.ok) {
        setInstallSource('');
        fetchSkills();
      } else {
        const data = await res.json();
        alert(`Install failed: ${data.error}`);
      }
    } catch (e) {
      alert(`Install error: ${e}`);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete skill ${name}?`)) return;
    try {
      const res = await fetch(`/api/skills/${name}`, { method: 'DELETE' });
      if (res.ok) fetchSkills();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-mono text-zinc-100 flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#f59e0b]" />
          Skills Hub
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recommended Skills Gallery */}
        <div className="lg:col-span-3 bg-[#121215] border border-[#27272a] rounded-lg p-5">
           <h3 className="font-mono text-sm font-bold text-zinc-100 mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Recommended Skills Gallery
           </h3>
           <div className="flex flex-wrap gap-3">
              {PRESET_SKILLS.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => handleInstall(preset.repo)}
                  disabled={isInstalling || skills.some(s => s.name === preset.name)}
                  className={`flex flex-col items-start gap-1 p-3 rounded border text-left transition-colors min-w-[160px] ${
                    skills.some(s => s.name === preset.name)
                     ? 'bg-zinc-900 border-[#27272a] opacity-50 cursor-not-allowed'
                     : 'bg-[#18181b] border-[#3f3f46] hover:border-[#f59e0b] hover:bg-[#1f1f22]'
                  }`}
                >
                   <span className="text-lg">{preset.icon}</span>
                   <span className="font-mono text-xs font-bold text-zinc-200">{preset.label}</span>
                   <span className="font-mono text-[10px] text-zinc-500">
                     {skills.some(s => s.name === preset.name) ? 'Installed' : 'Click to install'}
                   </span>
                </button>
              ))}
           </div>
        </div>

        {/* Install Custom Skill */}
        <div className="lg:col-span-3 bg-[#121215] border border-[#27272a] rounded-lg p-5 flex flex-col gap-3">
           <h3 className="font-mono text-sm font-bold text-zinc-100">Install Custom Skill</h3>
           <div className="flex gap-2">
              <input
                 type="text"
                 placeholder="github:owner/repo or /path/to/local"
                 value={installSource}
                 onChange={e => setInstallSource(e.target.value)}
                 className="flex-1 bg-zinc-900 border border-[#27272a] rounded px-3 py-2 font-mono text-xs text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
              />
              <button
                 onClick={() => handleInstall(installSource)}
                 disabled={isInstalling || !installSource}
                 className="bg-[#f59e0b] hover:bg-[#d97706] text-black font-mono text-xs font-bold px-4 py-2 rounded flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                 <Download className="w-4 h-4" />
                 {isInstalling ? 'Installing...' : 'Install Skill'}
              </button>
           </div>
        </div>

        {/* Installed Skills Grid */}
        <div className="lg:col-span-3">
           <h3 className="font-mono text-sm font-bold text-zinc-100 mb-4">Installed Skills ({skills.length})</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {skills.map(skill => (
                 <div key={skill.name} className="bg-[#121215] border border-[#27272a] rounded-lg p-4 flex flex-col justify-between">
                    <div>
                       <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono text-sm font-bold text-emerald-400">{skill.name}</span>
                          <span className="px-1.5 py-0.5 rounded-sm bg-zinc-800 border border-zinc-700 text-[9px] font-mono text-zinc-400">
                             {skill.isGlobal ? 'GLOBAL' : 'WORKSPACE'}
                          </span>
                       </div>
                       <p className="text-xs text-zinc-400 font-mono mb-2 line-clamp-2">{skill.description}</p>
                       <div className="flex gap-4 text-[10px] font-mono text-zinc-500 mb-4">
                          {skill.version && <span>v{skill.version}</span>}
                          {skill.author && <span>by {skill.author}</span>}
                       </div>
                    </div>
                    <div className="flex items-center gap-2 pt-3 border-t border-[#27272a]">
                       <button
                          onClick={() => setViewSkill(skill)}
                          className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px] font-mono font-bold py-1.5 rounded flex justify-center items-center gap-1.5 transition-colors border border-[#27272a]"
                       >
                          <BookOpen className="w-3.5 h-3.5" />
                          SKILL.md
                       </button>
                       <button
                          onClick={() => handleDelete(skill.name)}
                          className="w-8 h-8 flex items-center justify-center bg-zinc-900 hover:bg-red-900/30 text-zinc-500 hover:text-red-400 border border-[#27272a] hover:border-red-900/50 rounded transition-colors"
                          title="Delete skill"
                       >
                          <Trash className="w-3.5 h-3.5" />
                       </button>
                    </div>
                 </div>
              ))}
              {skills.length === 0 && (
                 <div className="col-span-full py-8 text-center border border-dashed border-[#27272a] rounded-lg bg-[#121215]/50">
                    <Zap className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                    <p className="font-mono text-xs text-zinc-500">No skills installed.</p>
                 </div>
              )}
           </div>
        </div>
      </div>

      {/* SKILL.md Inspector Modal */}
      {viewSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
           <div className="bg-[#121215] border border-[#27272a] rounded-lg shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between p-4 border-b border-[#27272a] shrink-0">
                 <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-mono text-sm font-bold text-zinc-100">{viewSkill.name}/SKILL.md</h3>
                 </div>
                 <button
                    onClick={() => setViewSkill(null)}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors"
                 >
                    ✕
                 </button>
              </div>
              <div className="p-4 overflow-auto font-mono text-xs text-zinc-300 leading-relaxed bg-[#09090b] m-4 rounded border border-[#27272a]">
                 <pre className="whitespace-pre-wrap">{viewSkill.instructions}</pre>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};