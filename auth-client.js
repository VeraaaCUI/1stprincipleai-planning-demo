/* One Supabase SDK client owns authentication and session persistence.
 * This adapter exposes only validated public user state, never session tokens.
 */
(function (scope) {
  'use strict';
  function create(options = {}) {
    const config = options.config || scope.FirstPrincipleRuntimeConfig || {};
    const listeners = new Set();
    let state = {status: 'loading', user: null, error: '', recovery: false};
    let disposed = false, epoch = 0, subscription = null, client = options.client || null;
    let initializing = true, activeActions = 0;
    const location = options.location || scope.location;
    const history = options.history || scope.history;
    let callback = null, callbackError = false, recoveryRequested = false;
    function getState() { return {...state, user: state.user ? {...state.user} : null}; }
    function publish(next) {
      if (disposed) return getState();
      state = {...state, ...next};
      for (const listener of listeners) { try { listener(getState()); } catch (_) { /* A view cannot break the SDK session. */ } }
      return getState();
    }
    function cleanCallback(keepRecovery = false) {
      if (!location?.href || !history?.replaceState) return;
      const url = new URL(location.href);
      ['code', 'error', 'error_code', 'error_description', 'auth'].forEach(key => url.searchParams.delete(key));
      if (keepRecovery) url.searchParams.set('auth', 'recovery');
      if (/^#(?:access_token|error|refresh_token)=/.test(url.hash)) url.hash = '#/home';
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
    if (location?.href) {
      const url = new URL(location.href);
      recoveryRequested = url.searchParams.get('auth') === 'recovery';
      callback = url.searchParams.get('code');
      callbackError = url.searchParams.has('error') || /^#(?:access_token|error|refresh_token)=/.test(url.hash);
      // Remove credentials/codes before the existing hash router handles URLs.
      if (callback || callbackError) cleanCallback(recoveryRequested && !callbackError);
    }
    const callbackPending = Boolean(callback || callbackError || recoveryRequested);
    const unavailable = 'Account services are not configured. You can continue exploring properties; sign in to create and manage account projects.';
    if (!client) {
      try {
        const url = new URL(config.supabaseUrl || '');
        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.hostname.startsWith('db.')) throw new Error('Invalid public Auth URL.');
        if (!/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(config.supabasePublishableKey || '')) throw new Error('A publishable browser key is required.');
        if (!scope.supabase?.createClient) throw new Error('The Supabase JavaScript client could not load.');
        client = scope.supabase.createClient(url.origin, config.supabasePublishableKey, {
          auth: {flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false}
        });
      } catch (_) { publish({status: 'unavailable', error: unavailable, user: null}); }
    }
    function required() { if (!client || state.status === 'unavailable') throw new Error(unavailable); }
    function safeError(error, fallback) {
      if (!error) return '';
      // Do not surface request URLs, headers or SDK stack traces in the page.
      const code = String(error.code || '');
      if (['invalid_credentials', 'email_not_confirmed'].includes(code)) return code === 'email_not_confirmed' ? 'Confirm your email before logging in.' : 'The email or password is incorrect.';
      if (/rate|limit/.test(code) || error.status === 429) return 'Too many requests. Please wait before trying again.';
      if (/weak_password/.test(code)) return 'Choose a stronger password that meets the account requirements.';
      if (/signup_disabled/.test(code)) return 'New account registration is not enabled for this project.';
      if (/email_address/.test(code)) return 'Enter a valid email address.';
      if (/fetch|network|timeout/i.test(error.message || '')) return 'Account services could not be reached. Check your connection and try again.';
      return fallback;
    }
    function email(value) {
      const result = String(value || '').trim();
      if (result.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error('Enter a valid email address.');
      return result;
    }
    function password(value, creating = false) {
      if (typeof value !== 'string' || !value || value.length > 1024 || (creating && value.length < 8)) throw new Error(creating ? 'Use a password with at least 8 characters.' : 'Enter your password.');
      return value;
    }
    function redirect(kind) {
      if (!location?.href) throw new Error('Account links require a website address.');
      const url = new URL(location.href);
      url.search = ''; url.hash = ''; url.searchParams.set('auth', kind);
      return url.href;
    }
    async function validate({recovery = state.recovery, quiet = false} = {}) {
      required(); const ticket = ++epoch;
      if (!quiet) publish({status: 'loading', user: null, error: ''});
      try {
        const sessionResult = await client.auth.getSession();
        if (sessionResult.error) throw sessionResult.error;
        if (!sessionResult.data?.session) {
          if (ticket === epoch) publish({status: 'anonymous', user: null, recovery: false, error: ''});
          return getState();
        }
        // A locally cached user/JWT is not sufficient for restored UI identity.
        const result = await client.auth.getUser();
        if (result.error || !result.data?.user?.id) throw result.error || new Error('Invalid session.');
        if (result.data.user.id !== sessionResult.data.session.user?.id) throw new Error('The account changed while verifying the session.');
        if (ticket === epoch) publish({status: 'authenticated', user: {id: result.data.user.id, email: result.data.user.email || ''}, recovery: Boolean(recovery), error: ''});
      } catch (error) {
        if (ticket === epoch) publish({status: 'anonymous', user: null, recovery: false,
          error: safeError(error, 'Your session could not be verified. Please log in again.')});
      }
      return getState();
    }
    if (client) {
      const result = client.auth.onAuthStateChange((event, session) => {
        if (disposed || event === 'INITIAL_SESSION') return;
        // Startup validation owns restored-session identity while the SDK hydrates storage.
        if (initializing && event === 'SIGNED_IN') return;
        if (event === 'SIGNED_OUT') { epoch++; publish({status: 'anonymous', user: null, recovery: false, error: ''}); return; }
        if (session?.user?.id !== state.user?.id) {
          // Clear the old principal synchronously, before views or repositories
          // can pair that identity with a newly switched SDK token.
          epoch++; recoveryRequested = event === 'PASSWORD_RECOVERY';
          publish({status:'loading', user:null, recovery:false, error:''});
        }
        if (event === 'PASSWORD_RECOVERY') recoveryRequested = true;
        // Explicit SDK actions perform their own verification after completion.
        // A competing listener verification must not invalidate that result.
        if (initializing || activeActions) return;
        // Calling another Auth method inside this SDK callback can deadlock.
        // Schedule verification after the SDK's session/storage lock releases.
        scope.setTimeout(() => {
          if (!disposed) validate({recovery: recoveryRequested || state.recovery, quiet: true}).catch(() => {});
        }, 0);
      });
      subscription = result?.data?.subscription;
    }
    const ready = (async () => {
      if (!client) return getState();
      if (callbackError) return publish({status: 'anonymous', user: null, recovery: false,
        error: 'This account link is invalid or expired. Request a new link and open it in the browser where you started.'});
      if (callback) {
        try {
          const result = await client.auth.exchangeCodeForSession(callback);
          callback = null;
          if (result.error || !result.data?.session) throw result.error || new Error('No session returned.');
        } catch (_) {
          cleanCallback(false);
          return publish({status: 'anonymous', user: null, recovery: false,
            error: 'This account link could not be verified. Request a new link and open it in the same browser where you started.'});
        }
      }
      const result = await validate({recovery: recoveryRequested});
      if (recoveryRequested && result.status !== 'authenticated') {
        cleanCallback(false);
        return publish({error: result.error || 'Request a new password reset link before changing your password.'});
      }
      return result;
    })().finally(() => { initializing = false; });
    async function action(task) {
      required(); activeActions++;
      try { return await task(); } finally { activeActions--; }
    }
    function signIn(input = {}) { return action(async () => {
      const credentials = {email: email(input.email), password: password(input.password)};
      const result = await client.auth.signInWithPassword(credentials);
      credentials.password = '';
      if (result.error || !result.data?.session) throw new Error(safeError(result.error, 'Log in could not be completed. Check your details and try again.'));
      recoveryRequested = false; cleanCallback(false);
      const verified = await validate({recovery: false});
      if (verified.status !== 'authenticated') throw new Error(verified.error || 'Your session could not be verified. Please try again.');
      return verified;
    }); }
    function signUp(input = {}) { return action(async () => {
      const credentials = {email: email(input.email), password: password(input.password, true), options: {emailRedirectTo: redirect('callback')}};
      const result = await client.auth.signUp(credentials);
      credentials.password = '';
      if (result.error) throw new Error(safeError(result.error, 'Registration could not be completed. Try again or contact support.'));
      if (result.data?.session) {
        const verified = await validate({recovery: false});
        if (verified.status !== 'authenticated') throw new Error(verified.error || 'Your session could not be verified.');
      }
      return {authenticated: Boolean(result.data?.session) && state.status === 'authenticated', confirmationRequired: !result.data?.session};
    }); }
    function signOut() { return action(async () => {
      const result = await client.auth.signOut();
      if (result.error) throw new Error(safeError(result.error, 'Log out could not be completed. Please try again.'));
      epoch++; recoveryRequested = false; cleanCallback(false);
      return publish({status: 'anonymous', user: null, recovery: false, error: ''});
    }); }
    async function requestPasswordReset(input = {}) {
      required(); const result = await client.auth.resetPasswordForEmail(email(input.email), {redirectTo: redirect('recovery')});
      if (result.error) throw new Error(safeError(result.error, 'A reset link could not be requested. Please try again.'));
      return {accepted: true};
    }
    function updatePassword(input = {}) { return action(async () => {
      if (state.status !== 'authenticated' || !state.recovery) throw new Error('Open a valid password reset link before setting a new password.');
      const result = await client.auth.updateUser({password: password(input.password, true)});
      if (result.error) throw new Error(safeError(result.error, 'Your password could not be updated. Request a new reset link or try again.'));
      recoveryRequested = false; cleanCallback(false);
      publish({recovery: false}); return {updated: true};
    }); }
    return Object.freeze({ready, client, callbackPending, getState, signIn, signUp, signOut, requestPasswordReset, updatePassword,
      revalidate: () => validate(),
      subscribe(listener) { listeners.add(listener); listener(getState()); return () => listeners.delete(listener); },
      destroy() { disposed = true; epoch++; listeners.clear(); subscription?.unsubscribe(); }
    });
  }
  const api = Object.freeze({create}); scope.FirstPrincipleAuth = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
