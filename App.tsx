import React, { useState, useEffect } from 'react';
import { Editor } from './components/Editor';
import { Prompter } from './components/Prompter';
import { AppMode, SavedScript } from './types';

const STORAGE_KEY = 'voice_prompter_scripts_v1';
const MAX_SCRIPTS = 10;

function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.EDITOR);
  
  // Initialize scripts from local storage or create default
  const [scripts, setScripts] = useState<SavedScript[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migration: Ensure all scripts have a title property if loading old data
        return parsed.map((s: any) => ({
          ...s,
          title: s.title || (s.content ? s.content.split('\n')[0].substring(0, 30) : 'Untitled Script')
        }));
      }
    } catch (e) {
      console.error("Failed to load scripts", e);
    }
    return [{ id: crypto.randomUUID(), title: 'Welcome to Legg.io', content: '', lastModified: Date.now() }];
  });

  const [activeScriptId, setActiveScriptId] = useState<string>(() => {
    // Try to restore last active script or default to first
    return scripts.length > 0 ? scripts[0].id : '';
  });

  // Auto-save to LocalStorage whenever scripts change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
  }, [scripts]);

  // Actions
  const handleUpdateScript = (content: string) => {
    setScripts(prev => prev.map(s => 
      s.id === activeScriptId 
        ? { ...s, content, lastModified: Date.now() } 
        : s
    ));
  };

  const handleRenameScript = (title: string) => {
    setScripts(prev => prev.map(s => 
      s.id === activeScriptId 
        ? { ...s, title, lastModified: Date.now() } 
        : s
    ));
  };

  const handleCreateScript = () => {
    if (scripts.length >= MAX_SCRIPTS) return;
    
    const newScript: SavedScript = {
      id: crypto.randomUUID(),
      title: 'New Script',
      content: '',
      lastModified: Date.now()
    };
    
    setScripts(prev => [newScript, ...prev]);
    setActiveScriptId(newScript.id);
  };

  const handleDeleteScript = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    // Prevent deleting the last script
    if (scripts.length <= 1) {
      handleUpdateScript(''); 
      handleRenameScript('Untitled Script');
      return;
    }

    const newScripts = scripts.filter(s => s.id !== id);
    setScripts(newScripts);
    
    // If we deleted the active script, select the first available
    if (id === activeScriptId) {
      setActiveScriptId(newScripts[0].id);
    }
  };

  const activeScript = scripts.find(s => s.id === activeScriptId);

  return (
    <div className="min-h-screen bg-black text-slate-100 font-sans">
      {mode === AppMode.EDITOR ? (
        <Editor 
          scripts={scripts}
          activeId={activeScriptId}
          onUpdate={handleUpdateScript}
          onRename={handleRenameScript}
          onSelect={setActiveScriptId}
          onCreate={handleCreateScript}
          onDelete={handleDeleteScript}
          onStart={() => setMode(AppMode.PROMPTER)} 
        />
      ) : (
        <Prompter 
          script={activeScript?.content || "No text available."} 
          onBack={() => setMode(AppMode.EDITOR)} 
        />
      )}
    </div>
  );
}

export default App;