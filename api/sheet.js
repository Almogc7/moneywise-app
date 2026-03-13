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