// Supabase connection for sign-in. The anon key is public by design (row-level security protects the data).
// Never put the service_role key here. Leave both empty to run without Supabase (browser-only demo users).
window.STOCKSENSE_CONFIG = {
  SUPABASE_URL: 'https://hxdsjqrqvnstzyalnlia.supabase.co',
  // The StockSense backend (backend/ folder, `npm start`). It emails the password-reset codes with Nodemailer.
  API_URL: 'http://localhost:5000',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4ZHNqcXJxdm5zdHp5YWxubGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzOTc1NjgsImV4cCI6MjEwNTk3MzU2OH0.Tn9vgQuTRYg8BC32tuIsoUHW-iwYJ7yEjTsfjP4Ofx8',
};
