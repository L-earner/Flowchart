import jsPDF from 'jspdf';
import { saveAs } from 'file-saver';
import type { ExportFormat } from '../types';

function getSvgElement(container: HTMLElement): SVGSVGElement | null {
  return container.querySelector('svg');
}

function getSvgDimensions(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const [, , w, h] = viewBox.split(' ').map(Number);
    return { width: w || 1200, height: h || 800 };
  }
  const rect = svg.getBoundingClientRect();
  return { width: rect.width || 1200, height: rect.height || 800 };
}

async function svgToCanvas(svg: SVGSVGElement, scale = 2): Promise<HTMLCanvasElement> {
  const { width, height } = getSvgDimensions(svg);
  const svgData = new XMLSerializer().serializeToString(svg);

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render diagram image.'));
    };
    img.src = url;
  });
}

export async function exportDiagram(
  container: HTMLElement,
  format: ExportFormat,
  filename = 'process-flow-diagram'
): Promise<void> {
  const svg = getSvgElement(container);
  if (!svg) throw new Error('No diagram found to export.');

  if (format === 'svg') {
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    saveAs(blob, `${filename}.svg`);
    return;
  }

  const canvas = await svgToCanvas(svg, 2);

  if (format === 'png') {
    canvas.toBlob((blob) => {
      if (blob) saveAs(blob, `${filename}.png`);
    }, 'image/png');
    return;
  }

  if (format === 'pdf') {
    const { width, height } = getSvgDimensions(svg);
    const imgData = canvas.toDataURL('image/png');
    const isLandscape = width > height;
    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'px',
      format: isLandscape ? [height, width] : [width, height],
    });
    pdf.addImage(imgData, 'PNG', 0, 0, isLandscape ? height : width, isLandscape ? width : height);
    pdf.save(`${filename}.pdf`);
  }
}
