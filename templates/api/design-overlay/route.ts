import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { AnnotationTask, DrawShape } from '@/components/design-overlay/types';

function compileMarkdownSpec(tasks: AnnotationTask[], projectRoot: string, selectedTaskIds?: string[]): string {
  // If selectedTaskIds is provided, only include those tasks, but keep the global numbering intact
  const tasksToInclude = selectedTaskIds ? tasks.filter(t => selectedTaskIds.includes(t.id)) : tasks;
  
  const openTasks = tasksToInclude.filter(t => t.status === 'open');
  const resolvedTasks = tasksToInclude.filter(t => t.status === 'resolved');
  const rules = Array.from(new Set(tasksToInclude.map(t => t.context?.bestPracticeRule).filter(Boolean)));

  let md = `# 🎨 UI/UX Design Annotations & Active Tasks (Single Spec File)\n\n`;
  md += `> Generated automatically by \`next-design-overlay\`.\n`;
  md += `> AI Agents: This is your primary task list. Inspect target files, styles, visual shape coordinates, and mark resolved via MCP or update \`.design-spec/annotations.json\`.\n\n`;

  md += `## 🔴 Open Tasks (${openTasks.length})\n\n`;
  if (openTasks.length === 0) {
    md += `*No open tasks. All UI annotations resolved! 🎉*\n\n`;
  } else {
    for (const t of openTasks) {
      const globalIndex = tasks.findIndex(task => task.id === t.id) + 1;
      md += `### [Задача #${globalIndex}] ${t.context?.title || 'Untitled Directive'}\n`;
      md += `- **ID задачи:** \`${t.id}\`\n`;
      md += `- **Категория:** \`${t.context?.category?.toUpperCase()}\`\n`;
      md += `- **Исходный файл:** [\`${t.target?.filePath}${t.target?.lineNumber ? ':L' + t.target?.lineNumber : ''}\`](file:///${projectRoot.replace(/\\/g, '/')}/${t.target?.filePath}#L${t.target?.lineNumber || 1})\n`;
      md += `- **Компонент:** \`${t.target?.componentName}\` (${t.target?.selector ? 'Селектор: `' + t.target.selector + '`' : ''})\n`;
      
      if (t.context?.computedStyles) {
        const s = t.context.computedStyles;
        md += `- **Текущие CSS Стили:** \`display: ${s.display || 'block'}, position: ${s.position || 'static'}, size: ${s.width}x${s.height}, padding: ${s.padding}\`\n`;
      }
      if (t.context?.tailwindClasses) {
        md += `- **Tailwind Классы:** \`${t.context.tailwindClasses}\`\n`;
      }

      if (t.visuals?.shapes && t.visuals.shapes.length > 0) {
        const shapeStr = t.visuals.shapes.map((s: DrawShape) => {
          if (s.type === 'rect') return `Рамка [x: ${s.x}px, y: ${s.y}px, w: ${s.width}px, h: ${s.height}px]`;
          if (s.type === 'arrow') return `Стрелка от (${s.x}, ${s.y}) к (${s.endX}, ${s.endY})`;
          if (s.type === 'pin') return `Метка #${s.text} в (${s.x}, ${s.y})`;
          return String(s.type);
        }).join(', ');
        md += `- **Визуальное выделение на экране:** ${shapeStr}\n`;
      }

      if (t.visuals?.gridInfo) {
        const g = t.visuals.gridInfo;
        const gridNotes: string[] = [];
        if (g.showGrid) gridNotes.push('8pt Grid System');
        if (g.showColumns) gridNotes.push(`${g.columnCount || 12} колонок (Horiz) x ${g.rowCount || 8} строк (Vert)`);
        if (gridNotes.length > 0) {
          md += `- **Активная сетка при создании:** \`${gridNotes.join(' | ')}\`\n`;
        }
      }

      md += `- **Описание проблемы:** ${t.context?.description}\n`;
      if (t.context?.bestPracticeRule) {
        md += `- **Правило Best Practice:** \`${t.context.bestPracticeRule}\`\n`;
      }

      if (t.visuals?.compositeSnapshotPath) {
        md += `- **Снимок страницы с аннотациями:** ![Overlaid Snapshot](file:///${projectRoot.replace(/\\/g, '/')}/${t.visuals.compositeSnapshotPath})\n`;
      }
      if (t.visuals?.pageSnapshotPath) {
        md += `- **Чистый снимок страницы:** ![Page Snapshot](file:///${projectRoot.replace(/\\/g, '/')}/${t.visuals.pageSnapshotPath})\n`;
      }
      if (t.visuals?.canvasMarkupPath && !t.visuals?.compositeSnapshotPath) {
        md += `- **Снимок с выделением:** ![Snapshot](file:///${projectRoot.replace(/\\/g, '/')}/${t.visuals.canvasMarkupPath})\n`;
      }
      if (t.visuals?.referenceImagePath) {
        md += `- **Референс "Как надо":** ![Reference](file:///${projectRoot.replace(/\\/g, '/')}/${t.visuals.referenceImagePath})\n`;
      }
      md += `\n---\n\n`;
    }
  }

  if (resolvedTasks.length > 0) {
    md += `## 🟢 Resolved Tasks (${resolvedTasks.length})\n\n`;
    for (const t of resolvedTasks) {
      const globalIndex = tasks.findIndex(task => task.id === t.id) + 1;
      md += `- **[Задача #${globalIndex}] ${t.context?.title}** — \`${t.target?.filePath}\` (Resolved at ${t.updatedAt})\n`;
    }
    md += `\n`;
  }

  if (rules.length > 0) {
    md += `## 📐 Design System Best Practices\n\n`;
    rules.forEach((rule, idx) => {
      md += `${idx + 1}. ${rule}\n`;
    });
  }

  return md;
}

async function deleteTaskSnapshots(task: AnnotationTask, projectRoot: string) {
  if (!task.visuals) return;
  const pathsToDelete = [
    task.visuals.referenceImagePath,
    task.visuals.compositeSnapshotPath,
    task.visuals.pageSnapshotPath,
    task.visuals.canvasMarkupPath
  ].filter(Boolean) as string[];

  for (const relPath of pathsToDelete) {
    try {
      const absPath = path.join(projectRoot, relPath);
      await fs.unlink(absPath);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  }
  
  // Clear the paths so they don't get referenced anymore
  delete task.visuals.referenceImagePath;
  delete task.visuals.compositeSnapshotPath;
  delete task.visuals.pageSnapshotPath;
  delete task.visuals.canvasMarkupPath;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const projectRoot = process.cwd();
    const specDir = path.join(projectRoot, '.design-spec');
    const jsonPath = path.join(specDir, 'annotations.json');
    const rootSpecMdPath = path.join(projectRoot, 'UI_SPEC.md');
    const selectedSpecMdPath = path.join(projectRoot, 'SELECTED_TASKS.md');

    // Handle "Send" action (generating SELECTED_TASKS.md)
    if (body.action === 'sendSelected') {
      let tasks: AnnotationTask[] = [];
      try {
        const raw = await fs.readFile(jsonPath, 'utf-8');
        tasks = JSON.parse(raw);
      } catch {
        tasks = [];
      }
      const selectedIds: string[] = body.selectedTaskIds || [];
      const markdown = compileMarkdownSpec(tasks, projectRoot, selectedIds);
      await fs.writeFile(selectedSpecMdPath, markdown, 'utf-8');
      
      return NextResponse.json({ success: true, specMdPath: 'SELECTED_TASKS.md' });
    }

    // Handle standard task saving
    const task = body.task;
    if (!task || !task.id) {
      return NextResponse.json({ success: false, error: 'Invalid task payload' }, { status: 400 });
    }

    let tasks: AnnotationTask[] = [];
    try {
      const raw = await fs.readFile(jsonPath, 'utf-8');
      tasks = JSON.parse(raw);
    } catch {
      tasks = [];
    }
    const existingIdx = tasks.findIndex(t => t.id === task.id);
    const existingTask = existingIdx >= 0 ? tasks[existingIdx] : null;

    // If task is being resolved, delete its snapshots to save disk space
    if (task.status === 'resolved') {
      await deleteTaskSnapshots(task, projectRoot);
      if (existingTask) {
        await deleteTaskSnapshots(existingTask, projectRoot);
      }
    } else {
      // Save new snapshots if it's an open task
      const snapshotsDir = path.join(specDir, 'snapshots');
      await fs.mkdir(snapshotsDir, { recursive: true });

      if (task.visuals?.referenceImageBase64) {
        const base64Data = task.visuals.referenceImageBase64.replace(/^data:image\/\w+;base64,/, '');
        const refFileName = `${task.id}-reference.png`;
        const refPath = path.join(snapshotsDir, refFileName);
        await fs.writeFile(refPath, Buffer.from(base64Data, 'base64'));
        task.visuals.referenceImagePath = `.design-spec/snapshots/${refFileName}`;
        delete task.visuals.referenceImageBase64;
      }

      if (task.visuals?.compositeSnapshotBase64) {
        const base64Data = task.visuals.compositeSnapshotBase64.replace(/^data:image\/\w+;base64,/, '');
        const compositeFileName = `${task.id}-composite.png`;
        const compositePath = path.join(snapshotsDir, compositeFileName);
        await fs.writeFile(compositePath, Buffer.from(base64Data, 'base64'));
        task.visuals.compositeSnapshotPath = `.design-spec/snapshots/${compositeFileName}`;
        delete task.visuals.compositeSnapshotBase64;
      }

      if (task.visuals?.pageSnapshotBase64) {
        const base64Data = task.visuals.pageSnapshotBase64.replace(/^data:image\/\w+;base64,/, '');
        const pageFileName = `${task.id}-page.png`;
        const pagePath = path.join(snapshotsDir, pageFileName);
        await fs.writeFile(pagePath, Buffer.from(base64Data, 'base64'));
        task.visuals.pageSnapshotPath = `.design-spec/snapshots/${pageFileName}`;
        delete task.visuals.pageSnapshotBase64;
      }

      if (task.visuals?.canvasMarkupBase64) {
        const base64Data = task.visuals.canvasMarkupBase64.replace(/^data:image\/\w+;base64,/, '');
        const markupFileName = `${task.id}-markup.png`;
        const markupPath = path.join(snapshotsDir, markupFileName);
        await fs.writeFile(markupPath, Buffer.from(base64Data, 'base64'));
        task.visuals.canvasMarkupPath = `.design-spec/snapshots/${markupFileName}`;
        delete task.visuals.canvasMarkupBase64;
      }
    }

    if (existingIdx >= 0) {
      tasks[existingIdx] = { ...existingTask, ...task, updatedAt: new Date().toISOString() };
    } else {
      tasks.push(task);
    }

    await fs.writeFile(jsonPath, JSON.stringify(tasks, null, 2), 'utf-8');
    await fs.writeFile(rootSpecMdPath, compileMarkdownSpec(tasks, projectRoot), 'utf-8');

    return NextResponse.json({ success: true, taskId: task.id, specMdPath: 'UI_SPEC.md' });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const taskIdsParam = searchParams.get('taskIds');
    
    if (!taskId && !taskIdsParam) {
      return NextResponse.json({ success: false, error: 'taskId or taskIds required' }, { status: 400 });
    }

    const idsToDelete = taskIdsParam ? taskIdsParam.split(',') : [taskId];

    const projectRoot = process.cwd();
    const specDir = path.join(projectRoot, '.design-spec');
    const jsonPath = path.join(specDir, 'annotations.json');
    const rootSpecMdPath = path.join(projectRoot, 'UI_SPEC.md');

    let tasks: AnnotationTask[] = [];
    try {
      const raw = await fs.readFile(jsonPath, 'utf-8');
      tasks = JSON.parse(raw);
    } catch {
      tasks = [];
    }

    const tasksToDelete = tasks.filter(t => idsToDelete.includes(t.id));
    for (const t of tasksToDelete) {
      await deleteTaskSnapshots(t, projectRoot);
    }

    tasks = tasks.filter(t => !idsToDelete.includes(t.id));
    await fs.writeFile(jsonPath, JSON.stringify(tasks, null, 2), 'utf-8');
    await fs.writeFile(rootSpecMdPath, compileMarkdownSpec(tasks, projectRoot), 'utf-8');

    return NextResponse.json({ success: true, deletedIds: idsToDelete });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const projectRoot = process.cwd();
    const jsonPath = path.join(projectRoot, '.design-spec', 'annotations.json');
    const raw = await fs.readFile(jsonPath, 'utf-8');
    return NextResponse.json({ success: true, tasks: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ success: true, tasks: [] });
  }
}
