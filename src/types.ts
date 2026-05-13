export type AppStep = 'input' | 'diagram';
export type InputMode = 'upload' | 'paste';
export type ExportFormat = 'pdf' | 'png' | 'svg';

export interface AppState {
  step: AppStep;
  processText: string;
  instructions: string;
  mermaidCode: string;
  isLoading: boolean;
  error: string | null;
}
