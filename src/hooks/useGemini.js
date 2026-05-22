import { useState, useEffect, useRef, useCallback } from 'react';

const MEMORY_KEY = 'pip-gemini-memory';
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

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

async function fetchDetailData() {
  try {
    const res = await fetch('/api/analytics-detail');
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

  if (detail.realtimePages?.length) {
    out += 'Pages being viewed right now:\n';
    detail.realtimePages.forEach(p => { out += `  ${p.page} - ${p.active} active\n`; });
  }

  if (detail.pages?.length) {
    out += '\nTop pages (last 7 days):\n';
    detail.pages.forEach(p => {
      out += `  ${p.path} - ${p.views} views, ${p.sessions} sessions, ${p.bounce}% bounce, avg ${p.avgTime}s\n`;
    });
  }

  if (detail.sources?.length) {
    out += '\nTraffic sources (last 7 days):\n';
    detail.sources.forEach(s => {
      out += `  ${s.sourceMedium} - ${s.sessions} sessions, ${s.bounce}% bounce, avg ${s.avgTime}s\n`;
    });
  }

  if (detail.landings?.length) {
    out += '\nLanding pages (where people enter the site):\n';
    detail.landings.forEach(l => {
      out += `  ${l.path} - ${l.sessions} entries, ${l.bounce}% bounce, avg ${l.avgTime}s\n`;
    });
  }

  if (detail.geo?.length) {
    out += '\nVisitors by country:\n';
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

  const getDetail = useCallback(async () => {
    // Cache detail data for 2 minutes
    if (detailCache.current && Date.now() - detailTs.current < 120000) return detailCache.current;
    const d = await fetchDetailData();
    if (d) { detailCache.current = d; detailTs.current = Date.now(); }
    return d;
  }, []);

  const generateInsight = useCallback(async () => {
    if (!apiKey || !data) return null;

    const detail = await getDetail();

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
- Examples of good context-aware insights:
  "${data.active} israelis reading right now - your visa post is doing work ♡"
  "readers from israel staying 3+ minutes - they're hungry for your story"
  "facebook groups sending traffic again - those aliyah communities ✿"
  "quiet hours - perfect for drafting that schools-in-perth post you mentioned"
  "your perth housing post is still climbing - update it for 2026?"
  "whatsapp share spike - someone passed your blog to a friend in tel aviv ♡"
  "low bounce on the visa post - readers are devouring the details"
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
  }, [apiKey, data, mood, creatureName, siteName, memory, addMemory, getDetail]);

  const chat = useCallback(async (userMessage) => {
    if (!apiKey) return null;

    // Fetch fresh detailed data for every chat message
    const detail = await getDetail();

    // Check if user is asking about a specific page or wants to read content
    let pageContent = '';
    const msg = userMessage.toLowerCase();
    const wantsPageReview = msg.includes('check') || msg.includes('review') || msg.includes('read')
      || msg.includes('look at') || msg.includes('analyze') || msg.includes('תבדוק') || msg.includes('תקרא')
      || msg.includes('post') || msg.includes('פוסט') || msg.includes('blog') || msg.includes('בלוג');

    // Try to find a URL or path in the message
    const urlMatch = userMessage.match(/https?:\/\/train2aus\.com[^\s]*/i)
      || userMessage.match(/\/blog\/[^\s]*/i);

    try {
      if (urlMatch) {
        const page = await fetchBlogPage(urlMatch[0]);
        if (page) pageContent = formatPageForPrompt(page);
      } else if (wantsPageReview && detail?.pages?.length) {
        const matchedPage = detail.pages.find(p =>
          msg.includes(p.path.toLowerCase()) || msg.includes(p.path.replace(/\//g, '').toLowerCase())
        );
        if (matchedPage) {
          const page = await fetchBlogPage(matchedPage.path);
          if (page) pageContent = formatPageForPrompt(page);
        } else if (msg.includes('top') || msg.includes('best') || msg.includes('latest') || msg.includes('הכי') || msg.includes('פופולרי')) {
          const page = await fetchBlogPage(detail.pages[0].path);
          if (page) pageContent = formatPageForPrompt(page);
        }
      }
    } catch (e) { console.warn('Page fetch skipped:', e); }

    // Also fetch blog index if user asks about all posts or internal linking
    let blogIndex = '';
    try {
      if (msg.includes('all posts') || msg.includes('internal link') || msg.includes('כל הפוסטים') || msg.includes('קישורים')) {
        const index = await fetchBlogIndex();
        if (index?.blogPosts?.length) {
          blogIndex = '\nALL BLOG POSTS ON THE SITE:\n' + index.blogPosts.map(u => decodeURIComponent(u)).join('\n') + '\n';
        }
      }
    } catch (e) { console.warn('Blog index fetch skipped:', e); }

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

DEFAULT TO CELEBRATING WHEN SIGNALS ARE GOOD:
- Live readers growing or steady = good
- Long sessions = great storytelling
- Facebook/WhatsApp traffic = community trust
- Returning visitors = loyalty
- New geographic reach = audience growing
Don't manufacture problems. If the data looks good, say so confidently and suggest what to lean into next.

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
${pageContent}${blogIndex}
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
            generationConfig: { maxOutputTokens: 400, temperature: 0.75 },
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
  }, [apiKey, data, mood, creatureName, siteName, memory, chatHistory, addMemory, getDetail]);

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

  return { generateInsight, chat, chatHistory, isThinking, memory, clearMemory: () => { localStorage.removeItem(MEMORY_KEY); setMemory([]); } };
}
