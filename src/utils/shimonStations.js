// What bogan Shimon presents on the bar. Every station is built only from real
// numbers (live data + /api/bar-stats); a station with no data is skipped.
// Each station: { id, kicker, big, kind: 'num'|'text'|'flags'|'chart', sub, line, pose }
//   line = what Shimon says (typed out while he talks)
//   pose = the attitude he pulls after talking ('stoked', 'swear', 'stare', 'sneer', 'puff')

const n = (v) => Number(v || 0).toLocaleString('en-US');

const COUNTRY_HE = {
  Australia: 'אוסטרליה', Israel: 'ישראל', 'United States': 'ארה"ב', 'United Kingdom': 'בריטניה',
  Canada: 'קנדה', Germany: 'גרמניה', 'New Zealand': 'ניו זילנד', Finland: 'פינלנד', Sweden: 'שבדיה',
  Ireland: 'אירלנד', France: 'צרפת', Netherlands: 'הולנד', Singapore: 'סינגפור', India: 'הודו',
  Thailand: 'תאילנד', Cyprus: 'קפריסין', Greece: 'יוון', Spain: 'ספרד', Italy: 'איטליה', Portugal: 'פורטוגל',
  Russia: 'רוסיה', Ukraine: 'אוקראינה', Switzerland: 'שווייץ', Austria: 'אוסטריה', Belgium: 'בלגיה',
  'South Africa': 'דרום אפריקה', Japan: 'יפן', China: 'סין', Brazil: 'ברזיל', Mexico: 'מקסיקו',
};
const CITY_HE = {
  Perth: "פרת'", Melbourne: 'מלבורן', Sydney: 'סידני', Brisbane: 'בריסביין', Adelaide: 'אדלייד',
  'Gold Coast': 'גולד קוסט', Canberra: 'קנברה', Hobart: 'הובארט', Darwin: 'דרווין',
  'Tel Aviv-Yafo': 'תל אביב', Jerusalem: 'ירושלים', Haifa: 'חיפה', 'Rishon LeZion': 'ראשון לציון',
  'Petah Tikva': 'פתח תקווה', Netanya: 'נתניה', Ashdod: 'אשדוד', 'Be\'er Sheva': 'באר שבע',
  "Beersheba": 'באר שבע', Holon: 'חולון', 'Ramat Gan': 'רמת גן', Herzliya: 'הרצליה', "Ra'anana": 'רעננה',
  'Kfar Saba': 'כפר סבא', Rehovot: 'רחובות', Modiin: 'מודיעין', London: 'לונדון', 'New York': 'ניו יורק',
};
// Cloud data centres: their "visitors" are crawlers and link previews, not readers
const DATACENTER_CITIES = new Set([
  'Prineville', 'Boardman', 'Ashburn', 'Council Bluffs', 'Lulea', 'The Dalles', 'Forest City', 'Altoona',
  'Clonee', 'Odense', 'Papillion', 'Quincy', 'Moncks Corner', 'Lenoir', 'Mayes County', 'Henderson',
  'Los Lunas', 'Eagle Mountain', 'Fort Worth', 'Sarpy County', 'Santa Clara', 'San Jose', 'Columbus',
]);
const CHANNEL_HE = {
  'Organic Social': 'רשתות חברתיות', Direct: 'כניסה ישירה', Email: 'ניוזלטר ומייל',
  'Organic Search': 'חיפוש בגוגל', Referral: 'קישורים מאתרים אחרים', 'Organic Shopping': 'קניות',
  'Paid Social': 'פרסום ממומן', 'Paid Search': 'חיפוש ממומן', Unassigned: 'לא מזוהה', 'Organic Video': 'וידאו',
};
const CHANNEL_LINE = {
  'Organic Social': 'השיתופים בפייסבוק ובוואטסאפ עובדים. תמשיכו לשתף, mate.',
  Direct: 'אנשים מקלידים את הכתובת בעצמם. זה קהל נאמן, אחי.',
  Email: 'הניוזלטר מביא אנשים. מי היה מאמין שמישהו עוד קורא מיילים.',
  'Organic Search': 'גוגל שולח קוראים. ה-SEO עובד, בלאדי גוד.',
  Referral: 'אתרים אחרים מקשרים אליכם. כבוד.',
};

const heCountry = (c) => COUNTRY_HE[c] || c;
const heCity = (c) => CITY_HE[c] || c;
export const flag = (code) => (code && code.length === 2
  ? String.fromCodePoint(...[...code.toUpperCase()].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65))
  : '');

// "בלוג 61 ..." posts are Chen's, "61 ..." (#61) posts are Meayan's
const postAuthor = (title) => (/^בלוג/.test(title) ? 'חן' : /^\d/.test(title) ? 'מעיין' : '');
const shortTitle = (t, max = 46) => (t.length > max ? t.slice(0, max - 1).trim() + '…' : t);
const ddmm = (yyyymmdd) => `${yyyymmdd.slice(6, 8)}.${yyyymmdd.slice(4, 6)}`;

export function buildStations(live, s, insight) {
  const out = [];
  const a = live?.active ?? 0;

  out.push({
    id: 'live', kicker: 'עכשיו באתר', kind: 'num', big: n(a),
    sub: a === 0 ? 'שקט כרגע' : `${a === 1 ? 'קורא אחד' : 'קוראים'}${live?.country ? ' · ' + heCountry(live.country) : ''}`,
    line: a === 0 ? 'אף אחד פה כרגע. מה אתה מסתכל עליי ככה?'
      : a >= 10 ? `${a} אנשים באתר ממש עכשיו! סטוקד, אחי!`
      : `${a === 1 ? 'בן אדם אחד קורא' : a + ' אנשים קוראים'} אתכם עכשיו${live?.country ? ', מ' + heCountry(live.country) : ''}. סבבה, mate.`,
    pose: a === 0 ? 'stare' : a >= 10 ? 'stoked' : 'puff',
  });

  if (!s) {
    if (insight) out.push({ id: 'insight', kicker: 'שמעון חושב', kind: 'text', big: insight, sub: '', line: insight, pose: 'puff' });
    return out;
  }

  out.push({
    id: 'today', kicker: 'היום', kind: 'num', big: n(s.today.users),
    sub: `${n(s.today.views)} צפיות · ${n(s.today.sessions)} ביקורים`,
    line: `היום כבר עברו פה ${n(s.today.users)} אנשים, ${n(s.today.views)} צפיות. לא רע, mate.`,
    pose: 'puff',
  });

  out.push({
    id: 'week', kicker: '7 ימים אחרונים', kind: 'num', big: n(s.week.users),
    sub: `${n(s.week.views)} צפיות · ${n(s.week.sessions)} ביקורים`,
    line: `${n(s.week.users)} מבקרים השבוע. תמשיכו לכתוב, אני לא עושה את זה בשבילכם.`,
    pose: 'sneer',
  });

  const m = s.month.users, p = s.prevMonthToDate.users;
  const pct = p > 0 ? Math.round(((m - p) / p) * 100) : null;
  out.push({
    id: 'month', kicker: 'החודש', kind: 'num', big: n(m),
    sub: pct === null ? `חודש שעבר: ${n(s.prevMonth.users)}`
      : `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% מול אותו זמן בחודש שעבר`,
    line: pct === null ? `${n(m)} מבקרים החודש עד עכשיו.`
      : pct >= 0 ? `${n(m)} מבקרים החודש, יותר מאותו זמן בחודש שעבר. בלאדי גוד!`
      : `${n(m)} החודש, מול ${n(p)} באותו זמן בחודש שעבר. #@$%! יאללה פוסט חדש.`,
    pose: pct === null ? 'puff' : pct >= 0 ? 'stoked' : 'swear',
  });

  out.push({
    id: 'prevMonth', kicker: 'חודש שעבר', kind: 'num', big: n(s.prevMonth.users),
    sub: `${n(s.prevMonth.views)} צפיות · ${n(s.prevMonth.sessions)} ביקורים`,
    line: `בחודש שעבר היו ${n(s.prevMonth.users)} מבקרים. זה הרף, אחי.`,
    pose: 'puff',
  });

  const cs = (s.countries || []).slice(0, 3);
  if (cs.length) {
    out.push({
      id: 'countries', kicker: 'מאיפה קוראים · 30 יום', kind: 'flags', big: cs.map(c => flag(c.code)).join(' '),
      sub: cs.map(c => `${heCountry(c.country)} ${n(c.users)}`).join(' · '),
      line: cs.length >= 3
        ? `רוב הקוראים מ${heCountry(cs[0].country)}, אחר כך ${heCountry(cs[1].country)} ו${heCountry(cs[2].country)}.`
        : `רוב הקוראים מ${heCountry(cs[0].country)}.`,
      pose: 'puff',
    });
  }

  const cities = (s.cities || []).filter(c => !DATACENTER_CITIES.has(c.city)).slice(0, 3);
  if (cities.length) {
    const top = cities[0];
    out.push({
      id: 'cities', kicker: 'ערים מובילות · 30 יום', kind: 'text', big: heCity(top.city),
      sub: cities.map(c => `${heCity(c.city)} ${n(c.users)}`).join(' · '),
      line: top.city === 'Perth' ? `פרת' מובילה עם ${n(top.users)} קוראים. הבית שלי, אחי.`
        : `${heCity(top.city)} מובילה עם ${n(top.users)} קוראים החודש.`,
      pose: top.city === 'Perth' ? 'stoked' : 'puff',
    });
  }

  const post = (s.topPosts || [])[0];
  if (post) {
    const who = postAuthor(post.title);
    out.push({
      id: 'topPost', kicker: 'הפוסט של השבוע', kind: 'text', big: shortTitle(post.title),
      sub: `${n(post.views)} צפיות${who ? ' · מאת ' + who : ''}`,
      line: `הכי נקרא השבוע, ${n(post.views)} צפיות.${who === 'חן' ? ' חן עשה את זה שוב.' : who === 'מעיין' ? ' מעיין עשתה את זה שוב.' : ''}`,
      pose: 'stoked',
    });
  }

  const ch = s.channels || [];
  const chTotal = ch.reduce((t, c) => t + c.sessions, 0);
  if (ch.length && chTotal) {
    const top = ch[0];
    out.push({
      id: 'channels', kicker: 'מאיפה מגיעים · 30 יום', kind: 'num', big: Math.round((top.sessions / chTotal) * 100) + '%',
      sub: `${CHANNEL_HE[top.channel] || top.channel}${ch[1] ? ' · אחריו ' + (CHANNEL_HE[ch[1].channel] || ch[1].channel) : ''}`,
      line: CHANNEL_LINE[top.channel] || `רוב התנועה מגיעה מ${CHANNEL_HE[top.channel] || top.channel}.`,
      pose: 'puff',
    });
  }

  if (s.returningUsers) {
    out.push({
      id: 'loyal', kicker: 'קוראים חוזרים · 30 יום', kind: 'num', big: n(s.returningUsers),
      sub: `${n(s.newUsers)} חדשים · ${n(s.returningUsers)} חוזרים`,
      line: `${n(s.returningUsers)} חזרו לעוד. יש לכם חבר'ה נאמנים.`,
      pose: 'stoked',
    });
  }

  out.push({
    id: 'allTime', kicker: 'מאז שהתחלנו', kind: 'num', big: n(s.allTime.users),
    sub: `${n(s.allTime.views)} צפיות בסך הכל`,
    line: `${n(s.allTime.users)} איש כבר עלו על הרכבת. כמו התור לנקניקייה בבאנינגס.`,
    pose: 'stoked',
  });

  const daily = s.daily || [];
  if (daily.length > 5) {
    const peak = daily.reduce((b, d) => (d.users > b.users ? d : b), daily[0]);
    out.push({
      id: 'chart', kicker: '30 יום אחרונים', kind: 'chart', big: daily.map(d => d.users),
      sub: `שיא: ${n(peak.users)} ב-${ddmm(peak.date)}`,
      line: `השיא החודש: ${n(peak.users)} מבקרים ב-${ddmm(peak.date)}. מה פרסמתם שם?`,
      pose: 'sneer',
    });
  }

  if (insight) out.push({ id: 'insight', kicker: 'שמעון חושב', kind: 'text', big: insight, sub: '', line: insight, pose: 'puff' });

  return out;
}
