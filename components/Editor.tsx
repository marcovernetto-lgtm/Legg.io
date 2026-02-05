import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Play, Eraser, Plus, FileText, Trash2, Edit2 } from 'lucide-react';
import { SavedScript } from '../types';

interface EditorProps {
  scripts: SavedScript[];
  activeId: string;
  onUpdate: (content: string) => void;
  onRename: (title: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onStart: () => void;
}

export const Editor: React.FC<EditorProps> = ({ 
  scripts, 
  activeId, 
  onUpdate, 
  onRename,
  onSelect, 
  onCreate, 
  onDelete, 
  onStart 
}) => {

  const activeScript = scripts.find(s => s.id === activeId);
  const [typedSuffix, setTypedSuffix] = useState('');
  const [showCursor, setShowCursor] = useState(true);

  // Typewriter effect for the ".io" part
  useEffect(() => {
    const text = ".io";
    let index = 0;
    
    // Initial delay before typing starts (wait for page fade-in)
    const startTimeout = setTimeout(() => {
        const interval = setInterval(() => {
            setTypedSuffix(text.substring(0, index + 1));
            index++;
            if (index === text.length) {
                clearInterval(interval);
                // After typing is done, let it blink for ~2.2 seconds (2 blinks) then remove
                setTimeout(() => {
                  setShowCursor(false);
                }, 2200);
            }
        }, 200); // Speed of typing
        return () => clearInterval(interval);
    }, 800);

    return () => clearTimeout(startTimeout);
  }, []);

  const formatDate = (ts: number) => {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' }).format(new Date(ts));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#050505]">
      
      {/* Sidebar - File List */}
      <aside className="w-80 bg-[#0a0a0a] border-r border-white/5 flex flex-col hidden md:flex z-20">
        <div className="p-8 pb-4">
          <h1 className="text-4xl font-extrabold text-white tracking-tighter flex items-center mb-1 select-none">
            Legg
            <span className="text-blue-500">{typedSuffix}</span>
            {showCursor && <span className="w-3 h-9 bg-blue-500 ml-1 animate-blink"></span>}
          </h1>
          {/* Subtitle removed for cleaner look */}
        </div>

        <div className="px-6 py-4">
          <Button 
            onClick={onCreate} 
            className="w-full justify-start bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 hover:border-zinc-700 transition-all duration-300 group" 
            icon={<Plus size={18} className="text-blue-500 group-hover:scale-110 transition-transform"/>}
            disabled={scripts.length >= 10}
          >
            New Script
          </Button>
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-zinc-600 mt-6 mb-2 px-1 font-semibold">
             <span>My Library</span>
             <span>{scripts.length}/10</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 custom-scrollbar">
          {scripts.map((script, idx) => (
            <div 
              key={script.id}
              onClick={() => onSelect(script.id)}
              style={{ animationDelay: `${idx * 50}ms` }}
              className={`animate-fade-in-up group relative flex flex-col p-4 rounded-xl cursor-pointer transition-all duration-300 border ${
                script.id === activeId 
                  ? 'bg-zinc-900/80 border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                  : 'bg-transparent border-transparent hover:bg-zinc-900/50 hover:border-zinc-800 hover:translate-x-1'
              }`}
            >
              <div className="flex items-start justify-between relative z-10">
                <div className="flex items-center gap-3 overflow-hidden w-full">
                   <div className={`p-1.5 rounded-lg shrink-0 ${script.id === activeId ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-500 group-hover:text-zinc-400'}`}>
                     <FileText size={14} />
                   </div>
                   <span className={`text-sm font-medium truncate transition-colors w-full ${script.id === activeId ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"}`}>
                     {script.title || "Untitled Script"}
                   </span>
                </div>
                <button 
                  onClick={(e) => onDelete(e, script.id)}
                  className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-red-900/20 rounded absolute right-2 top-2"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <span className="text-[10px] text-zinc-600 ml-10 mt-1">
                {formatDate(script.lastModified)}
              </span>
              
              {/* Active Indicator Strip */}
              {script.id === activeId && (
                <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-r-full"></div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative z-10">
        
        {/* Ambient Background Gradient Blob */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>

        {/* Mobile Header */}
        <div className="md:hidden p-4 bg-black/80 backdrop-blur-md border-b border-zinc-800 flex justify-between items-center sticky top-0 z-50">
             <h1 className="font-bold text-lg tracking-tight flex items-center">
               Legg<span className="text-blue-500">.io</span>
             </h1>
             <div className="flex gap-2">
                 <button onClick={onCreate} disabled={scripts.length >= 10} className="p-2 bg-zinc-800 rounded-lg text-sm disabled:opacity-50"><Plus size={18}/></button>
                 <select 
                    value={activeId} 
                    onChange={(e) => onSelect(e.target.value)}
                    className="bg-zinc-800 rounded-lg px-2 py-1 text-sm max-w-[140px] border-none focus:ring-1 focus:ring-blue-500"
                 >
                    {scripts.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                 </select>
             </div>
        </div>

        {/* Toolbar */}
        <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-transparent z-10 animate-fade-in-up">
          <div className="w-full md:w-2/3 group">
             {/* Editable Title Input */}
             <div className="relative flex items-center">
                 <input 
                    type="text"
                    value={activeScript?.title || ''}
                    onChange={(e) => onRename(e.target.value)}
                    placeholder="Script Title"
                    className="w-full bg-transparent text-2xl md:text-3xl font-bold text-white tracking-tight border-none focus:ring-0 placeholder-zinc-700 p-0 m-0"
                    maxLength={50}
                 />
                 <Edit2 size={16} className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity ml-2 pointer-events-none" />
             </div>
             
             <div className="flex items-center gap-3 mt-2">
                <span className="text-zinc-500 text-xs font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {activeScript?.content.length || 0} chars
                </span>
                <span className="text-zinc-600 text-xs">
                    Last edited {formatDate(activeScript?.lastModified || Date.now())}
                </span>
             </div>
          </div>
          
          <Button 
            onClick={onStart} 
            className="w-full md:w-auto px-8 py-3 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all duration-300 transform active:scale-95 bg-gradient-to-r from-blue-600 to-indigo-600 border border-white/10" 
            icon={<Play size={20} className="fill-white" />}
            disabled={!activeScript?.content.trim()}
          >
            Start Prompter
          </Button>
        </div>

        {/* Text Area Container */}
        <div className="flex-1 relative px-4 md:px-8 pb-8 animate-scale-in delay-100">
          <div className="w-full h-full relative group flex flex-col">
            
            {/* The Paper Sheet */}
            <div className="flex-1 relative bg-zinc-900/30 backdrop-blur-sm border border-white/5 rounded-2xl overflow-hidden transition-all duration-500 focus-within:bg-zinc-900/50 focus-within:border-blue-500/30 focus-within:ring-1 focus-within:ring-blue-500/30">
                <textarea
                value={activeScript?.content || ''}
                onChange={(e) => onUpdate(e.target.value)}
                placeholder="Type your script here..."
                className="w-full h-full bg-transparent border-none p-6 md:p-10 text-lg md:text-xl text-slate-200 resize-none focus:ring-0 focus:outline-none leading-relaxed placeholder-zinc-700 custom-scrollbar"
                spellCheck={false}
                />
                
                {/* Floating Action Button inside text area */}
                {activeScript?.content && (
                    <button
                        onClick={() => onUpdate('')}
                        className="absolute bottom-6 right-6 p-3 text-zinc-500 hover:text-white bg-zinc-800/50 hover:bg-red-500/80 backdrop-blur rounded-full transition-all duration-300 shadow-lg transform hover:scale-110"
                        title="Clear Text"
                    >
                        <Eraser size={18} />
                    </button>
                )}
            </div>

            {/* Bottom Helper Hint */}
            <div className="mt-3 text-center md:text-right">
                 <p className="text-zinc-600 text-xs flex items-center justify-end gap-1.5 opacity-60">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                    Changes saved automatically
                 </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};