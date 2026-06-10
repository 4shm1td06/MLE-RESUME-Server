function cleanText(value = '') {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function stripInstitutionName(text) {
  const s = cleanText(text);
  if (!s) return '';

  const dateMatch = s.match(/\(([^)]+)\)\s*$/);
  const dateRange = dateMatch ? `(${dateMatch[1]})` : '';
  const before = dateMatch ? s.slice(0, dateMatch.index).replace(/[,\s]+$/, '') : s;

  const fromMatch = before.match(/^(.*?)\s+from\s+(.*)$/i);
  if (fromMatch) return `${fromMatch[1].trim()} ${dateRange}`.trim();

  const firstComma = before.indexOf(',');
  if (firstComma > 0) return `${before.slice(0, firstComma).trim()} ${dateRange}`.trim();

  const dashMatch = before.match(/^(.*?)\s+[-–—]\s+(.*)$/);
  if (dashMatch) return `${dashMatch[1].trim()} ${dateRange}`.trim();

  return `${before} ${dateRange}`.trim();
}
