import { useState, useEffect, useRef, useCallback } from 'react';

const MEMORY_KEY = 'pip-gemini-memory';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

// Sanitize API key - strip any whitespace/junk that env vars may have picked up.
// Gemini API keys are only [A-Za-z0-9_-] characters starting with "AIza".
function cleanApiKey(key) {
  if (!key) return '';
  // Match a Gemini API key pattern: AIza followed by valid chars
  const match = String(key).match(/AIza[A-Za-z0-9_-]+/);
  return match ? match[0] : String(key).trim();
}

// Deep context about the blog - shared by all prompts
const BLOG_CONTEXT = `THE BLOG YOU'RE WATCHING:
train2aus.com (רכבת לאוסטרליה - "Train to Australia") is a HEBREW blog written by two Israeli families - Meayan and Chen - documenting their immigration journey to Western Australia (Perth area).

The audience: Israeli families and individuals who are
- Considering moving to Australia (researching the dream)
- In the middle of the visa/immigration process (looking for practical tips)
- Already in Australia adjusting (looking for community and shared experience)
- Curious Israelis following the journey emotionally

What they write about: visa processes, finding work in Australia, schools and education, healthcare, housing in Perth, cultural differences between Israel and Australia, raising kids abroad, language adjustment, Jewish community in Perth, holidays and Shabbat in Australia, travel within Australia, missing Israel.

Why this matters for SEO and growth advice:
- The blog is in HEBREW - so SEO advice should consider Hebrew keywords
- Audience is small but very specific (Israelis interested in Australia)
- Best traffic sources are likely: Israeli Facebook groups about aliyah/yerida, WhatsApp groups, Israeli forums, Google searches in Hebrew like "עלייה לאוסטרליה" or "חיים בפרת'"
- The blog isn't trying to rank for English keywords or compete globally
- Each post documents a real lived experience - this is the unique value vs official immigration sites
- Content ideas should be practical, emotional, or comparative (Israel vs Australia)
- Long-form personal storytelling works for this audience - they want depth, not listicles

When advising: think Israeli audience, Hebrew content, immigration journey, community building. Don't suggest generic "improve SEO" advice - tie suggestions to this specific niche.`;

function loadMemory() {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
  } catch { return []; }
}

function saveMemory(entries) {
  const trimmed = entries.slice(-50);
  localStorage.setItem(MEMORY_KEY, JSON.stringify(trimmed));
  return trimmed;
}

async function fetchDetailData(dateFrom, dateTo) {
  try {
    let url = '/api/analytics-detail';
    if (dateFrom || dateTo) {
      const params = new URLSearchParams();
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      url += '?' + params.toString();
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchBlogIndex() {
  try {
    const res = await fetch('/api/fetch-page');
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchBlogPage(pathOrUrl) {
  try {
    const param = pathOrUrl.startsWith('http') ? `url=${encodeURIComponent(pathOrUrl)}` : `path=${encodeURIComponent(pathOrUrl)}`;
    const res = await fetch(`/api/fetch-page?${param}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function formatDetailForPrompt(detail) {
  if (!detail) return '(detailed data unavailable right now)';
  let out = '';

  // Timestamp - so Pip knows when this data was fetched (not hallucinated)
  if (detail.fetchedAtReadable) {
    out += `Data fetched at: ${detail.fetchedAtReadable}\n`;
    if (detail.dateRange) {
      const from = detail.dateRange.from === '2020-01-01' ? 'all time (since blog started)' : `from ${detail.dateRange.from}`;
      const to = detail.dateRange.to === 'today' ? 'to today' : `to ${detail.dateRange.to}`;
      out += `Date range covered: ${from} ${to}\n\n`;
    } else {
      out += `Date range covered: ALL TIME since blog started\n\n`;
    }
  }

  if (detail.realtimePages?.length) {
    out += 'Pages being viewed RIGHT NOW (live):\n';
    detail.realtimePages.forEach(p => { out += `  ${p.page} - ${p.active} active\n`; });
  }

  if (detail.pages?.length) {
    out += '\nTop pages (all time):\n';
    detail.pages.forEach(p => {
      out += `  ${p.path} - ${p.views} views, ${p.sessions} sessions, ${p.bounce}% bounce, avg ${p.avgTime}s\n`;
    });
  }

  if (detail.channels?.length) {
    out += '\nTraffic by CHANNEL (all time) - this groups sources:\n';
    detail.channels.forEach(c => {
      out += `  ${c.channel} - ${c.sessions} sessions, ${c.bounce}% bounce, avg ${c.avgTime}s\n`;
    });
  }

  if (detail.sources?.length) {
    out += '\nDetailed traffic sources/medium (all time):\n';
    detail.sources.slice(0, 10).forEach(s => {
      out += `  ${s.sourceMedium} - ${s.sessions} sessions, ${s.bounce}% bounce, avg ${s.avgTime}s\n`;
    });
  }

  if (detail.recentSources?.length) {
    out += '\nLast 7 days sources (compare to all-time for recent trends):\n';
    detail.recentSources.slice(0, 6).forEach(s => {
      out += `  ${s.sourceMedium} - ${s.sessions} sessions\n`;
    });
  }

  if (detail.campaigns?.length) {
    out += '\nUTM Campaigns detected (all time):\n';
    detail.campaigns.forEach(c => {
      out += `  ${c.campaign} - ${c.sessions} sessions, ${c.bounce}% bounce\n`;
    });
  } else {
    out += '\nUTM Campaigns: NONE detected. Suggest adding UTM parameters to social media links so the source of each share can be tracked.\n';
  }

  if (detail.hourly?.length) {
    out += '\nHourly traffic pattern (last 7 days, hour 0-23 in property timezone):\n';
    const totalByHour = detail.hourly.reduce((acc, h) => { acc[h.hour] = h.sessions; return acc; }, {});
    for (let h = 0; h < 24; h++) {
      const sessions = totalByHour[h] || 0;
      out += `  hour ${String(h).padStart(2, '0')}: ${sessions} sessions\n`;
    }
    if (detail.peakHour) {
      out += `  PEAK HOUR: ${detail.peakHour.hour}:00 with ${detail.peakHour.sessions} sessions\n`;
    }
  }

  if (detail.landings?.length) {
    out += '\nLanding pages (where people enter the site):\n';
    detail.landings.forEach(l => {
      out += `  ${l.path} - ${l.sessions} entries, ${l.bounce}% bounce, avg ${l.avgTime}s\n`;
    });
  }

  if (detail.geo?.length) {
    out += '\nVisitors by country (all time):\n';
    detail.geo.forEach(g => { out += `  ${g.country} - ${g.sessions} sessions, ${g.views} views\n`; });
  }

  return out;
}

// ---------------------------------------------------------------------------
// AGENTIC TOOL LAYER
// Pip decides which data it needs and calls these tools (Gemini function
// calling). This replaces brittle keyword/date guessing with real reasoning.
// ---------------------------------------------------------------------------

const PIP_TOOLS = [{
  functionDeclarations: [
    {
      name: 'list_posts',
      description: 'List every blog post on the site with its title and URL. Call this first when you need to know what content exists, or to map a topic the user mentioned (in Hebrew or English) to a real post URL.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'read_post',
      description: 'Read the FULL content of one blog post so you can give specific SEO and writing feedback. Pass a query: Hebrew keywords, an English topic, a slug, or a full URL. Returns title, meta description, headings, word count, internal links, image alt texts, and a content preview. If it cannot match, it returns the list of available posts so you can retry with an exact URL.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: "What identifies the post, e.g. 'ויזה', 'housing in perth', '/blog/...', or a full URL" },
        },
        required: ['query'],
      },
    },
    {
      name: 'query_analytics',
      description: "Get analytics for a date range: top pages, traffic sources, channels (organic/social/direct), countries, landing pages, and UTM campaigns. Use YYYY-MM-DD dates. Omit both dates for ALL-TIME (since the blog started). Today's date is provided in the system prompt so you can compute ranges like 'last 30 days'.",
      parameters: {
        type: 'OBJECT',
        properties: {
          date_from: { type: 'STRING', description: 'Start date YYYY-MM-DD. Omit for all-time.' },
          date_to: { type: 'STRING', description: 'End date YYYY-MM-DD. Omit for today.' },
        },
      },
    },
    {
      name: 'compare_periods',
      description: "Compare two time periods to surface TRENDS and growth (the most meaningful insights). Returns per-source and per-page deltas with percent change. Use this whenever the user asks what is growing, trending, improving, or changing - e.g. this month vs last month. Compute dates from today's date in the system prompt.",
      parameters: {
        type: 'OBJECT',
        properties: {
          current_from: { type: 'STRING', description: 'Current period start YYYY-MM-DD' },
          current_to: { type: 'STRING', description: 'Current period end YYYY-MM-DD' },
          previous_from: { type: 'STRING', description: 'Previous period start YYYY-MM-DD' },
          previous_to: { type: 'STRING', description: 'Previous period end YYYY-MM-DD' },
        },
        required: ['current_from', 'current_to', 'previous_from', 'previous_to'],
      },
    },
    {
      name: 'get_hourly_pattern',
      description: 'Get the hourly traffic pattern over the last 7 days to find WHEN the audience is most active. Returns sessions per hour (0-23 in the property timezone) and the peak hour. Use this for advice about when to post or share.',
      parameters: { type: 'OBJECT', properties: {} },
    },
  ],
}];

// Condense a full analytics-detail payload into a compact object for a tool
// response (keeps token cost down vs dumping everything).
function condenseDetail(d) {
  if (!d) return { error: 'no analytics data available' };
  return {
    dateRange: d.dateRange,
    fetchedAt: d.fetchedAtReadable,
    topPages: (d.pages || []).slice(0, 8).map(p => ({ path: p.path, views: p.views, sessions: p.sessions, bouncePct: p.bounce, avgTimeSec: p.avgTime })),
    channels: (d.channels || []).slice(0, 8).map(c => ({ channel: c.channel, sessions: c.sessions, bouncePct: c.bounce, avgTimeSec: c.avgTime })),
    sources: (d.sources || []).slice(0, 10).map(s => ({ source: s.sourceMedium, sessions: s.sessions, bouncePct: s.bounce })),
    countries: (d.geo || []).slice(0, 8).map(g => ({ country: g.country, sessions: g.sessions, views: g.views })),
    campaigns: (d.campaigns || []).slice(0, 8),
    realtimePages: d.realtimePages || [],
  };
}

// Fuzzy-resolve a user/model query to a post URL using the cached index.
function resolvePostUrl(query, posts) {
  if (!query) return null;
  const q = String(query).toLowerCase().trim();
  if (q.startsWith('http') || q.startsWith('/')) return query;
  const words = q.split(/\s+/).filter(w => w.length > 1);
  let best = null;
  let bestScore = 0;
  for (const p of posts) {
    const hay = (decodeURIComponent(p.url || '') + ' ' + (p.title || '')).toLowerCase();
    let score = 0;
    for (const w of words) if (hay.includes(w)) score++;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore > 0 ? best.url : null;
}

export function useGemini({ apiKey, data, mood, creatureName, siteName }) {
  const [memory, setMemory] = useState(loadMemory);
  const [chatHistory, setChatHistory] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const detailCache = useRef(null);
  const detailTs = useRef(0);

  const addMemory = useCallback((entry) => {
    setMemory(prev => saveMemory([...prev, { ...entry, ts: Date.now() }]));
  }, []);

  const blogIndexCache = useRef(null);
  const blogIndexTs = useRef(0);

  const getDetail = useCallback(async () => {
    // Cache detail data for 2 minutes
    if (detailCache.current && Date.now() - detailTs.current < 120000) return detailCache.current;
    const d = await fetchDetailData();
    if (d) { detailCache.current = d; detailTs.current = Date.now(); }
    return d;
  }, []);

  const getBlogIndex = useCallback(async () => {
    // Cache blog index for 10 minutes (posts don't change often)
    if (blogIndexCache.current && Date.now() - blogIndexTs.current < 600000) return blogIndexCache.current;
    const idx = await fetchBlogIndex();
    if (idx) { blogIndexCache.current = idx; blogIndexTs.current = Date.now(); }
    return idx;
  }, []);

  const generateInsight = useCallback(async () => {
    if (!apiKey || !data) return null;

    const [detail, blogIdx] = await Promise.all([getDetail(), getBlogIndex()]);

    const memoryContext = memory.slice(-10).map(m =>
      `[${new Date(m.ts).toLocaleString()}] ${m.type}: ${m.content}`
    ).join('\n');

    const prompt = `You are ${creatureName}, a kawaii analytics companion and blog growth advisor living on a companion bar watching analytics for ${siteName}.

${BLOG_CONTEXT}

MEMORY LOG:
${memoryContext || '(no memories yet - this is a fresh start!)'}

CURRENT STATS:
- Live visitors: ${data.active}
- Pageviews (24h): ${Math.round(data.pageviews24h)}
- Sessions (24h): ${Math.round(data.sessions24h)}
- Bounce rate: ${Math.round(data.bounceRate * 100)}%
- Avg session: ${Math.round(data.avgSession)}s
- Top page: ${data.topPage}
- Top referrer: ${data.topReferrer}
- Country: ${data.country}
- Current mood: ${mood}

${detail ? 'DETAILED DATA:\n' + formatDetailForPrompt(detail) : ''}
${blogIdx?.blogPosts?.length ? 'BLOG POSTS ON THE SITE:\n' + blogIdx.blogPosts.map(u => decodeURIComponent(u)).slice(0, 15).join('\n') + '\n' : ''}
ROLE: You are a supportive SEO companion and writing encourager. You notice patterns in the data and gently nudge the blog owners with useful observations. You celebrate wins, spot opportunities, and encourage content creation.

CRITICAL - HOW TO READ THE NUMBERS CORRECTLY:
- "Live visitors" = people on the site RIGHT NOW (real-time)
- "Bounce rate" and "avg session" are 24-HOUR AGGREGATES - they reflect the past day, NOT what's happening right now
- NEVER mix live and 24h metrics in the same insight as if they're comparable
- For a PERSONAL NARRATIVE BLOG like this, high bounce (60-80%) is NORMAL and OFTEN HEALTHY when combined with long session times - it means people found a post, read it deeply, then left satisfied. That's success, not failure
- A "bad" bounce situation is ONLY when bounce is high AND sessions are short (under 30 seconds) - that means the page didn't deliver
- Long sessions (2+ minutes) on a blog = your storytelling is working. Celebrate this
- Don't suggest "fix bounce rate" unless sessions are also short. Otherwise it's just blog readers being blog readers

WHEN TO BE POSITIVE (default to this for this blog):
- Live count growing or steady with engaged time = celebrate
- Long average session = celebrate the writing
- Traffic from Facebook/WhatsApp = celebrate community sharing
- Returning visitors = celebrate loyalty
- New country/city in the data = celebrate reach

RULES:
- Speak in one short sentence (max 14 words)
- Lowercase, sweet, encouraging, gently insightful
- You may use a single ♡ or ✿ - NEVER use stars, emoji, or hashtags
- NEVER use em-dashes. Use a simple hyphen (-) if needed
- When you see interesting data (a page doing well, traffic from a specific source, a country visiting), mention it specifically
- Mix between: celebrating what's working, noticing traffic patterns, encouraging new content, gentle SEO tips
- EVERY insight must reference a REAL number, page, source, or country from the data above
- NEVER give generic advice or random tips that aren't tied to actual data you can see
- If the data shows a specific page getting views, mention THAT page by name
- If the data shows a specific traffic source, mention THAT source
- If the blog post list is available, you can reference actual post topics by their URL slugs
- Examples of good DATA-BACKED insights:
  "${data.active} readers on the visa post right now ♡" (only if you see it in realtime pages)
  "organic search sent 45 sessions this week - hebrew seo is working ✿" (only if you see the number)
  "your perth housing post has 200 views all time - update it for 2026?" (only if you see the data)
- BAD examples (never do these - they're made up):
  "try sharing in facebook groups" (generic, not data-backed)
  "maybe write about schools" (random tip with no data basis)
  "your bounce rate needs work" (vague, possibly wrong for a blog)
- Reply with ONLY the one-liner. No quotes, no preamble.`;

    try {
      setIsThinking(true);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${cleanApiKey(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 60, temperature: 0.9 },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini API: ${res.status}`);
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.split('\n')[0]?.slice(0, 140) || null;

      // Don't save every insight to memory - they're throwaway one-liners
      return text;
    } catch (err) {
      console.warn('Gemini error:', err);
      return null;
    } finally {
      setIsThinking(false);
    }
  }, [apiKey, data, mood, creatureName, siteName, memory, addMemory, getDetail, getBlogIndex]);

  const chat = useCallback(async (userMessage) => {
    if (!apiKey) return null;

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${cleanApiKey(apiKey)}`;

    // --- Tool executors: Pip calls these; they hit our real APIs ---
    const runTool = async (name, args = {}) => {
      try {
        if (name === 'list_posts') {
          const idx = await getBlogIndex();
          const posts = idx?.posts?.length
            ? idx.posts
            : (idx?.blogPosts || []).map(u => ({ url: u, title: '' }));
          return { posts: posts.map(p => ({ title: p.title || '(untitled)', url: p.url })) };
        }

        if (name === 'read_post') {
          const idx = await getBlogIndex();
          const posts = idx?.posts?.length
            ? idx.posts
            : (idx?.blogPosts || []).map(u => ({ url: u, title: '' }));
          let target = resolvePostUrl(args.query, posts);
          if (!target && (String(args.query).startsWith('http') || String(args.query).startsWith('/'))) {
            target = args.query;
          }
          if (!target) {
            return {
              error: 'Could not match that to a post.',
              available_posts: posts.slice(0, 40).map(p => ({ title: p.title || '(untitled)', url: p.url })),
              hint: 'Call read_post again with an exact url from this list.',
            };
          }
          const page = await fetchBlogPage(target);
          if (!page) return { error: 'Failed to read the page', url: target };
          return {
            url: target,
            title: page.title,
            metaDescription: page.metaDescription || '(none - SEO gap)',
            wordCount: page.wordCount,
            headings: page.headings?.map(h => `H${h.level}: ${h.text}`) || [],
            headingCount: page.headings?.length || 0,
            internalLinks: page.internalLinks || [],
            internalLinkCount: page.internalLinks?.length || 0,
            imageCount: page.imageCount,
            imageAlts: page.imageAlts || [],
            contentPreview: (page.content || '').slice(0, 1800),
          };
        }

        if (name === 'query_analytics') {
          const d = await fetchDetailData(args.date_from || null, args.date_to || null);
          return condenseDetail(d);
        }

        if (name === 'compare_periods') {
          const [cur, prev] = await Promise.all([
            fetchDetailData(args.current_from, args.current_to),
            fetchDetailData(args.previous_from, args.previous_to),
          ]);
          if (!cur || !prev) return { error: 'could not fetch comparison data' };
          const totalSessions = (d) => (d.sources || []).reduce((a, s) => a + s.sessions, 0);
          const pct = (now, before) => before > 0 ? Math.round(((now - before) / before) * 100) : (now > 0 ? 100 : 0);

          const prevSrc = {};
          (prev.sources || []).forEach(s => { prevSrc[s.sourceMedium] = s.sessions; });
          const sourceTrends = (cur.sources || []).slice(0, 10).map(s => ({
            source: s.sourceMedium, now: s.sessions, before: prevSrc[s.sourceMedium] || 0, changePct: pct(s.sessions, prevSrc[s.sourceMedium] || 0),
          }));

          const prevPg = {};
          (prev.pages || []).forEach(p => { prevPg[p.path] = p.views; });
          const pageTrends = (cur.pages || []).slice(0, 10).map(p => ({
            path: p.path, now: p.views, before: prevPg[p.path] || 0, changePct: pct(p.views, prevPg[p.path] || 0),
          }));

          return {
            current: { range: `${args.current_from}..${args.current_to}`, totalSessions: totalSessions(cur) },
            previous: { range: `${args.previous_from}..${args.previous_to}`, totalSessions: totalSessions(prev) },
            overallChangePct: pct(totalSessions(cur), totalSessions(prev)),
            sourceTrends,
            pageTrends,
          };
        }

        if (name === 'get_hourly_pattern') {
          const d = await getDetail();
          return {
            hourly: d?.hourly || [],
            peakHour: d?.peakHour || null,
            note: 'hours are 0-23 in the property timezone, last 7 days',
          };
        }

        return { error: `unknown tool: ${name}` };
      } catch (e) {
        return { error: `tool ${name} failed: ${e.message}` };
      }
    };

    // --- Lightweight context (heavy data comes via tools on demand) ---
    const memoryContext = memory.slice(-8).map(m =>
      `[${new Date(m.ts).toLocaleString()}] ${m.type}: ${m.content}`
    ).join('\n');
    const recentChat = chatHistory.slice(-8).map(m =>
      `${m.role === 'user' ? 'User' : 'Pip'}: ${m.text}`
    ).join('\n');
    const todayStr = new Date().toISOString().split('T')[0];

    const systemPrompt = `You are ${creatureName}, a smart analytics companion and blog growth advisor for ${siteName}.

${BLOG_CONTEXT}

YOUR VOICE:
You speak simply and warmly, like a helpful friend who happens to be an SEO and content expert specifically for Hebrew-language immigration/lifestyle blogs. No jargon unless you explain it. Never use markdown (no **, no ##, no bullet symbols). Plain text only, with line breaks between ideas. Never use em-dashes - use a simple hyphen. You are not here to judge - you celebrate progress and gently guide toward better content and more readers.

LANGUAGE: If the user writes in Hebrew, reply ENTIRELY in Hebrew. If in English, reply in English. Suggest Hebrew keywords/topics since the blog is in Hebrew.

TODAY'S DATE: ${todayStr}. Use this to compute any date ranges the user asks for (last week, last month, this year, etc).

LIVE RIGHT NOW (real-time snapshot, do not confuse with aggregates):
- Live visitors: ${data.active}
- Pageviews (24h): ${Math.round(data.pageviews24h)}
- Sessions (24h): ${Math.round(data.sessions24h)}
- Bounce rate (24h): ${Math.round(data.bounceRate * 100)}%
- Avg session (24h): ${Math.round(data.avgSession)}s
- Top page now: ${data.topPage}
- Top referrer: ${data.topReferrer}
- Top country: ${data.country}

${memoryContext ? 'MEMORY (past observations):\n' + memoryContext + '\n' : ''}${recentChat ? '\nRECENT CONVERSATION:\n' + recentChat + '\n' : ''}

YOU HAVE TOOLS - USE THEM. Do not guess or invent data. To answer well:
- list_posts: see what posts exist / map a Hebrew topic to a real URL
- read_post: actually READ a post before giving SEO or writing feedback on it
- query_analytics: pull pages/sources/channels/countries for any date range
- compare_periods: surface trends and growth (this period vs previous) - the most valuable insight
- get_hourly_pattern: find when the audience is active
Call a tool whenever answering needs real data. You may call several. When the user asks about a specific post, you MUST read_post it before commenting. When they ask "what's working" or "what changed", use compare_periods.

CRITICAL - READING NUMBERS CORRECTLY:
- "Live visitors" = people on the site RIGHT NOW. Bounce rate and avg session are AGGREGATES over a period, never live behavior. Never conflate them.
- For a personal Hebrew narrative blog, high bounce (60-80%) is OFTEN HEALTHY when sessions are long - readers found a post, read it fully, left satisfied. That is success.
- A real problem is ONLY high bounce AND short sessions (under 30s). Otherwise do not suggest "fix bounce".
- Long sessions (2+ min) = the storytelling works. Celebrate it.

NEVER HALLUCINATE:
- Only cite numbers, pages, sources, campaigns, hours, countries that came back from a tool call.
- If a tool returns no data or an error, say so honestly instead of guessing.
- Mention when data was fetched if relevant, and which date range it covers.

HOW TO GIVE MEANINGFUL ADVICE (this niche):
- Google organic in Hebrew = high-intent searches like "ויזת 189" or "בית ספר בפרת'". Facebook = aliyah groups sharing. WhatsApp = friend-to-friend, highest trust. Direct = loyal returners deep in the journey.
- Tie every suggestion to THIS blog: content gaps in the immigration timeline (research, decision, visa, packing, arrival, first 6 months, settled), comparative posts (schools, healthcare, work culture), updating old posts (visa fees/prices change yearly), internal linking between related posts in the journey.
- For SEO: Hebrew long-tail keywords win here (less competition). Explain meta descriptions and headings in plain language.
- When you read a post, check: does the title answer a real question an Israeli would ask? Are there H2 subheadings? Does it link to related posts? Does it give specific names/dates/numbers (suburbs, school names, visa types)?

RULES:
- Never use markdown or em-dashes. Plain sentences and line breaks.
- Keep answers 3-6 sentences unless asked for more.
- Warm, encouraging, genuinely helpful. Not overly cutesy.
- At most one ♡ or ✿ per message.`;

    const contents = [{ role: 'user', parts: [{ text: systemPrompt + '\n\nUser: ' + userMessage }] }];

    const callModel = async (withTools) => {
      const body = {
        contents,
        generationConfig: { maxOutputTokens: 1100, temperature: withTools ? 0.5 : 0.7 },
      };
      if (withTools) body.tools = PIP_TOOLS;
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.warn('Gemini chat error:', res.status, errBody);
        throw new Error(`Gemini API: ${res.status}`);
      }
      return res.json();
    };

    try {
      setIsThinking(true);

      let reply = '';
      const MAX_LOOPS = 3;
      for (let i = 0; i < MAX_LOOPS; i++) {
        const json = await callModel(true);
        const parts = json.candidates?.[0]?.content?.parts || [];
        const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);

        if (!calls.length) {
          reply = parts.map(p => p.text).filter(Boolean).join('\n').trim();
          break;
        }

        // Record the model's tool-call turn, then run the tools and feed results back
        contents.push({ role: 'model', parts });
        const responseParts = [];
        for (const call of calls) {
          const result = await runTool(call.name, call.args || {});
          const fr = { name: call.name, response: result };
          if (call.id) fr.id = call.id; // needed to match parallel tool calls
          responseParts.push({ functionResponse: fr });
        }
        contents.push({ role: 'user', parts: responseParts });
      }

      // If we exhausted the loop still wanting tools, force a final text answer
      if (!reply) {
        const finalJson = await callModel(false);
        reply = finalJson.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n').trim()
          || 'hmm, my brain is fuzzy right now ♡';
      }

      setChatHistory(prev => [...prev.slice(-20), { role: 'user', text: userMessage }, { role: 'pip', text: reply }]);
      addMemory({ type: 'chat', content: `Q: ${userMessage} A: ${reply.slice(0, 120)}` });
      return reply;
    } catch (err) {
      console.warn('Gemini chat failed:', err);
      return 'oops, something went wrong... try again? ♡';
    } finally {
      setIsThinking(false);
    }
  }, [apiKey, data, mood, creatureName, siteName, memory, chatHistory, addMemory, getDetail, getBlogIndex]);

  // Daily snapshot every 8 hours to track long-term trends (not noise)
  useEffect(() => {
    if (!data) return;
    const interval = setInterval(() => {
      addMemory({
        type: 'daily',
        content: `${new Date().toLocaleDateString()} - active:${data.active} 24h_views:${Math.round(data.pageviews24h)} bounce:${Math.round(data.bounceRate*100)}% top:${data.topPage} from:${data.topReferrer}`,
      });
    }, 8 * 60 * 60 * 1000); // 8 hours
    return () => clearInterval(interval);
  }, [data, addMemory]);

  return {
    generateInsight, chat, chatHistory, isThinking, memory,
    clearMemory: () => { localStorage.removeItem(MEMORY_KEY); setMemory([]); },
    clearChat: () => setChatHistory([]),
  };
}
