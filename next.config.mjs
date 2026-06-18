/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent accidental exposure of server-only env vars to the browser bundle
  serverRuntimeConfig: {
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    databaseUrl: process.env.DATABASE_URL,
  },
  publicRuntimeConfig: {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
}

export default nextConfig
