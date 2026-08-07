export default async function handler(req, res) {
  try {
    // Log everything we receive, regardless of method/shape, so real Evopay
    // webhook calls can be inspected in the Vercel function logs.
    console.log('Webhook chamado. Method:', req.method, 'Headers:', JSON.stringify(req.headers));

    if (req.method !== 'POST') {
      console.warn('Webhook recebido com método inesperado:', req.method, 'Query:', JSON.stringify(req.query));
      // Respond 200 instead of 405 so the caller doesn't treat this as a hard
      // failure/retry loop if Evopay ever pings with a different method.
      res.status(200).send('OK');
      return;
    }

    let payload;
    try {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (parseErr) {
      console.error('Webhook: corpo recebido não é JSON válido:', req.body);
      // Still 200 — we don't want Evopay to keep retrying a payload we can't parse,
      // but we log it in full so it can be diagnosed.
      res.status(200).send('OK');
      return;
    }

    console.log('Webhook recebido da Evopay:', JSON.stringify(payload));

    // Evopay sends a webhook call for every status change (PENDING, COMPLETED,
    // CANCELED, EXPIRED, WAITING_FOR_REFUND, REFUNDED) on DEPOSIT and WITHDRAW
    // transactions — not only on payment. Only COMPLETED deposits are actual
    // paid donations; anything else must not be reported to Utmify as "paid".
    const status = (payload.status || '').toString().toUpperCase();
    const txType = (payload.type || 'DEPOSIT').toString().toUpperCase();
    if (status !== 'COMPLETED' || txType !== 'DEPOSIT') {
      console.log('Webhook ignorado (não é um depósito concluído). status:', status, 'type:', txType);
      res.status(200).send('OK');
      return;
    }

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
      const utmifyRes = await fetch('https://api.utmify.com.br/api-credentials/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': 'PJU1tp12HMfiP3f4Jebt6AtkBv4CeiSmzM3b'
        },
        body: JSON.stringify(utmifyPayload)
      });
      const utmifyText = await utmifyRes.text();
      if (!utmifyRes.ok) {
        console.error('Webhook - Utmify respondeu com erro:', utmifyRes.status, utmifyText);
      } else {
        console.log('Webhook - Venda PAID enviada para Utmify!', orderId, utmifyText);
      }
    } catch (e) {
      console.error('Webhook - Erro ao enviar Utmify', e);
    }

    res.status(200).send('OK');
  } catch (fatalErr) {
    // Absolute last resort: never let this function crash without a 200,
    // since Evopay's payment confirmation depends on getting one.
    console.error('Webhook - erro inesperado:', fatalErr);
    res.status(200).send('OK');
  }
}
