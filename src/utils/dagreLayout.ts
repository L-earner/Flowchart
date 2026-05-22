import Dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';

const WIDTHS  = { rectangle: 180, diamond: 160, circle: 140, stadium: 180 } as const;
const HEIGHTS = { rectangle: 56,  diamond: 80,  circle: 56,  stadium: 56  } as const;

export function layoutWithDagre(nodes: Node[], edges: Edge[], direction = 'TB') {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 70, ranksep: 90, marginx: 40, marginy: 40 });

  nodes.forEach((n) => {
    const shape = (n.data.shape as string) ?? 'rectangle';
    const w = WIDTHS[shape as keyof typeof WIDTHS]  ?? 180;
    const h = HEIGHTS[shape as keyof typeof HEIGHTS] ?? 56;
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));

  Dagre.layout(g);

  return nodes.map((n) => {
    const shape = (n.data.shape as string) ?? 'rectangle';
    const w = WIDTHS[shape as keyof typeof WIDTHS]  ?? 180;
    const h = HEIGHTS[shape as keyof typeof HEIGHTS] ?? 56;
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });
}
