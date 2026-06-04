import fs from 'fs/promises';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

function cleanText(input = '') {
  return String(input)
    .replace(/\u0000/g, ' ')
    .replace(/[•●▪◦]/g, '•')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function shouldIgnorePdfWarning(args = []) {
  const msg = args.map(String).join(' ');
  return (
    msg.includes('Warning: TT: undefined function:') ||
    msg.includes('Warning: TT: invalid function id:')
  );
}

async function parsePdfQuietly(buffer) {
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalError = console.error;

  try {
    console.warn = (...args) => {
      if (shouldIgnorePdfWarning(args)) return;
      originalWarn(...args);
    };

    console.log = (...args) => {
      if (shouldIgnorePdfWarning(args)) return;
      originalLog(...args);
    };

    console.error = (...args) => {
      if (shouldIgnorePdfWarning(args)) return;
      originalError(...args);
    };

    const result = await pdfParse(buffer);
    return cleanText(result.text || '');
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
    console.error = originalError;
  }
}

export async function extractTextFromResume({ filePath, mimeType }) {
  const buffer = await fs.readFile(filePath);

  if (mimeType === 'application/pdf') {
    return await parsePdfQuietly(buffer);
  }

  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value || '');
  }

  throw new Error('Unsupported file type. Please upload a PDF or DOCX file.');
}