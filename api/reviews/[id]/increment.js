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
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'missing id in path' });

  // parse body safely
  let body = {};
  try { body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch {}
  const correct = Boolean(body.correct);

  // 1) fetch current
  const { data: current, error: selErr } = await supabase
    .from('words')
    .select('review_count')
    .eq('id', id)
    .maybeSingle();

  if (selErr) return res.status(500).json({ error: selErr.message });
  if (!current) return res.status(404).json({ error: 'word not found' });

  const newCount = (current.review_count || 0) + 1;
  const now = new Date().toISOString();

  // 2) update words
  const { data: updated, error: updErr } = await supabase
    .from('words')
    .update({ review_count: newCount, last_review: now })
    .eq('id', id)
    .select('id, review_count, last_review')
    .maybeSingle();

  if (updErr) return res.status(500).json({ error: updErr.message });

  // 3) insert review event (best-effort; report error if any)
  const { error: insErr } = await supabase
    .from('reviews')
    .insert([{ word_id: id, correct }]);

  if (insErr) return res.status(500).json({ error: insErr.message });

  return res.status(200).json({
    ok: true,
    id: updated?.id ?? id,
    reviewCount: updated?.review_count ?? newCount,
    lastReviewedAt: updated?.last_review ?? now
  });
}
