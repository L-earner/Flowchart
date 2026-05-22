# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start both Express API (port 3001) and Vite frontend (port 5173) concurrently
npm run build    # TypeScript compile + Vite production build → dist/
npm start        # Serve production build via Express (NODE_ENV=production)
npm run server   # Start Express API only
npm run lint     # ESLint check
```

There are no tests. `npm run dev` is the primary development command.

## Architecture

This is a two-process full-stack app with no shared TypeScript between frontend and backend.

**Dev-time data flow:**
```
Browser → Vite (port 5173) → [/api/* proxy] → Express (port 3001) → OpenAI gpt-4o
```
The Vite proxy in `vite.config.ts` forwards all `/api` requests to the Express server, so the frontend always uses relative paths like `/api/generate`. No hardcoded backend URLs exist in the frontend.

**Production:** `npm run build` outputs to `dist/`, which Express serves statically when `NODE_ENV=production`. No Vite process runs.

### Backend — `server/index.js`

Plain ES-module Express server. Endpoints:
- `POST /api/generate` — takes `{ processText, instructions, diagramLib }`, calls OpenAI, returns `{ diagramCode }`
- `POST /api/refine` — takes `{ currentDiagram, refinementInstructions, diagramLib }`, calls OpenAI, returns `{ diagramCode }`
- `GET /api/samples` — lists `.txt/.md/.docx/.pdf` files from `public/samples/`
- `GET /api/health` — health check

`diagramLib` defaults to `'mermaid'` if omitted. Valid values: `'mermaid'` | `'flowchart'` | `'d3'`.

The backend selects one of three system prompts based on `diagramLib`:
- `MERMAID_SYSTEM_PROMPT` — instructs model to return raw Mermaid `flowchart` syntax
- `FLOWCHART_SYSTEM_PROMPT` — instructs model to return flowchart.js DSL
- `D3_SYSTEM_PROMPT` — instructs model to return a JSON object `{ direction, nodes, edges }`

These system prompts are the primary lever for diagram quality and output format. Both endpoints strip accidental markdown fences from the model response before returning.

Requires `OPENAI_API_KEY` in `.env` (root level). `PORT` defaults to 3001.

### Frontend — `src/`

**State machine in `App.tsx`:** The entire app is a two-step flow controlled by a single `step` state (`'input' | 'diagram'`). No router. `App.tsx` owns all async API calls (`apiFetch`) and passes handlers down as props. It also tracks `diagramLib: DiagramLib` (`'mermaid' | 'flowchart' | 'd3'`) to carry the library choice from generation into refinement.

- `InputScreen` — Step 1. File upload, paste, or sample selection. File parsing is fully client-side (`src/utils/fileParser.ts`). Supported: `.txt`, `.md`, `.docx` (mammoth), `.pdf` (pdfjs-dist, dynamically imported). The user selects a diagram library here before generating.

- `DiagramScreen` — Step 2. Routes rendering to one of three view components based on `diagramLib`:
  - **`diagramLib === 'mermaid'`**: Renders Mermaid SVG via `mermaid.render()` into a `ref`-attached div. Mermaid is initialized once at module scope (not inside a component). Also supports a **canvas mode** (`viewMode: 'diagram' | 'canvas'`) which renders `CanvasView.tsx` — an interactive React Flow (`@xyflow/react`) graph built by parsing `mermaidCode` via `src/utils/mermaidParser.ts` into nodes/edges, then running auto-layout via `src/utils/dagreLayout.ts` (dagre). Canvas mode is only available for Mermaid; switching to `flowchart` or `d3` forces `viewMode` back to `'diagram'`.
  - **`diagramLib === 'flowchart'`**: Renders `FlowchartView.tsx`, which uses the flowchart.js library to render DSL syntax into an SVG inside a `ref`-attached div.
  - **`diagramLib === 'd3'`**: Renders `D3View.tsx`, which parses the JSON graph and renders an interactive D3.js diagram. `D3View` accepts an `onCodeChange` prop to allow node dragging to update `diagramCode`.

  The `exportContainer` ref passed to `ExportModal` is selected dynamically: `fcRef` for flowchart, `d3Ref` for D3, `mermaidRef` for Mermaid.

- `ExportModal` — Exports the rendered diagram (PNG and PDF use `html-to-image`'s `toPng` at 2× pixel ratio; SVG export strips `@import`/`url()` references). Export is disabled when the Mermaid library has a render error.

### Replit-specific configuration

`vite.config.ts` sets `server.host: '0.0.0.0'` and `server.hmr: { clientPort: 443, protocol: 'wss' }` so HMR works through Replit's HTTPS proxy. CORS on the Express server is open (`cors()` with no origin restriction) since Replit frontend URLs are dynamic.

## Key constraints

- Mermaid output must start with `flowchart` and contain no markdown fences — the backend strips fences, but malformed output causes a render error in `DiagramScreen`.
- flowchart.js output must define all nodes before connections; condition nodes require both `(yes)` and `(no)` branches.
- D3 output must be a single JSON object with shape `{ direction, nodes, edges }` — parsing errors in `D3View` will fail silently or show a blank canvas.
- Canvas mode (React Flow) only works with the Mermaid library; `DiagramScreen` enforces this by resetting `viewMode` to `'diagram'` when `diagramLib` changes away from `'mermaid'`.
- `pdfjs-dist` requires Node ≥22 but runs on Node 20 with a warning — PDF parsing still works.
- All styling is in `src/App.css` and `src/index.css` — there is no CSS framework or CSS modules.
