import crypto from 'crypto';

const documents = new Map();

export function createDocumentId() {
  return crypto.randomBytes(12).toString('hex');
}

export function createDocumentEntry({ identifier, fileName, mimeType, status = 'processing' }) {
  const entry = {
    identifier,
    fileName: fileName || null,
    mimeType: mimeType || null,
    status,
    createdDt: new Date().toISOString(),
    readyDt: null,
    ready: false,
    failed: false,
    error: null,
    data: null,
    confidence: null,
    rawText: null,
    meta: {},
  };
  documents.set(identifier, entry);
  return entry;
}

export function updateDocument(identifier, updates) {
  const entry = documents.get(identifier);
  if (!entry) return null;
  Object.assign(entry, updates);
  return entry;
}

export function getDocument(identifier) {
  return documents.get(identifier) || null;
}

export function listDocuments({ offset = 0, limit = 20 } = {}) {
  const all = Array.from(documents.values());
  const results = all.slice(offset, offset + limit);
  return {
    count: all.length,
    next: offset + limit < all.length ? `/v3/documents?offset=${offset + limit}&limit=${limit}` : null,
    previous: offset > 0 ? `/v3/documents?offset=${Math.max(0, offset - limit)}&limit=${limit}` : null,
    results: results.map(d => ({
      identifier: d.identifier,
      fileName: d.fileName,
      ready: d.ready,
      readyDt: d.readyDt,
      failed: d.failed,
      createdDt: d.createdDt,
      status: d.status,
    })),
  };
}

export function deleteDocument(identifier) {
  return documents.delete(identifier);
}

export function markProcessing(identifier, fileName, mimeType) {
  return createDocumentEntry({ identifier, fileName, mimeType, status: 'processing' });
}

export function markReady(identifier, data, confidence, rawText, meta = {}) {
  return updateDocument(identifier, {
    status: 'ready',
    ready: true,
    readyDt: new Date().toISOString(),
    data,
    confidence,
    rawText,
    meta,
  });
}

export function markFailed(identifier, errorMessage) {
  return updateDocument(identifier, {
    status: 'failed',
    ready: true,
    readyDt: new Date().toISOString(),
    failed: true,
    error: errorMessage,
  });
}
