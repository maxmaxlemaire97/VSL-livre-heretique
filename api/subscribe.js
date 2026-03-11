module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prenom, email } = req.body;

  if (!email || !prenom) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  try {
    // ── 1. Créer le contact dans Systeme.io ──
    const sysResponse = await fetch('https://api.systeme.io/api/contacts', {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.SYSTEME_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ email, firstName: prenom }),
    });

    let contactId = null;
    if (sysResponse.ok) {
      const contact = await sysResponse.json();
      contactId = contact.id;
    } else if (sysResponse.status === 422) {
      // Contact déjà existant — récupère son ID via recherche
      const search = await fetch(
        `https://api.systeme.io/api/contacts?email=${encodeURIComponent(email)}`,
        {
          headers: {
            'X-API-Key': process.env.SYSTEME_API_KEY,
            'Accept': 'application/json',
          },
        }
      );
      if (search.ok) {
        const data = await search.json();
        contactId = data.items?.[0]?.id ?? null;
      }
    }

    // ── 2. Appliquer le tag "VSL Livre Hérétique" ──
    if (contactId) {
      await fetch(`https://api.systeme.io/api/contacts/${contactId}/tags`, {
        method: 'POST',
        headers: {
          'X-API-Key': process.env.SYSTEME_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ tagId: 1913470 }),
      });
    }

    // ── 3. Envoyer l'événement Lead à Facebook Conversions API ──
    const fbResponse = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.FB_PIXEL_ID}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [
            {
              event_name: 'Lead',
              event_time: Math.floor(Date.now() / 1000),
              action_source: 'website',
              user_data: {
                em: [await sha256(email.toLowerCase().trim())],
                fn: [await sha256(prenom.toLowerCase().trim())],
              },
            },
          ],
          access_token: process.env.FB_ACCESS_TOKEN,
        }),
      }
    );

    if (!fbResponse.ok) {
      console.error('Facebook CAPI error:', await fbResponse.text());
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Subscribe error:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Hash SHA-256 pour la Facebook Conversions API (PII hashée obligatoire)
async function sha256(str) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(str).digest('hex');
}
