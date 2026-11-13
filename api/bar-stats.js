// Rich, slow-changing stats for the bar (Shimon's "stations").
// Live visitor count stays in /api/analytics (30s). This one is cached 5 min.
import { SignJWT, importPKCS8 } from 'jose';

const TZ = 'Australia/Perth';

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

async function runReport(token, propertyId, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `GA API: ${res.status}`);
  }
  return res.json();
}

// YYYY-MM-DD for "now" in the blog's timezone, shifted by whole days/months
function perthDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function ymd(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const num = (v) => Number(v || 0);

// Multi-date-range report with no dimensions -> { rangeName: [metrics...] }
function byRange(report) {
  const out = {};
  for (const row of report.rows || []) {
    const name = row.dimensionValues?.[0]?.value;
    out[name] = row.metricValues.map(m => num(m.value));
  }
  return out;
}

const rows = (report) => report.rows || [];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const propertyId = process.env.VITE_GA_PROPERTY_ID;
    if (!credentialsJson || !propertyId) return res.status(500).json({ error: 'Missing config' });
    const token = await getAccessToken(JSON.parse(credentialsJson));

    const today = perthDate();
    const [Y, M, D] = today.split('-').map(Number);
    const monthStart = ymd(Y, M, 1);
    const prevY = M === 1 ? Y - 1 : Y;
    const prevM = M === 1 ? 12 : M - 1;
    const prevMonthDays = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
    const prevMonthStart = ymd(prevY, prevM, 1);
    const prevMonthSameDay = ymd(prevY, prevM, Math.min(D, prevMonthDays));
    const prevMonthEnd = ymd(prevY, prevM, prevMonthDays);

    const totalsMetrics = [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }];

    const [recent, longer, countries, cities, posts, channels, newRet, daily] = await Promise.all([
      runReport(token, propertyId, {
        dateRanges: [
          { startDate: 'today', endDate: 'today', name: 'today' },
          { startDate: '6daysAgo', endDate: 'today', name: 'week' },
          { startDate: monthStart, endDate: 'today', name: 'month' },
          { startDate: prevMonthStart, endDate: prevMonthSameDay, name: 'prevMonthToDate' },
        ],
        metrics: totalsMetrics,
      }),
      runReport(token, propertyId, {
        dateRanges: [
          { startDate: prevMonthStart, endDate: prevMonthEnd, name: 'prevMonth' },
          { startDate: '29daysAgo', endDate: 'today', name: 'days30' },
          { startDate: '2020-01-01', endDate: 'today', name: 'allTime' },
        ],
        metrics: totalsMetrics,
      }),
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'country' }, { name: 'countryId' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: 6,
      }),
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'city' }, { name: 'country' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: 8,
      }),
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '6daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
        dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/blog/' } } },
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 5,
      }),
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 6,
      }),
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'newVsReturning' }],
        metrics: [{ name: 'activeUsers' }],
      }),
      runReport(token, propertyId, {
        dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 40,
      }),
    ]);

    const r1 = byRange(recent);
    const r2 = byRange(longer);
    const pack = (a) => ({ users: a?.[0] || 0, sessions: a?.[1] || 0, views: a?.[2] || 0 });

    const nr = {};
    rows(newRet).forEach(r => { nr[r.dimensionValues[0].value] = num(r.metricValues[0].value); });

    // The SPA sometimes reports a generic <title>, so build the post name from
    // its slug: "/blog/בלוג-61-אני-הבעיה" -> "בלוג 61 אני הבעיה"
    const titleFromPath = (p) => {
      let slug = (p || '').split('/').filter(Boolean).pop() || '';
      try { slug = decodeURIComponent(slug); } catch { /* already decoded */ }
      return slug.replace(/[-_]+/g, ' ').trim();
    };

    return res.status(200).json({
      today: pack(r1.today),
      week: pack(r1.week),
      month: pack(r1.month),
      prevMonthToDate: pack(r1.prevMonthToDate),
      prevMonth: pack(r2.prevMonth),
      days30: pack(r2.days30),
      allTime: pack(r2.allTime),
      countries: rows(countries).map(r => ({ country: r.dimensionValues[0].value, code: r.dimensionValues[1].value, users: num(r.metricValues[0].value) })),
      cities: rows(cities)
        .map(r => ({ city: r.dimensionValues[0].value, country: r.dimensionValues[1].value, users: num(r.metricValues[0].value) }))
        .filter(c => c.city && c.city !== '(not set)'),
      topPosts: rows(posts).map(r => ({
        path: r.dimensionValues[0].value,
        title: titleFromPath(r.dimensionValues[0].value),
        views: num(r.metricValues[0].value),
        users: num(r.metricValues[1].value),
      })),
      channels: rows(channels).map(r => ({ channel: r.dimensionValues[0].value, sessions: num(r.metricValues[0].value) })),
      newUsers: nr.new || 0,
      returningUsers: nr.returning || 0,
      daily: rows(daily).map(r => ({ date: r.dimensionValues[0].value, users: num(r.metricValues[0].value) })),
      dates: { today, monthStart, prevMonthStart, prevMonthSameDay },
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('bar-stats error:', err);
    return res.status(500).json({ error: err.message });
  }
}
