// Manual/scheduled reconciliation: checks a Pix transaction's real status
// directly with Evopay (GET /v1/pix?id=...) and reports it to Utmify as paid
// if it's COMPLETED but we never got — or never processed — the webhook call.
//
// Usage: GET /api/reconcile?id=<transactionId>
//        GET /api/reconcile?id=<id1>,<id2>,<id3>   (comma-separated, checks each)

async function checkAndReportOne(id) {
  const evopayRes = await fetch('https://pix.evopay.cash/v1/pix?id=' + encodeURIComponent(id), {
    method: 'GET',
    headers: { 'API-Key': 'f8055c9e-6a4c-442f-a431-3378adf00528' }
  });

  const text = await evopayRes.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { id, ok: false, reason: 'Evopay retornou resposta inválida', raw: text };
  }

  if (!evopayRes.ok) {
    return { id, ok: false, reason: 'Evopay retornou erro', status: evopayRes.status, data };
  }

  const status = (data.status || '').toString().toUpperCase();
  if (status !== 'COMPLETED') {
    return { id, ok: true, reported: false, status, amount: data.amount };
  }

  const amountCents = Math.round(Number(data.amount || 0) * 100);
  const now = new Date();
  const formattedDate = now.toISOString().replace('T', ' ').substring(0, 19);

  const utmifyPayload = {
    orderId: id.toString(),
    platform: 'Evopay',
    paymentMethod: 'pix',
    status: 'paid',
    createdAt: formattedDate,
    approvedDate: formattedDate,
    customer: {
      name: data.payerName || 'Cliente',
      email: 'cliente@email.com',
      phone: '',
      document: data.payerDocument || '',
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
      src: null, sck: null, utm_source: null, utm_campaign: null,
      utm_medium: null, utm_content: null, utm_term: null
    },
    commission: {
      totalPriceInCents: amountCents > 0 ? amountCents : 1000,
      gatewayFeeInCents: 0,
      userCommissionInCents: amountCents > 0 ? amountCents : 1000
    }
  };

  const utmifyRes = await fetch('https://api.utmify.com.br/api-credentials/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-token': 'PJU1tp12HMfiP3f4Jebt6AtkBv4CeiSmzM3b'
    },
    body: JSON.stringify(utmifyPayload)
  });
  const utmifyText = await utmifyRes.text();

  return { id, ok: true, reported: true, status, amount: data.amount, utmifyOk: utmifyRes.ok, utmifyResponse: utmifyText };
}

export default async function handler(req, res) {
  try {
    const idsParam = (req.query && req.query.id) || '';
    if (!idsParam) {
      res.status(400).json({ error: 'Informe ?id=<transactionId> (ou vários, separados por vírgula)' });
      return;
    }
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);

    const results = [];
    for (const id of ids) {
      try {
        results.push(await checkAndReportOne(id));
      } catch (err) {
        results.push({ id, ok: false, reason: err.message });
      }
    }

    res.status(200).json({ results });
  } catch (fatalErr) {
    console.error('Reconcile - erro inesperado:', fatalErr);
    res.status(500).json({ error: fatalErr.message });
  }
}
