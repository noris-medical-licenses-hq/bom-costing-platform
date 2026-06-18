import type { SupabaseServerClient } from '../lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tables, Inserts } from '../types/database.generated'
import { handleSupabaseError, NotFoundError } from './base/errors'

export type Profile = Tables<'profiles'>

// ─── Profile Reads ────────────────────────────────────────────────────────────

export async function findProfileByUserId(
  userId: string,
  client: SupabaseServerClient | SupabaseClient
): Promise<Profile | null> {
  const { data, error } = await (client as SupabaseServerClient)
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') {
    handleSupabaseError(error, 'findProfileByUserId', 'profiles')
  }
  return data ?? null
}

export async function findProfileById(id: string, client: SupabaseServerClient): Promise<Profile> {
  const { data, error } = await client.from('profiles').select('*').eq('id', id).single()
  if (error) handleSupabaseError(error, 'findProfileById', 'profiles')
  if (!data) throw new NotFoundError('Profile', id)
  return data
}

export async function listProfilesByOrg(client: SupabaseServerClient): Promise<Profile[]> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('is_active', true)
    .order('full_name', { ascending: true })
  if (error) handleSupabaseError(error, 'listProfilesByOrg', 'profiles')
  return data ?? []
}

// ─── Profile Writes (service-role only — bypasses RLS) ───────────────────────

// Called by the auth webhook when a new user signs up.
// Must use the service_role client; user JWT does not exist yet.
export async function createProfile(
  input: Inserts<'profiles'>,
  client: SupabaseClient
): Promise<Profile> {
  const { data, error } = await client.from('profiles').insert(input).select().single()
  if (error) handleSupabaseError(error, 'createProfile', 'profiles')
  if (!data) throw new Error('createProfile returned no data')
  return data
}

export async function updateProfileRole(
  profileId: string,
  role: Profile['role'],
  client: SupabaseServerClient
): Promise<Profile> {
  const { data, error } = await client
    .from('profiles')
    .update({ role })
    .eq('id', profileId)
    .select()
    .single()
  if (error) handleSupabaseError(error, 'updateProfileRole', 'profiles')
  if (!data) throw new NotFoundError('Profile', profileId)
  return data
}

export async function deactivateProfile(
  profileId: string,
  client: SupabaseServerClient
): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({ is_active: false })
    .eq('id', profileId)
  if (error) handleSupabaseError(error, 'deactivateProfile', 'profiles')
}

export async function touchLastSeen(userId: string, client: SupabaseServerClient): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) handleSupabaseError(error, 'touchLastSeen', 'profiles')
}
