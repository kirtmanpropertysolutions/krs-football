import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext } from './authContext'

/**
 * Dev-only breadcrumb logger. Auth flow traces are invaluable during
 * dev (and during a production incident if someone enables verbose
 * logging) but the emoji-prefixed firehose pollutes athletes' devtools
 * consoles and leaks query shapes. `console.error` / `console.warn`
 * below stay unconditional — those are the actionable signals.
 */
const devLog = (...args) => {
  if (import.meta.env.DEV) console.log(...args)
}

/**
 * Race a Supabase query against a hard timeout so a stuck network or
 * orphaned auth lock can't leave the user stranded on a loading spinner.
 * If the timeout wins, throws a tagged error the caller catches.
 * Hoisted to module scope — no React state, so it doesn't need to live
 * inside the component.
 */
const withTimeout = (queryPromise, label, ms = 12000) =>
  Promise.race([
    queryPromise,
    new Promise((_, reject) =>
      setTimeout(() => {
        const err = new Error(`Timeout: ${label} took longer than ${ms}ms`)
        err.isAuthTimeout = true
        reject(err)
      }, ms)
    ),
  ])

/**
 * Last-resort recovery: drop the stale Supabase token from localStorage
 * and hard-reload.
 *
 * Only safe to call on the INITIAL page load — if we trigger this on a
 * background token-refresh that happened while the user was sitting on
 * a page, we'll sign them out mid-session for no reason. Subsequent
 * timeouts (post-init) just log the error and leave the user where
 * they are; the next user interaction will retry the query naturally.
 *
 * Guarded by `sessionStorage` so we never recovery-loop. If reloading
 * doesn't fix things on the first try, the user sees the actual stuck
 * state instead of an infinite reload loop.
 */
const recoverFromStuckAuth = () => {
  if (typeof window === 'undefined') return
  if (sessionStorage.getItem('krs_auth_recovery_attempted')) {
    console.warn('🔧 useAuth: Skipping recovery — already attempted this session')
    return
  }
  console.warn('🔧 useAuth: Stuck auth detected — clearing storage and reloading')
  try {
    sessionStorage.setItem('krs_auth_recovery_attempted', '1')
    Object.keys(localStorage)
      .filter((k) => k.startsWith('sb-'))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* localStorage may be blocked in private mode — nothing to clean up */
  }
  window.location.reload()
}

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true) // Start with loading=true
  const [profile, setProfile] = useState(null)

  const loadUserProfile = useCallback(async (userId, { isInitialLoad = false } = {}) => {
    devLog('👤 useAuth: Loading user profile for userId:', userId)
    try {
      // Step 1: Load profile data (raced against a 12s hang-timeout)
      devLog('🔍 useAuth: Executing profile query')
      const { data: profileData, error: profileError } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', userId).single(),
        'profile query'
      )

      if (profileError) {
        console.error('❌ useAuth: Profile query error:', profileError.message, profileError.code)
        return
      }

      devLog('✅ useAuth: Profile loaded successfully:', profileData)

      // Step 2: Load org membership data (non-fatal if missing)
      devLog('🔍 useAuth: Executing org_members query')
      const { data: orgMemberData, error: orgMemberError } = await withTimeout(
        supabase.from('org_members').select('org_id, role').eq('user_id', userId).maybeSingle(),
        'org_members query'
      )

      if (orgMemberError) {
        console.error('❌ useAuth: Org member query error:', orgMemberError.message)
        // Non-fatal — continue with profile-only data
      }

      devLog('✅ useAuth: Org member data loaded:', orgMemberData)

      // Step 3: Load athlete data (non-fatal if missing)
      devLog('🔍 useAuth: Executing athletes query')
      const { data: athleteData, error: athleteError } = await withTimeout(
        supabase.from('athletes').select('*').eq('user_id', userId).maybeSingle(),
        'athletes query'
      )

      if (athleteError) {
        console.error('❌ useAuth: Athlete query error:', athleteError.message)
        // Non-fatal — continue without athlete data
      }

      devLog('✅ useAuth: Athlete data loaded:', athleteData)

      // Step 4: Merge all results
      // The org_members table can override role/org_id for multi-org users, but
      // when org_member row is missing or has null role we fall back to the
      // authoritative value from the profiles table.
      const mergedProfile = {
        ...profileData,
        org_id: orgMemberData?.org_id ?? profileData?.org_id,
        role: orgMemberData?.role ?? profileData?.role,
        athlete: athleteData
      }

      devLog('✅ useAuth: Merged profile data:', mergedProfile)
      setProfile(mergedProfile)

    } catch (error) {
      console.error('💥 useAuth: Exception in loadUserProfile:', error.message)
      // Hard timeout handling — only force-recover on the very first
      // page load, when there's no good UX path forward. On background
      // token refreshes (TOKEN_REFRESHED, page navigations after first
      // load) we just log and return; the user keeps their session.
      if (error.isAuthTimeout) {
        if (isInitialLoad) {
          recoverFromStuckAuth()
        } else {
          console.warn(
            '⚠️  useAuth: Profile refresh timed out post-init — keeping current session. ' +
              'Will retry on next auth state change.'
          )
        }
        return
      }
      // Re-throw so callers can decide how to handle it (log vs. surface to user)
      throw error
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    // Initialize auth state from Supabase (no manual timeouts — Supabase handles
    // token refresh automatically via its own refresh logic and localStorage).
    // Aggressive timeouts here were causing sessions to be incorrectly nuked
    // during dev hot-reloads and slow network conditions.
    const initializeAuth = async () => {
      try {
        devLog('🚀 useAuth: Starting auth initialization')

        const { data: { session }, error } = await supabase.auth.getSession()

        if (!isMounted) return

        if (error) {
          console.error('❌ useAuth: Error getting session:', error.message)
          // Don't sign out globally on a read error — just clear local state
          setSession(null)
          setUser(null)
          setProfile(null)
          return
        }

        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          devLog('👤 useAuth: Session found, loading profile')
          // Initial-load path — if the profile query hangs here, the
          // user is truly stuck (blank Loading spinner with no session
          // state). Allow recoverFromStuckAuth to clear localStorage
          // and reload as a last resort.
          await loadUserProfile(session.user.id, { isInitialLoad: true })
        } else {
          setProfile(null)
        }
      } catch (error) {
        console.error('💥 useAuth: Error initializing auth:', error.message)
        // Don't sign out — just leave loading=false so the app renders the login page
        setSession(null)
        setUser(null)
        setProfile(null)
      } finally {
        if (isMounted) {
          devLog('✅ useAuth: Auth initialization complete, setting loading=false')
          setLoading(false)
        }
      }
    }

    // Subscribe to auth state changes. Supabase fires these for:
    //   INITIAL_SESSION — on first load (may overlap with getSession above, harmless)
    //   SIGNED_IN       — after signInWithPassword or OAuth callback
    //   TOKEN_REFRESHED — automatic silent refresh (every ~55 min)
    //   SIGNED_OUT      — after explicit signOut()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return

      devLog('Auth state change:', event, session?.user?.id)

      if (event === 'SIGNED_OUT') {
        setSession(null)
        setUser(null)
        setProfile(null)
        return
      }

      // SIGNED_IN and TOKEN_REFRESHED both need fresh session + profile in state.
      // INITIAL_SESSION is skipped here — getSession() above handles first load.
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          // Profile load failure here is non-fatal — log it and keep the session alive
          await loadUserProfile(session.user.id).catch(err =>
            console.error('❌ useAuth: Profile reload failed on auth change:', err.message)
          )
        }
      }
    })

    initializeAuth()

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [loadUserProfile])

  // Signup joins the program inside the database: the invite code and full
  // name ride along as auth metadata, and the on_auth_user_created trigger
  // (supabase/football/100_football_core.sql) validates the code, consumes a
  // use, and creates the profile + membership in the same transaction. An
  // invalid code aborts the whole signup, so no orphan accounts are left.
  const signUp = async (email, password, inviteCode, fullName) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            invite_code: (inviteCode || '').trim(),
            full_name: (fullName || '').trim(),
          },
        },
      })

      if (error) {
        const msg = (error.message || '').toLowerCase()
        if (msg.includes('database error') || msg.includes('invalid_invite_code')) {
          return { data: null, error: { message: 'Invalid or expired invite code.' } }
        }
        return { data: null, error }
      }

      // Projects with email confirmation on return no session — the account
      // and program membership exist; the athlete confirms, then signs in.
      if (!data?.session) {
        return { data, error: null, needsConfirmation: true }
      }

      return { data, error: null }
    } catch (error) {
      console.error('Signup error:', error)
      return {
        data: null,
        error: { message: 'Signup failed. Please try again.' },
      }
    }
  }

  const signIn = async (email, password) => {
    return await supabase.auth.signInWithPassword({
      email,
      password,
    })
  }

  const signOut = async () => {
    try {
      // (a) Sign out from Supabase with global scope first
      await supabase.auth.signOut({ scope: 'global' })

      // (b) Clear all localStorage
      localStorage.clear()

      // (c) Hard redirect to root
      window.location.href = '/'
    } catch (error) {
      console.error('Error signing out:', error)
      // Even if signOut fails, clear local state and redirect
      localStorage.clear()
      window.location.href = '/'
    }
  }

  const value = {
    session,
    user,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    isAdmin: profile?.role === 'admin',
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}