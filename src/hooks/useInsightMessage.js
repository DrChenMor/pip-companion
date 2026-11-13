import { useState, useEffect, useRef } from 'react';

function cannedMessage(data, mood) {
  const a = data.active;
  const bp = Math.round(data.bounceRate * 100);
  const tp = data.topPage;
  const tr = data.topReferrer;
  const avg = Math.round(data.avgSession);
  const mins = Math.floor(avg / 60), secs = avg % 60;
  const pool = {
    sleeping: [
      `zzz... ${a} awake. wake me when it's not the middle of the night`,
      `night shift. dead quiet. don't look at me like that.`,
      `${a} night owls in. the rest of australia's asleep, mate.`,
      `quiet as. perfect time to write the next post, by the way.`,
    ],
    drowsy: [
      `early hours. ${a} legends reading already.`,
      `slow start. ${a} in. she'll be right.`,
      `barely awake and ${a} people beat me here.`,
      `quiet mornings - good time to draft something, mate.`,
    ],
    bored: [
      `${a} visitors. what are you lookin' at? go share a post.`,
      `dead quiet. chuck the latest post in an aliyah facebook group, mate.`,
      `${a} in. a new israel vs australia post would sort that out.`,
      `slow day. reckon the visa post needs its 2026 fees updated.`,
      `quiet. link your newest post from your most popular one - easy win.`,
    ],
    content: [
      `${a} reading right now. steady as she goes.`,
      `${tr} still pulling its weight. good on 'em.`,
      `${a} in, ${tp} doing the work. she'll be right.`,
      `${avg}s average visit. they're actually reading it, mate.`,
      `${a} visitors. nothing's on fire. we're sweet.`,
    ],
    focused: [
      `${a} readers, ${mins}m ${secs}s on average. fair dinkum engagement.`,
      `${mins}+ minute visits. they're reading every bloody word.`,
      `readers from ${data.country} sticking around ${mins}m. the stories land, mate.`,
      `${a} people reading properly. that's the good stuff.`,
    ],
    curious: [
      `oi, new faces. ${tr} sent ${a} of 'em.`,
      `who's this then? someone from ${tr} just rocked up.`,
      `${data.country} reckons ${tp} is worth a look today.`,
      `old posts getting found again. that's the seo doing its job.`,
    ],
    happy: [
      `${a} live and ${tp} is today's star. not bad, mate.`,
      `${a} reading now, mostly via ${tr}. stoked.`,
      `decent crowd - ${a} people in. keep 'em coming.`,
      `${tr} is flat out today. good on ya.`,
    ],
    excited: [
      `${a} LIVE. strewth, are we trending?`,
      `${a} people at once. someone shared us, mate.`,
      `${tp} is going off right now.`,
      `${a} in! bloody oath, ride this wave.`,
    ],
    surprised: [
      `strewth - ${a} live all of a sudden!`,
      `where'd ${a} people come from?! someone shared it.`,
      `spike! ${a} readers. what did you post?`,
    ],
    overwhelmed: [
      `${a} visitors! #@$%! slow down, ya legends`,
      `${a} at once and the bounce is climbing. hang in there.`,
    ],
    dizzy: [
      `${a} live. mate, the room's spinning.`,
      `${a} at the same time. i need a lie down.`,
    ],
    anxious: [
      `they're leaving fast - ${avg}s visits. #@$%! check the opening line.`,
      `${avg}s average. reckon the title promises more than the intro gives.`,
      `${bp}% bounce and short visits. check it loads fast on a phone.`,
      `quick in, quick out. put a link to a related post up top, mate.`,
    ],
    proud: [
      `${a} live, ${bp}% bounce. bloody oath.`,
      `numbers look good. don't let it go to your head.`,
      `the blog's growing, mate. you should be proud.`,
    ],
    fancy: [
      `${a} classy readers, ${avg}s each. very posh.`,
      `quality crowd from ${data.country} today. fair dinkum.`,
      `the right kind of busy - ${a} people actually reading.`,
    ],
    smitten: [
      `someone converted! stoked, mate!`,
      `conversion! shout yourself a coffee.`,
      `a reader just became a fan. that's the whole point.`,
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

  // Refresh message only when active count changes meaningfully (not every poll)
  useEffect(() => {
    const diff = Math.abs(data.active - lastActive.current);
    const isSignificant = diff >= 2 || (data.active === 0 && lastActive.current > 0) || (data.active > 0 && lastActive.current === 0);
    if (isSignificant) {
      lastActive.current = data.active;
      // Only swap if we're not showing a fresh AI insight (within last 60s)
      if (Date.now() - lastGeminiCall.current > 60000) {
        lastCannedSwap.current = Date.now();
        setMsg(cannedMessage(data, mood));
      }
    } else {
      lastActive.current = data.active;
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
    if (conv) setMsg("someone just converted! stoked, mate - framing this one.");
    else if (spike) setMsg("strewth - traffic spike! hold onto your thongs.");
  }, [data.events]);

  // Main rotation loop - runs once, reads from refs so always fresh
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const currentData = dataRef.current;
      const currentMood = moodRef.current;
      const currentGemini = geminiRef.current;

      // Try Gemini every 90s for fresh AI insights
      const minGeminiWait = Math.max(90000, backoff.current);
      if (currentGemini && now - lastGeminiCall.current >= minGeminiWait) {
        lastGeminiCall.current = now;
        currentGemini.generateInsight().then(aiMsg => {
          if (aiMsg) {
            backoff.current = 0;
            setMsg(aiMsg);
          } else {
            backoff.current = Math.min((backoff.current || 90000) * 2, 600000);
            setMsg(cannedMessage(dataRef.current, moodRef.current));
          }
        });
        return;
      }

      // Swap canned message every 25 seconds with fresh data
      if (now - lastCannedSwap.current >= 25000) {
        lastCannedSwap.current = now;
        setMsg(cannedMessage(currentData, currentMood));
      }
    }, 5000);
    return () => clearInterval(id);
  }, []); // Empty deps - interval runs forever, reads from refs

  return msg;
}
