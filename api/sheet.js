import { OAuth2Client } from 'google-auth-library';

const authClient = new OAuth2Client();

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
};

const parseAllowedEmails = (value) => {
  if (!value) return [];

  return value
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      status: 'error',
      message: 'Method not allowed',
    });
  }

  try {
    const googleScriptUrl = process.env.GOOGLE_SCRIPT_URL;
    const moneywiseSecret = process.env.MONEYWISE_SECRET;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const allowedEmails = parseAllowedEmails(process.env.ALLOWED_EMAILS);
    const idToken = getBearerToken(req);

    if (!googleScriptUrl) {
      return res.status(500).json({
        status: 'error',
        message: 'Missing GOOGLE_SCRIPT_URL in server environment',
      });
    }

    if (!moneywiseSecret) {
      return res.status(500).json({
        status: 'error',
        message: 'Missing MONEYWISE_SECRET in server environment',
      });
    }

    if (!googleClientId) {
      return res.status(500).json({
        status: 'error',
        message: 'Missing GOOGLE_CLIENT_ID in server environment',
      });
    }

    if (!idToken) {
      return res.status(401).json({
        status: 'error',
        message: 'Missing Google ID token',
      });
    }

    let tokenPayload;

    try {
      const ticket = await authClient.verifyIdToken({
        idToken,
        audience: googleClientId,
      });

      tokenPayload = ticket.getPayload();
    } catch {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid Google ID token',
      });
    }

    const email = tokenPayload?.email?.toLowerCase();
    const isVerified = tokenPayload?.email_verified;

    if (!email || !isVerified) {
      return res.status(401).json({
        status: 'error',
        message: 'Google account email is not verified',
      });
    }

    if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
      return res.status(403).json({
        status: 'error',
        message: 'Account is not authorized',
      });
    }

    const { action, transactions, goals } = req.body || {};

    if (!action) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing action in request body',
      });
    }

    const response = await fetch(googleScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action,
        transactions,
        goals,
        secret: moneywiseSecret,
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        status: 'error',
        message: `Google Script returned HTTP ${response.status}: ${text}`,
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({
        status: 'error',
        message: `Invalid JSON returned from Google Script: ${text}`,
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown server error',
    });
  }
}