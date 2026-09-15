// =============================================
// CONFIGURACIÓN SUPABASE (compartida por toda la app)
// =============================================
const SUPABASE_URL = 'https://cksdigyzhhhitgwtuiwi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrc2RpZ3l6aGhoaXRnd3R1aXdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMTY3NDIsImV4cCI6MjA5OTc5Mjc0Mn0.jCr4U8NTUagesIH4K5wTxqS2Lq4M8a3nXRcIrKmCiqY';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

// Base para OAuth e invitaciones por email (debe coincidir con Supabase Redirect URLs)
const APP_BASE_URL = typeof window !== 'undefined'
    ? new URL('./', window.location.href).href
    : 'https://torisapp.vercel.app/';
