import { useState } from 'react';
import InputScreen from './components/InputScreen';
import DiagramScreen from './components/DiagramScreen';
import type { AppStep, DiagramLib } from './types';
import './App.css';

async function apiFetch(path: string, body: Record<string, string>): Promise<{ diagramCode: string }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function App() {
  const [step, setStep] = useState<AppStep>('input');
  const [diagramCode, setDiagramCode] = useState('');
  const [diagramLib, setDiagramLib] = useState<DiagramLib>('mermaid');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (processText: string, instructions: string, lib: DiagramLib) => {
    setIsLoading(true);
    setError(null);
    try {
      const { diagramCode: code } = await apiFetch('/api/generate', {
        processText,
        instructions,
        diagramLib: lib,
      });
      setDiagramCode(code);
      setDiagramLib(lib);
      setStep('diagram');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate diagram. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefine = async (refinementInstructions: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { diagramCode: code } = await apiFetch('/api/refine', {
        currentDiagram: diagramCode,
        refinementInstructions,
        diagramLib,
      });
      setDiagramCode(code);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to refine diagram. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep('input');
    setError(null);
  };

  const handleDirectEdit = (code: string) => setDiagramCode(code);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="logo-icon">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span className="logo-text">Audit Process Flow</span>
          </div>
          <div className="step-indicator">
            <div className={`step-dot ${step === 'input' ? 'active' : 'done'}`}>
              {step === 'diagram' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : '1'}
            </div>
            <div className={`step-line ${step === 'diagram' ? 'active' : ''}`} />
            <div className={`step-dot ${step === 'diagram' ? 'active' : ''}`}>2</div>
            <span className="step-label">
              {step === 'input' ? 'Provide Documentation' : 'Review & Refine'}
            </span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {step === 'input' ? (
          <InputScreen
            onGenerate={handleGenerate}
            isLoading={isLoading}
            error={error}
          />
        ) : (
          <DiagramScreen
            diagramCode={diagramCode}
            diagramLib={diagramLib}
            onRefine={handleRefine}
            onBack={handleBack}
            onDirectEdit={handleDirectEdit}
            isLoading={isLoading}
            error={error}
          />
        )}
      </main>

      <footer className="app-footer">
        <span>Powered by OpenAI &mdash; For internal audit use only</span>
      </footer>
    </div>
  );
}
