export type NodeShape = 'rectangle' | 'diamond' | 'circle' | 'stadium';

export interface FlowNode {
  id: string;
  label: string;
  shape: NodeShape;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface FlowGraph {
  direction: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

function strip(s: string) {
  return s.replace(/^["']|["']$/g, '').replace(/\\n/g, ' ').trim();
}

function parseNodeStr(s: string): FlowNode | null {
  s = s.trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^([\w-]+)\(\((.+?)\)\)/s))) return { id: m[1], label: strip(m[2]), shape: 'circle' };
  if ((m = s.match(/^([\w-]+)\(\[(.+?)\]\)/s))) return { id: m[1], label: strip(m[2]), shape: 'stadium' };
  if ((m = s.match(/^([\w-]+)\((.+?)\)/s)))     return { id: m[1], label: strip(m[2]), shape: 'stadium' };
  if ((m = s.match(/^([\w-]+)\{(.+?)\}/s)))     return { id: m[1], label: strip(m[2]), shape: 'diamond' };
  if ((m = s.match(/^([\w-]+)\[(.+?)\]/s)))     return { id: m[1], label: strip(m[2]), shape: 'rectangle' };
  if ((m = s.match(/^([\w-]+)$/)))              return { id: m[1], label: m[1],        shape: 'rectangle' };
  return null;
}

export function parseMermaidFlowchart(code: string): FlowGraph {
  const lines = code.split('\n').map(l => l.trim()).filter(Boolean);
  const nodeMap = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  let direction = 'TD';
  let edgeCount = 0;

  const dirMatch = (lines[0] || '').match(/(?:flowchart|graph)\s+(\w+)/i);
  if (dirMatch) direction = dirMatch[1].toUpperCase();

  for (const line of lines) {
    if (/^(?:flowchart|graph|subgraph|end|%%|style\s|classDef|class\s|linkStyle)/i.test(line)) continue;

    const hasArrow = /-{1,2}>|-\.->|={1,2}>/.test(line);

    if (!hasArrow) {
      const n = parseNodeStr(line);
      if (n && !nodeMap.has(n.id)) nodeMap.set(n.id, n);
      continue;
    }

    // Find the arrow start position while respecting bracket depth
    let depth = 0;
    let arrowStart = -1;
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i];
      if ('[({'.includes(c)) depth++;
      else if (']})'.includes(c)) depth--;
      else if (depth === 0) {
        if ((c === '-' && line[i + 1] === '-') || (c === '=' && line[i + 1] === '=')) {
          arrowStart = i;
          break;
        }
      }
    }
    if (arrowStart === -1) continue;

    let arrowEnd = arrowStart;
    while (arrowEnd < line.length && /[->=.]/.test(line[arrowEnd])) arrowEnd++;

    const sourceStr = line.slice(0, arrowStart).trim();
    let rest = line.slice(arrowEnd).trim();

    let edgeLabel: string | undefined;
    if (rest.startsWith('|')) {
      const closeIdx = rest.indexOf('|', 1);
      if (closeIdx !== -1) {
        edgeLabel = rest.slice(1, closeIdx).trim();
        rest = rest.slice(closeIdx + 1).trim();
      }
    }

    const src = parseNodeStr(sourceStr);
    const tgt = parseNodeStr(rest);
    if (!src || !tgt) continue;

    if (!nodeMap.has(src.id)) nodeMap.set(src.id, src);
    if (!nodeMap.has(tgt.id)) nodeMap.set(tgt.id, tgt);
    edges.push({ id: `e${edgeCount++}`, source: src.id, target: tgt.id, label: edgeLabel });
  }

  return { direction, nodes: [...nodeMap.values()], edges };
}
