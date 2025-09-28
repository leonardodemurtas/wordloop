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

  const { q = '', type = '', relevance = '' } = req.query || {};

  try {
    // Use head:true so we only get a count (no rows transferred)
    let query = supabase
      .from('words')
      .select('id', { count: 'exact', head: true });

    if (q) {
      query = query.or(`word.ilike.%${q}%,description.ilike.%${q}%`);
    }
    if (type) query = query.eq('type', String(type));
    if (relevance) query = query.eq('relevance', String(relevance));

    const { count, error } = await query;

    if (error) {
      console.error('Supabase count error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
    return res.status(200).json({ total: typeof count === 'number' ? count : 0 });
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'unexpected error' });
  }
}
