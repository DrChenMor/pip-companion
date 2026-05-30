// Fetches and extracts text content from train2aus.com pages
// Only allows fetching from the blog's own domain for safety

const ALLOWED_DOMAIN = 'train2aus.com';

function extractText(html) {
  // Remove script and style tags
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // Extract headings
  const headings = [];
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1]),
      text: match[2].replace(/<[^>]+>/g, '').trim(),
    });
  }

  // Extract internal links
  const internalLinks = [];
  const linkRegex = /<a[^>]+href=["']([^"']*train2aus\.com[^"']*|\/[^"']*)/gi;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (href && !internalLinks.includes(href) && !href.includes('#')) {
      internalLinks.push(href);
    }
  }

  // Extract meta description
  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const metaDescription = metaMatch ? metaMatch[1].trim() : '';

  // Extract author - posts carry reliable JSON-LD structured data, with a
  // visible "מאת <name>" byline as a fallback.
  let author = '';
  const ldAuthor = html.match(/"author":\s*\[?\s*\{[^}]*"name":\s*"([^"]+)"/i);
  if (ldAuthor) {
    author = ldAuthor[1].trim();
  } else {
    const byline = html.match(/מאת\s+([^<·|\n]{2,40})/);
    if (byline) author = byline[1].trim();
  }

  // Extract main content - strip all tags, clean whitespace
  // Try to find main/article content first
  let mainContent = '';
  const articleMatch = html.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i);
  if (articleMatch) {
    mainContent = articleMatch[2];
  } else {
    // Fall back to body
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    mainContent = bodyMatch ? bodyMatch[1] : html;
  }

  // Convert <br>, <p>, <div>, <li> to newlines for readability
  mainContent = mainContent.replace(/<br\s*\/?>/gi, '\n');
  mainContent = mainContent.replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
  mainContent = mainContent.replace(/<[^>]+>/g, ' ');

  // Clean up whitespace
  mainContent = mainContent.replace(/&nbsp;/g, ' ');
  mainContent = mainContent.replace(/&amp;/g, '&');
  mainContent = mainContent.replace(/&lt;/g, '<');
  mainContent = mainContent.replace(/&gt;/g, '>');
  mainContent = mainContent.replace(/&quot;/g, '"');
  mainContent = mainContent.replace(/&#39;/g, "'");
  mainContent = mainContent.replace(/[ \t]+/g, ' ');
  mainContent = mainContent.replace(/\n\s*\n/g, '\n\n');
  mainContent = mainContent.trim();

  // Count images
  const imageCount = (html.match(/<img[^>]+>/gi) || []).length;

  // Check for images with alt text
  const images = [];
  const imgRegex = /<img[^>]+alt=["']([^"']*)["'][^>]*>/gi;
  while ((match = imgRegex.exec(html)) !== null) {
    if (match[1].trim()) images.push(match[1].trim());
  }

  // Truncate content to ~8000 chars to fit in prompt (the agent slices further)
  if (mainContent.length > 8000) {
    mainContent = mainContent.slice(0, 8000) + '\n... (content truncated)';
  }

  return {
    title,
    metaDescription,
    author,
    headings,
    content: mainContent,
    internalLinks,
    imageCount,
    imageAlts: images,
    wordCount: mainContent.split(/\s+/).filter(Boolean).length,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { url, path } = req.query;

    // Build the target URL
    let targetUrl;
    if (url) {
      targetUrl = url;
    } else if (path) {
      targetUrl = `https://${ALLOWED_DOMAIN}${path.startsWith('/') ? '' : '/'}${path}`;
    } else {
      // Default: fetch the homepage to get all post URLs
      targetUrl = `https://${ALLOWED_DOMAIN}`;
    }

    // Security: only allow fetching from train2aus.com
    const parsed = new URL(targetUrl);
    if (!parsed.hostname.endsWith(ALLOWED_DOMAIN)) {
      return res.status(403).json({ error: 'Only train2aus.com pages can be fetched' });
    }

    // train2aus.com is a JS-rendered SPA (Lovable) behind Cloudflare with an
    // SEO pre-render gatekeeper. It only serves the fully-rendered HTML (with
    // real article text) to allow-listed crawler user-agents. A custom or even
    // a normal-browser UA gets the empty React shell with no content. We must
    // present a recognized crawler UA (Googlebot) to receive the prerender,
    // while still honestly tagging ourselves at the end.
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) Train2ausPipBot/1.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'he,en;q=0.9',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch: ${response.status}` });
    }

    const html = await response.text();
    const extracted = extractText(html);

    // If fetching homepage, also extract all blog post URLs WITH their titles
    // (the anchor text is usually the Hebrew post title - needed for fuzzy matching)
    if (parsed.pathname === '/' || parsed.pathname === '') {
      const posts = [];
      const seen = new Set();
      // Capture the anchor's href AND its inner text in one pass
      const anchorRegex = /<a[^>]+href=["'](https?:\/\/train2aus\.com\/blog\/[^"'#]+|\/blog\/[^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = anchorRegex.exec(html)) !== null) {
        const postUrl = m[1].startsWith('/') ? `https://${ALLOWED_DOMAIN}${m[1]}` : m[1];
        let title = (m[2] || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&#0?39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
        // Fall back to a readable slug if the link had no text (e.g. image link)
        if (!title) {
          try {
            const slug = new URL(postUrl).pathname.split('/').filter(Boolean).pop() || '';
            title = decodeURIComponent(slug).replace(/[-_]/g, ' ').trim();
          } catch { title = ''; }
        }
        if (!seen.has(postUrl)) {
          seen.add(postUrl);
          posts.push({ url: postUrl, title });
        } else if (title) {
          // Prefer a version that has a title if we saw the URL before without one
          const existing = posts.find(p => p.url === postUrl);
          if (existing && !existing.title) existing.title = title;
        }
      }
      extracted.posts = posts;                       // new: [{ url, title }]
      extracted.blogPosts = posts.map(p => p.url);   // backward compatible
    }

    return res.status(200).json(extracted);
  } catch (err) {
    console.error('Fetch page error:', err);
    return res.status(500).json({ error: err.message });
  }
}
