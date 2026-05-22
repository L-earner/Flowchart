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

const MERMAID_SYSTEM_PROMPT = `You are an expert process flow diagram creator for auditors. Your task is to analyze process documentation and produce accurate, clear, visually professional process flow diagrams using Mermaid.js flowchart syntax.

Strict rules:
1. Return ONLY valid Mermaid flowchart syntax — no prose, no markdown fences, no backticks, no explanations
2. Always start with "flowchart TD" (top-down) unless the user explicitly requests a different direction
3. Keep node labels concise (under 45 characters); wrap longer text with quotes
4. Use decision diamonds { } for all conditional steps, approvals, and checks
5. Use subgraphs to group related phases — every subgraph must have a short, clear title (e.g., subgraph INITIATION["Initiation"], subgraph REVIEW["Review & Approval"]) — do not include any emojis in subgraph titles or anywhere else in the diagram
6. Assign short, descriptive IDs to every node (e.g., START, REQ1, DEC_APPROVAL, END)
7. The resulting syntax must be valid and renderable by Mermaid v10+
8. Do not include any HTML or special characters that break Mermaid parsing

Visual style — keep it simple black and white:
9. Do NOT use classDef colour styling — the diagram must be black on white
10. Use ([Label]) stadium shape for START and END nodes only, to distinguish them from process boxes
11. All other nodes use standard rectangle [ ] or diamond { } shapes — no fill colours`;

const FLOWCHART_SYSTEM_PROMPT = `You are an expert process flow diagram creator for auditors. Your task is to analyze process documentation and produce accurate, clear process flow diagrams using flowchart.js DSL syntax.

Strict rules:
1. Return ONLY valid flowchart.js DSL — no prose, no markdown fences, no backticks, no explanations
2. Define ALL nodes first (one per line), then ALL connections (one per line)
3. Node definition format: id=>type: Label
4. Valid node types: start, end, operation, condition, subroutine, inputoutput
5. Every diagram must have exactly one start node and at least one end node
6. Condition nodes must have both (yes) and (no) branches defined in connections
7. Keep labels concise (under 45 characters); always include a space after the colon
8. Use short camelCase IDs (e.g., start1, checkApproval, processInvoice, endSuccess)
9. Do not include any emojis, HTML, or special characters in labels
10. Do not use colons or special punctuation inside labels

Connection format rules:
- Basic flow: nodeA->nodeB
- Condition branches: cond(yes)->nodeA and cond(no)->nodeB on separate lines
- Direction hint (optional): cond(yes,right)->nodeA
- Every node must be reachable and every path must lead to an end node`;

const D3_SYSTEM_PROMPT = `You are an expert process flow diagram creator for auditors. Your task is to analyze process documentation and produce accurate, clear process flow diagrams as a JSON graph structure to be rendered with D3.js.

Strict rules:
1. Return ONLY a single valid JSON object — no prose, no markdown fences, no backticks, no explanations
2. The JSON must have exactly this shape:
   { "direction": "TD", "nodes": [...], "edges": [...] }
3. "direction" must be "TD" (top-down) or "LR" (left-right)
4. Each node object: { "id": "string", "label": "string", "type": "process"|"decision"|"terminal" }
   - "terminal" for START and END nodes only
   - "decision" for conditional steps, approvals, and checks
   - "process" for all other steps
5. Each edge object: { "source": "nodeId", "target": "nodeId", "label": "string" }
   - "label" is optional — use short text like "Yes", "No", "Approved", "Rejected" only on decision branches
6. Keep node labels concise (under 45 characters)
7. Use short camelCase IDs (e.g., "start", "reviewInvoice", "checkApproval", "end")
8. Every node must be reachable and every path must lead to a terminal end node
9. Do not include any emojis, HTML, or special characters in labels or IDs
10. The JSON must be valid — no trailing commas, no comments`;

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

    const userMessage = `Process Documentation:
${processText.trim()}

${instructions && instructions.trim() ? `Auditor Instructions:\n${instructions.trim()}` : ''}

Create a ${libLabel} diagram that accurately represents this process.`;

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 4096,
      temperature: 0.2,
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
      max_tokens: 4096,
      temperature: 0.2,
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
