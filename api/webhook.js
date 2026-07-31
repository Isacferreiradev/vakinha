export default async function handler(req, res) {
  if (req.method === 'POST') {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    
    console.log('Webhook recebido da Evopay:', payload);

    // Get UTMs from the URL query strings that we appended!
    const query = req.query || {};
    
    // Construct the order ID. Evopay usually sends txid or id
    const orderId = payload.txid || payload.id || query.id || ('pix_' + Date.now());
    const amount = payload.amount || payload.valor || 0;
    const amountCents = Math.round(Number(amount) * 100);

    const now = new Date();
    const formattedDate = now.toISOString().replace('T', ' ').substring(0, 19);

    const utmifyPayload = {
      orderId: orderId.toString(),
      platform: 'Evopay',
      paymentMethod: 'pix',
      status: 'paid', // Notifica a Utmify que o Pix foi pago!
      createdAt: formattedDate,
      approvedDate: formattedDate,
      customer: {
        name: payload.nome || payload.customerName || 'Cliente',
        email: payload.email || payload.customerEmail || 'cliente@email.com',
        phone: payload.telefone || payload.customerPhone || '',
        document: payload.cpf || payload.document || '',
        ip: '127.0.0.1'
      },
      products: [
        {
          id: '1',
          name: 'Doação',
          quantity: 1,
          priceInCents: amountCents > 0 ? amountCents : 1000,
          planId: '0',
          planName: 'Único'
        }
      ],
      trackingParameters: {
        src: query.src || null,
        sck: query.sck || null,
        utm_source: query.utm_source || null,
        utm_campaign: query.utm_campaign || null,
        utm_medium: query.utm_medium || null,
        utm_content: query.utm_content || null,
        utm_term: query.utm_term || null
      },
      commission: {
        totalPriceInCents: amountCents > 0 ? amountCents : 1000,
        gatewayFeeInCents: 0,
        userCommissionInCents: amountCents > 0 ? amountCents : 1000
      }
    };

    try {
      await fetch('https://api.utmify.com.br/api-credentials/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': 'PJU1tp12HMfiP3f4Jebt6AtkBv4CeiSmzM3b'
        },
        body: JSON.stringify(utmifyPayload)
      });
      console.log('Webhook - Venda PAID enviada para Utmify!', orderId);
    } catch (e) {
      console.error('Webhook - Erro ao enviar Utmify', e);
    }

    res.status(200).send('OK');
  } else {
    res.status(405).send('Method Not Allowed');
  }
}
