export default function handler(req, res) {
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || "not set",
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    apiKey: process.env.X_API_KEY ? "present" : "not set"
  });
}
