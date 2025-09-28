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

  try {
    const { data, error } = await supabase
      .from('words')
      .select('id, word, created_at')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    const first = (data && data[0]) || null;
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');

    // Return the minimal shape: { id, word, createdAt } or null if none
    return res.status(200).json(first ? {
      id: first.id,
      word: first.word,
      createdAt: first.created_at
    } : null);
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'unexpected error' });
  }
}
