// The API behind the widget and the owner inbox. Static files (widget.js,
// the demo and the inbox page) are served from public/ before this runs.
//
//   GET    /api/sites/:site                     public config for the widget
//   GET    /api/sites/:site/availability?service=ID
//   POST   /api/sites/:site/requests            a visitor's booking or enquiry
//   GET    /api/sites/:site/requests            owner: list    (Bearer inbox key)
//   PATCH  /api/sites/:site/requests/:id        owner: status  (Bearer inbox key)
import sites from './sites.gen.js';
import { notifyOwner } from './notify.js';
import { publicSite } from '../shared/site.js';
import { bookableRange, cellsFor, isOpen, openTimes } from '../shared/slots.js';
import { validateRequest } from '../shared/validate.js';

const STATUSES = ['new', 'confirmed', 'declined', 'done', 'cancelled'];
const HOLDING = new Set(['new', 'confirmed', 'done']); // statuses that keep the slot taken
const PER_HOUR = 5; // requests one visitor may send to one site per hour
const REF_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to misread

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json(err.body, err.status, err.headers);
      console.error(err);
      return json({ error: 'server_error', message: 'Something went wrong on our side. Please try again.' }, 500);
    }
  },

  // Daily: empty the public demo and forget visitors' IP hashes after two days.
  async scheduled(_event, env) {
    const demoIds = Object.values(sites).filter((s) => s.demo).map((s) => s.id);
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    const stmts = [env.DB.prepare('UPDATE requests SET ip_hash = NULL WHERE created_at < ?').bind(twoDaysAgo)];
    for (const id of demoIds) {
      stmts.push(
        env.DB.prepare('DELETE FROM holds WHERE site = ? AND request_id IN (SELECT id FROM requests WHERE site = ? AND created_at < ?)').bind(id, id, dayAgo),
        env.DB.prepare('DELETE FROM requests WHERE site = ? AND created_at < ?').bind(id, dayAgo),
      );
    }
    await env.DB.batch(stmts);
  },
};

async function route(request, env, ctx) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) {
    // Not a file in public/ and not the API: show the 404 page.
    const page = await env.ASSETS.fetch(new URL('/404', url)); // serves 404.html
    return new Response(page.body, { status: 404, headers: page.headers });
  }
  const m = url.pathname.match(/^\/api\/sites\/([a-z0-9-]+)(?:\/(availability|requests)(?:\/([A-Z0-9-]+))?)?\/?$/);
  if (!m) throw new HttpError(404, { error: 'not_found' });

  const [, siteId, section, requestId] = m;
  const site = sites[siteId];
  const cors = corsHeaders(request, site);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!site) throw new HttpError(404, { error: 'unknown_site', message: 'This booking widget isn’t set up yet.' }, cors);

  const method = request.method;
  if (!section && method === 'GET') return json(publicSite(site), 200, cors);
  if (section === 'availability' && method === 'GET') return availability(site, url, env, cors);
  if (section === 'requests' && !requestId && method === 'POST') return createRequest(request, site, env, ctx, cors);
  if (section === 'requests' && !requestId && method === 'GET') return listRequests(request, site, url, env);
  if (section === 'requests' && requestId && method === 'PATCH') return updateRequest(request, site, requestId, env);
  throw new HttpError(405, { error: 'method_not_allowed' }, cors);
}

// ---------- visitor endpoints ----------

async function availability(site, url, env, cors) {
  const service = site.services.find((s) => s.id === url.searchParams.get('service'));
  if (!service) throw new HttpError(400, { error: 'unknown_service', message: 'Choose a service first.' }, cors);
  const { first, last } = bookableRange(site);
  const held = await heldCells(env, site.id, first, last);
  const dates = openTimes(site, { minutes: service.minutes, held });
  return json({ timezone: site.timezone, first, last, dates }, 200, { ...cors, 'Cache-Control': 'no-store' });
}

async function createRequest(request, site, env, ctx, cors) {
  if (!originAllowed(request, site)) throw new HttpError(403, { error: 'origin_not_allowed', message: 'This website isn’t allowed to send requests to this business.' }, cors);
  if (Number(request.headers.get('Content-Length') || 0) > 16384) throw new HttpError(413, { error: 'too_large' }, cors);

  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, { error: 'bad_json' }, cors);
  }

  const { ok, errors, value, spam } = validateRequest(site, body);
  if (!ok) throw new HttpError(422, { error: 'invalid', errors, message: 'Please check the highlighted fields.' }, cors);
  if (body.website) {
    // Honeypot filled: answer like a success so the bot moves on, store nothing.
    return json({ ok: true, request: { id: makeRef(), ...value, status: 'new' } }, 201, cors);
  }
  if (spam) {
    throw new HttpError(422, { error: 'too_fast', message: 'That was quick! Please check your details and press send again.' }, cors);
  }

  const ipHash = await sha256(`${request.headers.get('CF-Connecting-IP') || 'local'}|${site.id}|${new Date().toISOString().slice(0, 10)}`);
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM requests WHERE site = ? AND ip_hash = ? AND created_at > ?')
    .bind(site.id, ipHash, hourAgo).first('n');
  if (recent >= PER_HOUR) {
    const call = site.phone ? ` or call ${site.phone}` : '';
    throw new HttpError(429, { error: 'rate_limited', message: `You’ve sent several requests already. Please try again in an hour${call}.` }, cors);
  }

  const service = site.services.find((s) => s.id === value.service) || null;
  const r = {
    id: makeRef(),
    ...value,
    minutes: value.kind === 'booking' ? service.minutes : null,
    status: 'new',
    createdAt: new Date().toISOString(),
  };

  const insert = env.DB.prepare(
    `INSERT INTO requests (id, site, kind, service, date, time, minutes, name, contact_via, phone, email, message, status, created_at, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
  ).bind(r.id, site.id, r.kind, r.service, r.date, r.time, r.minutes, r.name, r.contactVia,
    r.phone || null, r.email || null, r.message || null, r.createdAt, ipHash);

  if (r.kind === 'booking') {
    const held = await heldCells(env, site.id, r.date, r.date);
    if (!isOpen(site, { date: r.date, time: r.time, minutes: r.minutes, held })) throw slotTaken(cors);
    // The request and its holds go in one transaction; a clash on the holds'
    // primary key rolls back both, so a slot can only ever be taken once.
    try {
      await env.DB.batch([insert, ...holdStatements(env, site, r)]);
    } catch (err) {
      if (/UNIQUE|constraint/i.test(String(err.message))) throw slotTaken(cors);
      throw err;
    }
  } else {
    await insert.run();
  }

  const inboxUrl = `${new URL(request.url).origin}/admin/?site=${site.id}`;
  ctx.waitUntil(notifyOwner(env, site, r, inboxUrl));
  return json({ ok: true, request: publicRequest(r) }, 201, cors);
}

// ---------- owner endpoints ----------

async function listRequests(request, site, url, env) {
  await requireOwner(request, site);
  const all = url.searchParams.get('status') === 'all';
  const { results } = await env.DB.prepare(
    `SELECT * FROM requests WHERE site = ? ${all ? '' : "AND status IN ('new', 'confirmed')"}
     ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END,
              COALESCE(date, substr(created_at, 1, 10)), time, created_at
     LIMIT 500`,
  ).bind(site.id).all();
  return json({ site: publicSite(site), requests: results.map(rowToRequest) }, 200, { 'Cache-Control': 'no-store' });
}

async function updateRequest(request, site, id, env) {
  await requireOwner(request, site);
  const { status } = await request.json().catch(() => ({}));
  if (!STATUSES.includes(status)) throw new HttpError(400, { error: 'bad_status', message: `Status must be one of ${STATUSES.join(', ')}.` });

  const row = await env.DB.prepare('SELECT * FROM requests WHERE site = ? AND id = ?').bind(site.id, id).first();
  if (!row) throw new HttpError(404, { error: 'not_found', message: 'That request no longer exists.' });
  const r = rowToRequest(row);

  const update = env.DB.prepare('UPDATE requests SET status = ? WHERE id = ?').bind(status, id);
  const wasHolding = HOLDING.has(r.status);
  const nowHolding = HOLDING.has(status);
  const stmts = [update];
  if (r.kind === 'booking' && wasHolding && !nowHolding) {
    stmts.push(env.DB.prepare('DELETE FROM holds WHERE request_id = ?').bind(id));
  } else if (r.kind === 'booking' && !wasHolding && nowHolding) {
    stmts.push(...holdStatements(env, site, r)); // taking a declined booking back needs its slot to still be free
  }
  try {
    await env.DB.batch(stmts);
  } catch (err) {
    if (/UNIQUE|constraint/i.test(String(err.message))) {
      throw new HttpError(409, { error: 'slot_taken', message: 'Someone else has booked that time since. Contact the customer to pick another.' });
    }
    throw err;
  }
  return json({ ok: true, request: { ...r, status } });
}

async function requireOwner(request, site) {
  const key = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key || (await sha256(key)) !== site.adminKeyHash) {
    throw new HttpError(401, { error: 'unauthorized', message: 'That inbox key doesn’t match this business.' });
  }
}

// ---------- helpers ----------

async function heldCells(env, siteId, from, to) {
  const { results } = await env.DB.prepare('SELECT date, time FROM holds WHERE site = ? AND date BETWEEN ? AND ?')
    .bind(siteId, from, to).all();
  return new Set(results.map((h) => `${h.date} ${h.time}`));
}

function holdStatements(env, site, r) {
  return cellsFor(r.time, r.minutes, site.slotMinutes).map((time) =>
    env.DB.prepare('INSERT INTO holds (site, date, time, request_id) VALUES (?, ?, ?, ?)').bind(site.id, r.date, time, r.id));
}

const slotTaken = (cors) => new HttpError(409, {
  error: 'slot_taken', message: 'Sorry, someone just booked that time. Please pick another.',
}, cors);

function rowToRequest(row) {
  return {
    id: row.id, kind: row.kind, service: row.service, date: row.date, time: row.time, minutes: row.minutes,
    name: row.name, contactVia: row.contact_via, phone: row.phone, email: row.email, message: row.message,
    status: row.status, createdAt: row.created_at,
  };
}

const publicRequest = (r) => ({ id: r.id, kind: r.kind, service: r.service, date: r.date, time: r.time, minutes: r.minutes, status: r.status });

function makeRef() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const s = [...bytes].map((b) => REF_CHARS[b % REF_CHARS.length]).join('');
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

function corsHeaders(request, site) {
  const origin = request.headers.get('Origin');
  const allowed = site && origin && (site.allowedOrigins.includes('*') || site.allowedOrigins.includes(origin));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function originAllowed(request, site) {
  const origin = request.headers.get('Origin');
  if (!origin || site.allowedOrigins.includes('*')) return true;
  return site.allowedOrigins.includes(origin) || origin === new URL(request.url).origin;
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

class HttpError extends Error {
  constructor(status, body, headers = {}) {
    super(body.message || body.error);
    this.status = status;
    this.body = body;
    this.headers = headers;
  }
}
