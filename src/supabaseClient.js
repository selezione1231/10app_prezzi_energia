import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://srtcuqatzaduvdteyjhb.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNydGN1cWF0emFkdXZkdGV5amhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDEyMjMsImV4cCI6MjA4OTc3NzIyM30.GziUnJ3PbQM9UmReyXjzXnKaWEC3dA88aGX0Dz_dwtI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
