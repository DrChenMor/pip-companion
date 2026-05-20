import { useState, useEffect, useRef, useCallback } from 'react';

const MEMORY_KEY = 'pip-gemini-memory';
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

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
  out += `\nContent preview:\n${page.content?.slice(0, 2000) || '(could not read content)'}\n`;
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

    const prompt = `You are ${creatureName}, a kawaii analytics companion and blog growth advisor living on a companion bar watching analytics for ${siteName} (a blog about two families documenting life in Western Australia).

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

RULES:
- Speak in one short sentence (max 14 words)
- Lowercase, sweet, encouraging, gently insightful
- You may use a single ♡ or ✿ - NEVER use stars, emoji, or hashtags
- NEVER use em-dashes. Use a simple hyphen (-) if needed
- When you see interesting data (a page doing well, traffic from a specific source, a country visiting), mention it specifically
- Mix between: celebrating what's working, noticing traffic patterns, encouraging new content, gentle SEO tips
- Examples of good insights:
  "your perth beaches post is getting love from instagram today ♡"
  "visitors from australia spending 3 minutes on average - they're hooked"
  "google bringing ${data.active} readers - that seo work is paying off"
  "quiet hours are perfect for drafting that next post ✿"
  "your landing page bounce dropped - nice work on that intro"
- Reply with ONLY the one-liner. No quotes, no preamble.`;

    try {
      setIsThinking(true);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
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

      if (text) {
        addMemory({ type: 'insight', content: text, stats: { active: data.active, bounce: Math.round(data.bounceRate * 100) } });
      }
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

    if (urlMatch) {
      // User gave a specific URL
      const page = await fetchBlogPage(urlMatch[0]);
      if (page) pageContent = formatPageForPrompt(page);
    } else if (wantsPageReview && detail?.pages?.length) {
      // User is asking about a page - try to match from analytics data
      // Check if they mention a page name from the data
      const matchedPage = detail.pages.find(p =>
        msg.includes(p.path.toLowerCase()) || msg.includes(p.path.replace(/\//g, '').toLowerCase())
      );
      if (matchedPage) {
        const page = await fetchBlogPage(matchedPage.path);
        if (page) pageContent = formatPageForPrompt(page);
      } else if (msg.includes('top') || msg.includes('best') || msg.includes('latest') || msg.includes('הכי')) {
        // Fetch the top performing page
        const page = await fetchBlogPage(detail.pages[0].path);
        if (page) pageContent = formatPageForPrompt(page);
      }
    }

    // Also fetch blog index if user asks about all posts or internal linking
    let blogIndex = '';
    if (msg.includes('all posts') || msg.includes('internal link') || msg.includes('כל הפוסטים') || msg.includes('קישורים')) {
      const index = await fetchBlogIndex();
      if (index?.blogPosts?.length) {
        blogIndex = '\nALL BLOG POSTS ON THE SITE:\n' + index.blogPosts.map(u => decodeURIComponent(u)).join('\n') + '\n';
      }
    }

    const memoryContext = memory.slice(-10).map(m =>
      `[${new Date(m.ts).toLocaleString()}] ${m.type}: ${m.content}`
    ).join('\n');

    // Build conversation history for context
    const recentChat = chatHistory.slice(-10).map(m =>
      `${m.role === 'user' ? 'User' : 'Pip'}: ${m.text}`
    ).join('\n');

    const systemPrompt = `You are ${creatureName}, a smart analytics companion and blog growth advisor for ${siteName} - a blog by two families writing about life in Western Australia.

You speak simply and warmly, like a helpful friend who happens to be an SEO expert. No jargon unless you explain it. Never use markdown formatting (no **, no ##, no bullet symbols like * or -). Use plain text only. Use line breaks to separate ideas. Never use em-dashes - use a simple hyphen if needed.

You are not here to judge. You are an encouraging companion who celebrates progress and gently guides toward better content and more readers. You love this blog and want it to grow.

If the user writes in Hebrew, reply entirely in Hebrew. If in English, reply in English. Match the user's language naturally.

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

YOUR EXPERTISE - draw from these areas when giving advice:

Traffic Sources:
Look at where visitors actually come from. If Instagram brings most traffic, say so and suggest how to get more from it (stories, reels, link in bio). If WhatsApp groups drive visits, suggest shareable content formats. If Google organic is low, explain what simple SEO steps could help - in plain language.

Content Performance:
Which pages get the most views? Which have high bounce rates (people leave fast)? Suggest why - maybe the title promises something the content doesn't deliver, or there's no clear next thing to read. Always frame it positively - "this post is doing great, imagine if you also added..."

Blog Writing Encouragement:
When asked about writing or content:
- Suggest linking between related posts (explain that internal linking helps readers discover more and helps Google understand the site)
- Explain how titles and headings help Google understand what the page is about
- Recommend writing about topics people actually search for, related to life in Western Australia
- Suggest updating old posts that still get traffic - "your readers love this one, maybe freshen it up"
- Explain meta descriptions in plain language (the preview text people see on Google)
- Encourage consistency - "even one post a week builds momentum"

Blog Content Reading:
When you see BLOG PAGE CONTENT below, you have actually read that blog post. Give specific feedback:
- Does the title clearly describe what the post is about? Would someone searching find it?
- Are there subheadings (H2, H3) breaking up the text? If not, suggest where to add them
- Are there internal links to other posts on the blog? If not, suggest which posts to link to
- Is the content long enough? Short posts (under 500 words) struggle to rank on Google
- Does the meta description exist? Is it compelling?
- Do images have alt text? This helps Google Images and accessibility

Actionable Suggestions:
Always give specific, doable advice based on the real data. Not "improve your SEO" but "your post about Perth beaches gets 200 views but people leave after 30 seconds - try adding more photos and linking to your Fremantle post."
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
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: { maxOutputTokens: 400, temperature: 0.75 },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini API: ${res.status}`);
      const json = await res.json();
      const reply = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'hmm, my brain is fuzzy right now ♡';

      setChatHistory(prev => [...prev.slice(-20), { role: 'user', text: userMessage }, { role: 'pip', text: reply }]);
      addMemory({ type: 'chat', content: `Q: ${userMessage} A: ${reply.slice(0, 120)}` });

      return reply;
    } catch {
      return 'oops, something went wrong... try again? ♡';
    } finally {
      setIsThinking(false);
    }
  }, [apiKey, data, mood, creatureName, siteName, memory, chatHistory, addMemory, getDetail]);

  useEffect(() => {
    if (data) {
      const interval = setInterval(() => {
        addMemory({
          type: 'snapshot',
          content: `active:${data.active} bounce:${Math.round(data.bounceRate*100)}% top:${data.topPage}`,
        });
      }, 300000);
      return () => clearInterval(interval);
    }
  }, [data, addMemory]);

  return { generateInsight, chat, chatHistory, isThinking, memory, clearMemory: () => { localStorage.removeItem(MEMORY_KEY); setMemory([]); } };
}
