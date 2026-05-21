import { useState, useEffect, useRef, useCallback } from 'react';
import { TOP_PAGES, REFERRERS, COUNTRIES } from '../utils/constants';
import { lerp } from '../utils/colorMath';

function nowMin() { return new Date().getHours() * 60 + new Date().getMinutes(); }

function dailyCurve(min) {
  const a = Math.exp(-Math.pow((min - 630) / 180, 2)) * 0.9;
  const b = Math.exp(-Math.pow((min - 1260) / 200, 2)) * 1.0;
  return Math.min(1, 0.08 + a + b);
}

function seedState() {
  return {
    active: 12, sessions24h: 1840, pageviews24h: 4310,
    bounceRate: 0.42, avgSession: 96,
    topPage: '/', topReferrer: 'google.com', country: 'US',
    trend: Array.from({ length: 60 }, (_, i) => 8 + Math.sin(i / 8) * 4 + Math.random() * 3),
    events: [],
  };
}

export function useMockAnalytics({ multiplier = 1, spike = 0 } = {}) {
  const [data, setData] = useState(seedState);
  const ref = useRef(data);
  ref.current = data;
  const spikeRef = useRef({ active: 0, decay: 0 });

  useEffect(() => {
    if (spike > 0) spikeRef.current = { active: spike, decay: 1 };
  }, [spike]);

  useEffect(() => {
    let raf;
    let last = performance.now();
    const tick = (t) => {
      const dt = (t - last) / 1000;
      last = t;
      const cur = ref.current;
      const next = { ...cur };
      const curve = dailyCurve(nowMin());

      if (spikeRef.current.decay > 0)
        spikeRef.current.decay = Math.max(0, spikeRef.current.decay - dt * 0.04);
      const spikeBoost = spikeRef.current.active * spikeRef.current.decay;

      const targetActive = Math.max(0, Math.round((curve * 48 * multiplier) + spikeBoost + (Math.random() - 0.5) * 4));
      next.active = Math.round(lerp(cur.active, targetActive, 0.04));

      const overload = Math.max(0, (cur.active - 80) / 40);
      next.bounceRate = lerp(cur.bounceRate, 0.38 + Math.sin(t / 8000) * 0.04 + overload * 0.15, 0.02);
      next.avgSession = lerp(cur.avgSession, 95 + Math.sin(t / 12000) * 22 - overload * 30, 0.02);
      next.pageviews24h = cur.pageviews24h + cur.active * dt * 0.04;
      next.sessions24h = cur.sessions24h + cur.active * dt * 0.015;

      next.trend = cur.trend.slice();
      if (Math.random() < dt * 2) {
        next.trend.push(next.active);
        if (next.trend.length > 80) next.trend.shift();
      }

      next.events = cur.events.slice(-20);
      if (Math.random() < dt * (0.4 + curve))
        next.events.push({ kind: 'visit', page: TOP_PAGES[Math.floor(Math.random() * TOP_PAGES.length)], country: COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)], ref: REFERRERS[Math.floor(Math.random() * REFERRERS.length)], t: Date.now() });
      if (Math.random() < dt * 0.04)
        next.events.push({ kind: 'conversion', t: Date.now() });
      if (spikeRef.current.decay > 0.9 && Math.random() < 0.1)
        next.events.push({ kind: 'spike', t: Date.now() });
      if (Math.random() < dt * 0.05) {
        next.topPage = TOP_PAGES[Math.floor(Math.random() * TOP_PAGES.length)];
        next.topReferrer = REFERRERS[Math.floor(Math.random() * REFERRERS.length)];
        next.country = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
      }

      setData(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [multiplier]);

  return data;
}

export function useGoogleAnalytics({ propertyId, accessToken, refreshInterval = 30000 }) {
  const [gaData, setGaData] = useState(null);
  const [error, setError] = useState(null);

  const fetchGA = useCallback(async () => {
    if (!propertyId || !accessToken) return;
    try {
      const realtimeRes = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            dimensions: [{ name: 'country' }, { name: 'unifiedScreenName' }],
            metrics: [{ name: 'activeUsers' }],
          }),
        }
      );
      if (!realtimeRes.ok) {
        const body = await realtimeRes.json().catch(() => ({}));
        throw new Error(body.error?.message || `GA API: ${realtimeRes.status}`);
      }
      const realtime = await realtimeRes.json();

      let totalActive = 0;
      let topPage = '/';
      let topPageUsers = 0;
      let topCountry = 'US';
      let topCountryUsers = 0;
      const countryMap = {};
      const pageMap = {};

      for (const row of (realtime.rows || [])) {
        const country = row.dimensionValues?.[0]?.value || 'US';
        const page = row.dimensionValues?.[1]?.value || '/';
        const users = parseInt(row.metricValues?.[0]?.value || '0');
        totalActive += users;
        countryMap[country] = (countryMap[country] || 0) + users;
        pageMap[page] = (pageMap[page] || 0) + users;
      }

      for (const [p, u] of Object.entries(pageMap)) {
        if (u > topPageUsers) { topPage = p; topPageUsers = u; }
      }
      for (const [c, u] of Object.entries(countryMap)) {
        if (u > topCountryUsers) { topCountry = c; topCountryUsers = u; }
      }

      setGaData(prev => ({
        active: totalActive,
        sessions24h: prev?.sessions24h || totalActive * 40,
        pageviews24h: prev?.pageviews24h || totalActive * 120,
        bounceRate: prev?.bounceRate || 0.42,
        avgSession: prev?.avgSession || 96,
        topPage,
        topReferrer: 'google.com',
        country: topCountry,
        trend: [...(prev?.trend || []).slice(-79), totalActive],
        events: prev?.events || [],
      }));
      setError(null);
    } catch (err) {
      console.warn('GA4 error:', err.message);
      setError(err.message);
    }
  }, [propertyId, accessToken]);

  useEffect(() => {
    fetchGA();
    const id = setInterval(fetchGA, refreshInterval);
    return () => clearInterval(id);
  }, [fetchGA, refreshInterval]);

  return { gaData, error };
}

export function useServerAnalytics({ refreshInterval = 30000 } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics?t=' + Date.now());
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API: ${res.status}`);
      }
      const json = await res.json();
      setData(prev => ({
        active: json.active,
        pageviews24h: json.pageviews24h,
        sessions24h: json.sessions24h,
        bounceRate: json.bounceRate,
        avgSession: json.avgSession,
        topPage: json.topPage || '/',
        topReferrer: json.topReferrer || 'direct',
        country: json.country || 'US',
        trend: [...(prev?.trend || []).slice(-79), json.active],
        events: prev?.events || [],
      }));
      setError(null);
    } catch (err) {
      console.warn('Server analytics error:', err.message);
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, refreshInterval);
    return () => clearInterval(id);
  }, [fetchData, refreshInterval]);

  return { data, error };
}

export function moodFromAnalytics(d) {
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 23;
  const a = d.active;
  const session = d.avgSession || 0;
  const bounce = d.bounceRate || 0;

  const recent = (kind) => d.events.some(e => e.kind === kind && Date.now() - e.t < 30000);
  const recentConv = recent('conversion');
  const recentSpike = recent('spike');

  if (recentConv) return 'smitten';
  if (recentSpike && a > 80) return 'surprised';

  if (isNight && a < 4) return 'sleeping';
  if (isNight && a < 12) return 'drowsy';
  if (a < 3) return 'bored';

  // Focused mood: long sessions = engaged readers (matters MORE than bounce for blogs)
  // Personal narrative blog posts are often "read and leave satisfied" = high bounce + long session
  if (session > 120 && a > 5) return 'focused';

  // Only anxious if BOTH bounce is high AND sessions are short (real problem)
  if (bounce > 0.7 && session < 30 && a > 8) return 'anxious';

  if (a > 130) return 'dizzy';
  if (a > 95) return 'overwhelmed';
  if (a > 55) return 'excited';

  if (a > 30 && session > 90) return 'fancy';
  if (a > 20) return 'happy';

  if (a > 8 && a < 16) return 'curious';
  return 'content';
}
