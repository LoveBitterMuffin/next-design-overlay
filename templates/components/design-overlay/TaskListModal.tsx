'use client';

import React, { useState, useEffect } from 'react';
import { AnnotationTask } from './types';
import { Language, translations } from './i18n';
import { ListIcon, CloseIcon, TrashIcon } from './Icons';

interface TaskListModalProps {
  lang?: Language;
  onClose: () => void;
  onEditTask: (task: AnnotationTask) => void;
  onSaveTask: (task: AnnotationTask) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

export const TaskListModal: React.FC<TaskListModalProps> = ({
  lang = 'ru',
  onClose,
  onEditTask,
  onSaveTask,
  onDeleteTask,
}) => {
  const t = translations[lang];
  const [tasks, setTasks] = useState<AnnotationTask[]>([]);
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [loading, setLoading] = useState(true);

  // Removed the body overflow hidden to keep the page interactive

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/design-overlay');
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/design-overlay');
        const data = await res.json();
        if (data.success && isMounted) {
          setTasks(data.tasks);
        }
      } catch (err) {
        console.error('Failed to fetch tasks:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleStatus = async (task: AnnotationTask) => {
    const updated: AnnotationTask = {
      ...task,
      status: task.status === 'open' ? 'resolved' : 'open',
      updatedAt: new Date().toISOString(),
    };
    await onSaveTask(updated);
    await fetchTasks();
  };

  const handleDelete = async (taskId: string) => {
    await onDeleteTask(taskId);
    await fetchTasks();
  };

  const filteredTasks = tasks.filter(tItem => {
    if (filter === 'open') return tItem.status === 'open';
    if (filter === 'resolved') return tItem.status === 'resolved';
    return true;
  });

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[10000] flex flex-col bg-[#09090b]/95 border border-zinc-700/80 text-zinc-100 rounded-[2.5rem] shadow-2xl shadow-black/90 backdrop-blur-2xl w-[680px] max-w-[90vw] max-h-[70vh] font-sans text-sm animate-in slide-in-from-bottom-4" style={{ padding: '32px' }}>
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-2" style={{ paddingBottom: '20px', marginBottom: '24px' }}>
          <div className="flex items-center" style={{ gap: '16px' }}>
            <ListIcon className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-lg text-white tracking-wide m-0">{t.taskList}</h3>
            <span className="inline-flex items-center justify-center bg-zinc-800/80 text-zinc-300 border border-zinc-700 px-3 min-w-[32px] h-7 rounded-full font-mono font-bold text-xs">
              {tasks.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
            style={{ padding: '10px' }}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center px-2" style={{ gap: '12px', marginBottom: '24px' }}>
          <button
            onClick={() => setFilter('open')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm transition-all border ${
              filter === 'open'
                ? 'bg-zinc-100 border-transparent text-zinc-950 shadow-md font-bold'
                : 'bg-transparent border-transparent text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200 font-semibold'
            }`}
            style={{ padding: '10px 24px' }}
          >
            {t.openTasks} ({tasks.filter(task => task.status === 'open').length})
          </button>
          <button
            onClick={() => setFilter('resolved')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm transition-all border ${
              filter === 'resolved'
                ? 'bg-zinc-100 border-transparent text-zinc-950 shadow-md font-bold'
                : 'bg-transparent border-transparent text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200 font-semibold'
            }`}
            style={{ padding: '10px 24px' }}
          >
            {t.resolvedTasks} ({tasks.filter(task => task.status === 'resolved').length})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm transition-all border ${
              filter === 'all'
                ? 'bg-zinc-100 border-transparent text-zinc-950 shadow-md font-bold'
                : 'bg-transparent border-transparent text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200 font-semibold'
            }`}
            style={{ padding: '10px 24px' }}
          >
            {t.allTasks} ({tasks.length})
          </button>
        </div>

        {/* Task list container */}
        <div className="flex-1 overflow-y-auto pr-2" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {loading ? (
            <div className="text-center py-12 text-zinc-500 text-sm font-medium">Загрузка...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 text-sm font-medium">{t.noTasks}</div>
          ) : (
            filteredTasks.map(task => (
              <div
                key={task.id}
                className="bg-zinc-900/80 border border-zinc-800 rounded-[20px] hover:border-zinc-700 transition-all shadow-md flex flex-col"
                style={{ padding: '24px', gap: '16px' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center" style={{ gap: '12px' }}>
                    <span
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-full text-[11px] font-bold uppercase tracking-widest ${
                        task.status === 'open'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                      style={{ padding: '6px 16px' }}
                    >
                      {task.status === 'open' ? 'OPEN' : 'RESOLVED'}
                    </span>
                    <span 
                      className="inline-flex items-center justify-center whitespace-nowrap text-xs font-semibold text-zinc-400 bg-zinc-950 rounded-full border border-zinc-800 tracking-wide uppercase"
                      style={{ padding: '6px 16px' }}
                    >
                      {t.categories[task.context.category as keyof typeof t.categories] || task.context.category}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-zinc-500 font-medium">
                    {task.id}
                  </span>
                </div>

                {/* Title & Description */}
                <div>
                  <h4 className="font-bold text-zinc-100 text-base mb-2">
                    {task.context.title}
                  </h4>
                  {task.context.description && (
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      {task.context.description}
                    </p>
                  )}
                </div>

                {/* Target component info */}
                <div className="text-xs font-mono text-zinc-400 bg-zinc-950/60 rounded-2xl border border-zinc-800/80 flex items-center justify-between" style={{ padding: '16px 20px' }}>
                  <div className="flex items-center" style={{ gap: '12px' }}>
                    <span className="text-blue-400 font-bold text-sm">{task.target.componentName}</span>
                    <span className="text-zinc-500 text-xs">({task.target.filePath})</span>
                  </div>
                  {task.context.bestPracticeRule && (
                    <span className="text-amber-400 truncate max-w-[240px] font-medium" title={task.context.bestPracticeRule}>
                      💡 {task.context.bestPracticeRule}
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-end border-t border-zinc-800/60" style={{ paddingTop: '20px', marginTop: '8px', gap: '12px' }}>
                  <button
                    onClick={() => {
                      onEditTask(task);
                      onClose();
                    }}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold transition-colors border border-zinc-700/60 text-sm"
                    style={{ padding: '10px 24px' }}
                  >
                    {t.edit}
                  </button>
                  <button
                    onClick={() => handleToggleStatus(task)}
                    className={`inline-flex items-center justify-center whitespace-nowrap rounded-full font-bold transition-colors text-sm border ${
                      task.status === 'open'
                        ? 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border-emerald-800/50'
                        : 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 border-amber-800/50'
                    }`}
                    style={{ padding: '10px 24px' }}
                  >
                    {task.status === 'open' ? t.resolve : t.reopen}
                  </button>
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/50 font-bold transition-colors text-sm gap-2"
                    style={{ padding: '10px 24px' }}
                  >
                    <TrashIcon className="w-4 h-4 shrink-0" />
                    <span>{t.delete}</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
    </div>
  );
};
