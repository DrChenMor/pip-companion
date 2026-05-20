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

async function runReport(accessToken, propertyId, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `GA API: ${res.status}`);
  }
  return res.json();
}

async function runRealtimeReport(accessToken, propertyId, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const propertyId = process.env.VITE_GA_PROPERTY_ID;

    if (!credentialsJson || !propertyId) {
      return res.status(500).json({ error: 'Missing config' });
    }

    const credentials = JSON.parse(credentialsJson);
    const accessToken = await getAccessToken(credentials);

    // Fetch all reports in parallel
    const [topPages, trafficSources, landingPages, countries, realtimeByPage] = await Promise.all([
      // Top pages by pageviews (last 7 days for better data)
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'sessions' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' },
        ],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),

      // Traffic sources (source/medium includes UTM data)
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionSourceMedium' }],
        metrics: [
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 15,
      }),

      // Landing pages with bounce rates
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'landingPage' }],
        metrics: [
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }),

      // Geographic breakdown
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'country' }],
        metrics: [
          { name: 'sessions' },
          { name: 'screenPageViews' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }),

      // Realtime by page
      runRealtimeReport(accessToken, propertyId, {
        dimensions: [{ name: 'unifiedScreenName' }],
        metrics: [{ name: 'activeUsers' }],
        metricAggregations: ['TOTAL'],
      }),
    ]);

    // Parse top pages
    const pages = (topPages.rows || []).map(r => ({
      path: r.dimensionValues?.[0]?.value || '/',
      views: parseInt(r.metricValues?.[0]?.value || '0'),
      sessions: parseInt(r.metricValues?.[1]?.value || '0'),
      avgTime: Math.round(parseFloat(r.metricValues?.[2]?.value || '0')),
      bounce: Math.round(parseFloat(r.metricValues?.[3]?.value || '0') * 100),
    }));

    // Parse traffic sources
    const sources = (trafficSources.rows || []).map(r => ({
      sourceMedium: r.dimensionValues?.[0]?.value || 'unknown',
      sessions: parseInt(r.metricValues?.[0]?.value || '0'),
      views: parseInt(r.metricValues?.[1]?.value || '0'),
      bounce: Math.round(parseFloat(r.metricValues?.[2]?.value || '0') * 100),
      avgTime: Math.round(parseFloat(r.metricValues?.[3]?.value || '0')),
    }));

    // Parse landing pages
    const landings = (landingPages.rows || []).map(r => ({
      path: r.dimensionValues?.[0]?.value || '/',
      sessions: parseInt(r.metricValues?.[0]?.value || '0'),
      bounce: Math.round(parseFloat(r.metricValues?.[1]?.value || '0') * 100),
      avgTime: Math.round(parseFloat(r.metricValues?.[2]?.value || '0')),
    }));

    // Parse countries
    const geo = (countries.rows || []).map(r => ({
      country: r.dimensionValues?.[0]?.value || 'unknown',
      sessions: parseInt(r.metricValues?.[0]?.value || '0'),
      views: parseInt(r.metricValues?.[1]?.value || '0'),
    }));

    // Parse realtime pages
    const realtimePages = (realtimeByPage.rows || []).map(r => ({
      page: r.dimensionValues?.[0]?.value || '/',
      active: parseInt(r.metricValues?.[0]?.value || '0'),
    })).sort((a, b) => b.active - a.active).slice(0, 5);

    return res.status(200).json({
      pages,
      sources,
      landings,
      geo,
      realtimePages,
      ts: Date.now(),
    });
  } catch (err) {
    console.error('Analytics detail error:', err);
    return res.status(500).json({ error: err.message });
  }
}
