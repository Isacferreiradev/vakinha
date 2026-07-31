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
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    
    // Evopay API strictly validates payload and throws 400 if unknown fields exist.
    // So we extract ONLY what it expects.
    const postData = JSON.stringify({
      amount: Number(payload.amount),
      callbackUrl: 'https://webhook.site/placeholder'
    });

    try {
      // 1. Fetching from Evopay Cash API
      const response = await fetch('https://pix.evopay.cash/v1/pix/', {
        method: 'POST',
        headers: {
          'API-Key': 'f8055c9e-6a4c-442f-a431-3378adf00528',
          'Content-Type': 'application/json'
        },
        body: postData
      });
      
      const data = await response.json();
      
      // 2. If Pix generated successfully, send event to Utmify API
      if (response.ok && data && data.qrCodeText) {
        try {
          const orderId = data.txid || data.id || ('pix_' + Date.now());
          
          // Format date for Utmify (YYYY-MM-DD HH:MM:SS)
          const now = new Date();
          const formattedDate = now.toISOString().replace('T', ' ').substring(0, 19);

          const utmifyPayload = {
            orderId: orderId.toString(),
            platform: 'Evopay',
            paymentMethod: 'pix',
            status: 'waiting_payment',
            createdAt: formattedDate,
            customer: {
              name: payload.customer?.name || 'Cliente',
              email: payload.customer?.email || 'cliente@email.com',
              phone: payload.customer?.phone || '',
              document: payload.customer?.document || '',
              ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1'
            },
            products: [
              {
                id: '1',
                name: 'Doação',
                quantity: 1,
                priceInCents: Math.round(Number(payload.amount) * 100)
              }
            ],
            trackingParameters: payload.trackingParameters || {}
          };

          await fetch('https://api.utmify.com.br/api-credentials/orders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-token': 'PJU1tp12HMfiP3f4Jebt6AtkBv4CeiSmzM3b'
            },
            body: JSON.stringify(utmifyPayload)
          });
          
          console.log('Venda enviada para Utmify com sucesso', orderId);
        } catch (utmErr) {
          console.error('Erro ao enviar para Utmify:', utmErr);
        }
      }

      res.status(response.status).json(data);
    } catch (err) {
      console.error('Error proxying to Evopay:', err);
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
}
