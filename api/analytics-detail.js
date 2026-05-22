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
    const [topPages, trafficSources, landingPages, countries, realtimeByPage, channels, campaigns, hourlyTraffic, last7Sources] = await Promise.all([
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

      // Channel grouping (Organic Search, Social, Direct, Referral, Email, etc.)
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }),

      // Campaigns (UTM campaign names) - only meaningful when UTM tags are used
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionCampaignName' }],
        metrics: [
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }),

      // Hourly traffic pattern (last 7 days) - shows when audience is active
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'hour' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
        orderBys: [{ dimension: { dimensionName: 'hour' } }],
        limit: 24,
      }),

      // Last 7 days sources only (to compare vs 30-day trend)
      runReport(accessToken, propertyId, {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionSourceMedium' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
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

    // Parse channels (Organic Search, Social, Direct, etc.)
    const channelBreakdown = (channels.rows || []).map(r => ({
      channel: r.dimensionValues?.[0]?.value || 'Unknown',
      sessions: parseInt(r.metricValues?.[0]?.value || '0'),
      views: parseInt(r.metricValues?.[1]?.value || '0'),
      bounce: Math.round(parseFloat(r.metricValues?.[2]?.value || '0') * 100),
      avgTime: Math.round(parseFloat(r.metricValues?.[3]?.value || '0')),
    }));

    // Parse UTM campaigns (filter out "(not set)" and "(direct)" entries)
    const campaignList = (campaigns.rows || [])
      .map(r => ({
        campaign: r.dimensionValues?.[0]?.value || '',
        sessions: parseInt(r.metricValues?.[0]?.value || '0'),
        views: parseInt(r.metricValues?.[1]?.value || '0'),
        bounce: Math.round(parseFloat(r.metricValues?.[2]?.value || '0') * 100),
      }))
      .filter(c => c.campaign && !c.campaign.startsWith('(') && c.sessions > 0);

    // Parse hourly traffic - find peak hours
    const hourly = (hourlyTraffic.rows || []).map(r => ({
      hour: parseInt(r.dimensionValues?.[0]?.value || '0'),
      sessions: parseInt(r.metricValues?.[0]?.value || '0'),
      users: parseInt(r.metricValues?.[1]?.value || '0'),
    })).sort((a, b) => a.hour - b.hour);
    const peakHour = [...hourly].sort((a, b) => b.sessions - a.sessions)[0];

    // Last 7 days sources for trend comparison
    const recentSources = (last7Sources.rows || []).map(r => ({
      sourceMedium: r.dimensionValues?.[0]?.value || 'unknown',
      sessions: parseInt(r.metricValues?.[0]?.value || '0'),
    }));

    const fetchedAt = new Date();
    return res.status(200).json({
      pages,
      sources,           // 30-day source/medium (includes UTMs)
      recentSources,     // 7-day source/medium for trend comparison
      landings,
      geo,
      realtimePages,
      channels: channelBreakdown,
      campaigns: campaignList,
      hourly,
      peakHour,
      dateRange: { from: '30daysAgo', to: 'today' },
      fetchedAt: fetchedAt.toISOString(),
      fetchedAtReadable: fetchedAt.toUTCString(),
      ts: Date.now(),
    });
  } catch (err) {
    console.error('Analytics detail error:', err);
    return res.status(500).json({ error: err.message });
  }
}
