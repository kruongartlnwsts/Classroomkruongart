// Supabase Configuration
// Please replace these with your actual Supabase URL and Anon Key
const SUPABASE_URL = 'https://gmoullxfmfauwubtruji.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdtb3VsbHhmbWZhdXd1YnRydWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MTk5NzUsImV4cCI6MjA5MzE5NTk3NX0.6RcXFN31PEt29sMex3Oc2u8Z6po48gd9c9VnO-io684';

// Initialize the Supabase Client
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
