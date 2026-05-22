export type AppStep = 'input' | 'diagram';
export type InputMode = 'upload' | 'paste' | 'sample';
export type ExportFormat = 'pdf' | 'png' | 'svg';
export type DiagramLib = 'mermaid' | 'flowchart' | 'd3';

export interface AppState {
  step: AppStep;
  processText: string;
  instructions: string;
  mermaidCode: string;
  isLoading: boolean;
  error: string | null;
}
