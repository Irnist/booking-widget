// Tells the owner about a new request. Every channel is optional and set per
// site in sites/<id>.json › notify; tokens live in Worker secrets.
//   notify.telegramChatId  + secret TELEGRAM_BOT_TOKEN
//   notify.webhook         a Discord, Slack or any JSON webhook URL
//   notify.email           + secret RESEND_API_KEY (and notify.emailFrom on a verified domain)
import { describeWhen, formatMinutes } from '../shared/format.js';
import { CONTACT_VIA } from '../shared/validate.js';

export function summary(site, r, inboxUrl) {
  const service = site.services.find((s) => s.id === r.service);
  const lines = [
    `New ${r.kind === 'booking' ? 'booking request' : 'enquiry'} for ${site.name} (${r.id})`,
    service ? `${service.name}${r.kind === 'booking' ? ` (${formatMinutes(r.minutes)})` : ''}` : null,
    describeWhen(r),
    `${r.name}, prefers ${CONTACT_VIA[r.contactVia].toLowerCase()}`,
    [r.phone, r.email].filter(Boolean).join(' · ') || null,
    r.message ? `"${r.message}"` : null,
    `Confirm or decline: ${inboxUrl}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export async function notifyOwner(env, site, r, inboxUrl) {
  const text = summary(site, r, inboxUrl);
  const jobs = [];
  const n = site.notify || {};

  if (n.telegramChatId && env.TELEGRAM_BOT_TOKEN) {
    jobs.push(post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: n.telegramChatId, text, disable_web_page_preview: true,
    }));
  }
  if (n.webhook) {
    const url = new URL(n.webhook);
    const body = url.hostname.endsWith('discord.com') ? { content: text }
      : url.hostname === 'hooks.slack.com' ? { text }
        : { event: 'request.created', site: site.id, request: r, text };
    jobs.push(post(n.webhook, body));
  }
  if (n.email && env.RESEND_API_KEY) {
    jobs.push(post('https://api.resend.com/emails', {
      from: n.emailFrom || 'Bookings <onboarding@resend.dev>',
      to: [n.email],
      reply_to: r.email || undefined,
      subject: text.split('\n')[0],
      text,
    }, { Authorization: `Bearer ${env.RESEND_API_KEY}` }));
  }

  const results = await Promise.allSettled(jobs);
  for (const res of results) if (res.status === 'rejected') console.error('notify failed:', res.reason?.message);
}

async function post(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
}
