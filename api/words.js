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

  const { q = '', type = '', relevance = '', limit = '20' } = req.query || {};
  const lim = Math.min(Math.max(parseInt(String(limit), 10) || 20, 1), 100);

  try {
    let query = supabase
      .from('words')
      .select('id, word, description, example, type, relevance, review_count, last_review, created_at', { count: 'exact' });

    if (q) {
      // simple case-insensitive match on word/description
      query = query.or(`word.ilike.%${q}%,description.ilike.%${q}%`);
    }
    if (type) query = query.eq('type', String(type));
    if (relevance) query = query.eq('relevance', String(relevance));

    const { data, error, count } = await query
      .order('created_at', { ascending: true })
      .limit(lim);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
    return res.status(200).json({
      items: data ?? [],
      nbHits: typeof count === 'number' ? count : (data?.length ?? 0)
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'unexpected error' });
  }
}
