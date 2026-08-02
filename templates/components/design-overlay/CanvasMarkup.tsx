'use client';

import React, { useState, useRef } from 'react';
import { DrawShape, ToolType, GuideLine } from './types';

interface CanvasMarkupProps {
  shapes: DrawShape[];
  onShapesChange: (shapes: DrawShape[]) => void;
  onShapeCreated?: (shape: DrawShape, point: { x: number; y: number }) => void;
  activeTool: ToolType;
  activeColor?: string;
  showGrid?: boolean;
  showColumns?: boolean;
  columnCount?: number;
  rowCount?: number;
  showGuides?: boolean;
  guides?: GuideLine[];
  onGuidesChange?: (guides: GuideLine[]) => void;
  targetRect?: DOMRect | null;
  selectedTaskIds?: string[];
  onShapeClick?: (taskId: string) => void;
  onShapeDoubleClick?: (taskId: string) => void;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

export const CanvasMarkup: React.FC<CanvasMarkupProps> = ({
  shapes,
  onShapesChange,
  onShapeCreated,
  activeTool,
  activeColor = '#ec4899',
  showGrid = false,
  showColumns = false,
  columnCount = 12,
  rowCount = 8,
  showGuides = false,
  guides = [],
  onGuidesChange,
  targetRect,
  selectedTaskIds = [],
  onShapeClick,
  onShapeDoubleClick,
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [draggingGuideId, setDraggingGuideId] = useState<string | null>(null);
  const [currentStart, setCurrentStart] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [pencilPoints, setPencilPoints] = useState<{ x: number; y: number }[]>([]);
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);
  const [scrollPos, setScrollPos] = useState({
    x: typeof window !== 'undefined' ? window.scrollX : 0,
    y: typeof window !== 'undefined' ? window.scrollY : 0,
  });
  const svgRef = useRef<SVGSVGElement>(null);

  // Track window scrolling for sticky shapes
  React.useEffect(() => {
    const handleScroll = () => {
      setScrollPos({ x: window.scrollX, y: window.scrollY });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const getCoordinates = (e: React.MouseEvent<SVGSVGElement> | MouseEvent) => {
    return {
      x: e.clientX + window.scrollX,
      y: e.clientY + window.scrollY,
    };
  };

  const eraseShapesAt = React.useCallback(
    (coords: { x: number; y: number }, radius: number = 22) => {
      const remaining = shapes.flatMap((shape) => {
        if (shape.type === 'pin') {
          if (Math.hypot(shape.x - coords.x, shape.y - coords.y) <= radius + 14) return [];
          return [shape];
        }
        if (shape.type === 'rect') {
          const w = shape.width || 0;
          const h = shape.height || 0;
          const insideOrNear =
            coords.x >= shape.x - radius &&
            coords.x <= shape.x + w + radius &&
            coords.y >= shape.y - radius &&
            coords.y <= shape.y + h + radius;
          if (insideOrNear) return [];
          return [shape];
        }
        if (shape.type === 'arrow') {
          const dist = distToSegment(
            coords.x,
            coords.y,
            shape.x,
            shape.y,
            shape.endX ?? shape.x,
            shape.endY ?? shape.y
          );
          if (dist <= radius) return [];
          return [shape];
        }
        if (shape.type === 'pencil') {
          if (!shape.points || shape.points.length === 0) return [shape];
          const newShapes: DrawShape[] = [];
          let currentPoints: {x: number, y: number}[] = [];
          let hasErased = false;
          
          for (let i = 0; i < shape.points.length; i++) {
            const pt = shape.points[i];
            if (Math.hypot(pt.x - coords.x, pt.y - coords.y) <= radius) {
              hasErased = true;
              if (currentPoints.length > 1) {
                newShapes.push({ ...shape, id: `${shape.id}-${newShapes.length}`, points: currentPoints });
              }
              currentPoints = [];
            } else {
              currentPoints.push(pt);
            }
          }
          if (currentPoints.length > 1) {
            if (hasErased) {
              newShapes.push({ ...shape, id: `${shape.id}-${newShapes.length}`, points: currentPoints });
            }
          }
          
          if (!hasErased) return [shape]; // No change
          return newShapes; // Return the split shapes (or empty if fully erased)
        }
        return [shape];
      });

      if (remaining.length !== shapes.length || remaining.some(s => s.id.includes('-'))) {
        onShapesChange(remaining);
      }
    },
    [shapes, onShapesChange]
  );

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'select' || activeTool === 'cursor') return;
    const coords = getCoordinates(e);

    if (activeTool === 'eraser') {
      setIsDrawing(true);
      setEraserPos(coords);
      eraseShapesAt(coords);
      return;
    }

    if (activeTool === 'pin') {
      const newPin: DrawShape = {
        id: `shape-${Date.now()}`,
        type: 'pin',
        x: coords.x,
        y: coords.y,
        text: '', // Number is now handled by taskIndex
        color: activeColor,
      };
      onShapesChange([...shapes, newPin]);
      onShapeCreated?.(newPin, coords);
      return;
    }

    if (activeTool === 'pencil') {
      setIsDrawing(true);
      setPencilPoints([coords]);
      return;
    }

    setIsDrawing(true);
    setCurrentStart(coords);
    setCurrentPos(coords);
  };

  const handleMouseUp = React.useCallback(() => {
    if (!isDrawing) return;

    if (activeTool === 'eraser') {
      setIsDrawing(false);
      return;
    }

    if (activeTool === 'pencil') {
      if (pencilPoints.length > 1) {
        const newPencil: DrawShape = {
          id: `shape-${Date.now()}`,
          type: 'pencil',
          x: pencilPoints[0].x,
          y: pencilPoints[0].y,
          points: pencilPoints,
          color: activeColor,
        };
        onShapesChange([...shapes, newPencil]);
        onShapeCreated?.(newPencil, pencilPoints[0]);
      }
      setIsDrawing(false);
      setPencilPoints([]);
      return;
    }

    if (!currentStart || !currentPos) return;

    if (activeTool === 'rect') {
      const newRect: DrawShape = {
        id: `shape-${Date.now()}`,
        type: 'rect',
        x: Math.min(currentStart.x, currentPos.x),
        y: Math.min(currentStart.y, currentPos.y),
        width: Math.abs(currentPos.x - currentStart.x),
        height: Math.abs(currentPos.y - currentStart.y),
        color: activeColor,
      };
      if ((newRect.width || 0) > 5 && (newRect.height || 0) > 5) {
        onShapesChange([...shapes, newRect]);
        onShapeCreated?.(newRect, { x: newRect.x, y: newRect.y });
      }
    } else if (activeTool === 'arrow') {
      const newArrow: DrawShape = {
        id: `shape-${Date.now()}`,
        type: 'arrow',
        x: currentStart.x,
        y: currentStart.y,
        endX: currentPos.x,
        endY: currentPos.y,
        color: activeColor,
      };
      const dx = currentPos.x - currentStart.x;
      const dy = currentPos.y - currentStart.y;
      if (Math.hypot(dx, dy) > 10) {
        onShapesChange([...shapes, newArrow]);
        onShapeCreated?.(newArrow, { x: currentPos.x, y: currentPos.y });
      }
    }

    setIsDrawing(false);
    setCurrentStart(null);
    setCurrentPos(null);
  }, [
    isDrawing,
    pencilPoints,
    currentStart,
    currentPos,
    activeTool,
    activeColor,
    shapes,
    onShapesChange,
    onShapeCreated,
  ]);

  const snapToGrid = React.useCallback((value: number, isVertical: boolean) => {
    let snapped = value;
    let minDiff = 12; // snap threshold in px

    if (showGrid) {
      const r = value % 8;
      if (r < 4) {
        if (r < minDiff) { minDiff = r; snapped = value - r; }
      } else {
        if (8 - r < minDiff) { minDiff = 8 - r; snapped = value + (8 - r); }
      }
    }

    if (showColumns && isVertical) {
      const colWidth = window.innerWidth / columnCount;
      for (let i = 0; i <= columnCount; i++) {
        const lineX = i * colWidth + scrollPos.x;
        const diff = Math.abs(value - lineX);
        if (diff < minDiff) {
          minDiff = diff;
          snapped = lineX;
        }
      }
    }

    if (showColumns && !isVertical) {
      const rowHeight = window.innerHeight / rowCount;
      for (let i = 0; i <= rowCount; i++) {
        const lineY = i * rowHeight + scrollPos.y;
        const diff = Math.abs(value - lineY);
        if (diff < minDiff) {
          minDiff = diff;
          snapped = lineY;
        }
      }
    }

    return snapped;
  }, [showGrid, showColumns, columnCount, rowCount, scrollPos]);

  React.useEffect(() => {
    if (!isDrawing && activeTool !== 'eraser' && !draggingGuideId) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const coords = getCoordinates(e);

      if (draggingGuideId && onGuidesChange) {
        onGuidesChange(guides.map(g => {
          if (g.id !== draggingGuideId) return g;
          const pos = g.type === 'v' ? coords.x : coords.y;
          return { ...g, position: snapToGrid(pos, g.type === 'v') };
        }));
        return;
      }
      if (activeTool === 'eraser') {
        setEraserPos(coords);
        if (isDrawing) {
          eraseShapesAt(coords);
        }
      } else if (activeTool === 'pencil') {
        setPencilPoints(pts => [...pts, coords]);
      } else {
        setCurrentPos(coords);
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (draggingGuideId && onGuidesChange) {
        const coords = getCoordinates(e);
        const guide = guides.find(g => g.id === draggingGuideId);
        if (guide) {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          // Delete if dragged out of viewport
          if (
            (guide.type === 'v' && (coords.x < scrollPos.x || coords.x > scrollPos.x + vw)) ||
            (guide.type === 'h' && (coords.y < scrollPos.y || coords.y > scrollPos.y + vh))
          ) {
            onGuidesChange(guides.filter(g => g.id !== draggingGuideId));
          }
        }
        setDraggingGuideId(null);
        return;
      }
      handleMouseUp();
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDrawing, activeTool, handleMouseUp, eraseShapesAt, draggingGuideId, guides, onGuidesChange, scrollPos, snapToGrid]);

  const handlePointerDownEdge = (e: React.PointerEvent<SVGRectElement>, type: 'h' | 'v') => {
    e.stopPropagation();
    const newId = `guide-${type}-${Date.now()}`;
    const coords = getCoordinates(e as unknown as MouseEvent);
    if (onGuidesChange) {
      onGuidesChange([...guides, { id: newId, type, position: type === 'h' ? coords.y : coords.x }]);
    }
    setDraggingGuideId(newId);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getCoordinates(e);
    if (activeTool === 'eraser') {
      setEraserPos(coords);
      if (isDrawing) {
        eraseShapesAt(coords);
      }
      return;
    }
    if (!isDrawing) return;
    if (activeTool === 'pencil') {
      setPencilPoints(pts => [...pts, coords]);
    } else {
      setCurrentPos(coords);
    }
  };

  const arrowColors = Array.from(
    new Set(['#f59e0b', activeColor, ...shapes.map(s => s.color).filter(Boolean)])
  ) as string[];

  return (
    <svg
      ref={svgRef}
      className="fixed inset-0 w-full h-full z-[9998]"
      style={{
        pointerEvents: activeTool === 'select' ? 'none' : 'auto',
        cursor: activeTool === 'select' || activeTool === 'cursor' ? 'default' : 'crosshair',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <defs>
        {arrowColors.map(col => (
          <marker
            key={col}
            id={`arrowhead-${col.replace('#', '')}`}
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={col} />
          </marker>
        ))}

        {/* 8pt Grid Pattern */}
        <pattern id="grid8pt" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(59, 130, 246, 0.25)" strokeWidth="0.8" />
          <path d="M 8 0 L 8 16 M 0 8 L 16 8" fill="none" stroke="rgba(59, 130, 246, 0.1)" strokeWidth="0.5" strokeDasharray="1 1" />
        </pattern>
      </defs>

      {/* Render 8pt Visual Grid Layer */}
      {showGrid && (
        <rect width="100%" height="100%" fill="url(#grid8pt)" className="pointer-events-none" />
      )}

      {/* Render Column & Row Layout Guidelines */}
      {showColumns && (
        <g className="pointer-events-none">
          {/* Horizontal Columns */}
          {Array.from({ length: Math.min(16, Math.max(4, columnCount)) }).map((_, i) => {
            const colWidth = (typeof window !== 'undefined' ? window.innerWidth : 1920) / columnCount;
            const x = i * colWidth;
            return (
              <g key={`col-${i}`}>
                <rect
                  x={x}
                  y={0}
                  width={colWidth}
                  height="100%"
                  fill={i % 2 === 0 ? 'rgba(239, 68, 68, 0.04)' : 'rgba(239, 68, 68, 0.08)'}
                  stroke="rgba(239, 68, 68, 0.25)"
                  strokeWidth="1"
                  strokeDasharray="4 2"
                />
                <text
                  x={x + colWidth / 2}
                  y="22"
                  textAnchor="middle"
                  fill="rgba(239, 68, 68, 0.85)"
                  fontSize="11"
                  fontWeight="bold"
                >
                  C{i + 1}
                </text>
              </g>
            );
          })}

          {/* Vertical Rows */}
          {Array.from({ length: Math.min(16, Math.max(4, rowCount)) }).map((_, j) => {
            const rowHeight = (typeof window !== 'undefined' ? window.innerHeight : 1080) / rowCount;
            const y = j * rowHeight;
            return (
              <g key={`row-${j}`}>
                <line
                  x1="0"
                  y1={y}
                  x2="100%"
                  y2={y}
                  stroke="rgba(59, 130, 246, 0.35)"
                  strokeWidth="1"
                  strokeDasharray="4 2"
                />
                <text
                  x="15"
                  y={y + 14}
                  fill="rgba(59, 130, 246, 0.85)"
                  fontSize="11"
                  fontWeight="bold"
                >
                  R{j + 1}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Group transform translates document page coordinates into screen viewport space */}
      <g transform={`translate(${-scrollPos.x}, ${-scrollPos.y})`}>

        {/* Edge Rulers for spawning guidelines (Photoshop/Figma style) */}
        {showGuides && (
          <g style={{ pointerEvents: 'auto' }}>
            {/* Top Ruler (Horizontal Guides) */}
            <rect
              x={scrollPos.x}
              y={scrollPos.y}
              width="10000"
              height="24"
              className="fill-cyan-500/15 stroke-cyan-500/30"
              strokeWidth="1"
              strokeDasharray="2 4"
              cursor="row-resize"
              onPointerDown={(e) => handlePointerDownEdge(e, 'h')}
            />
            {/* Left Ruler (Vertical Guides) */}
            <rect
              x={scrollPos.x}
              y={scrollPos.y}
              width="24"
              height="10000"
              className="fill-cyan-500/15 stroke-cyan-500/30"
              strokeWidth="1"
              strokeDasharray="2 4"
              cursor="col-resize"
              onPointerDown={(e) => handlePointerDownEdge(e, 'v')}
            />
          </g>
        )}

        {/* Render Guidelines Layer */}
        {showGuides && guides.map(guide => (
          <g
            key={guide.id}
            style={{ pointerEvents: 'auto', cursor: guide.type === 'v' ? 'col-resize' : 'row-resize' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setDraggingGuideId(guide.id);
            }}
          >
            {guide.type === 'h' ? (
              <>
                {/* Invisible thicker line for easier dragging */}
                <line
                  x1="-10000"
                  y1={guide.position}
                  x2="10000"
                  y2={guide.position}
                  stroke="transparent"
                  strokeWidth="16"
                />
                <line
                  x1="-10000"
                  y1={guide.position}
                  x2="10000"
                  y2={guide.position}
                  stroke="#06b6d4"
                  strokeWidth="2"
                  strokeDasharray="6 3"
                  className="drop-shadow-sm"
                />
                <g transform={`translate(${scrollPos.x + 80}, ${guide.position})`}>
                  <rect x="-40" y="-12" width="80" height="24" rx="12" fill="#06b6d4" className="shadow-sm" />
                  <text x="-8" y="4" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold" className="pointer-events-none">
                    Y: {Math.round(guide.position - scrollPos.y)}
                  </text>
                  <g
                    transform="translate(22, 0)"
                    cursor="pointer"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (onGuidesChange) onGuidesChange(guides.filter(g => g.id !== guide.id));
                    }}
                  >
                    <circle cx="0" cy="0" r="8" fill="#0891b2" className="hover:fill-rose-500 transition-colors" />
                    <line x1="-3" y1="-3" x2="3" y2="3" stroke="#fff" strokeWidth="1.5" className="pointer-events-none" />
                    <line x1="3" y1="-3" x2="-3" y2="3" stroke="#fff" strokeWidth="1.5" className="pointer-events-none" />
                  </g>
                </g>
              </>
            ) : (
              <>
                {/* Invisible thicker line for easier dragging */}
                <line
                  x1={guide.position}
                  y1="-10000"
                  x2={guide.position}
                  y2="10000"
                  stroke="transparent"
                  strokeWidth="16"
                />
                <line
                  x1={guide.position}
                  y1="-10000"
                  x2={guide.position}
                  y2="10000"
                  stroke="#06b6d4"
                  strokeWidth="2"
                  strokeDasharray="6 3"
                  className="drop-shadow-sm"
                />
                <g transform={`translate(${guide.position}, ${scrollPos.y + 40})`}>
                  <rect x="-40" y="-12" width="80" height="24" rx="12" fill="#06b6d4" className="shadow-sm" />
                  <text x="-8" y="4" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold" className="pointer-events-none">
                    X: {Math.round(guide.position - scrollPos.x)}
                  </text>
                  <g
                    transform="translate(22, 0)"
                    cursor="pointer"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (onGuidesChange) onGuidesChange(guides.filter(g => g.id !== guide.id));
                    }}
                  >
                    <circle cx="0" cy="0" r="8" fill="#0891b2" className="hover:fill-rose-500 transition-colors" />
                    <line x1="-3" y1="-3" x2="3" y2="3" stroke="#fff" strokeWidth="1.5" className="pointer-events-none" />
                    <line x1="3" y1="-3" x2="-3" y2="3" stroke="#fff" strokeWidth="1.5" className="pointer-events-none" />
                  </g>
                </g>
              </>
            )}
          </g>
        ))}
        {/* Target element highlight box if selected */}
        {targetRect && (
          <rect
            x={targetRect.left}
            y={targetRect.top}
            width={targetRect.width}
            height={targetRect.height}
            fill="rgba(59, 130, 246, 0.15)"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
        )}

        {/* Render saved shapes */}
        {shapes.map(shape => {
          const shapeColor = shape.color || activeColor;
          const isSelected = shape.taskId ? selectedTaskIds.includes(shape.taskId) : false;
          const strokeWidth = isSelected ? "5.5" : "3.5";
          const filter = isSelected ? "drop-shadow(0 0 4px rgba(251,191,36,0.6))" : "none";

          if (shape.type === 'pencil') {
            const pathData =
              shape.points && shape.points.length > 0
                ? shape.points.reduce(
                    (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
                    ''
                  )
                : '';
            return (
              <g
                key={shape.id}
                onPointerDown={(e) => {
                  if (activeTool === 'cursor' && shape.taskId && onShapeClick) {
                    e.stopPropagation();
                    onShapeClick(shape.taskId);
                  }
                }}
                onDoubleClick={(e) => {
                  if (activeTool === 'cursor' && shape.taskId && onShapeDoubleClick) {
                    e.stopPropagation();
                    onShapeDoubleClick(shape.taskId);
                  }
                }}
                className={activeTool === 'cursor' && shape.taskId ? "cursor-pointer" : ""}
                style={{ filter, pointerEvents: activeTool === 'cursor' ? 'all' : undefined }}
              >
                {/* Invisible thicker path for easier clicking */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="20"
                />
                <path
                  d={pathData}
                  fill="none"
                  stroke={isSelected ? "#f59e0b" : shapeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {shape.taskIndex !== undefined && shape.points && shape.points.length > 0 && (
                  <g transform={`translate(${shape.points[0].x}, ${shape.points[0].y})`}>
                    <circle cx="-10" cy="-10" r="8" fill={isSelected ? "#f59e0b" : shapeColor} />
                    <text x="-10" y="-7" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">
                      {shape.taskIndex}
                    </text>
                  </g>
                )}
              </g>
            );
          }

          if (shape.type === 'rect') {
            return (
              <g
                key={shape.id}
                onPointerDown={(e) => {
                  if (activeTool === 'cursor' && shape.taskId && onShapeClick) {
                    e.stopPropagation();
                    onShapeClick(shape.taskId);
                  }
                }}
                onDoubleClick={(e) => {
                  if (activeTool === 'cursor' && shape.taskId && onShapeDoubleClick) {
                    e.stopPropagation();
                    onShapeDoubleClick(shape.taskId);
                  }
                }}
                className={activeTool === 'cursor' && shape.taskId ? "cursor-pointer" : ""}
                style={{ filter, pointerEvents: activeTool === 'cursor' ? 'all' : undefined }}
              >
                <rect
                  x={shape.x}
                  y={shape.y}
                  width={shape.width}
                  height={shape.height}
                  fill={isSelected ? "#f59e0b22" : `${shapeColor}22`}
                  stroke={isSelected ? "#f59e0b" : shapeColor}
                  strokeWidth={isSelected ? "4" : "3"}
                  rx="4"
                />
                {shape.taskIndex !== undefined && (
                  <g transform={`translate(${shape.x}, ${shape.y})`}>
                    <circle cx="0" cy="0" r="8" fill={isSelected ? "#f59e0b" : shapeColor} />
                    <text x="0" y="3" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">
                      {shape.taskIndex}
                    </text>
                  </g>
                )}
              </g>
            );
          }

          if (shape.type === 'arrow') {
            const displayColor = isSelected ? "#f59e0b" : shapeColor;
            const markerId = `arrowhead-${displayColor.replace('#', '')}`;
            return (
              <g
                key={shape.id}
                onPointerDown={(e) => {
                  if (activeTool === 'cursor' && shape.taskId && onShapeClick) {
                    e.stopPropagation();
                    onShapeClick(shape.taskId);
                  }
                }}
                onDoubleClick={(e) => {
                  if (activeTool === 'cursor' && shape.taskId && onShapeDoubleClick) {
                    e.stopPropagation();
                    onShapeDoubleClick(shape.taskId);
                  }
                }}
                className={activeTool === 'cursor' && shape.taskId ? "cursor-pointer" : ""}
                style={{ filter, pointerEvents: activeTool === 'cursor' ? 'all' : undefined }}
              >
                {/* Invisible thicker line for clicking */}
                <line
                  x1={shape.x}
                  y1={shape.y}
                  x2={shape.endX}
                  y2={shape.endY}
                  stroke="transparent"
                  strokeWidth="20"
                />
                <line
                  x1={shape.x}
                  y1={shape.y}
                  x2={shape.endX}
                  y2={shape.endY}
                  stroke={displayColor}
                  strokeWidth={isSelected ? "5" : "4"}
                  markerEnd={`url(#${markerId})`}
                />
                <circle cx={shape.x} cy={shape.y} r="5" fill={displayColor} />
                {shape.taskIndex !== undefined && (
                  <g transform={`translate(${shape.x - 12}, ${shape.y - 12})`}>
                    <circle cx="0" cy="0" r="8" fill={displayColor} />
                    <text x="0" y="3" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">
                      {shape.taskIndex}
                    </text>
                  </g>
                )}
              </g>
            );
          }

          if (shape.type === 'pin') {
            const displayColor = isSelected ? "#f59e0b" : shapeColor;
            return (
              <g
                key={shape.id}
                transform={`translate(${shape.x}, ${shape.y})`}
                onPointerDown={(e) => {
                  if (activeTool === 'cursor' && shape.taskId && onShapeClick) {
                    e.stopPropagation();
                    onShapeClick(shape.taskId);
                  }
                }}
                onDoubleClick={(e) => {
                  if (activeTool === 'cursor' && shape.taskId && onShapeDoubleClick) {
                    e.stopPropagation();
                    onShapeDoubleClick(shape.taskId);
                  }
                }}
                className={activeTool === 'cursor' && shape.taskId ? "cursor-pointer" : ""}
                style={{ filter: isSelected ? "drop-shadow(0 0 6px rgba(251,191,36,0.8))" : "none", pointerEvents: activeTool === 'cursor' ? 'all' : undefined }}
              >
                <circle cx="0" cy="0" r="14" fill={displayColor} stroke="#ffffff" strokeWidth="2" />
                <text
                  x="0"
                  y="5"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="12"
                  fontWeight="bold"
                >
                  {shape.taskIndex !== undefined ? shape.taskIndex : shape.text || '1'}
                </text>
              </g>
            );
          }

          return null;
        })}

        {/* Render active drawing preview */}
        {isDrawing && activeTool === 'pencil' && pencilPoints.length > 0 && (
          <path
            d={pencilPoints.reduce(
              (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
              ''
            )}
            fill="none"
            stroke={activeColor}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {isDrawing && currentStart && currentPos && (
          <>
            {activeTool === 'rect' && (
              <rect
                x={Math.min(currentStart.x, currentPos.x)}
                y={Math.min(currentStart.y, currentPos.y)}
                width={Math.abs(currentPos.x - currentStart.x)}
                height={Math.abs(currentPos.y - currentStart.y)}
                fill={`${activeColor}22`}
                stroke={activeColor}
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            )}

            {activeTool === 'arrow' && (
              <line
                x1={currentStart.x}
                y1={currentStart.y}
                x2={currentPos.x}
                y2={currentPos.y}
                stroke={activeColor}
                strokeWidth="3"
                strokeDasharray="4 4"
                markerEnd={`url(#arrowhead-${activeColor.replace('#', '')})`}
              />
            )}
          </>
        )}

        {/* Render Eraser cursor preview */}
        {activeTool === 'eraser' && eraserPos && (
          <circle
            cx={eraserPos.x}
            cy={eraserPos.y}
            r="22"
            fill="rgba(244, 63, 94, 0.15)"
            stroke="#f43f5e"
            strokeWidth="2"
            strokeDasharray="3 3"
            className="pointer-events-none animate-pulse"
          />
        )}
      </g>
    </svg>
  );
};
