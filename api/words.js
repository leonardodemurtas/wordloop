// api/words.js
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

  if (req.method === 'POST') return createWord(req, res);
  if (req.method === 'GET')  return listWords(req, res);

  return res.status(405).json({ error: 'method not allowed' });
}

/* -------------------------- POST /api/words -------------------------- */
async function createWord(req, res) {
  // Parse JSON body safely
  let body = {};
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch {
    return res.status(400).json({ error: 'invalid JSON body' });
  }

  // Required
  const rawWord = (body.word ?? '').toString().trim();
  if (!rawWord) return res.status(400).json({ error: 'word is required' });

  // Optional fields (trimmed)
  const description   = (body.description ?? '').toString().trim() || null;
  const example       = (body.example ?? '').toString().trim() || null;
  const type          = (body.type ?? '').toString().trim() || null;
  const conjugations  = (body.conjugations ?? '').toString().trim() || null;
  const collocations  = (body.collocations ?? '').toString().trim() || null;

  // Relevance normalization
  const allowedRel = ['low','medium','high'];
  const rel = (body.relevance ?? '').toString().toLowerCase().trim();
  const relevance = allowedRel.includes(rel) ? rel : 'medium';

  // last_review (optional iso); if bad, ignore
  let last_review = null;
  if (body.last_review) {
    const d = new Date(body.last_review);
    if (!Number.isNaN(d.getTime())) last_review = d.toISOString();
  }

  // Always start at zero regardless of what the caller sends
  const review_count = 0;

  // (Optional) simple duplicate check (case-insensitive exact match)
  const { data: dupe, error: dupeErr } = await supabase
    .from('words')
    .select('id, word')
    .ilike('word', rawWord)   // equality when no % wildcard, case-insensitive
    .maybeSingle();

  if (dupeErr) return res.status(500).json({ error: dupeErr.message });
  if (dupe)    return res.status(409).json({ error: 'already exists', id: dupe.id });

  // Insert
  const insertRow = {
    word: rawWord,
    description,
    example,
    type,
    relevance,
    conjugations,
    collocations,
    review_count,
    last_review
    // created_at/updated_at are set by DB defaults/trigger
  };

  const { data, error } = await supabase
    .from('words')
    .insert([insertRow])
    .select('id, word, description, example, type, relevance, review_count, last_review, created_at, updated_at')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(201).json({ item: data });
}

/* --------------------------- GET /api/words -------------------------- */
async function listWords(req, res) {
  const { q = '', type = '', relevance = '', limit = '20' } = req.query || {};
  const lim = Math.min(Math.max(parseInt(String(limit), 10) || 20, 1), 100);

  // Clean q: trim and remove a single pair of wrapping double quotes
  const rawQ = String(q ?? '');
  let cleanedQ = rawQ.trim();
  if (/^".*"$/.test(cleanedQ)) cleanedQ = cleanedQ.slice(1, -1);
  const hasQuery = cleanedQ.length > 0;

  try {
    // Ranked FTS via RPC when q is present
    if (hasQuery) {
      const { data, error } = await supabase.rpc('search_words', {
        p_q: cleanedQ,
        p_type: type || null,
        p_relevance: relevance || null,
        p_limit: lim
      });

      if (!error) {
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
        return res.status(200).json({ items: data ?? [], nbHits: data?.length ?? 0 });
      }
      console.error('RPC search_words error (fallback to ILIKE):', error);
    }

    // Fallback / no-q path: ILIKE
    let query = supabase
      .from('words')
      .select('id, word, description, example, type, relevance, review_count, last_review, created_at', { count: 'exact' });

    if (hasQuery) {
      const qEsc = cleanedQ.replace(/,/g, '\\,');
      query = query.or(`word.ilike.%${qEsc}%,description.ilike.%${qEsc}%`);
    }
    if (type)      query = query.eq('type', String(type));
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