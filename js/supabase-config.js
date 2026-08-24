// Jericho Platform — Supabase client configuration
//
// This is the PUBLISHABLE key, meant to be visible in client-side code —
// it identifies the project but grants nothing by itself. All real access
// control happens in Postgres via Row Level Security (see
// sql/rls_policies.sql). Never put the service role key in this file or
// anywhere else under version control.
//
// Loaded via <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/dist/umd/supabase.js">
// in every page before this file. That UMD build defines a global `supabase`
// object with .createClient() — verified against the published package
// (dist/umd/supabase.js), not assumed.

const SUPABASE_URL = 'https://coarclhafggkakmpggfh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gDvKmt06iRiRYmDSYXv7Mg_XARxm2o0';

const jericho = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
