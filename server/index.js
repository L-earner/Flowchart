import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: 'http://localhost:5173' }));

const SYSTEM_PROMPT = `You are an expert process flow diagram creator for auditors. Your task is to analyze process documentation and produce accurate, clear process flow diagrams using Mermaid.js flowchart syntax.

Strict rules:
1. Return ONLY valid Mermaid flowchart syntax — no prose, no markdown fences, no backticks, no explanations
2. Always start with "flowchart TD" (top-down) unless the user explicitly requests a different direction
3. Keep node labels concise (under 50 characters); wrap longer text with quotes
4. Use decision diamonds { } for conditional steps and approvals
5. Use subgraphs to group related phases (e.g., subgraph Initiation, subgraph Review)
6. Assign short, descriptive IDs to every node (e.g., A, B, C1, DEC1)
7. The resulting syntax must be valid and renderable by Mermaid v10+
8. Do not include any HTML or special characters that break Mermaid parsing`;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  return new Anthropic({ apiKey });
}

app.post('/api/generate', async (req, res) => {
  try {
    const { processText, instructions } = req.body;
    if (!processText || !processText.trim()) {
      return res.status(400).json({ error: 'Process documentation text is required.' });
    }

    const userMessage = `Process Documentation:
${processText.trim()}

${instructions && instructions.trim() ? `Auditor Instructions:\n${instructions.trim()}` : ''}

Create a Mermaid flowchart diagram that accurately represents this process.`;

    const client = getClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    let mermaidCode = message.content[0].text.trim();
    // Strip any accidental markdown fences
    mermaidCode = mermaidCode.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    res.json({ mermaidCode });
  } catch (error) {
    console.error('Generate error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to generate diagram.' });
  }
});

app.post('/api/refine', async (req, res) => {
  try {
    const { currentMermaid, refinementInstructions } = req.body;
    if (!currentMermaid || !refinementInstructions || !refinementInstructions.trim()) {
      return res.status(400).json({ error: 'Current diagram and refinement instructions are required.' });
    }

    const userMessage = `Current Mermaid flowchart:

${currentMermaid}

Refinement instructions from the auditor:
${refinementInstructions.trim()}

Return the updated Mermaid flowchart syntax only.`;

    const client = getClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    let mermaidCode = message.content[0].text.trim();
    mermaidCode = mermaidCode.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    res.json({ mermaidCode });
  } catch (error) {
    console.error('Refine error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to refine diagram.' });
  }
});

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
