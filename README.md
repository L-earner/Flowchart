# Audit Process Flow Diagram Generator

A full-stack web application that lets auditors convert process walkthrough notes or documentation into interactive flowcharts powered by Claude AI.

## Features

- **File upload or paste** — supports `.txt`, `.md`, `.docx`, and `.pdf` input files
- **AI Instructions** — steer the diagram (layout, emphasis, groupings, etc.)
- **Mermaid.js rendering** — clean, scalable flowchart with zoom controls
- **Iterative refinement** — type instructions to update the diagram in-place without starting over
- **Multi-format export** — download the final diagram as **PDF**, **PNG**, or **SVG** for the audit file

## Quick Start

### Prerequisites

- Node.js 18+
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=your_key_here

# 3. Start the app (API server + frontend together)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Application Flow

### Step 1 — Provide Documentation
- Choose **Upload File** to drag-and-drop a process document, or **Paste Text** to copy-paste notes
- Optionally add **AI Instructions** to guide the diagram (e.g. "use left-to-right layout, highlight approval steps, group by department")
- Click **Generate Diagram**

### Step 2 — Review & Refine
- The AI-generated Mermaid flowchart is displayed with zoom controls
- Use the **Refinement** panel to type changes (e.g. "add a Manager Approval step after submission") and click **Apply Refinement**
- Repeat until satisfied

### Export
- Click **Complete & Export** to open the export modal
- Choose a filename and format: **PDF**, **PNG**, or **SVG**
- Download and attach to your audit file

## Project Structure

```
├── server/
│   └── index.js          # Express API — /api/generate and /api/refine
├── src/
│   ├── components/
│   │   ├── InputScreen.tsx   # Step 1: file upload / paste + AI instructions
│   │   ├── DiagramScreen.tsx # Step 2: Mermaid diagram + refinement panel
│   │   └── ExportModal.tsx   # Format selection and download
│   ├── utils/
│   │   ├── fileParser.ts     # Parses .txt, .md, .docx, .pdf uploads
│   │   └── exportUtils.ts    # SVG → PDF / PNG / SVG export
│   ├── types.ts
│   └── App.tsx
├── .env.example
└── vite.config.ts        # Proxies /api to Express on port 3001
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API server + Vite frontend concurrently |
| `npm run build` | Production build |
| `npm start` | Serve production build via Express |

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Express.js
- **AI**: OpenAI (`gpt-5.4-mini`)
- **Diagrams**: Mermaid.js v11
- **File parsing**: mammoth (DOCX), pdfjs-dist (PDF)
- **Export**: jsPDF, file-saver
