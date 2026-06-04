import { heuristicParseResume } from './resumeHeuristics.js';
import { normalizeResume } from '../utils/schema.js';

export async function parseResumeText(extractedText = '') {
  const data = normalizeResume(heuristicParseResume(extractedText));

  return {
    data,
    meta: {
      apiUsed: false,
      fallbackUsed: true,
      reason: 'heuristic only — no AI rewriting',
      provider: 'heuristic',
      model: null
    }
  };
}