import jsPDF from 'jspdf';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image';
import type { ExportFormat } from '../types';

function getSvgElement(container: HTMLElement): SVGSVGElement | null {
  return container.querySelector('svg');
}

function getSvgDimensions(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const [, , w, h] = viewBox.split(' ').map(Number);
    if (w && h) return { width: w, height: h };
  }
  const rect = svg.getBoundingClientRect();
  return { width: rect.width || 1200, height: rect.height || 800 };
}

// Renders the SVG element to a PNG data URL using html-to-image.
// This avoids the "tainted canvas" error that occurs when loading an SVG
// with external font references (e.g. Google Fonts @import) via <img>.
async function svgToPngDataUrl(svg: SVGSVGElement): Promise<string> {
  return toPng(svg as unknown as HTMLElement, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    // Ensure the SVG is rendered at its intrinsic size
    width: svg.getBoundingClientRect().width || undefined,
    height: svg.getBoundingClientRect().height || undefined,
  });
}

function svgToString(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  // Strip all external @import and url() references so the SVG file itself
  // is self-contained when downloaded.
  clone.querySelectorAll('style').forEach((style) => {
    let css = style.textContent ?? '';
    css = css.replace(/@import\b[^;]+;/gi, '');
    css = css.replace(/@font-face\s*\{[\s\S]*?\}/gi, (m) =>
      /https?:\/\//.test(m) ? '' : m,
    );
    css = css.replace(/url\(\s*['"]?https?:\/\/[^)'"]+['"]?\s*\)/gi, 'none');
    style.textContent = css;
  });
  return new XMLSerializer().serializeToString(clone);
}

export async function exportDiagram(
  container: HTMLElement,
  format: ExportFormat,
  filename = 'process-flow-diagram',
): Promise<void> {
  const svg = getSvgElement(container);
  if (!svg) throw new Error('No diagram found to export.');

  if (format === 'svg') {
    const blob = new Blob([svgToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
    saveAs(blob, `${filename}.svg`);
    return;
  }

  // PNG and PDF both go through html-to-image (no canvas taint)
  const dataUrl = await svgToPngDataUrl(svg);

  if (format === 'png') {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    saveAs(blob, `${filename}.png`);
    return;
  }

  if (format === 'pdf') {
    const { width, height } = getSvgDimensions(svg);
    const isLandscape = width > height;
    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'px',
      format: isLandscape ? [height, width] : [width, height],
    });
    const pdfW = isLandscape ? height : width;
    const pdfH = isLandscape ? width : height;
    pdf.addImage(dataUrl, 'PNG', 0, 0, pdfW, pdfH);
    pdf.save(`${filename}.pdf`);
  }
}
