import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Router } from 'express';
import multer from 'multer';
import {
  atsScoreController,
  generatePdfController,
  generateDocxController,
  jdMatchController,
  parseResumeController,
  createDocumentController,
  getDocumentController,
  listDocumentsController,
  deleteDocumentController,
} from '../controllers/resumeController.js';
import { authMiddleware } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '../..');
const uploadDir = path.join(serverRoot, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const router = Router();
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error('Only PDF and DOCX files are supported.'));
      return;
    }
    cb(null, true);
  },
});

// -------------------------------------------------------
// Legacy v1 formatter endpoints (backward compatible)
// -------------------------------------------------------
router.post('/parse', upload.single('resume'), parseResumeController);
router.post('/generate-pdf', generatePdfController);
router.post('/generate-docx', generateDocxController);
router.post('/ats-score', atsScoreController);
router.post('/jd-match', jdMatchController);

// -------------------------------------------------------
// V3 Affinda-compatible API endpoints
// -------------------------------------------------------
const v3Router = Router();
v3Router.use(authMiddleware);

const v3Upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/tiff',
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(file.mimetype) || ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.tiff'].includes(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error('Unsupported file type.'));
  },
});

v3Router.post('/documents', v3Upload.single('file'), createDocumentController);
v3Router.get('/documents', listDocumentsController);
v3Router.get('/documents/:identifier', getDocumentController);
v3Router.delete('/documents/:identifier', deleteDocumentController);

// Mount v3 routes
router.use('/v3', v3Router);

export default router;
