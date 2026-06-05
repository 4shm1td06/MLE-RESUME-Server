import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';

const execFileAsync = promisify(execFile);

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

async function ocrPdf(buffer) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-ocr-'));
  const inputPath = path.join(tmpDir, 'input.pdf');
  await fs.writeFile(inputPath, buffer);

  try {
    await execFileAsync('pdftoppm', [
      '-png',
      '-r', '300',
      inputPath,
      path.join(tmpDir, 'page'),
    ]);

    const files = await fs.readdir(tmpDir);
    const pageFiles = files
      .filter((f) => f.endsWith('.png'))
      .sort();

    const texts = await Promise.all(
      pageFiles.map(async (file) => {
        const imageBuf = await fs.readFile(path.join(tmpDir, file));
        const { data } = await Tesseract.recognize(imageBuf, 'eng', {
          logger: () => {},
        });
        return data.text || '';
      }),
    );

    return cleanText(texts.join('\n\n'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        'OCR is not available on this server (pdftoppm not found). ' +
        'Install poppler-utils or use a digital (text-based) PDF.',
      );
    }
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function extractTextFromResume({ filePath, mimeType }) {
  const buffer = await fs.readFile(filePath);

  if (mimeType === 'application/pdf') {
    const text = await parsePdfQuietly(buffer);
    if (text.replace(/\s/g, '').length > 50) {
      return text;
    }
    return await ocrPdf(buffer);
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