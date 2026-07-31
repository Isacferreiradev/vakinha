export default async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    // req.body is already parsed by Vercel
    const payload = req.body || {};
    
    const postData = JSON.stringify({
      ...payload,
      callbackUrl: payload.callbackUrl || 'https://webhook.site/placeholder'
    });

    try {
      // Fetching from Evopay Cash API
      const response = await fetch('https://pix.evopay.cash/v1/pix/', {
        method: 'POST',
        headers: {
          'API-Key': 'f8055c9e-6a4c-442f-a431-3378adf00528',
          'Content-Type': 'application/json'
        },
        body: postData
      });
      
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (err) {
      console.error('Error proxying to Evopay:', err);
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
}
