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
  // parse JSON body safely
  let body = {};
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch {
    return res.status(400).json({ error: 'invalid JSON body' });
  }

  // required
  const rawWord = (body.word ?? '').toString().trim();
  if (!rawWord) return res.status(400).json({ error: 'word is required' });

  // optional
  const description   = (body.description ?? '').toString().trim() || null;
  const example       = (body.example ?? '').toString().trim() || null;
  const type          = (body.type ?? '').toString().trim() || null;
  const conjugations  = (body.conjugations ?? '').toString().trim() || null;
  const collocations  = (body.collocations ?? '').toString().trim() || null;

  // relevance
  const allowedRel = ['low','medium','high'];
  const rel = (body.relevance ?? '').toString().toLowerCase().trim();
  const relevance = allowedRel.includes(rel) ? rel : 'medium';

  // last_review (optional ISO)
  let last_review = null;
  if (body.last_review) {
    const d = new Date(body.last_review);
    if (!Number.isNaN(d.getTime())) last_review = d.toISOString();
  }

  // always start at zero
  const review_count = 0;

  // ✅ simple dupe check (case-insensitive, tolerate multiples)
  const { data: dupeRows, error: dupeErr } = await supabase
    .from('words')
    .select('id')
    .ilike('word', rawWord)   // case-insensitive exact match (no %)
    .limit(1);

  if (dupeErr) return res.status(500).json({ error: dupeErr.message });
  if (Array.isArray(dupeRows) && dupeRows.length > 0) {
    return res.status(409).json({ error: 'already exists', id: dupeRows[0].id });
  }

  // insert a single object, then read first returned row (no .single())
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
  };

  const { data: insRows, error: insErr } = await supabase
    .from('words')
    .insert(insertRow)
    .select('id, word, description, example, type, relevance, review_count, last_review, created_at, updated_at')
    .limit(1);

  if (insErr) return res.status(500).json({ error: insErr.message });

  const item = Array.isArray(insRows) ? insRows[0] : insRows;
  if (!item) return res.status(500).json({ error: 'insert failed: no row returned' });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(201).json({ item });
}

/* --------------------------- GET /api/words -------------------------- */
async function listWords(req, res) {
  const { q = '', type = '', relevance = '', limit = '20' } = req.query || {};
  const lim = Math.min(Math.max(parseInt(String(limit), 10) || 20, 1), 100);

  // clean q: trim and remove a single pair of wrapping double quotes
  const rawQ = String(q ?? '');
  let cleanedQ = rawQ.trim();
  if (/^".*"$/.test(cleanedQ)) cleanedQ = cleanedQ.slice(1, -1);
  const hasQuery = cleanedQ.length > 0;

  try {
    // ranked FTS via RPC when q is present
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

    // fallback / no-q: ILIKE
    let query = supabase
      .from('words')
      .select(
        'id, word, description, example, type, relevance, review_count, last_review, created_at',
        { count: 'exact' }
      );

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