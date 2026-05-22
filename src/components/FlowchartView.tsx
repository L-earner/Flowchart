import { useEffect, useRef, useState } from 'react';

interface Props {
  code: string;
}

export default function FlowchartView({ code }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !code) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = (window as any).flowchart;
    if (!fc || typeof fc.parse !== 'function') {
      setError('Flowchart.js library not available on window.flowchart — check that /vendor/raphael.min.js and /vendor/flowchart.min.js loaded.');
      return;
    }

    try {
      el.innerHTML = '';
      setError(null);

      const diagram = fc.parse(code);
      diagram.drawSVG(el, {
        'line-width': 1.5,
        'line-length': 80,
        'text-margin': 14,
        'font-size': 13,
        'font-color': '#000000',
        'line-color': '#000000',
        'element-color': '#000000',
        'fill': '#ffffff',
        'yes-text': 'Yes',
        'no-text': 'No',
        'arrow-end': 'block',
        'scale': 1,
        'symbols': {
          start:       { 'font-color': '#000', 'element-color': '#000', 'fill': '#fff', 'text-margin': 14 },
          end:         { 'font-color': '#000', 'element-color': '#000', 'fill': '#fff', 'text-margin': 14 },
          operation:   { 'font-color': '#000', 'element-color': '#000', 'fill': '#fff', 'text-margin': 14 },
          condition:   { 'font-color': '#000', 'element-color': '#000', 'fill': '#fff', 'text-margin': 14 },
          inputoutput: { 'font-color': '#000', 'element-color': '#000', 'fill': '#fff', 'text-margin': 14 },
          subroutine:  { 'font-color': '#000', 'element-color': '#000', 'fill': '#fff', 'text-margin': 14 },
        },
      });

      // Raphael outputs a fixed-size SVG with no viewBox. Add one so the SVG
      // scales responsively when width:100% / height:auto is applied.
      const svg = el.querySelector('svg');
      if (svg) {
        const w = svg.getAttribute('width');
        const h = svg.getAttribute('height');
        if (w && h) {
          svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
          svg.removeAttribute('width');
          svg.removeAttribute('height');
        }
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.display = 'block';
        svg.style.overflow = 'visible';
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [code]);

  if (error) {
    return (
      <div className="render-error">
        <div className="render-error-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="render-error-title">Diagram could not be rendered</p>
        <p className="render-error-body">{error}</p>
        <details className="code-details" open>
          <summary>Raw flowchart.js syntax</summary>
          <pre className="code-block">{code}</pre>
        </details>
      </div>
    );
  }

  return <div ref={containerRef} className="fc-output" />;
}
