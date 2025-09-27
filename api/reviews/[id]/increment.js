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

  let body = {};
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch (e) {
    // ignore, we'll validate below
  }
  const correct = Boolean(body.correct);

  try {
    // 1) read current review_count (safe fallback if missing)
    const { data: currentRow, error: selectErr } = await supabase
      .from('words')
      .select('review_count')
      .eq('id', id)
      .maybeSingle();

    if (selectErr) {
      console.error('selectErr', selectErr);
      return res.status(500).json({ error: selectErr.message });
    }
    if (!currentRow) {
      return res.status(404).json({ error: 'word not found' });
    }

    const newCount = (currentRow.review_count || 0) + 1;
    const now = new Date().toISOString();

    // 2) update words table
    const { data: updated, error: updateErr } = await supabase
      .from('words')
      .update({ review_count: newCount, last_review: now })
      .eq('id', id)
      .select('id, review_count, last_review')
      .maybeSingle();

    if (updateErr) {
      console.error('updateErr', updateErr);
      return res.status(500).json({ error: updateErr.message });
    }

    // 3) insert event into reviews
    const { error: insertErr } = await supabase
      .from('reviews')
      .insert([{ word_id: id, correct }]);

    if (insertErr) {
      console.error('insertErr', insertErr);
      // don't fail the whole operation on analytics insert failure — but report it
      return res.status(500).json({ error: insertErr.message });
    }

    return res.status(200).json({
      ok: true,
      id: updated?.id ?? id,
      reviewCount: updated?.review_count ?? newCount,
      lastReviewedAt: updated?.last_review ?? now
    });
  } catch (err) {
    console.error('unexpected', err);
    return res.status(500).json({ error: 'unexpected error' });
  }
}
