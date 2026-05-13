import React, { useState, useCallback, useRef } from 'react';
import type { InputMode } from '../types';
import { parseUploadedFile } from '../utils/fileParser';

interface Props {
  onGenerate: (processText: string, instructions: string) => void;
  isLoading: boolean;
  error: string | null;
}

export default function InputScreen({ onGenerate, isLoading, error }: Props) {
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [pastedText, setPastedText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedText, setUploadedText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setParseError(null);
    setIsParsing(true);
    try {
      const text = await parseUploadedFile(file);
      setUploadedFile(file);
      setUploadedText(text);
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : 'Failed to read file.');
      setUploadedFile(null);
      setUploadedText('');
    } finally {
      setIsParsing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setUploadedText('');
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = () => {
    const text = inputMode === 'upload' ? uploadedText : pastedText;
    if (!text.trim()) return;
    onGenerate(text.trim(), instructions.trim());
  };

  const activeText = inputMode === 'upload' ? uploadedText : pastedText;
  const canGenerate = activeText.trim().length > 0 && !isLoading && !isParsing;

  return (
    <div className="input-screen">
      <div className="page-header">
        <div className="header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
          </svg>
        </div>
        <div>
          <h1 className="page-title">Process Flow Diagram Generator</h1>
          <p className="page-subtitle">
            Upload or paste your process documentation and let AI render it as a flow diagram
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Process Documentation</h2>
          <p className="card-desc">Provide the process walkthrough notes or workflow documentation</p>
        </div>

        <div className="mode-toggle">
          <button
            className={`mode-btn ${inputMode === 'upload' ? 'active' : ''}`}
            onClick={() => setInputMode('upload')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload File
          </button>
          <button
            className={`mode-btn ${inputMode === 'paste' ? 'active' : ''}`}
            onClick={() => setInputMode('paste')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Paste Text
          </button>
        </div>

        {inputMode === 'upload' ? (
          <div>
            {!uploadedFile ? (
              <div
                className={`drop-zone ${isDragging ? 'dragging' : ''} ${isParsing ? 'parsing' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.docx,.pdf"
                  className="hidden-input"
                  onChange={handleFileChange}
                />
                {isParsing ? (
                  <div className="drop-zone-content">
                    <div className="spinner" />
                    <p className="drop-zone-text">Reading file…</p>
                  </div>
                ) : (
                  <div className="drop-zone-content">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="drop-icon">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p className="drop-zone-text">
                      Drag & drop your file here, or <span className="link-text">browse</span>
                    </p>
                    <p className="drop-zone-hint">Supports .txt, .md, .docx, .pdf</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="file-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="file-name">{uploadedFile.name}</span>
                <span className="file-size">({Math.round(uploadedFile.size / 1024)} KB)</span>
                <button className="remove-btn" onClick={handleRemoveFile} title="Remove file">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}
            {parseError && <p className="field-error">{parseError}</p>}
          </div>
        ) : (
          <textarea
            className="text-area"
            placeholder="Paste your process walkthrough notes, workflow description, or audit documentation here…"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={12}
          />
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">AI Instructions</h2>
          <p className="card-desc">
            Optional: Guide the AI on how to structure or emphasize the diagram
          </p>
        </div>
        <textarea
          className="text-area"
          placeholder="e.g., Focus on the approval workflow and highlight all decision points. Use a left-to-right layout. Group activities by department using subgraphs. Emphasize controls and sign-off steps."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
        />
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

      <div className="action-row">
        <button
          className="primary-btn"
          onClick={handleSubmit}
          disabled={!canGenerate}
        >
          {isLoading ? (
            <>
              <div className="btn-spinner" />
              Generating Diagram…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Generate Diagram
            </>
          )}
        </button>
        {!canGenerate && !isLoading && (
          <p className="hint-text">
            {inputMode === 'upload'
              ? 'Upload a file to continue'
              : 'Paste some text to continue'}
          </p>
        )}
      </div>
    </div>
  );
}
