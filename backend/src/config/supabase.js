const path = require("path");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase environment variables. Check backend/.env for SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

module.exports = supabase;
