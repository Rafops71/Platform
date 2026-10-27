// The weekly business update: plain numbers for the owner, by email, every
// Monday morning. Asked for on 2026-10-27 (docs/AGREED-2026-10-25.md):
// all the figures, Monday 08:00 Brussels, to both of his addresses.
//
// It goes by email and never into the repository or a GitHub issue, because
// the repository is public and these are business figures.
//
// Test accounts are left out. The browser suite runs against the live
// database and every account it makes has an email starting with
// 'jericho-e2e-' (tests/e2e/helpers/fixtures.js, E2E_PREFIX). Counting them
// would report the robots' activity as the business's.
//
//   node scripts/business-update.js            # send
//   node scripts/business-update.js --dry-run  # print, send nothing
//
// Needs SUPABASE_DB_URL, and for sending RESEND_API_KEY and LISTING_EMAIL_FROM
// (the same secrets as send-listing-emails.js). BUSINESS_UPDATE_TO overrides
// the recipients (comma-separated).

const { Client } = require('pg');

const DEFAULT_TO = ['rafael@myplatform.trade', 'rafael.e@telenet.be'];
const TEST_PREFIX = 'jericho-e2e-%';

// One query. Every figure is for the seven days before `until`, except
// "waiting for approval", which is how many are waiting right now.
const SQL = `
with real_profiles as (
  select id, role, status, created_at from public.profiles
  where email not like $3
),
real_listings as (
  select l.* from public.listings l
  join real_profiles p on p.id = l.user_id
)
select
  (select count(*) from real_profiles
     where role = 'participant' and created_at >= $1 and created_at < $2)          as new_members,
  (select count(*) from real_profiles
     where role = 'participant' and status = 'pending')                           as waiting_approval,
  (select count(*) from real_profiles
     where role = 'participant' and status = 'approved')                          as approved_members,
  (select count(*) from real_listings
     where type = 'sell' and created_at >= $1 and created_at < $2)                as new_offers,
  (select count(*) from real_listings
     where type = 'buy' and created_at >= $1 and created_at < $2)                 as new_demands,
  (select count(*) from public.matches m
     join real_listings a on a.id = m.listing_a_id
     join real_listings b on b.id = m.listing_b_id
     where m.created_at >= $1 and m.created_at < $2)                              as new_matches,
  (select count(*) from public.deals d
     where d.opened_at >= $1 and d.opened_at < $2
       and not exists (select 1 from public.profiles p
                       where p.id in (d.owner_id, d.counterparty_id) and p.email like $3)) as deals_opened,
  (select count(*) from public.deals d
     where d.agreed_at >= $1 and d.agreed_at < $2
       and not exists (select 1 from public.profiles p
                       where p.id in (d.owner_id, d.counterparty_id) and p.email like $3)) as deals_agreed,
  (select count(*) from public.deals d
     where d.closed_at >= $1 and d.closed_at < $2
       and not exists (select 1 from public.profiles p
                       where p.id in (d.owner_id, d.counterparty_id) and p.email like $3)) as deals_closed
`;

async function figures(client, until = new Date()) {
  const since = new Date(until.getTime() - 7 * 24 * 3600 * 1000);
  const { rows } = await client.query(SQL, [since, until, TEST_PREFIX]);
  const n = {};
  for (const [k, v] of Object.entries(rows[0])) n[k] = Number(v);
  return { since, until, n };
}

function day(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/Brussels' });
}

function compose({ since, until, n }) {
  const lastDay = new Date(until.getTime() - 1);
  const lines = [
    `Your platform, ${day(since)} to ${day(lastDay)}`,
    '',
    'MEMBERS',
    `  New members registered:      ${n.new_members}`,
    `  Waiting for your approval:   ${n.waiting_approval}${n.waiting_approval ? '  <- open the Approvals tab' : ''}`,
    `  Approved members in total:   ${n.approved_members}`,
    '',
    'MARKET',
    `  New offers (sell):           ${n.new_offers}`,
    `  New demands (buy):           ${n.new_demands}`,
    `  Matches the platform found:  ${n.new_matches}`,
    '',
    'DEALS',
    `  Opened:                      ${n.deals_opened}`,
    `  Agreed:                      ${n.deals_agreed}`,
    `  Closed:                      ${n.deals_closed}`,
    '',
    'Test accounts used by the automatic checks are not counted.',
  ];
  return {
    subject: `Weekly update: ${n.new_members} new members, ${n.new_offers + n.new_demands} new listings, ${n.deals_closed} deals closed`,
    text: lines.join('\n'),
  };
}

async function send(mail) {
  const to = (process.env.BUSINESS_UPDATE_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.LISTING_EMAIL_FROM,
      to: to.length ? to : DEFAULT_TO,
      subject: mail.subject,
      text: mail.text,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend refused the weekly update: HTTP ${res.status} ${body}`);
  return body;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is not set');
  if (!dryRun && (!process.env.RESEND_API_KEY || !process.env.LISTING_EMAIL_FROM)) {
    throw new Error('RESEND_API_KEY and LISTING_EMAIL_FROM must be set to send');
  }
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const mail = compose(await figures(client));
    // Never print the figures when sending: this runs in GitHub Actions on a
    // public repository, and its logs are public. Only --dry-run, run by hand,
    // shows them.
    if (dryRun) console.log(mail.subject + '\n\n' + mail.text);
    else {
      const { id } = JSON.parse(await send(mail));
      console.log(`Weekly update sent (Resend id ${id}). Figures are in the email only.`);
    }
  } finally {
    await client.end();
  }
}

module.exports = { figures, compose, SQL };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
