import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Router } from 'express';
import multer from 'multer';
import {
  atsScoreController,
  generateDocxController,
  generatePdfController,
  grammarFixController,
  jdMatchController,
  parseResumeController
} from '../controllers/resumeController.js';

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
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error('Only PDF and DOCX files are supported.'));
      return;
    }
    cb(null, true);
  }
});

router.post('/parse', upload.single('resume'), parseResumeController);
router.post('/generate-pdf', generatePdfController);
router.post('/generate-docx', generateDocxController);
router.post('/ats-score', atsScoreController);
router.post('/grammar-fix', grammarFixController);
router.post('/jd-match', jdMatchController);

export default router;
