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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { data, error } = await supabase
    .schema('lexicon')   // ✅ point to your schema
    .from('words')       // ✅ table name
    .select('*')
    .limit(10);

  if (error) {
    console.error('Supabase error:', error); // 👀 goes to Vercel Logs
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ items: data });
}
