import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function guard(req, res) {
  const k = req.headers['x-api-key'];
  if (!process.env.X_API_KEY || k !== process.env.X_API_KEY) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const URL = process.env.SUPABASE_URL || '';
  const SR  = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  // log presence (never secrets)
  console.error('ENV DEBUG:', { URL, SR });

  // preflight ping to Supabase REST (should return 200/404 but NOT throw)
  try {
    const ping = await fetch(`${URL}/rest/v1/`, {
      method: 'GET',
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '' }
    });
    console.error('PING:', { status: ping.status });
  } catch (e) {
    console.error('PING_FAIL:', e);
  }

  try {
    const { data, error } = await supabase
      .from('words')
      .select('id, word, description, example, type, relevance, review_count, last_review, created_at')
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
    return res.status(200).json({ items: data ?? [] });
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
