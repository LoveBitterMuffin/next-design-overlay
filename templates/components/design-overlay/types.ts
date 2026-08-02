export type AnnotationCategory = 'bug' | 'design_system' | 'layout' | 'animation' | 'copywriting';
export type TaskStatus = 'open' | 'in_progress' | 'resolved';

export type ToolType = 'cursor' | 'select' | 'pencil' | 'rect' | 'arrow' | 'pin' | 'eraser';

export interface GuideLine {
  id: string;
  type: 'h' | 'v';
  position: number;
}

export interface DrawShape {
  id: string;
  type: 'pencil' | 'rect' | 'arrow' | 'pin';
  x: number;
  y: number;
  width?: number;
  height?: number;
  endX?: number;
  endY?: number;
  points?: { x: number; y: number }[];
  text?: string;
  color?: string;
  taskId?: string;
  taskIndex?: number;
}

export interface AnnotationTask {
  id: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  target: {
    pageUrl: string;
    componentName: string;
    filePath: string;
    lineNumber?: number;
    selector?: string;
  };
  context: {
    category: AnnotationCategory;
    title: string;
    description: string;
    bestPracticeRule?: string;
    computedStyles?: Record<string, string>;
    tailwindClasses?: string;
  };
  visuals: {
    elementCropPath?: string;
    canvasMarkupPath?: string;
    canvasMarkupBase64?: string;
    pageSnapshotPath?: string;
    pageSnapshotBase64?: string;
    compositeSnapshotPath?: string;
    compositeSnapshotBase64?: string;
    referenceImagePath?: string;
    referenceImageBase64?: string;
    shapes?: DrawShape[];
    gridInfo?: {
      showGrid?: boolean;
      showColumns?: boolean;
      columnCount?: number;
      rowCount?: number;
      guides?: GuideLine[];
    };
  };
}
