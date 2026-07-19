import { useState, useEffect } from 'react';
import { LucideSettings, LucideSave } from 'lucide-react';

export function SettingsTab() {
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      alert('Settings saved!');
    } catch (e) {
      console.error(e);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!config) return <div className="p-8 text-zinc-400">Loading settings...</div>;

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <h2 className="text-2xl font-semibold text-emerald-400 flex items-center gap-3">
          <LucideSettings className="w-6 h-6" /> Advanced Configuration
        </h2>
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-500 text-zinc-100 px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2"
        >
          <LucideSave className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 9router Config */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-lg space-y-4">
          <h3 className="text-lg font-medium text-zinc-200">9router Connection</h3>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">API Key</label>
            <input 
              type="password"
              value={config.nineRouter.apiKey}
              onChange={e => setConfig({...config, nineRouter: {...config.nineRouter, apiKey: e.target.value}})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Base URL</label>
            <input 
              type="text"
              value={config.nineRouter.baseUrl}
              onChange={e => setConfig({...config, nineRouter: {...config.nineRouter, baseUrl: e.target.value}})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Daily Budget (USD)</label>
            <input 
              type="number"
              value={config.nineRouter.dailyBudgetUSD}
              onChange={e => setConfig({...config, nineRouter: {...config.nineRouter, dailyBudgetUSD: parseFloat(e.target.value)}})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none" 
            />
          </div>
        </div>

        {/* Model Roles */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-lg space-y-4">
          <h3 className="text-lg font-medium text-zinc-200">Agent Models</h3>
          {['planner', 'coder', 'reviewer', 'scout'].map(role => (
            <div key={role}>
              <label className="block text-sm text-zinc-400 mb-1 capitalize">{role} Model</label>
              <input 
                type="text"
                value={config.modelRoles[role]}
                onChange={e => setConfig({...config, modelRoles: {...config.modelRoles, [role]: e.target.value}})}
                placeholder="e.g. 9router/ag/gemini-3.1-pro"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none" 
              />
            </div>
          ))}
        </div>

        {/* Sandbox & Execution */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-lg space-y-4">
          <h3 className="text-lg font-medium text-zinc-200">Execution Sandbox</h3>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Driver</label>
            <select 
              value={config.sandbox.driver}
              onChange={e => setConfig({...config, sandbox: {...config.sandbox, driver: e.target.value}})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="local">Local Native (Direct Execution)</option>
              <option value="docker">Docker Container</option>
            </select>
          </div>
          {config.sandbox.driver === 'docker' && (
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Docker Image</label>
              <input 
                type="text"
                value={config.sandbox.dockerImage}
                onChange={e => setConfig({...config, sandbox: {...config.sandbox, dockerImage: e.target.value}})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none" 
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Timeout (ms)</label>
            <input 
              type="number"
              value={config.sandbox.timeoutMs}
              onChange={e => setConfig({...config, sandbox: {...config.sandbox, timeoutMs: parseInt(e.target.value, 10)}})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none" 
            />
          </div>
        </div>

        {/* Policy Config */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-lg space-y-4">
          <h3 className="text-lg font-medium text-zinc-200">Policy & Automation</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input 
              type="checkbox"
              checked={config.hitl.autoApproveSafeCommands}
              onChange={e => setConfig({...config, hitl: {...config.hitl, autoApproveSafeCommands: e.target.checked}})}
              className="w-4 h-4 text-emerald-500 bg-zinc-950 border-zinc-800 rounded focus:ring-emerald-500" 
            />
            <span className="text-sm text-zinc-300">Auto-approve safe commands (read, grep)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input 
              type="checkbox"
              checked={config.consensus.strictMode}
              onChange={e => setConfig({...config, consensus: {...config.consensus, strictMode: e.target.checked}})}
              className="w-4 h-4 text-emerald-500 bg-zinc-950 border-zinc-800 rounded focus:ring-emerald-500" 
            />
            <span className="text-sm text-zinc-300">Require full consensus strict mode</span>
          </label>
          <div>
             <label className="block text-sm text-zinc-400 mb-1">Max Retries</label>
             <input 
               type="number"
               value={config.consensus.maxRetries}
               onChange={e => setConfig({...config, consensus: {...config.consensus, maxRetries: parseInt(e.target.value, 10)}})}
               className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none" 
             />
           </div>
        </div>

      </div>
    </div>
  );
}
