import { SignJWT, importPKCS8 } from 'jose';

async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(credentials.private_key, 'RS256');
  const jwt = await new SignJWT({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(privateKey);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Token exchange failed');
  return data.access_token;
}

async function fetchRealtimeReport(accessToken, propertyId) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dimensions: [
          { name: 'country' },
          { name: 'unifiedScreenName' },
        ],
        metrics: [
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
          { name: 'conversions' },
        ],
        metricAggregations: ['TOTAL'],
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `GA API: ${res.status}`);
  }
  return res.json();
}

async function fetchDailyReport(accessToken, propertyId) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: '1daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `GA API: ${res.status}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const propertyId = process.env.VITE_GA_PROPERTY_ID;

    if (!credentialsJson || !propertyId) {
      return res.status(500).json({ error: 'Missing service account or property ID config' });
    }

    const credentials = JSON.parse(credentialsJson);
    const accessToken = await getAccessToken(credentials);

    const [realtime, daily] = await Promise.all([
      fetchRealtimeReport(accessToken, propertyId),
      fetchDailyReport(accessToken, propertyId),
    ]);

    const realtimeRows = realtime.rows || [];
    const activeUsers = realtime.totals?.[0]?.metricValues?.[0]?.value
      || String(realtimeRows.reduce((sum, r) => sum + parseInt(r.metricValues?.[0]?.value || '0'), 0));
    const conversions = realtime.totals?.[0]?.metricValues?.[2]?.value
      || String(realtimeRows.reduce((sum, r) => sum + parseInt(r.metricValues?.[2]?.value || '0'), 0));

    let topPage = '/', topCountry = 'US', topReferrer = 'direct';
    let maxViews = 0;
    const countryMap = {};
    for (const row of realtimeRows) {
      const country = row.dimensionValues?.[0]?.value || 'unknown';
      const page = row.dimensionValues?.[1]?.value || '/';
      const views = parseInt(row.metricValues?.[1]?.value || '0');
      countryMap[country] = (countryMap[country] || 0) + views;
      if (views > maxViews) { maxViews = views; topPage = page; }
    }
    const sortedCountries = Object.entries(countryMap).sort((a, b) => b[1] - a[1]);
    if (sortedCountries.length > 0) topCountry = sortedCountries[0][0];

    const dailyRow = daily.rows?.[0]?.metricValues || [];
    const pageviews24h = parseFloat(dailyRow[0]?.value || '0');
    const sessions24h = parseFloat(dailyRow[1]?.value || '0');
    const bounceRate = parseFloat(dailyRow[2]?.value || '0');
    const avgSession = parseFloat(dailyRow[3]?.value || '0');

    return res.status(200).json({
      active: parseInt(activeUsers),
      pageviews24h,
      sessions24h,
      bounceRate,
      avgSession,
      topPage,
      topReferrer,
      country: topCountry,
      conversions: parseInt(conversions),
      ts: Date.now(),
    });
  } catch (err) {
    console.error('Analytics API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
