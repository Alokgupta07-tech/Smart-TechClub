/**
 * Application Configuration
 * Central location for all environment-dependent values
 */

// API Base URL - uses Vercel API routes in production, localhost in dev
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Supabase Configuration
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Environment helpers
export const isDevelopment = import.meta.env.DEV;
export const isProduction = import.meta.env.PROD;
