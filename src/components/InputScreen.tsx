import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { InputMode, DiagramLib } from '../types';
import { parseUploadedFile } from '../utils/fileParser';

interface Props {
  onGenerate: (processText: string, instructions: string, diagramLib: DiagramLib) => void;
  isLoading: boolean;
  error: string | null;
}

function prettifyFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
}

const AUDIO_EXTS = /\.(mp3|wav|m4a|ogg|webm|flac)$/i;

export default function InputScreen({ onGenerate, isLoading, error }: Props) {
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [pastedText, setPastedText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [diagramLib, setDiagramLib] = useState<DiagramLib>('mermaid');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedText, setUploadedText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [sampleFiles, setSampleFiles] = useState<string[]>([]);
  const [selectedSample, setSelectedSample] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/samples')
      .then(r => r.json())
      .then(data => setSampleFiles(data.samples ?? []))
      .catch(() => setSampleFiles([]));
  }, []);

  // Stop recording when user switches away from paste mode
  useEffect(() => {
    if (inputMode !== 'paste' && mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [inputMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const transcribeAudio = useCallback(async (blob: Blob, filename: string): Promise<string> => {
    const fd = new FormData();
    fd.append('audio', blob, filename);
    const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transcription failed.');
    return data.text as string;
  }, []);

  const handleSelectSample = useCallback(async (filename: string) => {
    setSelectedSample(filename);
    setParseError(null);
    setIsParsing(true);
    setUploadedFile(null);
    setUploadedText('');
    try {
      const response = await fetch(`/samples/${encodeURIComponent(filename)}`);
      if (!response.ok) throw new Error('Could not load sample file.');
      const blob = await response.blob();
      const file = new File([blob], filename, { type: blob.type });
      const text = await parseUploadedFile(file);
      setUploadedFile(file);
      setUploadedText(text);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to load sample.');
      setSelectedSample(null);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    setParseError(null);

    if (AUDIO_EXTS.test(file.name) || file.type.startsWith('audio/')) {
      setIsTranscribing(true);
      try {
        const text = await transcribeAudio(file, file.name);
        setUploadedFile(file);
        setUploadedText(text);
      } catch (err: unknown) {
        setParseError(err instanceof Error ? err.message : 'Failed to transcribe audio.');
        setUploadedFile(null);
        setUploadedText('');
      } finally {
        setIsTranscribing(false);
      }
      return;
    }

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
  }, [transcribeAudio]);

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
    setSelectedSample(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startRecording = useCallback(async () => {
    setVoiceError(null);
    if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
      setVoiceError('Voice recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsTranscribing(true);
        try {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const text = await transcribeAudio(blob, 'recording.webm');
          setPastedText(prev => prev + (prev ? '\n' : '') + text);
        } catch (err: unknown) {
          setVoiceError(err instanceof Error ? err.message : 'Failed to transcribe recording.');
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err: unknown) {
      setVoiceError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow microphone access in your browser settings.'
          : err instanceof Error ? err.message : 'Could not access microphone.'
      );
    }
  }, [transcribeAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const handleSubmit = () => {
    const text = inputMode === 'paste' ? pastedText : uploadedText;
    if (!text.trim()) return;
    onGenerate(text.trim(), instructions.trim(), diagramLib);
  };

  const activeText = inputMode === 'paste' ? pastedText : uploadedText;
  const isFileLoading = isParsing || isTranscribing;
  const canGenerate = activeText.trim().length > 0 && !isLoading && !isFileLoading;
  const isAudioFile = uploadedFile
    ? AUDIO_EXTS.test(uploadedFile.name) || uploadedFile.type.startsWith('audio/')
    : false;

  return (
    <div className="input-screen">

      {/* ── Hero ── */}
      <div className="input-hero">
        <div className="hero-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <rect x="3" y="3" width="7" height="5" rx="1.5" />
            <rect x="3" y="13" width="7" height="5" rx="1.5" />
            <rect x="14" y="8" width="7" height="5" rx="1.5" />
            <line x1="10" y1="5.5" x2="14" y2="10.5" />
            <line x1="10" y1="15.5" x2="14" y2="10.5" />
          </svg>
        </div>
        <h1 className="hero-title">Process Flow Diagram Generator</h1>
        <p className="hero-subtitle">
          Turn audit documentation into professional flowcharts in seconds
        </p>
        <div className="hero-steps">
          <div className="hero-step">
            <span className="hero-step-num">1</span>
            <span>Upload document</span>
          </div>
          <div className="hero-step-arrow">→</div>
          <div className="hero-step">
            <span className="hero-step-num">2</span>
            <span>AI generates diagram</span>
          </div>
          <div className="hero-step-arrow">→</div>
          <div className="hero-step">
            <span className="hero-step-num">3</span>
            <span>Refine &amp; export</span>
          </div>
        </div>
      </div>

      {/* ── Step 1: Documentation ── */}
      <div className="input-card">
        <div className="input-card-header">
          <div className="step-badge">1</div>
          <div>
            <h2 className="input-card-title">Process Documentation</h2>
            <p className="input-card-desc">Provide your process walkthrough notes or workflow documentation</p>
          </div>
        </div>

        {/* Segmented control */}
        <div className="segment-control">
          <button
            className={`segment-btn ${inputMode === 'upload' ? 'active' : ''}`}
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
            className={`segment-btn ${inputMode === 'paste' ? 'active' : ''}`}
            onClick={() => setInputMode('paste')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Paste Text
          </button>
          {sampleFiles.length > 0 && (
            <button
              className={`segment-btn ${inputMode === 'sample' ? 'active' : ''}`}
              onClick={() => setInputMode('sample')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              Try a Sample
            </button>
          )}
        </div>

        {inputMode === 'upload' ? (
          <div>
            {!uploadedFile ? (
              <div
                className={`drop-zone ${isDragging ? 'dragging' : ''} ${isFileLoading ? 'parsing' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.docx,.pdf,.mp3,.wav,.m4a,.ogg,.webm,.flac"
                  className="hidden-input"
                  onChange={handleFileChange}
                />
                {isFileLoading ? (
                  <div className="drop-zone-content">
                    <div className="spinner" />
                    <p className="drop-zone-text">{isTranscribing ? 'Transcribing audio…' : 'Reading file…'}</p>
                  </div>
                ) : (
                  <div className="drop-zone-content">
                    <div className="drop-icon-wrap">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="drop-icon">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <p className="drop-zone-text">
                      Drag &amp; drop your file here, or <span className="link-text">browse</span>
                    </p>
                    <div className="file-type-chips">
                      {['.txt', '.md', '.docx', '.pdf', '.mp3', '.wav', '.m4a'].map(ext => (
                        <span key={ext} className="file-chip">{ext}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="file-badge">
                <div className="file-badge-icon">
                  {isAudioFile ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  )}
                </div>
                <div className="file-badge-info">
                  <span className="file-name">{uploadedFile.name}</span>
                  <span className="file-size">
                    {isAudioFile
                      ? `Transcribed · ${Math.round(uploadedFile.size / 1024)} KB`
                      : `${Math.round(uploadedFile.size / 1024)} KB · Ready to process`}
                  </span>
                </div>
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
        ) : inputMode === 'paste' ? (
          <div>
            <div className="textarea-wrap">
              <textarea
                className="text-area"
                placeholder="Paste your process walkthrough notes, workflow description, or audit documentation here…"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={12}
                disabled={isRecording}
              />
              {pastedText.length > 0 && (
                <span className="char-count">{pastedText.length.toLocaleString()} characters</span>
              )}
            </div>
            <div className="voice-row">
              {voiceError && <p className="voice-error">{voiceError}</p>}
              <button
                className={`mic-btn ${isRecording ? 'recording' : ''}`}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing}
                title={isRecording ? 'Stop recording' : 'Record voice input'}
                type="button"
              >
                {isTranscribing ? (
                  <>
                    <div className="btn-spinner light" />
                    Transcribing…
                  </>
                ) : isRecording ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="btn-icon">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                    Stop Recording
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
                      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                    </svg>
                    Record Voice
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="sample-picker">
            {sampleFiles.map(filename => {
              const isSelected = selectedSample === filename;
              const isLoaded = isSelected && uploadedFile !== null;
              return (
                <button
                  key={filename}
                  className={`sample-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectSample(filename)}
                  disabled={isParsing}
                >
                  <div className="sample-card-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <div className="sample-card-body">
                    <span className="sample-card-name">{prettifyFilename(filename)}</span>
                    <span className="sample-card-ext">{filename.split('.').pop()?.toUpperCase()}</span>
                  </div>
                  <div className="sample-card-status">
                    {isSelected && isParsing && <div className="spinner sample-spinner" />}
                    {isLoaded && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="sample-check">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
            {parseError && <p className="field-error">{parseError}</p>}
            {uploadedFile && selectedSample && (
              <div className="file-badge" style={{ marginTop: 12 }}>
                <div className="file-badge-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div className="file-badge-info">
                  <span className="file-name">{prettifyFilename(uploadedFile.name)}</span>
                  <span className="file-size">Loaded &amp; ready to process</span>
                </div>
                <button className="remove-btn" onClick={handleRemoveFile} title="Clear selection">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Step 2: AI Instructions ── */}
      <div className="input-card">
        <div className="input-card-header">
          <div className="step-badge">2</div>
          <div>
            <h2 className="input-card-title">
              AI Instructions
              <span className="optional-tag">Optional</span>
            </h2>
            <p className="input-card-desc">Guide the AI on layout, emphasis, or grouping</p>
          </div>
        </div>
        <textarea
          className="text-area"
          placeholder="e.g., Focus on the approval workflow and highlight all decision points. Use a left-to-right layout. Group activities by department using subgraphs. Emphasise controls and sign-off steps."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
        />
      </div>

      {/* ── Step 3: Diagram Library ── */}
      <div className="input-card">
        <div className="input-card-header">
          <div className="step-badge">3</div>
          <div>
            <h2 className="input-card-title">Diagram Library</h2>
            <p className="input-card-desc">Choose the rendering engine for your flowchart</p>
          </div>
        </div>
        <div className="lib-picker">
          <button
            className={`lib-card ${diagramLib === 'mermaid' ? 'selected' : ''}`}
            onClick={() => setDiagramLib('mermaid')}
            type="button"
          >
            <div className="lib-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="3" y="3" width="7" height="5" rx="1" />
                <rect x="3" y="13" width="7" height="5" rx="1" />
                <rect x="14" y="8" width="7" height="5" rx="1" />
                <line x1="10" y1="5.5" x2="14" y2="10.5" />
                <line x1="10" y1="15.5" x2="14" y2="10.5" />
              </svg>
            </div>
            <div className="lib-card-body">
              <span className="lib-card-name">Mermaid</span>
              <span className="lib-card-desc">Rich flowcharts with subgraph grouping and decision diamonds</span>
            </div>
            {diagramLib === 'mermaid' && (
              <div className="lib-card-check">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </button>

          <button
            className={`lib-card ${diagramLib === 'flowchart' ? 'selected' : ''}`}
            onClick={() => setDiagramLib('flowchart')}
            type="button"
          >
            <div className="lib-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <ellipse cx="12" cy="4" rx="5" ry="2.5" />
                <rect x="7" y="9" width="10" height="5" rx="1" />
                <path d="M9 17 L12 21 L15 17" />
                <line x1="12" y1="6.5" x2="12" y2="9" />
                <line x1="12" y1="14" x2="12" y2="17" />
              </svg>
            </div>
            <div className="lib-card-body">
              <span className="lib-card-name">Flowchart.js</span>
              <span className="lib-card-desc">Classic process flow style with typed shapes for start, end, and decisions</span>
            </div>
            {diagramLib === 'flowchart' && (
              <div className="lib-card-check">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </button>

          <button
            className={`lib-card ${diagramLib === 'd3' ? 'selected' : ''}`}
            onClick={() => setDiagramLib('d3')}
            type="button"
          >
            <div className="lib-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <circle cx="5"  cy="5"  r="2.5" />
                <circle cx="19" cy="5"  r="2.5" />
                <circle cx="12" cy="12" r="2.5" />
                <circle cx="5"  cy="19" r="2.5" />
                <circle cx="19" cy="19" r="2.5" />
                <line x1="7" y1="5.5" x2="17" y2="5.5" />
                <line x1="6.5" y1="6.5" x2="10.5" y2="10.5" />
                <line x1="17.5" y1="6.5" x2="13.5" y2="10.5" />
                <line x1="10.5" y1="13.5" x2="6.5" y2="17.5" />
                <line x1="13.5" y1="13.5" x2="17.5" y2="17.5" />
              </svg>
            </div>
            <div className="lib-card-body">
              <span className="lib-card-name">D3.js</span>
              <span className="lib-card-desc">Precise SVG rendering with custom node shapes and smooth curved edges</span>
            </div>
            {diagramLib === 'd3' && (
              <div className="lib-card-check">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </button>
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

      {/* ── Generate ── */}
      <div className="generate-wrap">
        <button
          className="generate-btn"
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="btn-icon">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Generate Diagram
            </>
          )}
        </button>
        {!canGenerate && !isLoading && (
          <p className="hint-text">
            {inputMode === 'upload' ? 'Upload a file to continue'
              : inputMode === 'paste' ? 'Paste or record some text to continue'
              : 'Select a sample to continue'}
          </p>
        )}
      </div>

    </div>
  );
}
