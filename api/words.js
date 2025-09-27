import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

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

  try {
    // log env check (safe: don’t log the key itself)
    console.log('SUPABASE_URL:', supabaseUrl);
    console.log('Service key present?', !!supabaseKey);

    const { data, error } = await supabase
      .from('words')
      .select('*')
      .limit(20);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ items: data });
  } catch (err) {
    console.error('Handler crashed:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
}
