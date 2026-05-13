import mammoth from 'mammoth';

export async function parseUploadedFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'txt' || ext === 'md') {
    return readAsText(file);
  }

  if (ext === 'docx') {
    return parseDocx(file);
  }

  if (ext === 'pdf') {
    return parsePdf(file);
  }

  throw new Error(`Unsupported file type ".${ext}". Please upload a .txt, .md, .docx, or .pdf file.`);
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

async function parseDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function parsePdf(file: File): Promise<string> {
  // Dynamically import pdfjs to avoid bundling issues
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ');
    pages.push(text);
  }

  return pages.join('\n\n');
}
