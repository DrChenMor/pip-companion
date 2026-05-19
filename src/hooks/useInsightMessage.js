import { useState, useEffect, useRef } from 'react';

function cannedMessage(data, mood) {
  const a = data.active;
  const bp = Math.round(data.bounceRate * 100);
  const tp = data.topPage;
  const tr = data.topReferrer;
  const pool = {
    sleeping:    [`zzz... ${a} awake. wake me at sunrise ♡`, `night shift quiet. dreaming of pageviews.`, `shhh - only ${a} of us. bounce ${bp}%, fine fine.`],
    drowsy:      [`sleepy hours... ${a} cozy readers ♡`, `low-key vibes, ${a} folks lurking.`, `eyelids heavy. ${a} stayed up with me.`],
    bored:       [`only ${a} visitors... tumble~weeds ✿`, `pretty empty. maybe post that thing you keep drafting?`, `${a} humans. tell a friend? please?`],
    content:     [`${a} reading right now ♡ cruisey vibes.`, `steady ${a}. ${tr} still pulling its weight.`, `${bp}% bounce - nothing's on fire, promise.`],
    focused:     [`deep readers - ${Math.round(data.avgSession)}s average session.`, `${a} folks reading slow. love that for us.`, `quiet but lovely. ${a} eyes on ${tp}.`],
    curious:     [`new faces! ${tr} brought ${a} of them.`, `someone interesting from ${tr} just landed.`, `hmm - ${a} visitors, who's that on ${tp}?`],
    happy:       [`${a} live!! ${tp} is today's mascot ♡`, `numbers look loved - ${a} cuties hanging out ♡`, `good vibes, ${a} now mostly from ${tr}`],
    excited:     [`${a} LIVE!! are we trending???`, `${a} simultaneous humans i'm a little dizzy ✿`, `big numbers - ${tp} is ON FIRE`],
    surprised:   [`oh!! traffic just doubled - ${a} live now!`, `wait what - ${a} of you appeared at once.`, `did somebody share us? ${a} just landed.`],
    overwhelmed: [`${a} visitors!! SOMEONE HELP THE SERVER`, `too many friends at once... bounce climbing.`, `${a} live - i love you all please slow down ♡`],
    dizzy:       [`woah ${a} live. room is spinning a bit.`, `${a} simultaneously - i need water.`, `cannot keep up. ${a} of you. lovely chaos.`],
    anxious:     [`${bp}% bouncing... did we break the homepage?`, `people landing and leaving. ${tp} needs love ♡`, `${a} visiting but ${bp}% bounce. suspicious.`],
    proud:       [`look at us go - ${a} live, ${bp}% bounce ♡`, `numbers are kissing today.`, `${a} live and all good. proud of you.`],
    fancy:       [`a refined ${a} guests. avg ${Math.round(data.avgSession)}s. classy.`, `✿ boutique traffic. ${a} discerning visitors.`, `the right kind of busy - ${a} engaged folks.`],
    smitten:     [`someone just paid us!! i'm telling everyone ♡`, `♡ conversion! i love them already.`, `that's a sale. treat yourself to a coffee ✿`],
  };
  const opts = pool[mood] || pool.content;
  return opts[Math.floor(Math.random() * opts.length)];
}

export function useInsightMessage({ data, mood, gemini }) {
  const [msg, setMsg] = useState(() => cannedMessage(data, mood));
  const lastMood = useRef(mood);
  const lastEventCount = useRef(0);
  const lastGeminiCall = useRef(0);
  const backoff = useRef(0);

  useEffect(() => {
    if (mood !== lastMood.current) {
      lastMood.current = mood;
      setMsg(cannedMessage(data, mood));
    }
  }, [mood]);

  useEffect(() => {
    const evCount = data.events.length;
    const fresh = data.events.slice(lastEventCount.current);
    lastEventCount.current = evCount;
    const conv = fresh.find(e => e.kind === 'conversion');
    const spike = fresh.find(e => e.kind === 'spike');
    if (conv) setMsg('kira kira! someone just converted - i\'m framing this one ♡');
    else if (spike) setMsg('uwah!! traffic spike incoming - hold my juice box ♡');
  }, [data.events]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const minWait = gemini ? Math.max(60000, backoff.current) : 15000;
      if (now - lastGeminiCall.current < minWait) {
        setMsg(cannedMessage(data, mood));
        return;
      }
      generate();
    }, 15000);
    return () => clearInterval(id);
  }, [mood, gemini]);

  async function generate() {
    if (gemini) {
      lastGeminiCall.current = Date.now();
      const aiMsg = await gemini.generateInsight();
      if (aiMsg) {
        backoff.current = 0;
        setMsg(aiMsg);
        return;
      }
      backoff.current = Math.min((backoff.current || 60000) * 2, 300000);
    }
    setMsg(cannedMessage(data, mood));
  }

  return msg;
}
