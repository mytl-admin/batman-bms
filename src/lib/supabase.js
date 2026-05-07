const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

let singleton;

function getSupabase() {
  if (!singleton) {
    singleton = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      realtime: { transport: ws },
    });
  }
  return singleton;
}

module.exports = { getSupabase };
