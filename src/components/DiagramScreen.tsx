import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import ExportModal from './ExportModal';
import CanvasView from './CanvasView';
import FlowchartView from './FlowchartView';
import D3View from './D3View';
import type { DiagramLib } from '../types';

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#ffffff',
    primaryTextColor: '#000000',
    primaryBorderColor: '#000000',
    lineColor: '#000000',
    secondaryColor: '#f5f5f5',
    secondaryTextColor: '#000000',
    secondaryBorderColor: '#000000',
    tertiaryColor: '#fafafa',
    tertiaryTextColor: '#000000',
    tertiaryBorderColor: '#888888',
    background: '#ffffff',
    mainBkg: '#ffffff',
    nodeBorder: '#000000',
    clusterBkg: 'transparent',
    clusterBorder: '#888888',
    titleColor: '#000000',
    edgeLabelBackground: '#ffffff',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    fontSize: '13px',
  },
  flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis', padding: 24 },
  securityLevel: 'loose',
});

const QUICK_PROMPTS = [
  'Add a decision point after approval',
  'Use left-to-right layout',
  'Group steps by department',
  'Highlight all control steps',
];

interface Props {
  diagramCode: string;
  diagramLib: DiagramLib;
  onRefine: (instructions: string) => void;
  onBack: () => void;
  onDirectEdit: (code: string) => void;
  isLoading: boolean;
  error: string | null;
}

export default function DiagramScreen({ diagramCode, diagramLib, onRefine, onBack, onDirectEdit, isLoading, error }: Props) {
  const mermaidRef = useRef<HTMLDivElement>(null);
  const fcRef = useRef<HTMLDivElement>(null);
  const d3Ref = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [refinementText, setRefinementText] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<'diagram' | 'canvas'>('diagram');
  const renderIdRef = useRef(0);

  // ── Mermaid rendering ────────────────────────────────────────
  const renderMermaid = useCallback(async (code: string) => {
    if (!mermaidRef.current) return;
    setRenderError(null);
    try {
      renderIdRef.current += 1;
      const id = `mermaid-${renderIdRef.current}`;
      const { svg } = await mermaid.render(id, code);
      if (!mermaidRef.current) return;

      mermaidRef.current.innerHTML = svg;
      const svgEl = mermaidRef.current.querySelector('svg');
      if (!svgEl) return;

      svgEl.style.maxWidth = '100%';
      svgEl.style.height = 'auto';

      svgEl.querySelectorAll('.flowchart-link, .edgePath path').forEach(el => {
        (el as SVGElement).style.strokeWidth = '1.5px';
      });
    } catch (err: unknown) {
      setRenderError(
        err instanceof Error
          ? `Diagram rendering error: ${err.message}`
          : 'Unable to render the diagram. The AI may have returned invalid syntax.'
      );
    }
  }, []);

  useEffect(() => {
    if (!diagramCode || diagramLib !== 'mermaid' || viewMode !== 'diagram') return;
    renderMermaid(diagramCode);
  }, [diagramCode, diagramLib, viewMode, renderMermaid]);

  // Canvas mode only supported for Mermaid; clear stale Mermaid render error
  useEffect(() => {
    if (diagramLib !== 'mermaid') {
      setViewMode('diagram');
      setRenderError(null);
    }
  }, [diagramLib]);

  const handleRefine = () => {
    if (!refinementText.trim() || isLoading) return;
    onRefine(refinementText.trim());
    setRefinementText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleRefine();
  };

  const exportContainer =
    diagramLib === 'flowchart' ? fcRef.current :
    diagramLib === 'd3'        ? d3Ref.current :
    mermaidRef.current;

  const exportDisabled = isLoading || (diagramLib === 'mermaid' && !!renderError);

  return (
    <div className="diagram-screen">

      {/* ── Top bar ── */}
      <div className="diagram-topbar">
        <button className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>

        <div className="topbar-center">
          <div className="topbar-title-row">
            <span className="live-dot" />
            <h1 className="diagram-title">Process Flow Diagram</h1>
          </div>
          {diagramLib === 'mermaid' && (
            <div className="view-toggle">
              <button
                className={`view-toggle-btn ${viewMode === 'diagram' ? 'active' : ''}`}
                onClick={() => setViewMode('diagram')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="5" rx="1" />
                  <rect x="3" y="13" width="7" height="5" rx="1" />
                  <rect x="14" y="8" width="7" height="5" rx="1" />
                  <line x1="10" y1="5.5" x2="14" y2="10.5" />
                  <line x1="10" y1="15.5" x2="14" y2="10.5" />
                </svg>
                Diagram
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'canvas' ? 'active' : ''}`}
                onClick={() => setViewMode('canvas')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="5"  cy="12" r="2" />
                  <circle cx="19" cy="5"  r="2" />
                  <circle cx="19" cy="19" r="2" />
                  <line x1="7"  y1="11" x2="17" y2="6.5" />
                  <line x1="7"  y1="13" x2="17" y2="17.5" />
                </svg>
                Canvas
              </button>
            </div>
          )}
        </div>

        <button
          className="topbar-export-btn"
          onClick={() => setShowExport(true)}
          disabled={exportDisabled}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export
        </button>
      </div>

      {/* ── Workspace ── */}
      <div className="diagram-workspace">

        {/* ── Canvas panel ── */}
        <div className="diagram-card">
          {viewMode === 'canvas' && diagramLib === 'mermaid' ? (
            <CanvasView key={diagramCode} mermaidCode={diagramCode} />
          ) : (
            <div className="diagram-viewport">
              {isLoading && (
                <div className="diagram-overlay">
                  <div className="overlay-inner">
                    <div className="spinner large" />
                    <p className="loading-text">AI is updating your diagram…</p>
                    <p className="loading-sub">This usually takes 5–10 seconds</p>
                  </div>
                </div>
              )}

              {diagramLib === 'flowchart' ? (
                <div ref={fcRef}><FlowchartView code={diagramCode} /></div>
              ) : diagramLib === 'd3' ? (
                <div ref={d3Ref}><D3View code={diagramCode} onCodeChange={onDirectEdit} /></div>
              ) : renderError ? (
                <div className="render-error">
                  <div className="render-error-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <p className="render-error-title">Diagram could not be rendered</p>
                  <p className="render-error-body">{renderError}</p>
                  <details className="code-details">
                    <summary>View raw syntax</summary>
                    <pre className="code-block">{diagramCode}</pre>
                  </details>
                </div>
              ) : (
                <div
                  className="diagram-container"
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                >
                  <div ref={mermaidRef} className="mermaid-output" />
                </div>
              )}

              {/* Floating zoom pill */}
              <div className="zoom-pill">
                <button className="zoom-pill-btn" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} title="Zoom out">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <button className="zoom-pill-pct" onClick={() => setZoom(1)} title="Reset zoom">
                  {Math.round(zoom * 100)}%
                </button>
                <button className="zoom-pill-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.1))} title="Zoom in">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Refinement sidebar ── */}
        <div className="refinement-panel">

          <div className="refinement-header">
            <div className="refinement-header-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div>
              <h2 className="refinement-title">Refine Diagram</h2>
              <p className="refinement-subtitle">Describe changes and the AI will update instantly</p>
            </div>
          </div>

          {error && (
            <div className="error-banner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="error-icon">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="quick-prompts-label">Quick prompts</div>
          <div className="quick-prompts">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                className="quick-prompt-chip"
                onClick={() => setRefinementText(prompt)}
                disabled={isLoading}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="refinement-body">
            <textarea
              className="text-area refinement-textarea"
              placeholder="e.g., Add a 'Manager Approval' decision step after submission. Rename 'Process A' to 'Invoice Validation'. Split the Review phase into two steps…"
              value={refinementText}
              onChange={(e) => setRefinementText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={6}
              disabled={isLoading}
            />
            <div className="refinement-hint">
              <kbd>Ctrl</kbd><span>+</span><kbd>Enter</kbd> to submit
            </div>
          </div>

          <button
            className="apply-btn"
            onClick={handleRefine}
            disabled={!refinementText.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <div className="btn-spinner" />
                Refining…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="btn-icon">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Apply Refinement
              </>
            )}
          </button>

          <div className="refinement-divider">
            <span>or when you're done</span>
          </div>

          <button
            className="finish-btn"
            onClick={() => setShowExport(true)}
            disabled={exportDisabled}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Complete &amp; Export
          </button>

        </div>
      </div>

      {showExport && (
        <ExportModal
          diagramContainer={exportContainer}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
