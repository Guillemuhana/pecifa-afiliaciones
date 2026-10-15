import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseOk = Boolean(url && key);
export const supabase = supabaseOk ? createClient(url, key, { auth: { persistSession: true, storageKey: 'pecifa-admin' } }) : null;
export const BUCKET = 'afiliaciones';
