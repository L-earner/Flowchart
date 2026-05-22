# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Express API (port 3001) + Vite frontend (port 5175) concurrently
npm run server   # Start API server only
npm run build    # TypeScript check + Vite production build
npm start        # Serve production build via Express
npm run lint     # ESLint
```

No test suite exists in this project.

## Environment

Copy `.env.example` to `.env` and set:
- `OPENAI_API_KEY` — required for all diagram generation
- `PORT` — optional, defaults to `3001`

The server loads env via `node --env-file=.env` (not dotenv).

## Architecture

Two-process dev setup: Vite proxies all `/api/*` requests to Express on port 3001 (`vite.config.ts`). In production, Express serves the built `dist/` statically.

### Data flow

1. User provides a document (upload/paste/sample) on `InputScreen` → selects a diagram library → clicks Generate
2. `App.tsx` POSTs to `/api/generate` with `{ processText, instructions, diagramLib }`
3. Express builds a library-specific system prompt and calls OpenAI `gpt-5.4-mini`; strips markdown fences from the response
4. `diagramCode` is stored in `App` state; `step` advances to `'diagram'`
5. `DiagramScreen` renders the code with the appropriate viewer component
6. Refinements POST to `/api/refine` with `{ currentDiagram, refinementInstructions, diagramLib }`; the same diagram code state is overwritten in place

### Diagram library system

Three libraries are supported, selected in `InputScreen` and carried through the whole flow via `DiagramLib = 'mermaid' | 'flowchart' | 'd3'`:

| Library | Renderer component | AI output format |
|---|---|---|
| `mermaid` | `<div ref={mermaidRef}>` via `mermaid.render()` | Mermaid flowchart syntax |
| `flowchart` | `FlowchartView.tsx` | flowchart.js DSL |
| `d3` | `D3View.tsx` | JSON `{ direction, nodes[], edges[] }` |

Canvas view (`CanvasView.tsx` using `@xyflow/react`) is only available for Mermaid. Switching away from Mermaid resets `viewMode` to `'diagram'`.

Mermaid is initialized once at module level in `DiagramScreen.tsx` with a strict black-and-white theme. The system prompts enforce this — never add `classDef` colour styling or the export will look wrong.

### Key constraints

- **6 MB file upload limit** — enforced by multer; AWS Lambda/Amplify drops larger payloads before they reach the server
- **Mermaid render errors** — disable the Export button; the raw syntax is shown in a `<details>` block for debugging
- D3 diagram code is parsed as JSON in `D3View.tsx` — the AI must return pure JSON, no fences

### Component responsibilities

- `App.tsx` — owns `step`, `diagramCode`, `diagramLib`, `isLoading`, `error` state; makes all API calls
- `InputScreen.tsx` — file upload (drag-drop via react-dropzone), paste textarea, sample picker, AI instructions, library selector
- `DiagramScreen.tsx` — diagram viewport with zoom, view toggle, refinement sidebar, delegates rendering to viewer components
- `ExportModal.tsx` — PDF/PNG/SVG export using `exportUtils.ts` (html-to-image + jsPDF)
- `src/utils/fileParser.ts` — client-side parsing of .txt/.md (FileReader), .docx (mammoth), .pdf (pdfjs-dist)

### Deployment

AWS Amplify Web Compute — see `amplify.yml`. Uses Node 20. The Amplify build produces the full repo as artifacts so Express can serve it at runtime.
