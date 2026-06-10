export function postProcessResume(data, rawText, source) {
  if (!data) return data;
  // AI-labeled data should pass through with zero modifications
  if (source === 'ai') return data;

  const lines = (rawText || '').split('\n').map(l => l.trim()).filter(Boolean);

  // Fix missing name — take first non-empty, non-email, non-phone line
  if ((!data.candidateName || !data.candidateName.fullName) && lines.length > 0) {
    for (const line of lines.slice(0, 5)) {
      if (!line || /^[^\w]/.test(line) || /@/.test(line) || /^\d/.test(line) || line.length > 60) continue;
      if (/^(email|phone|linkedin|skills|summary|education|work|experience|contact)/i.test(line)) continue;
      data.candidateName = { fullName: line };
      break;
    }
  }

  // Remove workExperience entries that are actually projects (duplicated by AI)
  const projectTitles = (data.projects || []).map(p => (p.title || '').toLowerCase().trim()).filter(Boolean);
  if (projectTitles.length > 0 && (data.workExperience || []).length > 0) {
    data.workExperience = data.workExperience.filter(w => {
      const title = (w.jobTitle || '').toLowerCase().trim();
      return !projectTitles.some(pt => title.includes(pt) || pt.includes(title));
    });
  }

  // Fix missing location — extract from education or work entries
  if (!data.location || !data.location.formatted) {
    const locationCandidates = [];

    for (const edu of (data.education || [])) {
      if (edu.organization) {
        const parts = edu.organization.split(',').map(s => s.trim());
        if (parts.length > 1) {
          locationCandidates.push(parts.slice(1).join(', ').trim());
        }
      }
    }

    for (const work of (data.workExperience || [])) {
      if (work.organization) {
        const parts = work.organization.split(',').map(s => s.trim());
        if (parts.length > 1) {
          const maybeLoc = parts.slice(1).join(', ').trim();
          if (/[A-Z][a-z]/.test(maybeLoc) && !locationCandidates.includes(maybeLoc)) {
            locationCandidates.push(maybeLoc);
          }
        }
      }
    }

    const cityState = rawText.match(/([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b/);
    if (cityState && !locationCandidates.some(l => l.includes(cityState[0]))) {
      locationCandidates.unshift(cityState[0]);
    }

    if (locationCandidates.length > 0) {
      data.location = {
        formatted: locationCandidates[0],
        rawInput: locationCandidates[0],
      };
    }
  }

  return data;
}
