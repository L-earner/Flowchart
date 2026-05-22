import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import Dagre from '@dagrejs/dagre';

interface D3Node { id: string; label: string; type: 'process' | 'decision' | 'terminal'; }
interface D3Edge { source: string; target: string; label?: string; }
interface D3Graph { direction?: string; nodes: D3Node[]; edges: D3Edge[]; }
interface Props { code: string; onCodeChange?: (code: string) => void; }

const NODE_W = { process: 180, decision: 150, terminal: 160 } as const;
const NODE_H = { process: 52,  decision: 72,  terminal: 44  } as const;
const TYPE_LABELS: Record<D3Node['type'], string> = { process: 'Process', decision: 'Decision', terminal: 'Terminal' };
const PAD = 60;

function parseGraph(code: string): D3Graph {
  return JSON.parse(code.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()) as D3Graph;
}

function layoutGraph(graph: D3Graph) {
  const g = new Dagre.graphlib.Graph({ multigraph: true }).setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: graph.direction === 'LR' ? 'LR' : 'TB', nodesep: 60, ranksep: 80, marginx: 48, marginy: 48 });
  graph.nodes.forEach(n => g.setNode(n.id, { width: NODE_W[n.type] ?? 180, height: NODE_H[n.type] ?? 52 }));
  graph.edges.forEach((e, i) => g.setEdge(e.source, e.target, {}, `e${i}`));
  Dagre.layout(g);
  return g;
}

function wrapWords(label: string, maxChars: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of label.split(' ')) {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function genNodeId(nodes: D3Node[]): string {
  const ids = new Set(nodes.map(n => n.id));
  let i = 1;
  while (ids.has(`node${i}`)) i++;
  return `node${i}`;
}

// Simple cubic bezier from node border to node border
function edgePath(
  sp: { x: number; y: number }, tp: { x: number; y: number },
  sType: D3Node['type'], tType: D3Node['type'],
  direction: string,
): string {
  const sh = NODE_H[sType] ?? 52, th = NODE_H[tType] ?? 52;
  const sw = NODE_W[sType] ?? 180, tw = NODE_W[tType] ?? 180;
  if (direction === 'LR') {
    const x1 = sp.x + sw / 2, y1 = sp.y, x2 = tp.x - tw / 2, y2 = tp.y;
    const dx = Math.max(40, Math.abs(x2 - x1)) * 0.5;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }
  const x1 = sp.x, y1 = sp.y + sh / 2, x2 = tp.x, y2 = tp.y - th / 2;
  const dy = Math.max(40, Math.abs(y2 - y1)) * 0.5;
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
}

export default function D3View({ code, onCodeChange }: Props) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError]             = useState<string | null>(null);
  const [graph, setGraph]             = useState<D3Graph | null>(null);
  // Persisted positions (set on drag-end; reset on AI update)
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeIdx, setSelectedEdgeIdx] = useState<number | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [labelDraft, setLabelDraft]   = useState('');
  const [edgeLabelDraft, setEdgeLabelDraft] = useState('');

  // Mutable refs — not tracked by React
  const lastEmittedRef    = useRef('');
  const livePos           = useRef<Record<string, { x: number; y: number }>>({});
  const graphRef          = useRef<D3Graph | null>(null);
  const connectingFromRef = useRef<string | null>(null);
  const isDragging        = useRef(false);

  useEffect(() => { graphRef.current = graph; }, [graph]);
  useEffect(() => { connectingFromRef.current = connectingFrom; }, [connectingFrom]);

  // ── Sync from code prop (AI updates only) ──────────────────
  useEffect(() => {
    if (code === lastEmittedRef.current) return;
    try {
      const parsed = parseGraph(code);
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges))
        throw new Error('Missing nodes or edges array.');
      setGraph(parsed);
      setNodePositions({});
      setError(null);
      setSelectedNodeId(null);
      setSelectedEdgeIdx(null);
      setConnectingFrom(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON returned by AI.');
    }
  }, [code]);

  const emit = useCallback((g: D3Graph) => {
    const s = JSON.stringify(g, null, 2);
    lastEmittedRef.current = s;
    onCodeChange?.(s);
  }, [onCodeChange]);

  // ── Edit handlers ─────────────────────────────────────────

  const handleDeselect = useCallback(() => {
    setSelectedNodeId(null); setSelectedEdgeIdx(null); setConnectingFrom(null);
  }, []);

  const handleSelectNode = useCallback((id: string) => {
    if (isDragging.current) return;
    if (connectingFrom) {
      if (connectingFrom !== id) {
        setGraph(prev => {
          if (!prev) return prev;
          if (prev.edges.some(e => e.source === connectingFrom && e.target === id)) return prev;
          const next = { ...prev, edges: [...prev.edges, { source: connectingFrom, target: id }] };
          emit(next);
          return next;
        });
      }
      setConnectingFrom(null);
      setSelectedNodeId(id);
      return;
    }
    setSelectedEdgeIdx(null);
    setSelectedNodeId(id);
    setGraph(prev => { setLabelDraft(prev?.nodes.find(n => n.id === id)?.label ?? ''); return prev; });
  }, [connectingFrom, emit]);

  const handleSelectEdge = useCallback((idx: number) => {
    if (isDragging.current) return;
    if (connectingFrom) { setConnectingFrom(null); return; }
    setSelectedNodeId(null);
    setSelectedEdgeIdx(idx);
    setGraph(prev => { setEdgeLabelDraft(prev?.edges[idx]?.label ?? ''); return prev; });
  }, [connectingFrom]);

  const applyNodeLabel = useCallback(() => {
    setGraph(prev => {
      if (!prev || !selectedNodeId) return prev;
      const next = { ...prev, nodes: prev.nodes.map(n => n.id === selectedNodeId ? { ...n, label: labelDraft } : n) };
      emit(next); return next;
    });
  }, [selectedNodeId, labelDraft, emit]);

  const handleNodeType = useCallback((type: D3Node['type']) => {
    setGraph(prev => {
      if (!prev || !selectedNodeId) return prev;
      const next = { ...prev, nodes: prev.nodes.map(n => n.id === selectedNodeId ? { ...n, type } : n) };
      emit(next); return next;
    });
  }, [selectedNodeId, emit]);

  const handleDeleteNode = useCallback(() => {
    setGraph(prev => {
      if (!prev || !selectedNodeId) return prev;
      const next = {
        ...prev,
        nodes: prev.nodes.filter(n => n.id !== selectedNodeId),
        edges: prev.edges.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId),
      };
      emit(next); return next;
    });
    setNodePositions(prev => { const n = { ...prev }; if (selectedNodeId) delete n[selectedNodeId]; return n; });
    setSelectedNodeId(null);
  }, [selectedNodeId, emit]);

  const applyEdgeLabel = useCallback(() => {
    setGraph(prev => {
      if (!prev || selectedEdgeIdx === null) return prev;
      const next = { ...prev, edges: prev.edges.map((e, i) => i === selectedEdgeIdx ? { ...e, label: edgeLabelDraft || undefined } : e) };
      emit(next); return next;
    });
  }, [selectedEdgeIdx, edgeLabelDraft, emit]);

  const handleDeleteEdge = useCallback(() => {
    setGraph(prev => {
      if (!prev || selectedEdgeIdx === null) return prev;
      const next = { ...prev, edges: prev.edges.filter((_, i) => i !== selectedEdgeIdx) };
      emit(next); return next;
    });
    setSelectedEdgeIdx(null);
  }, [selectedEdgeIdx, emit]);

  const handleAddNode = useCallback(() => {
    setGraph(prev => {
      if (!prev) return prev;
      const id = genNodeId(prev.nodes);
      const next = { ...prev, nodes: [...prev.nodes, { id, label: 'New Step', type: 'process' as const }] };
      emit(next);
      setSelectedNodeId(id);
      setLabelDraft('New Step');
      return next;
    });
  }, [emit]);

  // ── SVG rendering ─────────────────────────────────────────

  useEffect(() => {
    const container = svgContainerRef.current;
    if (!graph || !container) return;
    container.innerHTML = '';
    if (graph.nodes.length === 0) return;

    // Run dagre (positions only — we ignore its edge routing)
    let dagreG: ReturnType<typeof layoutGraph>;
    try { dagreG = layoutGraph(graph); }
    catch (e) {
      setError(e instanceof Error ? `Layout error: ${e.message}` : 'Failed to compute layout.');
      return;
    }

    // Build position map: saved positions > dagre
    const pos: Record<string, { x: number; y: number }> = {};
    graph.nodes.forEach(n => {
      const dp = dagreG.node(n.id);
      pos[n.id] = nodePositions[n.id] ?? { x: dp.x, y: dp.y };
    });
    livePos.current = pos;

    // Dynamic viewBox from actual positions
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    graph.nodes.forEach(n => {
      const p = pos[n.id];
      const nw = NODE_W[n.type] ?? 180, nh = NODE_H[n.type] ?? 52;
      minX = Math.min(minX, p.x - nw / 2);
      minY = Math.min(minY, p.y - nh / 2);
      maxX = Math.max(maxX, p.x + nw / 2);
      maxY = Math.max(maxY, p.y + nh / 2);
    });
    const vx = minX - PAD, vy = minY - PAD;
    const vw = maxX - minX + PAD * 2, vh = maxY - minY + PAD * 2;

    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    svgEl.setAttribute('width', String(vw));
    svgEl.setAttribute('height', String(vh));
    svgEl.style.cssText = 'width:100%;height:auto;display:block;overflow:visible;';
    svgEl.style.cursor = connectingFrom ? 'crosshair' : 'default';
    container.appendChild(svgEl);

    const svg = d3.select(svgEl);
    svg.on('click', (e) => { if (e.target === svgEl) handleDeselect(); });

    const defs = svg.append('defs');
    defs.append('marker').attr('id', 'd3v-arrow')
      .attr('markerWidth', 8).attr('markerHeight', 8).attr('refX', 7).attr('refY', 3).attr('orient', 'auto')
      .append('path').attr('d', 'M0,0 L0,6 L8,3 z').attr('fill', '#1e293b');

    const root = svg.append('g');
    const direction = graph.direction ?? 'TD';

    // Helper used by both render and drag
    function getEdgePath(srcId: string, tgtId: string): string {
      const g = graphRef.current;
      if (!g) return '';
      const sn = g.nodes.find(n => n.id === srcId), tn = g.nodes.find(n => n.id === tgtId);
      if (!sn || !tn) return '';
      const sp = livePos.current[srcId], tp = livePos.current[tgtId];
      if (!sp || !tp) return '';
      return edgePath(sp, tp, sn.type, tn.type, direction);
    }

    // ── Edges ──────────────────────────────────────────────────
    graph.edges.forEach((e, i) => {
      const isSelected = selectedEdgeIdx === i;
      const d = getEdgePath(e.source, e.target);
      if (!d) return;

      root.append('path')
        .attr('class', 'edge-hit').attr('data-ei', i)
        .attr('d', d).attr('fill', 'none').attr('stroke', 'transparent').attr('stroke-width', 14)
        .style('cursor', 'pointer')
        .on('click', (ev) => { ev.stopPropagation(); handleSelectEdge(i); });

      root.append('path')
        .attr('class', 'edge-vis').attr('data-ei', i)
        .attr('d', d).attr('fill', 'none')
        .attr('stroke', isSelected ? '#2563eb' : '#1e293b')
        .attr('stroke-width', isSelected ? 2.5 : 1.5)
        .attr('marker-end', 'url(#d3v-arrow)')
        .style('pointer-events', 'none');

      if (e.label) {
        const sp = pos[e.source], tp = pos[e.target];
        const sn = graph.nodes.find(n => n.id === e.source);
        const tn = graph.nodes.find(n => n.id === e.target);
        if (sp && tp && sn && tn) {
          const sh = NODE_H[sn.type] ?? 52, th = NODE_H[tn.type] ?? 52;
          const sw = NODE_W[sn.type] ?? 180, tw = NODE_W[tn.type] ?? 180;
          const mx = direction === 'LR'
            ? (sp.x + sw / 2 + tp.x - tw / 2) / 2
            : (sp.x + tp.x) / 2;
          const my = direction === 'LR'
            ? (sp.y + tp.y) / 2
            : (sp.y + sh / 2 + tp.y - th / 2) / 2;
          const lw = Math.max(44, e.label.length * 7 + 16);
          root.append('rect').attr('class', 'edge-lbg').attr('data-ei', i)
            .attr('x', mx - lw / 2).attr('y', my - 9).attr('width', lw).attr('height', 18)
            .attr('rx', 3).attr('fill', '#fff')
            .attr('stroke', isSelected ? '#2563eb' : '#e2e8f0').attr('stroke-width', 1);
          root.append('text').attr('class', 'edge-ltxt').attr('data-ei', i)
            .attr('x', mx).attr('y', my).attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
            .attr('font-size', 11).attr('font-family', 'Inter, sans-serif')
            .attr('fill', isSelected ? '#2563eb' : '#475569').style('pointer-events', 'none')
            .text(e.label);
        }
      }
    });

    // ── Nodes ──────────────────────────────────────────────────
    graph.nodes.forEach((n) => {
      const p = pos[n.id];
      if (!p) return;
      const nw = NODE_W[n.type] ?? 180, nh = NODE_H[n.type] ?? 52;
      const isSel = selectedNodeId === n.id;
      const isConSrc = connectingFrom === n.id;
      const hi = isSel || isConSrc;
      const stroke = hi ? '#2563eb' : '#1e293b';
      const strokeW = hi ? 2.5 : 1.5;
      const fill = isSel ? '#eff6ff' : '#fff';

      const grp = root.append('g')
        .datum({ id: n.id })
        .attr('class', 'node-grp')
        .attr('transform', `translate(${p.x},${p.y})`)
        .style('cursor', connectingFrom && !isConSrc ? 'crosshair' : 'grab')
        .on('click', (ev) => { ev.stopPropagation(); handleSelectNode(n.id); });

      if (n.type === 'decision') {
        grp.append('polygon')
          .attr('points', `0,${-nh / 2} ${nw / 2},0 0,${nh / 2} ${-nw / 2},0`)
          .attr('fill', fill).attr('stroke', stroke).attr('stroke-width', strokeW);
      } else if (n.type === 'terminal') {
        grp.append('rect')
          .attr('x', -nw / 2).attr('y', -nh / 2).attr('width', nw).attr('height', nh)
          .attr('rx', nh / 2).attr('fill', fill).attr('stroke', stroke).attr('stroke-width', strokeW);
      } else {
        grp.append('rect')
          .attr('x', -nw / 2).attr('y', -nh / 2).attr('width', nw).attr('height', nh)
          .attr('rx', 4).attr('fill', fill).attr('stroke', stroke).attr('stroke-width', strokeW);
      }

      const lines = wrapWords(n.label, n.type === 'decision' ? 16 : 22);
      const lineH = 14, totalH = lines.length * lineH;
      lines.forEach((line, li) => {
        grp.append('text')
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('y', -totalH / 2 + lineH / 2 + li * lineH)
          .attr('font-size', 12).attr('font-weight', n.type === 'terminal' ? '600' : '500')
          .attr('font-family', 'Inter, sans-serif')
          .attr('fill', hi ? '#1d4ed8' : '#0f172a')
          .style('pointer-events', 'none')
          .text(line);
      });

      // ── Drag ────────────────────────────────────────────────
      grp.call(
        d3.drag<SVGGElement, { id: string }>()
          .on('start', function() {
            d3.select(this).raise();
          })
          .on('drag', function(event, datum) {
            isDragging.current = true;
            d3.select(this).style('cursor', 'grabbing');
            livePos.current[datum.id] = { x: event.x, y: event.y };
            d3.select(this).attr('transform', `translate(${event.x},${event.y})`);

            // Update every edge touching this node
            const g = graphRef.current;
            if (!g) return;
            g.edges.forEach((edge, idx) => {
              if (edge.source !== datum.id && edge.target !== datum.id) return;
              const newD = getEdgePath(edge.source, edge.target);
              if (!newD) return;
              root.selectAll<SVGPathElement, unknown>(`path[data-ei="${idx}"]`).attr('d', newD);
              if (edge.label) {
                const sp2 = livePos.current[edge.source], tp2 = livePos.current[edge.target];
                const g2 = graphRef.current;
                if (sp2 && tp2 && g2) {
                  const sn2 = g2.nodes.find(n => n.id === edge.source);
                  const tn2 = g2.nodes.find(n => n.id === edge.target);
                  if (sn2 && tn2) {
                    const sh2 = NODE_H[sn2.type] ?? 52, th2 = NODE_H[tn2.type] ?? 52;
                    const sw2 = NODE_W[sn2.type] ?? 180, tw2 = NODE_W[tn2.type] ?? 180;
                    const mx2 = direction === 'LR'
                      ? (sp2.x + sw2 / 2 + tp2.x - tw2 / 2) / 2
                      : (sp2.x + tp2.x) / 2;
                    const my2 = direction === 'LR'
                      ? (sp2.y + tp2.y) / 2
                      : (sp2.y + sh2 / 2 + tp2.y - th2 / 2) / 2;
                    const lw2 = Math.max(44, (edge.label.length) * 7 + 16);
                    root.select<SVGRectElement>(`rect.edge-lbg[data-ei="${idx}"]`).attr('x', mx2 - lw2 / 2).attr('y', my2 - 9);
                    root.select<SVGTextElement>(`text.edge-ltxt[data-ei="${idx}"]`).attr('x', mx2).attr('y', my2);
                  }
                }
              }
            });
          })
          .on('end', function(event, datum) {
            d3.select(this).style('cursor', connectingFromRef.current ? 'crosshair' : 'grab');
            if (isDragging.current) {
              setNodePositions(prev => ({ ...prev, [datum.id]: { x: event.x, y: event.y } }));
              setTimeout(() => { isDragging.current = false; }, 50);
            }
          })
      );
    });

  }, [graph, nodePositions, selectedNodeId, selectedEdgeIdx, connectingFrom, handleSelectNode, handleSelectEdge, handleDeselect]);

  // ── Derived ───────────────────────────────────────────────
  const selectedNode = graph?.nodes.find(n => n.id === selectedNodeId) ?? null;
  const selectedEdge = selectedEdgeIdx !== null ? (graph?.edges[selectedEdgeIdx] ?? null) : null;
  const connectingFromNode = graph?.nodes.find(n => n.id === connectingFrom) ?? null;

  if (error) {
    return (
      <div className="render-error">
        <div className="render-error-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="render-error-title">Diagram could not be rendered</p>
        <p className="render-error-body">{error}</p>
        <details className="code-details" open>
          <summary>Raw JSON</summary>
          <pre className="code-block">{code}</pre>
        </details>
      </div>
    );
  }

  return (
    <div className="d3-wrapper">

      {/* ── Toolbar ── */}
      <div className="d3-toolbar">
        <button className="d3-tool-btn" onClick={handleAddNode}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Node
        </button>

        {connectingFrom && (
          <div className="d3-connect-banner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
            Click a target node to connect from <strong>{connectingFromNode?.label ?? connectingFrom}</strong>
            <button className="d3-cancel-btn" onClick={() => setConnectingFrom(null)}>Cancel</button>
          </div>
        )}
      </div>

      {/* ── SVG canvas ── */}
      <div ref={svgContainerRef} className="d3-output" />

      {/* ── Node edit panel ── */}
      {selectedNode && !connectingFrom && (
        <div className="d3-edit-panel">
          <div className="d3-edit-header">
            <span className="d3-edit-title">Edit Node</span>
            <button className="d3-edit-close" onClick={handleDeselect} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="d3-edit-body">
            <div className="d3-field">
              <label className="d3-label">Label</label>
              <input
                className="d3-input"
                value={labelDraft}
                onChange={e => setLabelDraft(e.target.value)}
                onBlur={applyNodeLabel}
                onKeyDown={e => { if (e.key === 'Enter') { applyNodeLabel(); (e.target as HTMLInputElement).blur(); } }}
                placeholder="Node label…"
              />
            </div>
            <div className="d3-field">
              <label className="d3-label">Shape</label>
              <div className="d3-type-row">
                {(['process', 'decision', 'terminal'] as const).map(t => (
                  <button key={t} className={`d3-type-btn ${selectedNode.type === t ? 'active' : ''}`} onClick={() => handleNodeType(t)}>
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="d3-edit-actions">
              <button className="d3-connect-btn" onClick={() => setConnectingFrom(selectedNodeId)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
                Connect to…
              </button>
              <button className="d3-delete-btn" onClick={handleDeleteNode}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
                </svg>
                Delete Node
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edge edit panel ── */}
      {selectedEdge && !connectingFrom && (
        <div className="d3-edit-panel">
          <div className="d3-edit-header">
            <span className="d3-edit-title">Edit Connection</span>
            <button className="d3-edit-close" onClick={handleDeselect} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="d3-edit-body">
            <div className="d3-field">
              <label className="d3-label">Label <span className="d3-optional">(optional)</span></label>
              <input
                className="d3-input"
                value={edgeLabelDraft}
                onChange={e => setEdgeLabelDraft(e.target.value)}
                onBlur={applyEdgeLabel}
                onKeyDown={e => { if (e.key === 'Enter') { applyEdgeLabel(); (e.target as HTMLInputElement).blur(); } }}
                placeholder="e.g. Yes, Approved, Rejected…"
              />
            </div>
            <div className="d3-edit-actions">
              <button className="d3-delete-btn" onClick={handleDeleteEdge}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
                </svg>
                Delete Connection
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
