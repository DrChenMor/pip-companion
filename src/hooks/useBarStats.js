import { useState, useEffect } from 'react';

// Slow-changing stats for Shimon's stations (/api/bar-stats, cached 5 min on
// the server). Keeps the last good result if a refresh fails.
export function useBarStats({ enabled = true, refreshInterval = 5 * 60 * 1000 } = {}) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/bar-stats');
        if (!res.ok) return;
        const json = await res.json();
        if (alive && !json.error) setStats(json);
      } catch { /* keep the last good stats */ }
    };
    load();
    const id = setInterval(load, refreshInterval);
    return () => { alive = false; clearInterval(id); };
  }, [enabled, refreshInterval]);

  return stats;
}
