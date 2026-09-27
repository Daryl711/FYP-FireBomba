const { createClient } = require("@supabase/supabase-js");

// A fresh client for every sign-in / refresh. supabase-js keeps the session it
// receives on the client object, so signing users in on the shared client in
// config/supabase.js would make every later query on it run as that user
// instead of as the service role.
const createAuthClient = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

module.exports = createAuthClient;
