import express from 'express';
import OpenAI from 'openai';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { readdir } from 'fs/promises';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// AWS Lambda / Amplify Web Compute enforces a ~6MB request payload ceiling.
// Files above this are rejected at the infrastructure layer before reaching multer.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });

const samplesDir = path.join(__dirname, '../public/samples');
app.use('/samples', express.static(samplesDir));

const MERMAID_SYSTEM_PROMPT = `You are an expert process flow diagram creator for auditors. Analyze the process documentation and return a single, complete, valid Mermaid.js flowchart — nothing else.

OUTPUT FORMAT (non-negotiable):
- Return ONLY Mermaid flowchart syntax. No prose, no markdown fences, no backticks, no explanations.
- The very first line must be exactly: flowchart TD
- Use flowchart LR only if the user explicitly requests a left-to-right layout.

NODE IDs:
- Use short SCREAMING_SNAKE_CASE IDs: PROC_START, RECV_REQUEST, DEC_APPROVAL, END_REJECTED
- NEVER use these reserved words as node IDs: end, start, stop, graph, flowchart, subgraph, direction, style, classDef, click — they will silently break the diagram

NODE LABELS:
- Keep labels under 45 characters. Always wrap labels in double quotes: A["Label text here"]
- NEVER place unescaped special characters inside labels — these all break Mermaid parsing: ( ) [ ] { } # : / \\ "
  Replace with plain words: "and" instead of "&", "or" not "/", "check" not "(check)"

NODE SHAPES:
- ([Label])  — terminal nodes only: exactly one START and at least one END
- {Label}    — every decision, approval, condition, or check
- [Label]    — all other process steps
- No other shapes. No fill colours. No classDef, style, or linkStyle directives.

DECISION BRANCHES (critical):
- Every diamond {decision} MUST have all outgoing edges labeled — binary decisions get two, multi-outcome decisions get one per outcome:
    DEC_APPROVAL -->|Approved| NEXT_STEP
    DEC_APPROVAL -->|Rejected| END_REJECTED
    DECISION -->|Approved| APPROVE_FILE
    DECISION -->|Conditional| COND_FILE
    DECISION -->|Declined| DECLINE_FILE
- Use concise branch labels: Yes/No, Approved/Rejected, Pass/Fail, Conditional, Incomplete
- Unlabeled edges on decision nodes will make the diagram unreadable

CONNECTIONS:
- Every node must appear in at least one connection — no orphan nodes
- Every path must eventually reach a terminal END node — no dead ends
- Label edges ONLY on decision branches; all other edges are unlabeled arrows

SUBGRAPHS:
- Use subgraphs to group 3 or more steps that belong to the same phase or owner
- Always prefix subgraph IDs with PHASE_: PHASE_INTAKE, PHASE_REVIEW, PHASE_APPROVAL
- Subgraph IDs share the same namespace as node IDs — a subgraph ID must NEVER match any node ID or Mermaid will crash with a cycle error
- Format: subgraph PHASE_INTAKE["Intake"]\n  ...\nend
- Do not nest subgraphs inside other subgraphs
- No emojis anywhere in the diagram

DIAGRAM QUALITY:
- Aim for 10–25 nodes. Consolidate minor steps; expand all decision points and exception paths.
- Capture every approval gate, exception path, and rejection loop mentioned in the documentation.
- The diagram must be fully self-explanatory without the source document.`;

const FLOWCHART_SYSTEM_PROMPT = `You are an expert process flow diagram creator for auditors. Analyze the process documentation and return a single, complete, valid flowchart.js DSL diagram — nothing else.

OUTPUT FORMAT (non-negotiable):
- Return ONLY flowchart.js DSL. No prose, no markdown fences, no backticks, no explanations.
- Structure: define ALL nodes first (one per line), then ALL connections (one per line). Never mix them.

NODE DEFINITIONS — format: id=>type: Label
- Valid types: start, end, operation, condition, subroutine, inputoutput
  - start / end       — terminal nodes (rounded rectangle)
  - operation         — standard process step (rectangle)
  - condition         — decision or approval check (diamond) — yes/no branches required
  - subroutine        — step that refers to a separate documented sub-process (double-bordered box)
  - inputoutput       — data input or output step (parallelogram)
- Every diagram must have exactly one start node and at least one end node
- Always include a space after the colon: id=>operation: Label text

NODE IDs:
- Use short camelCase IDs: startProcess, checkApproval, processInvoice, endApproved
- NEVER use these as IDs — they are reserved words that break the parser: yes, no, end, start
  Use endApproved, endRejected, startProcess instead

NODE LABELS:
- Keep labels under 40 characters
- NEVER include these characters inside labels — they break DSL parsing: : -> => ( ) % # "
  Rephrase to avoid them: "and" not "&", "or" not "/", "check" not "(check)"
- No emojis anywhere

CONNECTIONS:
- Basic flow: nodeA->nodeB
- Condition branches (both required for every condition node):
    cond(yes)->nodeA
    cond(no)->nodeB
- Optional direction hint: cond(yes,right)->nodeA
- Every node must appear in at least one connection — no orphan nodes
- Every path must lead to an end node — no dead ends
- The yes/no branch labels are rendered automatically — do not try to customise them in the DSL

DIAGRAM QUALITY:
- Aim for 8–20 nodes. Consolidate minor steps; preserve all decision and exception paths.
- Capture every approval gate, exception path, and rejection route in the documentation.`;

const D3_SYSTEM_PROMPT = `You are an expert process flow diagram creator for auditors. Analyze the process documentation and return a single, complete, valid JSON graph — nothing else.

OUTPUT FORMAT (non-negotiable):
- Return ONLY a single valid JSON object. No prose, no markdown fences, no backticks, no explanations.
- The JSON must have exactly this shape:
  { "direction": "TD", "nodes": [...], "edges": [...] }
- "direction": "TD" (top-down, default) or "LR" (left-right, only if user requests it)
- Invalid JSON causes a render failure — no trailing commas, no comments, no extra keys

NODES — each object: { "id": "string", "label": "string", "type": "process"|"decision"|"terminal" }
- "terminal"  — exactly one START node and at least one END node; rendered as a pill shape
- "decision"  — every conditional check, approval, or branch point; rendered as a diamond
- "process"   — all other steps; rendered as a rectangle
- IDs must be unique camelCase strings with no spaces or special characters: "recvApplication", "checkApproval", "endApproved", "endRejected"
- Keep labels under 45 characters. No emojis, no HTML, no special characters in labels or IDs.

EDGES — each object: { "source": "nodeId", "target": "nodeId", "label": "string" }
- "label" is optional — add it ONLY on branches from decision nodes
- Edge labels must be 12 characters or fewer: "Yes", "No", "Approved", "Rejected", "Pass", "Fail"
- Every decision node must have all its outgoing edges labeled
- No edge label on non-decision connections

CONNECTIONS:
- Every node must appear in at least one edge — no orphan nodes
- Every path must eventually reach a terminal END node — no dead ends
- Node IDs in edges must exactly match IDs defined in the nodes array

DIAGRAM QUALITY:
- Aim for 10–25 nodes. Consolidate minor steps; preserve all decision points and exception paths.
- Capture every approval gate, rejection route, and loop-back in the documentation.`;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set');
  return new OpenAI({ apiKey });
}

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided.' });
    const client = getClient();
    const audioFile = new File([req.file.buffer], req.file.originalname || 'audio.webm', { type: req.file.mimetype || 'audio/webm' });
    const transcription = await client.audio.transcriptions.create({ file: audioFile, model: 'whisper-1' });
    res.json({ text: transcription.text });
  } catch (error) {
    console.error('Transcribe error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to transcribe audio.' });
  }
});

app.post('/api/generate', async (req, res) => {
  try {
    const { processText, instructions, diagramLib = 'mermaid' } = req.body;
    if (!processText || !processText.trim()) {
      return res.status(400).json({ error: 'Process documentation text is required.' });
    }

    const systemPrompt = diagramLib === 'flowchart' ? FLOWCHART_SYSTEM_PROMPT
      : diagramLib === 'd3' ? D3_SYSTEM_PROMPT
      : MERMAID_SYSTEM_PROMPT;
    const libLabel = diagramLib === 'flowchart' ? 'flowchart.js'
      : diagramLib === 'd3' ? 'D3.js JSON graph'
      : 'Mermaid';

    const isMermaid = diagramLib === 'mermaid';
    const userMessage = `Process Documentation:
${processText.trim()}

${instructions && instructions.trim() ? `Auditor Instructions:\n${instructions.trim()}\n` : ''}${isMermaid ? `
Before writing any syntax, silently identify:
1. The main phases or departments involved
2. Every process step within each phase
3. All decision points, approvals, and conditional checks
4. All exception paths, rejection loops, and alternative outcomes

Then produce the complete Mermaid flowchart. Output the diagram syntax only — no commentary.` : `Create a ${libLabel} diagram that accurately represents this process.`}`;

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
    });

    let diagramCode = completion.choices[0].message.content?.trim() ?? '';
    diagramCode = diagramCode.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    res.json({ diagramCode });
  } catch (error) {
    console.error('Generate error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to generate diagram.' });
  }
});

app.post('/api/refine', async (req, res) => {
  try {
    const { currentDiagram, refinementInstructions, diagramLib = 'mermaid' } = req.body;
    if (!currentDiagram || !refinementInstructions || !refinementInstructions.trim()) {
      return res.status(400).json({ error: 'Current diagram and refinement instructions are required.' });
    }

    const systemPrompt = diagramLib === 'flowchart' ? FLOWCHART_SYSTEM_PROMPT
      : diagramLib === 'd3' ? D3_SYSTEM_PROMPT
      : MERMAID_SYSTEM_PROMPT;
    const libLabel = diagramLib === 'flowchart' ? 'flowchart.js'
      : diagramLib === 'd3' ? 'D3.js JSON graph'
      : 'Mermaid';

    const userMessage = `Current ${libLabel} diagram:

${currentDiagram}

Refinement instructions from the auditor:
${refinementInstructions.trim()}

Return the updated ${libLabel} diagram syntax only.`;

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
    });

    let diagramCode = completion.choices[0].message.content?.trim() ?? '';
    diagramCode = diagramCode.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    res.json({ diagramCode });
  } catch (error) {
    console.error('Refine error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to refine diagram.' });
  }
});

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// List sample files from public/samples/
app.get('/api/samples', async (_req, res) => {
  try {
    const files = await readdir(samplesDir);
    const samples = files.filter(f => !f.startsWith('.') && /\.(txt|md|docx|pdf)$/i.test(f));
    res.json({ samples });
  } catch {
    res.json({ samples: [] });
  }
});

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
