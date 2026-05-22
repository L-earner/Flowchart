import { memo, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  BackgroundVariant, MarkerType, Handle, Position,
  type Node, type Edge, type NodeProps, type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { parseMermaidFlowchart } from '../utils/mermaidParser';
import { layoutWithDagre } from '../utils/dagreLayout';

/* ── Custom node types ─────────────────────────────────────── */

const ProcessNode = memo(({ data }: NodeProps) => (
  <div className="rf-process-node">
    <Handle type="target" position={Position.Top} className="rf-handle" />
    <span className="rf-node-label">{String(data.label ?? '')}</span>
    <Handle type="source" position={Position.Bottom} className="rf-handle" />
  </div>
));
ProcessNode.displayName = 'ProcessNode';

const DecisionNode = memo(({ data }: NodeProps) => (
  <div className="rf-decision-outer">
    <div className="rf-decision-diamond" />
    <span className="rf-node-label rf-decision-label">{String(data.label ?? '')}</span>
    <Handle type="target" position={Position.Top}    className="rf-handle" style={{ top: 0 }} />
    <Handle type="source" position={Position.Bottom} className="rf-handle" style={{ bottom: 0 }} id="b" />
    <Handle type="source" position={Position.Left}   className="rf-handle" style={{ left: 0 }}  id="l" />
    <Handle type="source" position={Position.Right}  className="rf-handle" style={{ right: 0 }} id="r" />
  </div>
));
DecisionNode.displayName = 'DecisionNode';

const StadiumNode = memo(({ data }: NodeProps) => (
  <div className="rf-stadium-node">
    <Handle type="target" position={Position.Top} className="rf-handle" />
    <span className="rf-node-label">{String(data.label ?? '')}</span>
    <Handle type="source" position={Position.Bottom} className="rf-handle" />
  </div>
));
StadiumNode.displayName = 'StadiumNode';

const nodeTypes = { process: ProcessNode, decision: DecisionNode, stadium: StadiumNode };

/* ── Graph builder ─────────────────────────────────────────── */

function buildElements(mermaidCode: string): { nodes: Node[]; edges: Edge[] } {
  const { direction, nodes: parsed, edges: parsedEdges } = parseMermaidFlowchart(mermaidCode);

  const rfDir = (direction === 'LR' || direction === 'RL') ? 'LR' : 'TB';

  const nodeTypeMap: Record<string, string> = { diamond: 'decision', circle: 'stadium', stadium: 'stadium' };

  const nodes: Node[] = parsed.map((n) => ({
    id: n.id,
    type: nodeTypeMap[n.shape] ?? 'process',
    data: { label: n.label, shape: n.shape },
    position: { x: 0, y: 0 },
  }));

  const edges: Edge[] = parsedEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 16, height: 16 },
    style: { stroke: '#64748b', strokeWidth: 1.75 },
    labelStyle: { fontSize: 11, fontFamily: 'Inter, sans-serif', fill: '#475569' },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
    labelBgPadding: [4, 6] as [number, number],
    labelBgBorderRadius: 4,
  }));

  const laidOut = layoutWithDagre(nodes, edges, rfDir);
  return { nodes: laidOut, edges };
}

/* ── Component ─────────────────────────────────────────────── */

export default function CanvasView({ mermaidCode }: { mermaidCode: string }) {
  const initial = useMemo(() => buildElements(mermaidCode), [mermaidCode]);

  const [nodes, , onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  if (initial.nodes.length === 0) {
    return (
      <div className="canvas-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p>Canvas mode could not parse this diagram.</p>
        <span>Use the Diagram tab to view it.</span>
      </div>
    );
  }

  return (
    <div className="canvas-wrapper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2.5}
        defaultEdgeOptions={{ animated: false }}
        snapToGrid
        snapGrid={[12, 12]}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#cbd5e1" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => n.type === 'decision' ? '#2563eb' : n.type === 'stadium' ? '#eff6ff' : '#1e3a5f'}
          maskColor="rgba(241,245,249,0.75)"
          style={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
        />
      </ReactFlow>
      <div className="canvas-tip">
        Drag nodes to rearrange · Scroll to zoom · Drag canvas to pan
      </div>
    </div>
  );
}
