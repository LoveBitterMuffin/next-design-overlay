# Next.js Design Overlay for AI Coding Agents 🎨

A standalone mini-application and MCP (Model Context Protocol) server designed to bridge the gap between human designers/developers and AI coding agents (like Cursor, Claude, or Gemini). It provides an interactive UI inside your Next.js application to visually annotate, layout, and document design tasks, which are instantly synchronized with your AI agent.

## Features

- **Visual Annotations**: Draw bounding boxes, arrows, and drop pin markers directly over your local UI.
- **Grid Systems**: Overlay customizable horizontal/vertical 8pt grid systems to verify alignment.
- **Component Inspector**: Hover over any UI element to automatically capture its React component name, source file location (e.g. `src/components/Button.tsx:L42`), computed CSS styles, and Tailwind classes.
- **Task Management**: Create structured tasks linked to visual areas. Tasks are stored in a `.design-spec/annotations.json` file and compiled to a `UI_SPEC.md` for agents to read.
- **MCP Server**: Exposes tools for AI agents to query active design tasks, fetch visual snapshots, and mark tasks as resolved.

## Installation

Run the following command in the root of your Next.js App Router project:

```bash
npx next-design-overlay init
```

The installer will ask you a few questions and automatically copy the necessary components, API routes, and MCP scripts into your project. It will also install `html-to-image` as a dependency.

### Prerequisites
- Next.js 13+ (App Router)
- Tailwind CSS (The UI is styled using standard Tailwind utility classes)
- React 18+

## Setup & Usage

### 1. Mount the Component
After installation, import and mount the `<DesignOverlay />` component in your global layout file (e.g., `src/app/layout.tsx`):

```tsx
import { DesignOverlay } from '@/components/design-overlay/DesignOverlay';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <DesignOverlay />
      </body>
    </html>
  );
}
```
*Note: The component will automatically hide itself in production environments (`process.env.NODE_ENV !== 'development'`).*

### 2. Connect the MCP Server
To allow your AI Coding Agent to read the visual tasks you create, add the MCP server to your agent's configuration.

For example, in Cursor, go to `Cursor Settings > MCP` and add a new `stdio` server:
- **Name**: `Design Overlay`
- **Command**: `node scripts/design-overlay-mcp.js`

### 3. Using the UI
Start your Next.js dev server (`npm run dev`). You will see a small palette icon (🎨) in the bottom-left corner of your screen. 
1. Click the icon to activate **Design Mode**.
2. **Inspect**: Hover over elements to see their source code location and CSS.
3. **Draw**: Use the Bounding Box (🔲), Arrow (↘️), or Pin (📍) tools to highlight issues on the screen.
4. **Create Task**: Click the element or finish your drawing to open the Annotation Modal. Write instructions for your AI agent (e.g., "Fix alignment of this button").
5. **Agent Handoff**: The AI agent will automatically detect the new task via the MCP server or the generated `UI_SPEC.md` file, locate the exact file/line number, see a screenshot of your annotation, and write the code to fix it!

## Architecture

When you save a task:
1. The **API Route** (`app/api/design-overlay/route.ts`) receives the payload.
2. Screenshots (clean, marked-up, composite) are generated and saved to `.design-spec/snapshots/`.
3. The task metadata is written to `.design-spec/annotations.json`.
4. A human/agent-readable markdown file `UI_SPEC.md` is compiled at your project root.
5. The **MCP Server** serves these files directly to the LLM context when requested.

## License
MIT
