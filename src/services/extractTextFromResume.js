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
    .replace(/[•●▪◦❖]/g, '•')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const PDF_WARN_FILTER = /Warning: TT: (undefined function|invalid function id):/;

function setupPdfLogFilter() {
  const restore = [];
  for (const level of ['warn', 'log', 'error']) {
    const original = console[level];
    console[level] = (...args) => {
      if (args.some(a => PDF_WARN_FILTER.test(String(a)))) return;
      original(...args);
    };
    restore.push(() => { console[level] = original; });
  }
  return () => restore.forEach(fn => fn());
}

async function parsePdfQuietly(buffer) {
  const restore = setupPdfLogFilter();
  try {
    const result = await pdfParse(buffer);
    return cleanText(result.text || '');
  } finally {
    restore();
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