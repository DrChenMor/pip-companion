import { useState, useEffect, useRef } from 'react';

function cannedMessage(data, mood) {
  const a = data.active;
  const bp = Math.round(data.bounceRate * 100);
  const tp = data.topPage;
  const tr = data.topReferrer;
  const avg = Math.round(data.avgSession);
  const pool = {
    sleeping: [
      `zzz... ${a} awake. wake me at sunrise ♡`,
      `night shift quiet. dreaming of pageviews.`,
      `shhh - only ${a} of us. bounce ${bp}%, fine fine.`,
      `the blog rests. tomorrow we grow ✿`,
      `late night calm. perfect time to draft a new post ♡`,
      `${a} night owls reading. cozy.`,
    ],
    drowsy: [
      `sleepy hours... ${a} cozy readers ♡`,
      `low-key vibes, ${a} folks lurking.`,
      `eyelids heavy. ${a} stayed up with me.`,
      `quiet mornings are good for writing ✿`,
      `dawn readers are the loyal ones. ${a} of them right now.`,
      `slow start today. but every blog post was once a quiet morning.`,
    ],
    bored: [
      `only ${a} visitors... time to write something new? ✿`,
      `pretty empty. maybe post that thing you keep drafting?`,
      `${a} humans. share a post on whatsapp maybe?`,
      `slow day - perfect for updating an old post with fresh links ♡`,
      `quiet here. have you checked which posts need better titles?`,
      `${a} visitors. a new post could change that by tomorrow.`,
      `tip: add a link from your newest post to your most popular one ✿`,
    ],
    content: [
      `${a} reading right now ♡ cruisey vibes.`,
      `steady ${a}. ${tr} still pulling its weight.`,
      `${bp}% bounce - nothing's on fire, promise.`,
      `nice and steady. ${a} readers enjoying ${tp} ♡`,
      `${avg}s average session - people are actually reading.`,
      `good day so far. ${tr} keeps sending friends our way.`,
      `${a} visitors - the blog is alive and well ✿`,
    ],
    focused: [
      `deep readers - ${avg}s average session.`,
      `${a} folks reading slow. love that for us.`,
      `quiet but lovely. ${a} eyes on ${tp}.`,
      `quality over quantity today. ${avg}s avg means real engagement ♡`,
      `${a} readers who actually stay. that's what matters.`,
      `long sessions from ${data.country}. they love the content ✿`,
    ],
    curious: [
      `new faces! ${tr} brought ${a} of them.`,
      `someone interesting from ${tr} just landed.`,
      `hmm - ${a} visitors, who's that on ${tp}?`,
      `${data.country} readers are curious about ${tp} today.`,
      `interesting traffic pattern. ${tr} is doing something right.`,
      `new readers discovering old posts - that's SEO working ♡`,
    ],
    happy: [
      `${a} live!! ${tp} is today's star ♡`,
      `numbers look loved - ${a} readers hanging out ♡`,
      `good vibes, ${a} now mostly from ${tr}`,
      `${a} readers and ${bp}% bounce. this is a good day ✿`,
      `your content is connecting. ${a} people right now.`,
      `${tr} traffic looking healthy today. keep it up ♡`,
    ],
    excited: [
      `${a} LIVE!! are we trending???`,
      `${a} simultaneous humans i'm a little dizzy ✿`,
      `big numbers - ${tp} is ON FIRE`,
      `this is amazing - ${a} people reading right now!!`,
      `${a} live!! someone definitely shared this. ride the wave ♡`,
    ],
    surprised: [
      `oh!! traffic just doubled - ${a} live now!`,
      `wait what - ${a} of you appeared at once.`,
      `did somebody share us? ${a} just landed.`,
      `unexpected spike! ${a} readers. something is happening ♡`,
    ],
    overwhelmed: [
      `${a} visitors!! SOMEONE HELP THE SERVER`,
      `too many friends at once... bounce climbing.`,
      `${a} live - i love you all please slow down ♡`,
    ],
    dizzy: [
      `woah ${a} live. room is spinning a bit.`,
      `${a} simultaneously - i need water.`,
      `cannot keep up. ${a} of you. lovely chaos.`,
    ],
    anxious: [
      `${bp}% bouncing... did we break the homepage?`,
      `people landing and leaving. ${tp} needs love ♡`,
      `${a} visiting but ${bp}% bounce. maybe add more to the intro?`,
      `high bounce might mean the title promises more than the post delivers.`,
      `tip: add related posts at the bottom to keep readers exploring ✿`,
    ],
    proud: [
      `look at us go - ${a} live, ${bp}% bounce ♡`,
      `numbers are kissing today.`,
      `${a} live and all good. proud of you.`,
      `the blog is growing. you should be proud ✿`,
      `low bounce, good sessions. this is what growth looks like ♡`,
    ],
    fancy: [
      `a refined ${a} guests. avg ${avg}s. classy.`,
      `✿ boutique traffic. ${a} discerning visitors.`,
      `the right kind of busy - ${a} engaged folks.`,
      `quality readers from ${data.country}. ${avg}s sessions. chef's kiss ♡`,
    ],
    smitten: [
      `someone just converted!! i'm telling everyone ♡`,
      `♡ conversion! i love them already.`,
      `that's a conversion. treat yourself to a coffee ✿`,
      `a reader became a fan. this is what it's all about ♡`,
    ],
  };
  const opts = pool[mood] || pool.content;
  return opts[Math.floor(Math.random() * opts.length)];
}

export function useInsightMessage({ data, mood, gemini }) {
  const [msg, setMsg] = useState(() => cannedMessage(data, mood));

  // Refs keep latest values so the interval always reads fresh data
  const dataRef = useRef(data);
  const moodRef = useRef(mood);
  const geminiRef = useRef(gemini);
  const lastEventCount = useRef(0);
  const lastGeminiCall = useRef(0);
  const lastCannedSwap = useRef(Date.now());
  const lastActive = useRef(data.active);
  const backoff = useRef(0);

  // Keep refs in sync with latest props
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { moodRef.current = mood; }, [mood]);
  useEffect(() => { geminiRef.current = gemini; }, [gemini]);

  // Immediately refresh message when active count changes (real data update)
  useEffect(() => {
    if (data.active !== lastActive.current) {
      lastActive.current = data.active;
      // Only swap if we're showing a canned message (don't overwrite fresh AI insights)
      if (Date.now() - lastGeminiCall.current > 30000) {
        lastCannedSwap.current = Date.now();
        setMsg(cannedMessage(data, mood));
      }
    }
  }, [data.active]);

  // Refresh on mood change
  useEffect(() => {
    setMsg(cannedMessage(dataRef.current, mood));
    lastCannedSwap.current = Date.now();
  }, [mood]);

  // React to events (conversions, spikes)
  useEffect(() => {
    const evCount = data.events.length;
    const fresh = data.events.slice(lastEventCount.current);
    lastEventCount.current = evCount;
    const conv = fresh.find(e => e.kind === 'conversion');
    const spike = fresh.find(e => e.kind === 'spike');
    if (conv) setMsg('kira kira! someone just converted - i\'m framing this one ♡');
    else if (spike) setMsg('uwah!! traffic spike incoming - hold my juice box ♡');
  }, [data.events]);

  // Main rotation loop - runs once, reads from refs so always fresh
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const currentData = dataRef.current;
      const currentMood = moodRef.current;
      const currentGemini = geminiRef.current;

      // Try Gemini if enough time has passed
      const minGeminiWait = Math.max(60000, backoff.current);
      if (currentGemini && now - lastGeminiCall.current >= minGeminiWait) {
        lastGeminiCall.current = now;
        currentGemini.generateInsight().then(aiMsg => {
          if (aiMsg) {
            backoff.current = 0;
            setMsg(aiMsg);
          } else {
            backoff.current = Math.min((backoff.current || 60000) * 2, 300000);
            setMsg(cannedMessage(dataRef.current, moodRef.current));
          }
        });
        return;
      }

      // Swap canned message every 10 seconds with fresh data
      if (now - lastCannedSwap.current >= 10000) {
        lastCannedSwap.current = now;
        setMsg(cannedMessage(currentData, currentMood));
      }
    }, 5000);
    return () => clearInterval(id);
  }, []); // Empty deps - interval runs forever, reads from refs

  return msg;
}
