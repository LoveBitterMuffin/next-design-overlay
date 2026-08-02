#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * MCP Server for next-design-overlay
 * Provides JSON-RPC stdio interface for AI agents to inspect & resolve design annotations.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const projectRoot = process.cwd();
const specDir = path.join(projectRoot, '.design-spec');
const jsonPath = path.join(specDir, 'annotations.json');
const specMdPath = path.join(projectRoot, 'UI_SPEC.md');

function loadTasks() {
  try {
    if (!fs.existsSync(jsonPath)) return [];
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch {
    return [];
  }
}

function compileMarkdown(tasks) {
  const openTasks = tasks.filter(t => t.status === 'open');
  const resolvedTasks = tasks.filter(t => t.status === 'resolved');
  const rules = Array.from(new Set(tasks.map(t => t.context?.bestPracticeRule).filter(Boolean)));

  let md = `# 🎨 UI/UX Design Annotations & Active Tasks (Single Spec File)\n\n`;
  md += `> Generated automatically by \`next-design-overlay\`.\n`;
  md += `> AI Agents: This is your primary task list. Inspect target files, styles, visual shape coordinates, and mark resolved via MCP or update \`.design-spec/annotations.json\`.\n\n`;

  md += `## 🔴 Open Tasks (${openTasks.length})\n\n`;
  if (openTasks.length === 0) {
    md += `*No open tasks. All UI annotations resolved! 🎉*\n\n`;
  } else {
    for (const t of openTasks) {
      md += `### [${t.id}] ${t.context?.title || 'Untitled Directive'}\n`;
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
        const shapeStr = t.visuals.shapes.map((s) => {
          if (s.type === 'rect') return `Рамка [x: ${s.x}px, y: ${s.y}px, w: ${s.width}px, h: ${s.height}px]`;
          if (s.type === 'arrow') return `Стрелка от (${s.x}, ${s.y}) к (${s.endX}, ${s.endY})`;
          if (s.type === 'pin') return `Метка #${s.text} в (${s.x}, ${s.y})`;
          return s.type;
        }).join(', ');
        md += `- **Визуальное выделение на экране:** ${shapeStr}\n`;
      }

      md += `- **Описание проблемы:** ${t.context?.description}\n`;
      if (t.context?.bestPracticeRule) {
        md += `- **Правило Best Practice:** \`${t.context.bestPracticeRule}\`\n`;
      }

      if (t.visuals?.canvasMarkupPath) {
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
      md += `- **[${t.id}] ${t.context?.title}** — \`${t.target?.filePath}\` (Resolved at ${t.updatedAt})\n`;
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

function saveTasks(tasks) {
  if (!fs.existsSync(specDir)) {
    fs.mkdirSync(specDir, { recursive: true });
  }
  fs.writeFileSync(jsonPath, JSON.stringify(tasks, null, 2), 'utf-8');
  fs.writeFileSync(specMdPath, compileMarkdown(tasks), 'utf-8');
}

const TOOLS = [
  {
    name: 'get_ui_tasks',
    description: 'Get active or resolved UI/UX design annotation tasks created by the user in the browser overlay.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'resolved', 'all'], description: 'Filter by task status' }
      }
    }
  },
  {
    name: 'get_task_details',
    description: 'Get full context, CSS styles, Tailwind classes, and snapshot image paths for a specific task.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID (e.g. task-001)' }
      },
      required: ['taskId']
    }
  },
  {
    name: 'resolve_ui_task',
    description: 'Mark a UI design task as resolved after completing code changes.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID' },
        resolutionNote: { type: 'string', description: 'Summary of code changes made' }
      },
      required: ['taskId']
    }
  },
  {
    name: 'get_design_rules',
    description: 'Get accumulated design system rules and best practices.',
    inputSchema: { type: 'object', properties: {} }
  }
];

function handleCallTool(name, args) {
  const tasks = loadTasks();

  if (name === 'get_ui_tasks') {
    const statusFilter = args?.status || 'open';
    let filtered = tasks;
    if (statusFilter !== 'all') {
      filtered = tasks.filter(t => t.status === statusFilter);
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({ count: filtered.length, tasks: filtered }, null, 2) }]
    };
  }

  if (name === 'get_task_details') {
    const task = tasks.find(t => t.id === args?.taskId);
    if (!task) {
      return { isError: true, content: [{ type: 'text', text: `Task ${args?.taskId} not found` }] };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(task, null, 2) }]
    };
  }

  if (name === 'resolve_ui_task') {
    const task = tasks.find(t => t.id === args?.taskId);
    if (!task) {
      return { isError: true, content: [{ type: 'text', text: `Task ${args?.taskId} not found` }] };
    }
    task.status = 'resolved';
    task.updatedAt = new Date().toISOString();
    if (args.resolutionNote) {
      task.resolutionNote = args.resolutionNote;
    }
    saveTasks(tasks);
    return {
      content: [{ type: 'text', text: `Task ${task.id} marked as resolved.` }]
    };
  }

  if (name === 'get_design_rules') {
    const rules = Array.from(new Set(tasks.map(t => t.context?.bestPracticeRule).filter(Boolean)));
    return {
      content: [{ type: 'text', text: JSON.stringify({ rules }, null, 2) }]
    };
  }

  return { isError: true, content: [{ type: 'text', text: `Unknown tool ${name}` }] };
}

// JSON-RPC stdio protocol handler
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', line => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    if (msg.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'next-design-overlay-mcp', version: '1.0.0' }
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else if (msg.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result: { tools: TOOLS }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else if (msg.method === 'tools/call') {
      const { name, arguments: toolArgs } = msg.params || {};
      const res = handleCallTool(name, toolArgs);
      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result: res
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (e) {
    // Ignore non-json lines
  }
});
