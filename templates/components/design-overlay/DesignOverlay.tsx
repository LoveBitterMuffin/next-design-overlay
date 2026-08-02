'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AnnotationTask, DrawShape, ToolType, GuideLine } from './types';
import { getElementSourceInfo, SourceInfo } from './fiberResolver';
import { CanvasMarkup } from './CanvasMarkup';
import { AnnotationModal } from './AnnotationModal';
import { TaskListModal } from './TaskListModal';
import { Language, translations } from './i18n';
import {
  PaletteIcon,
  InspectIcon,
  PencilIcon,
  EraserIcon,
  BoxIcon,
  ArrowIcon,
  PinIcon,
  TrashIcon,
  ListIcon,
  GridIcon,
  ColumnsIcon,
  GlobeIcon,
  CheckIcon,
  GripVerticalIcon,
  UndoIcon,
  CopyIcon,
  SendIcon,
  CloseIcon,
  RulerIcon,
  CursorIcon,
} from './Icons';

export const DesignOverlay: React.FC = () => {
  const [active, setActive] = useState(false);
  const [lang, setLang] = useState<Language>('ru');
  const [showGrid, setShowGrid] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [columnCount, setColumnCount] = useState(12);
  const [rowCount, setRowCount] = useState(8);
  const [showGuides, setShowGuides] = useState(false);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [activeColor, setActiveColor] = useState<string>('#ec4899');
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null);
  const [shapes, setShapes] = useState<DrawShape[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTaskListOpen, setIsTaskListOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AnnotationTask | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [taskListRefreshKey, setTaskListRefreshKey] = useState(0);
  const [tasks, setTasks] = useState<AnnotationTask[]>([]);
  const [history, setHistory] = useState<{ shape: DrawShape, taskId?: string }[]>([]);
  const [redoStack, setRedoStack] = useState<{ shape: DrawShape, taskId?: string }[]>([]);
  const [absoluteTargetRect, setAbsoluteTargetRect] = useState<DOMRect | null>(null);
  const [scrollPos, setScrollPos] = useState({
    x: typeof window !== 'undefined' ? window.scrollX : 0,
    y: typeof window !== 'undefined' ? window.scrollY : 0,
  });
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // Fetch tasks on mount and when refresh key changes
  useEffect(() => {
    fetch('/api/design-overlay')
      .then(res => res.json())
      .then(data => {
        if (data.success) setTasks(data.tasks);
      })
      .catch(console.error);
  }, [taskListRefreshKey]);

  // Track window scrolling for badges
  useEffect(() => {
    const handleScroll = () => {
      setScrollPos({ x: window.scrollX, y: window.scrollY });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Update absoluteTargetRect when selectedElement changes
  useEffect(() => {
    if (selectedElement) {
      const rect = selectedElement.getBoundingClientRect();
      setAbsoluteTargetRect({
        ...rect,
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY,
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom + window.scrollY,
        right: rect.right + window.scrollX,
        toJSON: () => {}
      } as DOMRect);
    } else {
      setAbsoluteTargetRect(null);
    }
  }, [selectedElement]);

  // Dragging state for toolbar
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; initialOffsetX: number; initialOffsetY: number } | null>(null);

  const handleDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, [role="button"], .cursor-pointer, svg, path, rect, circle, polyline, line')) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffsetX: dragOffset.x,
      initialOffsetY: dragOffset.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setDragOffset({
        x: dragStartRef.current.initialOffsetX + dx,
        y: dragStartRef.current.initialOffsetY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleToggleGuides = () => {
    setShowGuides(prev => !prev);
  };

  const t = translations[lang];

  const [inspectLabels, setInspectLabels] = useState<{tag: string, left: number, top: number, width: number}[]>([]);

  // Mouse inspector hover handler
  useEffect(() => {
    if (!active || isModalOpen || isTaskListOpen || activeTool !== 'select') {
      setInspectLabels([]);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && !target.closest('#design-overlay-ui')) {
        setHoveredElement(target);
      }
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && !target.closest('#design-overlay-ui')) {
        e.preventDefault();
        e.stopPropagation();
        setSelectedElement(target);
        setEditingTask(null);
        const info = getElementSourceInfo(target);
        setSourceInfo(info);
        setIsModalOpen(true);
      }
    };

    const updateLabels = () => {
      const els = document.body.querySelectorAll('*:not(#design-overlay-ui):not(#design-overlay-ui *)');
      const newLabels: {tag: string, left: number, top: number, width: number}[] = [];
      els.forEach((el) => {
        // filter out tiny elements to reduce clutter
        const rect = el.getBoundingClientRect();
        if (rect.width > 30 && rect.height > 30) {
           newLabels.push({
             tag: el.tagName.toLowerCase(),
             left: rect.left + window.scrollX,
             top: rect.top + window.scrollY,
             width: rect.width
           });
        }
      });
      setInspectLabels(newLabels);
    };

    updateLabels();
    const observer = new MutationObserver(updateLabels);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', updateLabels);
    window.addEventListener('scroll', updateLabels, true);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick, true);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick, true);
      window.removeEventListener('resize', updateLabels);
      window.removeEventListener('scroll', updateLabels, true);
      observer.disconnect();
      setHoveredElement(null);
    };
  }, [active, isModalOpen, isTaskListOpen, activeTool]);

  const handleShapeCreated = (shape: DrawShape, point: { x: number; y: number }) => {
    const overlayUi = document.getElementById('design-overlay-ui');
    if (overlayUi) overlayUi.style.pointerEvents = 'none';

    const targetEl = document.elementFromPoint(point.x, point.y) as HTMLElement | null;

    if (overlayUi) overlayUi.style.pointerEvents = '';

    setEditingTask(null);
    if (targetEl) {
      setSelectedElement(targetEl);
      const info = getElementSourceInfo(targetEl);
      setSourceInfo(info);
    } else {
      setSourceInfo({
        componentName: 'PageRoot',
        filePath: 'src/app/page.tsx',
        selector: 'body',
        computedStyles: {},
        className: '',
      });
    }

    // Record history for undo/redo
    const isSingleTask = selectedTaskIds.length === 1;
    const targetTaskId = isSingleTask ? selectedTaskIds[0] : undefined;
    setHistory(prev => [...prev, { shape, taskId: targetTaskId }]);
    setRedoStack([]);

    // Modal is no longer opened automatically on shape drawn
    if (isSingleTask) {
      const targetTask = tasks.find(t => t.id === targetTaskId);
      if (targetTask) {
        const updatedTask = {
          ...targetTask,
          visuals: {
            ...targetTask.visuals,
            shapes: [...(targetTask.visuals?.shapes || []), shape]
          }
        };
        // Remove from local drafts (if it somehow got there)
        setShapes(prev => prev.filter(s => s.id !== shape.id));
        // Update local tasks
        setTasks(prev => prev.map(t => t.id === targetTask.id ? updatedTask : t));
        // Save to server silently
        handleSaveTask(updatedTask, true);
      }
    }
  };

  const handleEditTask = (task: AnnotationTask) => {
    setEditingTask(task);
    setSourceInfo({
      componentName: task.target.componentName,
      filePath: task.target.filePath,
      lineNumber: task.target.lineNumber,
      selector: task.target.selector || '',
      computedStyles: task.context.computedStyles || {},
      className: task.context.tailwindClasses || '',
    });
    setShapes(task.visuals?.shapes || []);
    setGuides(task.visuals?.gridInfo?.guides || []);
    setIsModalOpen(true);
  };

  const handleBulkDelete = async (ids: string[]) => {
    // Optimistic update
    setTasks(prev => prev.filter(t => !ids.includes(t.id)));
    setSelectedTaskIds([]);
    try {
      await fetch(`/api/design-overlay?taskIds=${ids.join(',')}`, { method: 'DELETE' });
      setTaskListRefreshKey(k => k + 1);
      setStatusMessage('Выбранные метки удалены!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkCopy = async (ids: string[]) => {
    try {
      setStatusMessage('Генерация текста...');
      const res = await fetch('/api/design-overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sendSelected', selectedTaskIds: ids })
      });
      const data = await res.json();
      if (data.success && data.markdown) {
        await navigator.clipboard.writeText(data.markdown);
        setStatusMessage('Скопировано в буфер!');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e) {
      console.error(e);
      setStatusMessage('Ошибка копирования');
    }
  };

  const handleBulkSend = async (ids: string[]) => {
    try {
      setStatusMessage('Отправка...');
      const res = await fetch('/api/design-overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sendSelected', selectedTaskIds: ids })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage(`Файл ${data.specMdPath} обновлён!`);
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (e) {
      console.error(e);
      setStatusMessage('Ошибка отправки');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    // Optimistic update
    setTasks(prev => prev.filter(t => t.id !== taskId));
    try {
      const res = await fetch(`/api/design-overlay?taskId=${taskId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setStatusMessage(`Task ${taskId} deleted & UI_SPEC.md updated`);
        setTimeout(() => setStatusMessage(null), 3000);
        setTaskListRefreshKey(k => k + 1);
      }
    } catch (err: unknown) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleSaveTask = async (task: AnnotationTask, silent = false) => {
    if (!silent) {
      setTasks(prev => {
        const exists = prev.find(t => t.id === task.id);
        if (exists) {
          return prev.map(t => t.id === task.id ? task : t);
        } else {
          return [...prev, task];
        }
      });
      setShapes([]); // clear drafts
      setHistory([]); // optionally clear history on task commit
      setRedoStack([]);
      setSelectedElement(null);
      setHoveredElement(null);
      setEditingTask(null);
    }

    try {
      const res = await fetch('/api/design-overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });

      if (res.ok) {
        if (!silent) {
          setStatusMessage(`Task ${task.id} saved & UI_SPEC.md updated!`);
          setTimeout(() => setStatusMessage(null), 4000);
        }
      } else {
        alert('Failed to save annotation to dev server');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Error saving annotation: ${msg}`);
    }
  };

  const handleUndo = () => {
    const lastAction = history[history.length - 1];
    if (!lastAction) return;

    setHistory(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, lastAction]);

    if (lastAction.taskId) {
      setTasks(prev => prev.map(t => {
        if (t.id === lastAction.taskId) {
          const updatedTask = {
            ...t,
            visuals: {
              ...t.visuals,
              shapes: (t.visuals?.shapes || []).filter(s => s.id !== lastAction.shape.id)
            }
          };
          handleSaveTask(updatedTask, true); // save silently
          return updatedTask;
        }
        return t;
      }));
    } else {
      setShapes(prev => prev.filter(s => s.id !== lastAction.shape.id));
    }
  };

  const handleRedo = () => {
    const redoAction = redoStack[redoStack.length - 1];
    if (!redoAction) return;

    setRedoStack(prev => prev.slice(0, -1));
    setHistory(prev => [...prev, redoAction]);

    if (redoAction.taskId) {
      setTasks(prev => prev.map(t => {
        if (t.id === redoAction.taskId) {
          const updatedTask = {
            ...t,
            visuals: {
              ...t.visuals,
              shapes: [...(t.visuals?.shapes || []), redoAction.shape]
            }
          };
          handleSaveTask(updatedTask, true); // save silently
          return updatedTask;
        }
        return t;
      }));
    } else {
      setShapes(prev => [...prev, redoAction.shape]);
    }
  };

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const hoverRect = hoveredElement ? hoveredElement.getBoundingClientRect() : null;

  const openTasks = tasks.filter(t => t.status === 'open');
  const nextTaskIndex = tasks.length + 1;

  // Enhance draft shapes with the next task index (or selected task index if one is selected)
  const draftShapes = shapes.map(s => {
    let targetIndex = nextTaskIndex;
    let targetId: string | undefined = undefined;
    
    if (selectedTaskIds.length === 1) {
      const selectedTask = tasks.find(t => t.id === selectedTaskIds[0]);
      if (selectedTask) {
        targetIndex = tasks.findIndex(t => t.id === selectedTask.id) + 1;
        targetId = selectedTask.id;
      }
    }
    
    return { ...s, taskIndex: targetIndex, taskId: targetId };
  });

  const allShapesMap = new Map<string, DrawShape>();
  
  openTasks.forEach(t => {
    const taskIndex = tasks.findIndex(task => task.id === t.id) + 1;
    (t.visuals?.shapes || []).forEach(s => {
      allShapesMap.set(s.id, {
        ...s,
        taskId: t.id,
        taskIndex
      });
    });
  });

  draftShapes.forEach(s => {
    allShapesMap.set(s.id, s);
  });

  const allShapes = Array.from(allShapesMap.values());

  const handleShapesChange = (newAllShapes: DrawShape[]) => {
    // Separate drafts from task shapes
    const remainingDraftShapes = newAllShapes.filter(s => !s.taskId || !tasks.find(t => t.id === s.taskId));
    setShapes(remainingDraftShapes);

    // Check if any existing task shapes were removed/erased
    let tasksChanged = false;
    const nextTasks = tasks.map(t => {
      const taskShapes = newAllShapes.filter(s => s.taskId === t.id);
      if ((t.visuals?.shapes || []).length !== taskShapes.length) {
        tasksChanged = true;
        return { ...t, visuals: { ...t.visuals, shapes: taskShapes } };
      }
      return t;
    });

    if (tasksChanged) {
      setTasks(nextTasks);
      // Silently save tasks that were modified (erased shapes)
      nextTasks.forEach(t => {
        const oldTask = tasks.find(ot => ot.id === t.id);
        if (oldTask && (oldTask.visuals?.shapes || []).length !== (t.visuals?.shapes || []).length) {
          handleSaveTask(t, true);
        }
      });
    }
  };

  return (
    <div id="design-overlay-ui" className="font-sans">
      {/* Show all available blocks in inspect mode */}
      {active && activeTool === 'select' && !isModalOpen && !isTaskListOpen && (
        <style>{`
          body *:not(#design-overlay-ui):not(#design-overlay-ui *) {
            outline: 1px solid rgba(59, 130, 246, 0.15);
            outline-offset: -1px;
          }
          /* Hierarchy by thickness */
          body > *:not(#design-overlay-ui) { outline-width: 4px; outline-color: rgba(59, 130, 246, 0.4); }
          body > *:not(#design-overlay-ui) > * { outline-width: 3px; outline-color: rgba(59, 130, 246, 0.3); }
          body > *:not(#design-overlay-ui) > * > * { outline-width: 2px; outline-color: rgba(59, 130, 246, 0.2); }
          body > *:not(#design-overlay-ui) > * > * > * { outline-width: 1px; outline-color: rgba(59, 130, 246, 0.15); }
          
          body *:not(#design-overlay-ui):not(#design-overlay-ui *):hover {
            outline: 2px solid rgba(59, 130, 246, 0.9) !important;
          }
        `}</style>
      )}

      {/* Render Labels as React Elements */}
      {active && activeTool === 'select' && !isModalOpen && !isTaskListOpen && inspectLabels.map((lbl, idx) => (
        <div
          key={idx}
          className="absolute z-10 pointer-events-none bg-blue-500/50 text-white font-mono leading-none"
          style={{
            left: lbl.left,
            top: lbl.top,
            fontSize: '9px',
            padding: '2px 4px',
          }}
        >
          {lbl.tag}
        </div>
      ))}

      {/* Active inspector hover outline */}
      {active && hoverRect && !isModalOpen && !isTaskListOpen && (
        <div
          className="fixed pointer-events-none z-30 border-2 border-blue-500 bg-blue-500/10 rounded-sm transition-all duration-75"
          style={{
            left: hoverRect.left,
            top: hoverRect.top,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
        >
          <div className="absolute -top-6 left-0 bg-blue-600 text-white text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-t-sm shadow-xs">
            {hoveredElement?.tagName.toLowerCase()}
          </div>
        </div>
      )}

      {/* Interactive SVG Canvas Layer when active */}
      {active && (
        <CanvasMarkup
          shapes={allShapes}
          selectedTaskIds={selectedTaskIds}
          onShapeClick={(taskId) => {
            if (activeTool === 'cursor') {
              setSelectedTaskIds(prev => 
                prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
              );
            }
          }}
          onShapeDoubleClick={(taskId) => {
            const task = tasks.find(t => t.id === taskId);
            if (task) handleEditTask(task);
          }}
          onShapesChange={handleShapesChange}
          onShapeCreated={handleShapeCreated}
          activeTool={activeTool}
          activeColor={activeColor}
          showGrid={showGrid}
          showColumns={showColumns}
          columnCount={columnCount}
          rowCount={rowCount}
          showGuides={showGuides}
          guides={guides}
          onGuidesChange={setGuides}
          targetRect={absoluteTargetRect}
        />
      )}

      {/* Render saved tasks as interactive Badges/Pins */}
      {active && !isModalOpen && !isTaskListOpen && tasks.filter(t => t.status === 'open').map(task => {
        let x = 0, y = 0;
        if (task.visuals?.shapes && task.visuals.shapes.length > 0) {
          x = task.visuals.shapes[0].x;
          y = task.visuals.shapes[0].y;
        } else {
           return null; // Skip rendering badge if no coordinate is found
        }
        
        const isSelected = selectedTaskIds.includes(task.id);
        const globalIndex = tasks.findIndex(t => t.id === task.id) + 1;
        
        return (
          <div
            key={task.id}
            className="fixed z-[9999] cursor-pointer group"
            style={{ left: x - scrollPos.x, top: y - scrollPos.y }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (activeTool === 'cursor') {
                setSelectedTaskIds(prev => 
                  prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
                );
              } else {
                handleEditTask(task);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleEditTask(task);
            }}
          >
            <div className={`relative -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full shadow-xl flex items-center justify-center transition-transform ${
              isSelected ? 'bg-amber-500 shadow-amber-500/40 border-2 border-white scale-125 z-50' : 'bg-blue-600 shadow-blue-500/30 border-2 border-blue-200 hover:scale-110 hover:bg-blue-500'
            }`}>
              <span className="text-white font-bold text-sm">{globalIndex}</span>
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity border border-zinc-700/50 shadow-2xl">
                {task.context.title}
              </div>
            </div>
          </div>
        );
      })}

      {/* Floating Control Area (SLEEK DRAGGABLE DARK DOCK) */}
      <div
        id="design-overlay-toolbar-wrapper"
        onMouseDown={handleDragStart}
        style={{
          transform: `translate(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px)`,
          touchAction: 'none'
        }}
        className={`fixed bottom-8 left-1/2 z-[9999] flex flex-col items-center gap-4 ${
          isDragging ? 'cursor-grabbing' : ''
        }`}
      >
        {/* Dynamic Popups (Stacks automatically above main bar) */}
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Column & Row Steppers Controls Popup (Centered) */}
          {active && showColumns && (
            <div 
              onMouseDown={e => e.stopPropagation()}
              className="bg-zinc-950/95 border border-zinc-800 text-zinc-100 rounded-full shadow-2xl backdrop-blur-xl flex items-center gap-8 font-mono animate-in fade-in slide-in-from-bottom-2 pointer-events-auto"
              style={{ padding: '12px 24px' }}
            >
              {/* Horizontal Columns Stepper */}
              <div className="flex items-center gap-4">
                <span className="text-rose-400 font-semibold text-sm">{t.horizontalCols}:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setColumnCount(c => Math.max(4, c - 1))}
                    className="w-8 h-8 rounded-xl bg-zinc-900 hover:bg-zinc-800 font-bold text-white flex items-center justify-center border border-zinc-800 transition-colors text-base"
                  >
                    -
                  </button>
                  <span className="font-bold text-rose-300 w-6 text-center text-base">{columnCount}</span>
                  <button
                    onClick={() => setColumnCount(c => Math.min(16, c + 1))}
                    className="w-8 h-8 rounded-xl bg-zinc-900 hover:bg-zinc-800 font-bold text-white flex items-center justify-center border border-zinc-800 transition-colors text-base"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="h-8 w-px bg-zinc-800" />

              {/* Vertical Rows Stepper */}
              <div className="flex items-center gap-4">
                <span className="text-blue-400 font-semibold text-sm">{t.verticalRows}:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRowCount(r => Math.max(4, r - 1))}
                    className="w-8 h-8 rounded-xl bg-zinc-900 hover:bg-zinc-800 font-bold text-white flex items-center justify-center border border-zinc-800 transition-colors text-base"
                  >
                    -
                  </button>
                  <span className="font-bold text-blue-300 w-6 text-center text-base">{rowCount}</span>
                  <button
                    onClick={() => setRowCount(r => Math.min(16, r + 1))}
                    className="w-8 h-8 rounded-xl bg-zinc-900 hover:bg-zinc-800 font-bold text-white flex items-center justify-center border border-zinc-800 transition-colors text-base"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Selection Action Bar */}
          {selectedTaskIds.length > 0 && active && !isModalOpen && !isTaskListOpen && (
            <div 
              onMouseDown={e => e.stopPropagation()}
              className="inline-flex items-center flex-nowrap gap-6 bg-[#09090b]/95 border border-zinc-700/80 backdrop-blur-2xl rounded-full shadow-2xl shadow-black/90 text-zinc-200 select-none box-border animate-in slide-in-from-bottom-2 pointer-events-auto"
              style={{ padding: '12px 24px' }}
            >
              <div className="text-sm font-medium text-zinc-300 whitespace-nowrap pl-2">
                Выбрано меток: <span className="text-emerald-400 font-bold ml-2">{selectedTaskIds.length}</span>
              </div>
              
              <div className="h-6 w-px bg-zinc-800/80 mx-2" />
              
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleBulkDelete(selectedTaskIds)}
                  style={{ padding: '12px 24px' }}
                  className="rounded-full text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/40 text-sm font-semibold flex items-center justify-center gap-2 transition-all shrink-0 whitespace-nowrap"
                >
                  <TrashIcon className="w-5 h-5" /> Удалить
                </button>
                <button
                  onClick={() => handleBulkCopy(selectedTaskIds)}
                  style={{ padding: '12px 24px' }}
                  className="rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-sm text-zinc-200 font-semibold flex items-center justify-center gap-2 transition-all shadow-xs shrink-0 whitespace-nowrap"
                >
                  <CopyIcon className="w-5 h-5 text-zinc-400" /> Копировать
                </button>
                <button
                  onClick={() => handleBulkSend(selectedTaskIds)}
                  style={{ padding: '12px 28px' }}
                  className="rounded-full bg-zinc-100 hover:bg-white text-zinc-950 text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md shrink-0 whitespace-nowrap"
                >
                  <SendIcon className="w-5 h-5 text-zinc-900" /> Отправить
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main Floating Control Toolbar */}
        <div
          id="design-overlay-toolbar"
          style={{ padding: '12px 24px' }}
          className={`inline-flex items-center flex-nowrap gap-2 bg-[#09090b]/95 border border-zinc-700/80 backdrop-blur-2xl rounded-full shadow-2xl shadow-black/90 text-zinc-200 select-none box-border transition-shadow pointer-events-auto ${
            isDragging ? 'shadow-emerald-900/30 ring-1 ring-emerald-500/30' : ''
          }`}
        >
          {/* Grip dots handle for dragging */}
          <div
            title="Перетащить панель"
            className="text-zinc-500 hover:text-zinc-300 p-2 cursor-grab active:cursor-grabbing rounded-full transition-colors shrink-0"
          >
            <GripVerticalIcon className="w-5 h-5 pointer-events-none" />
          </div>

        {/* Toggle Design Mode Button with Toggle Switch Slider */}
        <button
          onClick={() => setActive(!active)}
          title={t.designMode}
          className={`flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border select-none active:scale-[0.98] ${
            active
              ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
              : 'bg-zinc-900/90 hover:bg-zinc-800/90 border-zinc-800 text-zinc-300'
          }`}
        >
          <PaletteIcon className={`w-5 h-5 transition-colors duration-300 ${active ? 'text-emerald-400' : 'text-zinc-400'}`} />
          <span>{t.designMode}</span>

          {/* Switch slider */}
          <div
            className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-zinc-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                active ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </div>
        </button>

        {/* Animated wrapper for ALL the tools */}
        <div
          className={`flex items-center transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            active ? 'max-w-[2000px] opacity-100 ml-2' : 'max-w-0 opacity-0 ml-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center flex-nowrap gap-2 shrink-0">
            {/* Action Tools Group */}
            <div className="flex items-center gap-2">
              {/* Cursor / Pointer Tool */}
              <button
                onClick={() => setActiveTool('cursor')}
                title={t.cursor || "Обычный курсор"}
                style={{ padding: '12px' }}
                className={`rounded-full text-sm flex items-center justify-center transition-all ${
                  activeTool === 'cursor'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)] font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent'
                }`}
              >
                <CursorIcon className="w-5 h-5" />
              </button>

              {/* Select / Inspect Tool */}
              <button
                onClick={() => setActiveTool('select')}
                title={t.inspect}
                style={{ padding: '12px' }}
                className={`rounded-full text-sm flex items-center justify-center transition-all ${
                  activeTool === 'select'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)] font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent'
                }`}
              >
                <InspectIcon className="w-5 h-5" />
              </button>

              {/* Pin Tool */}
              <button
                onClick={() => setActiveTool('pin')}
                title={t.pin}
                style={{ padding: '12px' }}
                className={`rounded-full text-sm flex items-center justify-center transition-all ${
                  activeTool === 'pin'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)] font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent'
                }`}
              >
                <PinIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Divider */}
            <div className="h-6 w-px bg-zinc-800/80 mx-3" />

            {/* Drawing Tools Group */}
            <div className="flex items-center gap-2 bg-zinc-900/50 rounded-full border border-zinc-800/50" style={{ padding: '8px' }}>
              {/* Freehand Pencil Tool */}
              <button
                onClick={() => setActiveTool('pencil')}
                title={t.pencil}
                style={{ padding: '12px' }}
                className={`rounded-full text-sm flex items-center justify-center transition-all ${
                  activeTool === 'pencil'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)] font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent'
                }`}
              >
                <PencilIcon className="w-5 h-5" />
              </button>

              {/* Box / Rect Tool */}
              <button
                onClick={() => setActiveTool('rect')}
                title={t.box}
                style={{ padding: '12px' }}
                className={`rounded-full text-sm flex items-center justify-center transition-all ${
                  activeTool === 'rect'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)] font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent'
                }`}
              >
                <BoxIcon className="w-5 h-5" />
              </button>

              {/* Arrow Tool */}
              <button
                onClick={() => setActiveTool('arrow')}
                title={t.arrow}
                style={{ padding: '12px' }}
                className={`rounded-full text-sm flex items-center justify-center transition-all ${
                  activeTool === 'arrow'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)] font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent'
                }`}
              >
                <ArrowIcon className="w-5 h-5" />
              </button>

              {/* Eraser Tool */}
              <button
                onClick={() => setActiveTool('eraser')}
                title={t.eraser}
                style={{ padding: '12px' }}
                className={`rounded-full text-sm flex items-center justify-center transition-all ${
                  activeTool === 'eraser'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.25)] font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent'
                }`}
              >
                <EraserIcon className="w-5 h-5" />
              </button>

              {/* Color Indicator & Picker Popup */}
              <div className="relative">
                <button
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  title={t.colorPicker}
                  style={{ padding: '12px' }}
                  className="flex items-center justify-center rounded-full hover:bg-zinc-800/80 transition-colors border border-transparent"
                >
                  <div
                    className="w-5 h-5 rounded-full shadow-md transition-transform hover:scale-110 ring-2 ring-white/20"
                    style={{ backgroundColor: activeColor }}
                  />
                </button>

                {/* Color Picker Dropdown Popup */}
                {showColorPicker && (
                  <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-zinc-950/95 border border-zinc-800 p-2 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center gap-1.5 z-50 animate-in fade-in zoom-in-95">
                    {['#ec4899', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ffffff'].map(c => (
                      <button
                        key={c}
                        onClick={() => {
                          setActiveColor(c);
                          setShowColorPicker(false);
                        }}
                        className={`w-5.5 h-5.5 rounded-full transition-all border ${
                          activeColor === c ? 'scale-125 border-white ring-2 ring-white/40 shadow-md' : 'border-transparent hover:scale-110'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    {/* Custom Color Picker Input */}
                    <label className="relative cursor-pointer w-5.5 h-5.5 rounded-full bg-gradient-to-tr from-rose-500 via-emerald-400 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shadow-xs overflow-hidden hover:scale-110 transition-transform">
                      +
                      <input
                        type="color"
                        value={activeColor}
                        onChange={e => {
                          setActiveColor(e.target.value);
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="h-4.5 w-px bg-zinc-800/80 mx-0.5" />

            {/* Overlays & Tasks Group */}
            <div className="flex items-center gap-1">
              {/* 8pt Grid toggle */}
              <button
                onClick={() => setShowGrid(!showGrid)}
                title="8pt Grid"
                style={{ padding: '12px' }}
                className={`rounded-full text-sm flex items-center justify-center transition-all border ${
                  showGrid
                    ? 'bg-blue-600/30 text-blue-400 border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.2)] font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 border-transparent'
                }`}
              >
                <GridIcon className="w-5 h-5" />
              </button>

              {/* Columns / Rows Grid toggle */}
              <button
                onClick={() => {
                  setShowColumns(!showColumns);
                }}
                title={t.columns}
                style={{ padding: '12px' }}
                className={`rounded-full text-sm flex items-center justify-center transition-all border ${
                  showColumns
                    ? 'bg-purple-600/30 text-purple-400 border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.2)] font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 border-transparent'
                }`}
              >
                <ColumnsIcon className="w-5 h-5" />
              </button>

              {/* Guidelines toggle */}
              <button
                onClick={handleToggleGuides}
                title={t.guides}
                style={{ padding: '12px' }}
                className={`rounded-full text-sm flex items-center justify-center transition-all border ${
                  showGuides
                    ? 'bg-cyan-600/30 text-cyan-400 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)] font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 border-transparent'
                }`}
              >
                <RulerIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Divider */}
            <div className="h-6 w-px bg-zinc-800/80 mx-2" />

            {/* Canvas Actions Group */}
            <div className="flex items-center gap-1 bg-zinc-900/50 rounded-full border border-zinc-800/50" style={{ padding: '4px' }}>
              {/* Undo Last Shape */}
              <button
                onClick={handleUndo}
                title={t.undo}
                disabled={history.length === 0}
                style={{ padding: '12px' }}
                className="rounded-full text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent disabled:opacity-30 disabled:hover:bg-transparent transition-all flex items-center justify-center"
              >
                <UndoIcon className="w-5 h-5" />
              </button>

              {/* Redo Last Shape */}
              <button
                onClick={handleRedo}
                title="Вернуть (Redo)"
                disabled={redoStack.length === 0}
                style={{ padding: '12px', transform: 'scaleX(-1)' }}
                className="rounded-full text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent disabled:opacity-30 disabled:hover:bg-transparent transition-all flex items-center justify-center"
              >
                <UndoIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Clear All Shapes */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setShapes([]);
                  setGuides([]);
                  setHistory([]);
                  setRedoStack([]);
                  setSelectedElement(null);
                  setHoveredElement(null);
                  setEditingTask(null);
                }}
                title={t.clear}
                disabled={shapes.length === 0 && guides.length === 0}
                style={{ padding: '12px' }}
                className="rounded-full text-sm text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/40 disabled:opacity-30 disabled:hover:bg-transparent transition-all flex items-center justify-center"
              >
                <TrashIcon className="w-5 h-5" />
              </button>

              {/* Task List modal toggle */}
              <button
                onClick={() => {
                  setIsTaskListOpen(true);
                }}
                title={t.taskList}
                style={{ padding: '12px' }}
                className="rounded-full text-sm text-amber-400 hover:bg-zinc-800/80 border border-transparent transition-all flex items-center justify-center"
              >
                <ListIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Divider */}
            <div className="h-4.5 w-px bg-zinc-800/80 mx-0.5" />

            {/* Right Action Group */}
            <div className="flex items-center gap-4 pl-2 pr-2">
              {/* Copy Annotations */}
              <button
                onClick={() => {
                  const data = JSON.stringify(shapes, null, 2);
                  navigator.clipboard.writeText(data);
                  setStatusMessage('Shapes copied to clipboard!');
                  setTimeout(() => setStatusMessage(null), 3000);
                }}
                title={t.copy}
                style={{ padding: '12px 24px' }}
                className="rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-sm text-zinc-200 font-semibold flex items-center justify-center gap-2 transition-all shadow-xs shrink-0 whitespace-nowrap"
              >
                <CopyIcon className="w-5 h-5 text-zinc-400" />
                <span>{t.copy}</span>
              </button>

              {/* Primary Action Button: "Сохранить" / "Save" */}
              <button
                onClick={() => {
                  if (selectedElement) {
                    const info = getElementSourceInfo(selectedElement);
                    setSourceInfo(info);
                    setIsModalOpen(true);
                  } else if (shapes.length > 0) {
                    const targetEl = document.body;
                    const info = getElementSourceInfo(targetEl);
                    setSourceInfo(info);
                    setIsModalOpen(true);
                  } else {
                    alert('Выберите элемент или нарисуйте аннотацию для сохранения');
                  }
                }}
                title={t.save}
                style={{ padding: '12px 28px' }}
                className="rounded-full bg-zinc-100 hover:bg-white text-zinc-950 text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md shrink-0 whitespace-nowrap"
              >
                <SendIcon className="w-5 h-5 text-zinc-900" />
                <span>{shapes.length > 0 ? (lang === 'ru' ? 'Создать задачу' : 'Create Task') : t.save}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Animated wrapper for the Language Toggle */}
        <div
          className={`flex items-center overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            !active ? 'max-w-[200px] opacity-100 ml-2' : 'max-w-0 opacity-0 ml-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center shrink-0">
            <button
              onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
              title="Toggle Language / Переключить язык"
              className="px-3 py-1.5 rounded-full text-xs font-mono font-bold bg-zinc-900 hover:bg-zinc-800 text-blue-400 border border-zinc-800 flex items-center justify-center gap-1.5 transition-all shrink-0 whitespace-nowrap"
            >
              <GlobeIcon className="w-3.5 h-3.5" />
              <span>{lang.toUpperCase()}</span>
            </button>
          </div>
        </div>
      </div>
      {/* End of design-overlay-toolbar-wrapper */}
      </div>
      {/* Status notification toast */}
      {statusMessage && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-950/90 border border-emerald-500/80 text-emerald-200 text-xs font-medium px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-3 flex items-center space-x-2">
          <CheckIcon className="w-4 h-4 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Task List Modal */}
      {isTaskListOpen && (
        <TaskListModal
          key={taskListRefreshKey}
          lang={lang}
          onClose={() => setIsTaskListOpen(false)}
          onEditTask={handleEditTask}
          onSaveTask={handleSaveTask}
          onDeleteTask={handleDeleteTask}
        />
      )}

      {/* Annotation Modal */}
      {isModalOpen && sourceInfo && (
        <AnnotationModal
          sourceInfo={sourceInfo}
          shapes={shapes}
          initialTask={editingTask}
          gridInfo={{ showGrid, showColumns, columnCount, rowCount }}
          lang={lang}
          onClose={() => {
            setIsModalOpen(false);
            setEditingTask(null);
          }}
          onSave={handleSaveTask}
        />
      )}
    </div>
  );
};
