'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as htmlToImage from 'html-to-image';
import { AnnotationCategory, AnnotationTask, DrawShape } from './types';
import { SourceInfo } from './fiberResolver';
import { Language, translations } from './i18n';
import { CloseIcon, SendIcon, CheckIcon, PaletteIcon } from './Icons';

interface AnnotationModalProps {
  sourceInfo: SourceInfo;
  shapes: DrawShape[];
  initialTask?: AnnotationTask | null;
  gridInfo?: { showGrid: boolean; showColumns: boolean; columnCount: number; rowCount: number };
  lang?: Language;
  onClose: () => void;
  onSave: (task: AnnotationTask) => Promise<void>;
}

export const AnnotationModal: React.FC<AnnotationModalProps> = ({
  sourceInfo,
  shapes,
  initialTask,
  gridInfo,
  lang = 'ru',
  onClose,
  onSave,
}) => {
  const t = translations[lang];
  const [category, setCategory] = useState<AnnotationCategory>(initialTask?.context.category || 'layout');
  const [title, setTitle] = useState(initialTask?.context.title || '');
  const [description, setDescription] = useState(initialTask?.context.description || '');
  const [bestPracticeRule, setBestPracticeRule] = useState(initialTask?.context.bestPracticeRule || '');
  const [referenceImage, setReferenceImage] = useState<string | null>(initialTask?.visuals.referenceImagePath || null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    const taskId = initialTask?.id || `task-${Date.now().toString().slice(-4)}`;

    // Rasterize SVG canvas drawings & composite page snapshot
    let canvasMarkupBase64: string | undefined;
    let pageSnapshotBase64: string | undefined;
    let compositeSnapshotBase64: string | undefined;

    try {
      const svgEl = document.querySelector('#design-overlay-ui svg') as SVGSVGElement | null;
      const width = window.innerWidth;
      const height = window.innerHeight;

      // 1. Rasterize pure SVG markup canvas
      if (svgEl) {
        const svgData = new XMLSerializer().serializeToString(svgEl);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();

        await new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          img.src = url;
        });

        const markupCanvas = document.createElement('canvas');
        markupCanvas.width = width;
        markupCanvas.height = height;
        const mCtx = markupCanvas.getContext('2d');
        if (mCtx && img.naturalWidth > 0) {
          mCtx.drawImage(img, 0, 0);
          try {
            canvasMarkupBase64 = markupCanvas.toDataURL('image/png');
          } catch (e) {
            console.error('Failed markup toDataURL:', e);
          }
        }
        URL.revokeObjectURL(url);
      }

      // 2. Capture Page DOM Background & Composite Overlaid Snapshot
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = width;
      compositeCanvas.height = height;
      const cCtx = compositeCanvas.getContext('2d');

      if (cCtx) {
        // Fill background color
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        cCtx.fillStyle = (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') ? bodyBg : '#09090b';
        cCtx.fillRect(0, 0, width, height);

        // 1.5 Pre-capture canvases to DataURLs to fix WebGL and html-to-image foreignObject limitations
        const originalCanvases = Array.from(document.querySelectorAll('canvas')).filter(
          c => !c.closest('#design-overlay-ui')
        );
        
        const canvasReplacements: { orig: HTMLCanvasElement, img: HTMLImageElement, parent: HTMLElement }[] = [];
        
        originalCanvases.forEach(canv => {
          try {
            const dataUrl = canv.toDataURL('image/png');
            if (dataUrl && dataUrl !== 'data:,') {
              const img = document.createElement('img');
              img.src = dataUrl;
              img.style.cssText = canv.style.cssText;
              img.className = canv.className;
              img.width = canv.width;
              img.height = canv.height;
              
              const parent = canv.parentElement;
              if (parent) {
                parent.replaceChild(img, canv);
                canvasReplacements.push({ orig: canv, img, parent });
              }
            }
          } catch (e) {
            console.warn('Could not export canvas data URL:', e);
          }
        });

        let domCanvas: HTMLCanvasElement | null = null;
        try {
          // 2a. Capture Page DOM Background using html-to-image
          domCanvas = await htmlToImage.toCanvas(document.body, {
            filter: (node) => {
              if (node instanceof Element) {
                // Ignore the overlay UI itself
                if (node.id === 'design-overlay-ui') return false;
              }
              return true;
            },
            pixelRatio: 1, // Keep 1x for performance and match the viewport size
            width: width,
            height: height
          });
        } catch (e) {
          console.error('Failed to capture DOM with html-to-image:', e);
        } finally {
          // 1.6 Restore original canvases to the DOM
          canvasReplacements.forEach(({ orig, img, parent }) => {
            if (parent.contains(img)) {
              parent.replaceChild(orig, img);
            }
          });
        }

        if (domCanvas) {
          cCtx.drawImage(domCanvas, 0, 0);
        }

        // Save clean page snapshot
        try {
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = width;
          pageCanvas.height = height;
          const pCtx = pageCanvas.getContext('2d');
          if (pCtx) {
            pCtx.drawImage(compositeCanvas, 0, 0);
            pageSnapshotBase64 = pageCanvas.toDataURL('image/png');
          }
        } catch (e) {
          console.error('Failed page toDataURL:', e);
        }

        // Overlay SVG Markup onto composite canvas
        if (svgEl) {
          const svgData = new XMLSerializer().serializeToString(svgEl);
          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const svgUrl = URL.createObjectURL(svgBlob);
          const svgImg = new Image();

          await new Promise(resolve => {
            svgImg.onload = resolve;
            svgImg.onerror = resolve;
            svgImg.src = svgUrl;
          });

          if (svgImg.naturalWidth > 0) {
            cCtx.drawImage(svgImg, 0, 0);
          }
          URL.revokeObjectURL(svgUrl);
        }

        try {
          compositeSnapshotBase64 = compositeCanvas.toDataURL('image/png');
        } catch (e) {
          console.error('Failed composite toDataURL:', e);
        }
      }
    } catch (err) {
      console.error('Failed to capture composite screenshot:', err);
    }

    const newTask: AnnotationTask = {
      id: taskId,
      status: initialTask?.status || 'open',
      createdAt: initialTask?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      target: {
        pageUrl: window.location.pathname,
        componentName: sourceInfo.componentName,
        filePath: sourceInfo.filePath,
        lineNumber: sourceInfo.lineNumber,
        selector: sourceInfo.selector,
      },
      context: {
        category,
        title: title.trim(),
        description: description.trim(),
        bestPracticeRule: bestPracticeRule.trim() || undefined,
        computedStyles: sourceInfo.computedStyles,
        tailwindClasses: sourceInfo.className,
      },
      visuals: {
        shapes: shapes.length > 0 ? shapes : (initialTask?.visuals.shapes || []),
        canvasMarkupBase64,
        canvasMarkupPath: initialTask?.visuals.canvasMarkupPath,
        pageSnapshotBase64,
        pageSnapshotPath: initialTask?.visuals.pageSnapshotPath,
        compositeSnapshotBase64,
        compositeSnapshotPath: initialTask?.visuals.compositeSnapshotPath,
        referenceImageBase64: referenceImage?.startsWith('data:') ? referenceImage : undefined,
        referenceImagePath: !referenceImage?.startsWith('data:') ? referenceImage || undefined : undefined,
        gridInfo: gridInfo || initialTask?.visuals.gridInfo,
      },
    };

    try {
      await onSave(newTask);
      onClose();
    } catch (err) {
      console.error('Failed to save annotation task:', err);
      alert(err instanceof Error ? err.message : 'Failed to save annotation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] overflow-y-auto bg-black/80 backdrop-blur-md">
      <div className="min-h-full flex items-center justify-center p-4" style={{ padding: '48px 16px' }}>
        <div 
          className="bg-[#09090b] border border-zinc-800/90 text-zinc-100 shadow-2xl max-w-2xl w-full font-sans text-sm animate-in fade-in zoom-in-95 duration-200 overflow-y-auto"
          style={{ padding: '40px', borderRadius: '32px', maxHeight: '90vh' }}
        >
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800/80" style={{ paddingBottom: '24px', marginBottom: '24px' }}>
            <div className="flex items-center" style={{ gap: '16px' }}>
              <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400" style={{ padding: '12px', borderRadius: '16px' }}>
                <PaletteIcon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-xl text-white tracking-wide m-0">
                {initialTask ? t.editAnnotation : t.addAnnotation}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
              style={{ padding: '10px', borderRadius: '16px' }}
            >
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* Source info target badge */}
            <div className="bg-zinc-900/80 border border-zinc-800 font-mono text-sm" style={{ padding: '20px', borderRadius: '24px' }}>
              <div className="flex items-center justify-between flex-wrap" style={{ gap: '12px', marginBottom: '12px' }}>
                <div className="flex items-center text-blue-400 font-medium" style={{ gap: '12px' }}>
                  <span className="text-zinc-500">{t.component}:</span>
                  <span className="text-blue-300 font-bold text-base">{sourceInfo.componentName}</span>
                </div>
                {sourceInfo.selector && (
                  <span className="text-zinc-400 text-xs bg-zinc-950 border border-zinc-700/50" style={{ padding: '6px 12px', borderRadius: '8px' }}>
                    {sourceInfo.selector}
                  </span>
                )}
              </div>
              <div className="text-zinc-400 truncate">
                {t.path}: <span className="text-emerald-400">{sourceInfo.filePath}</span>
                {sourceInfo.lineNumber ? <span className="text-amber-300/80">:L{sourceInfo.lineNumber}</span> : ''}
              </div>
            </div>

            {/* 8pt Grid Audit Warnings */}
            {sourceInfo.offGridProps && sourceInfo.offGridProps.length > 0 && (
              <div className="bg-amber-950/30 border border-amber-500/30 text-sm text-amber-200/90" style={{ padding: '20px', borderRadius: '24px' }}>
                <div className="font-semibold text-amber-300 flex items-center" style={{ gap: '8px', marginBottom: '12px' }}>
                  <span className="text-base">📐</span>
                  <span>8pt Grid Audit Warning:</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {sourceInfo.offGridProps.map(og => (
                    <div key={og.prop} className="font-mono text-xs text-amber-300/80" style={{ paddingLeft: '32px' }}>
                      <span className="text-amber-500/80 mr-1.5">•</span> {og.prop}: <span className="line-through text-rose-400 mx-1.5">{og.actual}</span> ➔ <span className="text-emerald-400 font-bold mx-1.5">{og.suggested}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Category selection */}
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider" style={{ marginBottom: '12px' }}>
                  {t.category}
                </label>
                <div className="flex flex-wrap" style={{ gap: '12px' }}>
                  {(['layout', 'design_system', 'bug', 'animation', 'copywriting'] as AnnotationCategory[]).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`text-sm font-semibold border transition-all ${
                        category === cat
                          ? 'bg-blue-600 border-blue-400 text-white shadow-xl shadow-blue-600/30'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                      }`}
                      style={{ padding: '10px 20px', borderRadius: '16px' }}
                    >
                      {t.categories[cat as keyof typeof t.categories]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider" style={{ marginBottom: '12px' }}>
                  {t.title} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={t.titlePlaceholder}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700/80 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 text-base transition-all shadow-inner"
                  style={{ padding: '16px 20px', borderRadius: '16px' }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider" style={{ marginBottom: '12px' }}>
                  {t.description}
                </label>
                <textarea
                  placeholder={t.descriptionPlaceholder}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700/80 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 text-base transition-all shadow-inner"
                  style={{ padding: '16px 20px', borderRadius: '16px', resize: 'vertical', minHeight: '120px', maxHeight: '400px' }}
                />
              </div>

              {/* Best practice rule */}
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider" style={{ marginBottom: '12px' }}>
                  {t.bestPracticeRule}
                </label>
                <input
                  type="text"
                  placeholder={t.bestPracticePlaceholder}
                  value={bestPracticeRule}
                  onChange={e => setBestPracticeRule(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700/80 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 text-base transition-all shadow-inner"
                  style={{ padding: '16px 20px', borderRadius: '16px' }}
                />
              </div>

              {/* Reference Image Upload */}
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider" style={{ marginBottom: '12px' }}>
                  {t.attachReference}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full text-base text-zinc-400 file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500 file:transition-colors file:cursor-pointer cursor-pointer"
                  style={{ padding: '12px 0' }}
                />
                <style>{`
                  input[type="file"]::file-selector-button {
                    padding: 12px 24px;
                    border-radius: 12px;
                    margin-right: 20px;
                  }
                `}</style>
                {referenceImage && (
                  <div className="text-sm font-semibold text-emerald-400 flex items-center bg-emerald-500/10 w-fit border border-emerald-500/20" style={{ gap: '8px', padding: '8px 16px', borderRadius: '12px', marginTop: '16px' }}>
                    <CheckIcon className="w-5 h-5" />
                    <span>{t.referenceLoaded}</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-col-reverse sm:flex-row justify-end border-t border-zinc-800/80" style={{ paddingTop: '32px', marginTop: '16px', gap: '16px', paddingBottom: '8px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-base font-bold transition-colors border border-zinc-700/80 w-full sm:w-auto"
                  style={{ padding: '16px 32px', borderRadius: '16px' }}
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !title.trim()}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-base font-bold transition-all disabled:opacity-50 flex items-center justify-center shadow-xl shadow-blue-600/30 whitespace-nowrap w-full sm:w-auto"
                  style={{ padding: '16px 32px', borderRadius: '16px', gap: '12px' }}
                >
                  {isSubmitting ? (
                    <span>{t.syncing}</span>
                  ) : (
                    <>
                      <SendIcon className="w-5 h-5" />
                      <span>{t.saveAndSync}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
