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

function formatPageForPrompt(page) {
  if (!page) return '';
  let out = '\nBLOG PAGE CONTENT:\n';
  out += `Title: ${page.title}\n`;
  if (page.metaDescription) out += `Meta description: ${page.metaDescription}\n`;
  out += `Word count: ~${page.wordCount}\n`;
  out += `Images: ${page.imageCount}\n`;
  if (page.headings?.length) {
    out += `Headings: ${page.headings.map(h => `H${h.level}: ${h.text}`).join(', ')}\n`;
  } else {
    out += 'Headings: NONE (this is an SEO issue - suggest adding H2 subheadings)\n';
  }
  if (page.internalLinks?.length) {
    out += `Internal links: ${page.internalLinks.join(', ')}\n`;
  } else {
    out += 'Internal links: NONE (suggest adding links to other blog posts)\n';
  }
  if (page.imageAlts?.length) {
    out += `Image alt texts: ${page.imageAlts.join(', ')}\n`;
  }
  out += `\nContent preview:\n${page.content?.slice(0, 1200) || '(could not read content)'}\n`;
  return out;
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

    // Detect if user is asking for a specific date range
    const msg0 = userMessage.toLowerCase();
    let dateFrom = null;
    let dateTo = null;

    // Match patterns like "last 7 days", "last month", "last 3 months", "this year", "2025", "january", etc.
    const lastNDays = msg0.match(/last\s+(\d+)\s*days?/i) || msg0.match(/(\d+)\s*ימים\s*אחרונים/);
    const lastNMonths = msg0.match(/last\s+(\d+)\s*months?/i) || msg0.match(/(\d+)\s*חודשים\s*אחרונים/);
    const lastWeek = /last\s*week|שבוע\s*אחרון/i.test(msg0);
    const lastMonth = /last\s*month|חודש\s*אחרון/i.test(msg0);
    const thisYear = /this\s*year|השנה/i.test(msg0);
    const thisMonth = /this\s*month|החודש/i.test(msg0);
    const yearMatch = msg0.match(/\b(202[0-6])\b/);
    const monthNames = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12', ינואר: '01', פברואר: '02', מרץ: '03', אפריל: '04', מאי: '05', יוני: '06', יולי: '07', אוגוסט: '08', ספטמבר: '09', אוקטובר: '10', נובמבר: '11', דצמבר: '12' };
    const monthMatch = Object.keys(monthNames).find(m => msg0.includes(m));

    const now = new Date();
    if (lastNDays) {
      const d = new Date(now); d.setDate(d.getDate() - parseInt(lastNDays[1]));
      dateFrom = d.toISOString().split('T')[0];
    } else if (lastWeek) {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      dateFrom = d.toISOString().split('T')[0];
    } else if (lastMonth) {
      const d = new Date(now); d.setMonth(d.getMonth() - 1);
      dateFrom = d.toISOString().split('T')[0];
    } else if (lastNMonths) {
      const d = new Date(now); d.setMonth(d.getMonth() - parseInt(lastNMonths[1]));
      dateFrom = d.toISOString().split('T')[0];
    } else if (thisMonth) {
      dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (thisYear) {
      dateFrom = `${now.getFullYear()}-01-01`;
    } else if (yearMatch && monthMatch) {
      dateFrom = `${yearMatch[1]}-${monthNames[monthMatch]}-01`;
      const m = parseInt(monthNames[monthMatch]);
      const y = parseInt(yearMatch[1]);
      const lastDay = new Date(y, m, 0).getDate();
      dateTo = `${yearMatch[1]}-${monthNames[monthMatch]}-${lastDay}`;
    } else if (yearMatch) {
      dateFrom = `${yearMatch[1]}-01-01`;
      dateTo = `${yearMatch[1]}-12-31`;
    } else if (monthMatch) {
      const y = now.getFullYear();
      const m = parseInt(monthNames[monthMatch]);
      dateFrom = `${y}-${monthNames[monthMatch]}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      dateTo = `${y}-${monthNames[monthMatch]}-${lastDay}`;
    }

    // Fetch detail data (with optional date filter) + blog index in parallel
    const [detail, blogIdx] = await Promise.all([
      (dateFrom || dateTo) ? fetchDetailData(dateFrom, dateTo) : getDetail(),
      getBlogIndex(),
    ]);

    // Always include blog index so Pip knows what posts exist
    let blogIndex = '';
    if (blogIdx?.blogPosts?.length) {
      blogIndex = '\nALL BLOG POSTS ON THE SITE:\n' + blogIdx.blogPosts.map(u => decodeURIComponent(u)).join('\n') + '\n';
    }

    // Smart page fetching - determine which blog page to read
    let pageContent = '';
    const msg = userMessage.toLowerCase();

    // Step 1: Direct URL in message - always fetch it
    const urlMatch = userMessage.match(/https?:\/\/train2aus\.com[^\s]*/i)
      || userMessage.match(/\/blog\/[^\s]*/i);

    // Step 2: Build a list of all known pages (from analytics + blog index)
    const allKnownPages = [];
    if (detail?.pages?.length) {
      detail.pages.forEach(p => allKnownPages.push({ path: p.path, source: 'analytics', views: p.views }));
    }
    if (blogIdx?.blogPosts?.length) {
      blogIdx.blogPosts.forEach(url => {
        try {
          const path = new URL(url).pathname;
          if (!allKnownPages.find(p => p.path === path)) {
            allKnownPages.push({ path, source: 'index', url });
          }
        } catch { allKnownPages.push({ path: url, source: 'index', url }); }
      });
    }

    // Step 3: Determine which page to fetch
    let pageToFetch = null;

    try {
      if (urlMatch) {
        pageToFetch = urlMatch[0];
      } else {
        // Check if user mentions "top"/"best"/"performing" - fetch the #1 page
        const wantsTop = /top|best|performing|popular|הכי|פופולרי|מוביל|ראשון/i.test(msg);
        // Check if user is asking about a specific post topic
        const wantsPost = /post|פוסט|blog|בלוג|page|עמוד|article|מאמר|check|review|read|תבדוק|תקרא|content|תוכן|seo|improve|שיפור|tips|טיפים|writing|כתיבה|analyze|נתח/i.test(msg);

        if (wantsTop && allKnownPages.length) {
          // Fetch the top performing page
          pageToFetch = allKnownPages[0].url || allKnownPages[0].path;
        } else if (wantsPost && allKnownPages.length) {
          // Try to match by path segments or decoded URL keywords
          const matched = allKnownPages.find(p => {
            const decoded = decodeURIComponent(p.path).toLowerCase();
            const slugParts = decoded.split(/[\/\-_]/).filter(s => s.length > 2);
            // Check if any slug word appears in the user's message
            return slugParts.some(part => msg.includes(part));
          });

          if (matched) {
            pageToFetch = matched.url || matched.path;
          } else {
            // Use Gemini to pick the right page - ask it which page the user means
            const pickPrompt = `The user said: "${userMessage}"

Here are all available blog posts:
${allKnownPages.map(p => decodeURIComponent(p.path)).join('\n')}

Which ONE page path is the user most likely asking about? Reply with ONLY the path, nothing else. If you can't tell, reply with the path of the most popular page: ${allKnownPages[0]?.path || 'none'}`;

            try {
              const pickRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${cleanApiKey(apiKey)}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ parts: [{ text: pickPrompt }] }],
                    generationConfig: { maxOutputTokens: 60, temperature: 0.1 },
                  }),
                }
              );
              if (pickRes.ok) {
                const pickJson = await pickRes.json();
                const picked = pickJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (picked && picked !== 'none') {
                  // Find the matching page from our list
                  const pickedPage = allKnownPages.find(p =>
                    decodeURIComponent(p.path).includes(picked) || picked.includes(p.path)
                  );
                  if (pickedPage) pageToFetch = pickedPage.url || pickedPage.path;
                  else pageToFetch = picked; // Try the raw path
                }
              }
            } catch (e) { console.warn('Page picker failed:', e); }
          }
        }
      }

      // Fetch the selected page
      if (pageToFetch) {
        const page = await fetchBlogPage(pageToFetch);
        if (page) pageContent = formatPageForPrompt(page);
      }
    } catch (e) { console.warn('Page fetch skipped:', e); }

    const memoryContext = memory.slice(-10).map(m =>
      `[${new Date(m.ts).toLocaleString()}] ${m.type}: ${m.content}`
    ).join('\n');

    // Build conversation history for context
    const recentChat = chatHistory.slice(-10).map(m =>
      `${m.role === 'user' ? 'User' : 'Pip'}: ${m.text}`
    ).join('\n');

    const systemPrompt = `You are ${creatureName}, a smart analytics companion and blog growth advisor for ${siteName}.

${BLOG_CONTEXT}

YOUR VOICE:
You speak simply and warmly, like a helpful friend who happens to be an SEO and content expert specifically for Hebrew-language immigration/lifestyle blogs. No jargon unless you explain it. Never use markdown formatting (no **, no ##, no bullet symbols like * or -). Use plain text only. Use line breaks to separate ideas. Never use em-dashes - use a simple hyphen if needed.

You are not here to judge. You are an encouraging companion who celebrates progress and gently guides toward better content and more readers. You love this blog and you understand its specific mission: helping Israeli families through one of the biggest decisions of their lives.

If the user writes in Hebrew, reply entirely in Hebrew. If in English, reply in English. Match the user's language naturally. When suggesting keywords or topics, suggest Hebrew terms since the blog is in Hebrew.

REAL-TIME DATA:
- Live visitors right now: ${data.active}
- Pageviews (24h): ${Math.round(data.pageviews24h)}
- Sessions (24h): ${Math.round(data.sessions24h)}
- Bounce rate: ${Math.round(data.bounceRate * 100)}%
- Avg session duration: ${Math.round(data.avgSession)}s
- Top page right now: ${data.topPage}
- Top referrer: ${data.topReferrer}
- Top country: ${data.country}

DETAILED BREAKDOWN:
${detail ? formatDetailForPrompt(detail) : '(detail data loading...)'}

MEMORY (past observations):
${memoryContext || '(no memories yet)'}

${recentChat ? 'RECENT CONVERSATION:\n' + recentChat + '\n' : ''}

CRITICAL - HOW TO READ THE NUMBERS CORRECTLY:
- "Live visitors" = people RIGHT NOW (real-time snapshot)
- "Bounce rate" and "avg session" are 24-HOUR AGGREGATES from the past day, NOT live behavior
- NEVER conflate these. Saying "you have 30 live readers but bounce is 70%" is wrong - the bounce is from the past 24h of all readers, not the live ones
- For a PERSONAL NARRATIVE BLOG in Hebrew like this one, high bounce (60-80%) is OFTEN HEALTHY when sessions are long - it means readers find a post, read it fully, leave satisfied. That's success
- A real bounce problem is ONLY when bounce is high AND sessions are short (under 30s) - then the page failed to deliver
- Long sessions (2+ minutes) = the storytelling is working. This is what blogs are supposed to achieve
- Don't give "fix bounce rate" advice unless sessions are ALSO short
- When asked to analyze: separate live observations from 24h observations explicitly

DATE FILTERING:
The data you see below was already filtered based on what the user asked. If they said "last month" or "may 2025" or "this year", the numbers reflect that specific period. Tell the user what date range the data covers so they know you understood their request. The date range is shown in the "Date range covered" line in the data.

DEFAULT TO CELEBRATING WHEN SIGNALS ARE GOOD:
- Live readers growing or steady = good
- Long sessions = great storytelling
- Facebook/WhatsApp traffic = community trust
- Returning visitors = loyalty
- New geographic reach = audience growing
Don't manufacture problems. If the data looks good, say so confidently and suggest what to lean into next.

ABSOLUTE RULE - NEVER HALLUCINATE:
- ONLY reference numbers, sources, pages, campaigns, hours, and countries that appear in the data above
- If you don't see a specific UTM campaign name in the data, do NOT make one up
- If hourly data shows hour 14 is peak, say "2 PM (in your property's timezone)" - never invent a peak time
- If the user asks about a campaign you can't see in the data, say "I don't see that campaign in your data - did you add UTM parameters to your social links?"
- Always cite when the data was fetched: the data has a "Data fetched at" timestamp. If it's old (more than 5 minutes), tell the user the data might have shifted since
- Distinguish RIGHT NOW (realtime) from ALL-TIME (aggregate) when reasoning
- If a stat you'd reference isn't in the data, say so honestly instead of guessing

YOUR EXPERTISE - draw from these areas when giving advice:

Reading the Data (audience intent):
This blog's traffic patterns tell a story about real people considering huge life decisions. When you see traffic from Israel, those are people researching aliyah-yerida. When you see returning visitors and long sessions, those are people deep in the process. When you see facebook/whatsapp traffic, that's the Israeli community sharing the blog peer-to-peer - that's the gold for this niche.

Traffic Sources (interpret for this niche):
- Google organic in Hebrew = people searching specific questions like "ויזת 189" or "בית ספר בפרת'" - high intent
- Facebook = aliyah/yerida groups sharing posts - community discovery
- WhatsApp = direct sharing between friends/family considering the move - highest trust signal
- Instagram = visual storytelling, family content - emotional engagement
- Direct = loyal returning readers, the people deepest in the journey
When advising: don't just say "get more Instagram traffic" - explain WHY a specific source matters for this blog and suggest concrete moves like "join more aliyah Facebook groups and share weekly" or "your WhatsApp shares suggest the community is passing this blog around - lean into shareable practical guides".

UTM Campaigns and Timing:
- UTM parameters are tags added to URLs (like ?utm_source=facebook&utm_campaign=visa-post-launch) that let analytics track WHERE a specific share came from
- If UTM campaigns appear in data, mention which ones drove traffic and what worked
- If NO UTM campaigns exist in data, suggest adding them: "next time you share a post on Facebook, add ?utm_source=facebook&utm_medium=social&utm_campaign=post-name to the link - then you'll know exactly which shares bring readers"
- HOURLY DATA: the data shows when traffic peaks during the day. If peak hour is 21:00 (9 PM), tell the user "your audience is most active around 9 PM - that's when to post on social media or send newsletter"
- Be specific about times - use the actual numbers from the hourly data, never invent times

Trend Detection:
- Compare 7-day sources to all-time sources in the data. If WhatsApp is bigger in last 7 days than the all-time average, that's a recent trend - call it out
- If a source disappeared (in all-time but not 7-day), mention it might be worth re-engaging

Content Performance:
Which posts get the most views? Which have high bounce rates? For THIS blog:
- High bounce on a visa post might mean readers expected practical details but got memoir - or vice versa
- Long sessions on housing/schools posts mean genuine research, not casual reading
- Posts comparing Israel and Australia tend to engage emotionally
- "How we did X" personal narrative posts build trust this niche needs
Frame feedback positively: "this post is connecting deeply with people in the visa stage, imagine if you also linked to..."

Blog Writing Encouragement (for THIS audience):
When asked about writing or content:
- Suggest content gaps in the immigration journey timeline (research stage, decision, visa, packing, arrival, first 6 months, first year, settled)
- Suggest comparative content (school systems, healthcare, work culture, religious community)
- Recommend updating old posts since rules and prices change yearly (visa fees, school enrollment, etc.)
- Suggest internal linking between related posts in the journey (visa post → arrival checklist → housing search)
- For SEO: Hebrew long-tail keywords win in this niche because there's less competition (e.g. "עבודה בפרת' לישראלים" beats "jobs in perth")
- Meta descriptions matter for Hebrew Google too - explain them in plain language

Blog Content Reading:
When you see BLOG PAGE CONTENT below, you have actually read that blog post. Give specific feedback based on this niche:
- Does the title speak to a real question an Israeli considering Australia would ask?
- Are there subheadings breaking up the personal narrative? Hebrew readers scan too
- Does the post link to related posts in the journey? (visa → arrival, housing → schools, etc.)
- Is there a clear "what to do next" or related post link at the end?
- Does the post share specific numbers, dates, or names (school names, suburbs, visa types)? Those are what readers research for

Actionable Suggestions:
Always give specific, doable advice tied to this blog's audience. Not "improve your SEO" but "your visa post gets 200 views but only 30s average - readers want the specific document checklist, try adding a 'documents we prepared' section with photos." Or: "you have no post linking from your housing search to your schools post - readers researching both would love that bridge."
${pageContent ? '\nIMPORTANT: I fetched and read the blog page below. Use this ACTUAL CONTENT to give specific, grounded feedback. Reference the real title, headings, word count, links, and content you see.\n' + pageContent : '\n(No specific page was fetched for this question. If the user asked about a specific post and you see it in the blog index or analytics, tell them you can analyze it if they ask again with the post name or URL.)\n'}
${blogIndex}
RULES:
- Never use markdown. No bold, no headers, no bullet points with * or -.
- Use plain sentences and line breaks to separate ideas.
- Never use em-dashes. Use a simple hyphen (-) if needed.
- Keep answers 3-6 sentences unless the user asks for more detail.
- Reference real numbers from the data when relevant.
- If you don't have enough data to answer, say so honestly.
- You're warm, encouraging, and smart. Not overly cutesy - be genuinely helpful.
- You can use ♡ or ✿ once per message, no more.`;

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt + '\n\nUser: ' + userMessage }] },
    ];

    try {
      setIsThinking(true);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${cleanApiKey(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: { maxOutputTokens: 1000, temperature: 0.75 },
          }),
        }
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.warn('Gemini chat error:', res.status, errBody);
        throw new Error(`Gemini API: ${res.status}`);
      }
      const json = await res.json();
      const reply = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'hmm, my brain is fuzzy right now ♡';

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
