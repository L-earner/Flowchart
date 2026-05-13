import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import ExportModal from './ExportModal';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis' },
  securityLevel: 'loose',
});

interface Props {
  mermaidCode: string;
  onRefine: (instructions: string) => void;
  onBack: () => void;
  isLoading: boolean;
  error: string | null;
}

export default function DiagramScreen({ mermaidCode, onRefine, onBack, isLoading, error }: Props) {
  const diagramRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [refinementText, setRefinementText] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [zoom, setZoom] = useState(1);
  const renderIdRef = useRef(0);

  const renderDiagram = useCallback(async (code: string) => {
    if (!diagramRef.current) return;
    setRenderError(null);
    try {
      renderIdRef.current += 1;
      const id = `mermaid-${renderIdRef.current}`;
      const { svg } = await mermaid.render(id, code);
      if (diagramRef.current) {
        diagramRef.current.innerHTML = svg;
        // Make SVG responsive
        const svgEl = diagramRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
        }
      }
    } catch (err: unknown) {
      setRenderError(
        err instanceof Error
          ? `Diagram rendering error: ${err.message}`
          : 'Unable to render the diagram. The AI may have returned invalid syntax.'
      );
    }
  }, []);

  useEffect(() => {
    if (mermaidCode) renderDiagram(mermaidCode);
  }, [mermaidCode, renderDiagram]);

  const handleRefine = () => {
    if (!refinementText.trim() || isLoading) return;
    onRefine(refinementText.trim());
    setRefinementText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleRefine();
  };

  return (
    <div className="diagram-screen">
      <div className="diagram-topbar">
        <button className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Input
        </button>
        <div className="topbar-center">
          <h1 className="diagram-title">Process Flow Diagram</h1>
        </div>
        <button
          className="export-btn"
          onClick={() => setShowExport(true)}
          disabled={!!renderError || isLoading}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Complete &amp; Export
        </button>
      </div>

      <div className="diagram-workspace">
        <div className="diagram-card">
          <div className="diagram-toolbar">
            <span className="diagram-label">Generated Diagram</span>
            <div className="zoom-controls">
              <button className="zoom-btn" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
              <span className="zoom-label">{Math.round(zoom * 100)}%</span>
              <button className="zoom-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.1))}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
              <button className="zoom-btn" onClick={() => setZoom(1)} title="Reset zoom">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          </div>

          <div className="diagram-viewport">
            {isLoading && (
              <div className="diagram-overlay">
                <div className="spinner large" />
                <p className="loading-text">AI is updating your diagram…</p>
              </div>
            )}
            {renderError ? (
              <div className="render-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="error-icon large">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p>{renderError}</p>
                <details className="code-details">
                  <summary>View raw Mermaid syntax</summary>
                  <pre className="code-block">{mermaidCode}</pre>
                </details>
              </div>
            ) : (
              <div
                className="diagram-container"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
              >
                <div ref={diagramRef} className="mermaid-output" />
              </div>
            )}
          </div>
        </div>

        <div className="refinement-card">
          <div className="card-header">
            <h2 className="card-title">Refine the Diagram</h2>
            <p className="card-desc">
              Describe what to change and the AI will update the diagram accordingly.
              Press <kbd>Ctrl+Enter</kbd> to submit.
            </p>
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

          <textarea
            className="text-area"
            placeholder="e.g., Add a 'Manager Approval' decision step after the request is submitted. Rename 'Process A' to 'Invoice Validation'. Split the Review phase into two separate steps…"
            value={refinementText}
            onChange={(e) => setRefinementText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={5}
            disabled={isLoading}
          />

          <div className="refinement-actions">
            <button
              className="secondary-btn"
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  Apply Refinement
                </>
              )}
            </button>
            <button
              className="primary-btn"
              onClick={() => setShowExport(true)}
              disabled={!!renderError || isLoading}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Complete &amp; Export
            </button>
          </div>
        </div>
      </div>

      {showExport && (
        <ExportModal
          diagramContainer={diagramRef.current}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
