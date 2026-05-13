import { useState } from 'react';
import type { ExportFormat } from '../types';
import { exportDiagram } from '../utils/exportUtils';

interface Props {
  diagramContainer: HTMLElement | null;
  onClose: () => void;
}

const FORMATS: { id: ExportFormat; label: string; desc: string; ext: string }[] = [
  { id: 'pdf', label: 'PDF', desc: 'Best for printing and audit files', ext: '.pdf' },
  { id: 'png', label: 'PNG', desc: 'High-resolution image for reports', ext: '.png' },
  { id: 'svg', label: 'SVG', desc: 'Scalable vector — editable in Visio / Illustrator', ext: '.svg' },
];

export default function ExportModal({ diagramContainer, onClose }: Props) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [filename, setFilename] = useState('process-flow-diagram');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);

  const handleExport = async () => {
    if (!diagramContainer) return;
    setIsExporting(true);
    setExportError(null);
    try {
      await exportDiagram(diagramContainer, selectedFormat, filename || 'process-flow-diagram');
      setExported(true);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Export Diagram</h2>
            <p className="modal-subtitle">Save the process flow diagram to your audit file</p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="field-group">
            <label className="field-label">File Name</label>
            <input
              className="text-input"
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="process-flow-diagram"
            />
          </div>

          <div className="field-group">
            <label className="field-label">Format</label>
            <div className="format-grid">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  className={`format-card ${selectedFormat === fmt.id ? 'selected' : ''}`}
                  onClick={() => setSelectedFormat(fmt.id)}
                >
                  <div className="format-icon-wrap">
                    {fmt.id === 'pdf' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                        <line x1="9" y1="11" x2="15" y2="11" />
                      </svg>
                    )}
                    {fmt.id === 'png' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    )}
                    {fmt.id === 'svg' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className="format-name">
                      {fmt.label}
                      <span className="format-ext">{fmt.ext}</span>
                    </div>
                    <div className="format-desc">{fmt.desc}</div>
                  </div>
                  {selectedFormat === fmt.id && (
                    <div className="format-check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {exportError && (
            <div className="error-banner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="error-icon">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{exportError}</span>
            </div>
          )}

          {exported && !exportError && (
            <div className="success-banner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="success-icon">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>
                Diagram downloaded as <strong>{filename || 'process-flow-diagram'}.{selectedFormat}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="outline-btn" onClick={onClose}>
            Close
          </button>
          <button
            className="primary-btn"
            onClick={handleExport}
            disabled={isExporting || !diagramContainer}
          >
            {isExporting ? (
              <>
                <div className="btn-spinner" />
                Exporting…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download {selectedFormat.toUpperCase()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
