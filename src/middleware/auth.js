const API_KEYS = new Set();

const configuredKey = process.env.RESUME_API_KEY?.trim();
if (configuredKey) {
  API_KEYS.add(configuredKey);
}

export function addApiKey(key) {
  API_KEYS.add(key);
}

export function removeApiKey(key) {
  API_KEYS.delete(key);
}

export function authMiddleware(req, res, next) {
  if (API_KEYS.size === 0) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      type: 'auth_error',
      errors: [{ attr: null, code: 'missing_authorization', detail: 'Authorization header is required.' }],
    });
  }

  const parts = authHeader.split(' ');
  const scheme = parts[0]?.toLowerCase();
  const token = parts[1];

  if (scheme !== 'bearer' || !token) {
    return res.status(401).json({
      type: 'auth_error',
      errors: [{ attr: null, code: 'invalid_authorization', detail: 'Authorization must be Bearer token.' }],
    });
  }

  if (!API_KEYS.has(token)) {
    return res.status(403).json({
      type: 'auth_error',
      errors: [{ attr: null, code: 'invalid_api_key', detail: 'Invalid API key.' }],
    });
  }

  next();
}
