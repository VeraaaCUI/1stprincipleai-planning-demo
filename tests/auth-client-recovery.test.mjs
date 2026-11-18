import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {create} = require('../auth-client.js');
const {accountPresentation} = require('../site-navigation.js');

const makeSession = id => ({access_token: `synthetic-access-${id}`, refresh_token: `synthetic-refresh-${id}`, user: {id, email: `${id}@example.test`}});
const ok = data => ({data, error: null});

function makeAuth({session = null, exchangeSession = session, exchangeError = null, getUserError = null, signInSession = session, signUpSession = null, onExchange} = {}) {
  let currentSession = session;
  let listener;
  const calls = {exchange: [], reset: [], update: [], signIn: [], signUp: []};
  function emit(event, next = currentSession) { listener?.(event, next); }
  const auth = {
    getSession: async () => ok({session: currentSession}),
    getUser: async () => getUserError ? {data: {user: null}, error: getUserError} : ok({user: currentSession?.user || null}),
    onAuthStateChange(callback) { listener = callback; return {data: {subscription: {unsubscribe() {}}}}; },
    async exchangeCodeForSession(code) {
      calls.exchange.push(code);
      await onExchange?.({emit, setSession(value) { currentSession = value; }, calls});
      if (exchangeError) return {data: {session: null}, error: exchangeError};
      currentSession = exchangeSession;
      emit('SIGNED_IN', currentSession);
      return ok({session: currentSession});
    },
    async resetPasswordForEmail(email, options) { calls.reset.push({email, options}); return ok({}); },
    async updateUser(input) { calls.update.push(input); return ok({user: currentSession?.user}); },
    async signInWithPassword(input) { calls.signIn.push(input); currentSession = signInSession; emit('SIGNED_IN', currentSession); return ok({session: currentSession}); },
    async signUp(input) { calls.signUp.push(input); currentSession = signUpSession; if (currentSession) emit('SIGNED_IN', currentSession); return ok({session: currentSession}); },
    async signOut() { currentSession = null; emit('SIGNED_OUT', null); return ok({}); }
  };
  return {client: {auth}, calls, emit, setSession(value) { currentSession = value; }};
}

function makePage(href) {
  let current = new URL(href);
  const location = {get href() { return current.href; }};
  const history = {state: {synthetic: true}, replaceState(_state, _title, url) { current = new URL(url, current); }};
  return {location, history, current: () => current};
}

function makeAdapter(authMock, href = 'https://1stprincipleai-planning-demo.pages.dev/?code=synthetic-code&auth=recovery') {
  const page = makePage(href);
  return {page, adapter: create({client: authMock.client, location: page.location, history: page.history})};
}

test('valid same-profile PKCE callback verifies session and activates password reset presentation', async () => {
  const recoveredSession = makeSession('synthetic-user-a');
  const auth = makeAuth({exchangeSession: recoveredSession});
  const {page, adapter} = makeAdapter(auth);

  const state = await adapter.ready;
  assert.equal(auth.calls.exchange[0], 'synthetic-code');
  assert.equal(state.status, 'authenticated');
  assert.equal(state.user.id, 'synthetic-user-a');
  assert.equal(state.recovery, true);
  assert.equal(state.recoveryError, false);
  assert.equal(page.current().searchParams.has('code'), false);
  assert.equal(page.current().searchParams.get('auth'), 'recovery');

  const view = accountPresentation({authState: state, authMode: 'login'});
  assert.equal(view.accountTitle, 'Set a new password');
  assert.equal(view.submitLabel, 'Update password');
  assert.equal(view.emailHidden, true);
  assert.equal(view.passwordHidden, false);
  assert.equal(view.confirmHidden, false);
});

test('password update uses the verified recovery session and returns to ordinary account mode', async () => {
  const auth = makeAuth({exchangeSession: makeSession('synthetic-user-b')});
  const {adapter} = makeAdapter(auth);
  await adapter.ready;

  assert.deepEqual(await adapter.updatePassword({password: 'Synthetic-new-pass-123'}), {updated: true});
  assert.deepEqual(auth.calls.update, [{password: 'Synthetic-new-pass-123'}]);
  const state = adapter.getState();
  assert.equal(state.status, 'authenticated');
  assert.equal(state.recovery, false);
  assert.equal(state.recoveryError, false);
  const view = accountPresentation({authState: state, authMode: 'login', authNotice: 'Your password has been updated.'});
  assert.equal(view.accountTitle, 'Your account');
  assert.equal(view.accountMessage, 'Your password has been updated.');
  assert.equal(view.formHidden, true);
});

test('expired or reused recovery code stays anonymous and offers a fresh-link request', async () => {
  const auth = makeAuth({exchangeError: Object.assign(new Error('synthetic expired code'), {code: 'otp_expired'})});
  const {page, adapter} = makeAdapter(auth);
  const state = await adapter.ready;

  assert.equal(state.status, 'anonymous');
  assert.equal(state.recovery, false);
  assert.equal(state.recoveryError, true);
  assert.match(state.error, /expired, already used, or opened in another browser/i);
  assert.doesNotMatch(state.error, /synthetic-code|access_token|refresh_token/i);
  assert.equal(page.current().searchParams.has('code'), false);
  await assert.rejects(adapter.updatePassword({password: 'Synthetic-new-pass-123'}), /valid password reset link/);

  const view = accountPresentation({authState: state, authMode: 'recovery-error'});
  assert.equal(view.accountTitle, 'Reset link needs attention');
  assert.equal(view.submitLabel, 'Send a new reset link');
  assert.equal(view.passwordHidden, true);
  assert.equal(view.emailHidden, false);
  assert.equal(view.backHidden, false);
  assert.match(view.accountMessage, /browser where you requested it/i);
});

test('missing PKCE verifier produces recovery guidance without exposing callback data', async () => {
  const auth = makeAuth({exchangeError: Object.assign(new Error('PKCE code verifier not found'), {code: 'pkce_code_verifier_not_found'})});
  const {adapter} = makeAdapter(auth);
  const state = await adapter.ready;

  assert.equal(state.status, 'anonymous');
  assert.equal(state.recoveryError, true);
  assert.match(state.error, /opened in another browser/i);
  assert.doesNotMatch(state.error, /synthetic-code|pkce_code_verifier_not_found/i);
});

test('failed callback exchange cannot create a session or authorize password changes', async () => {
  const auth = makeAuth({exchangeError: Object.assign(new Error('bad synthetic callback'), {code: 'bad_code'})});
  const {adapter} = makeAdapter(auth);
  const state = await adapter.ready;

  assert.equal(state.status, 'anonymous');
  assert.equal(state.user, null);
  assert.equal(state.recovery, false);
  assert.equal(state.recoveryError, true);
  await assert.rejects(adapter.updatePassword({password: 'Synthetic-new-pass-123'}));
  assert.deepEqual(auth.calls.update, []);
});

test('callback code alone is insufficient when server user validation fails', async () => {
  const auth = makeAuth({exchangeSession: makeSession('synthetic-unverified-user'), getUserError: Object.assign(new Error('synthetic validation failed'), {code: 'validation_error'})});
  const {adapter} = makeAdapter(auth);
  const state = await adapter.ready;

  assert.equal(state.status, 'anonymous');
  assert.equal(state.user, null);
  assert.equal(state.recovery, false);
  assert.equal(state.recoveryError, true);
  assert.equal(auth.calls.update.length, 0);
  await assert.rejects(adapter.updatePassword({password: 'Synthetic-new-pass-123'}));
});

test('Auth error callback preserves recovery context and never attempts code exchange', async () => {
  const auth = makeAuth();
  const href = 'https://1stprincipleai-planning-demo.pages.dev/?error=access_denied&error_description=synthetic&auth=recovery';
  const {adapter, page} = makeAdapter(auth, href);
  const state = await adapter.ready;

  assert.equal(state.status, 'anonymous');
  assert.equal(state.recoveryError, true);
  assert.equal(state.recovery, false);
  assert.equal(auth.calls.exchange.length, 0);
  assert.equal(page.current().searchParams.has('error'), false);
  assert.equal(page.current().searchParams.has('auth'), false);
});

test('PASSWORD_RECOVERY event during PKCE exchange does not race startup validation', async () => {
  const recoveredSession = makeSession('synthetic-user-race');
  const auth = makeAuth({exchangeSession: recoveredSession, onExchange: async ({emit, setSession}) => {
    setSession(recoveredSession);
    emit('PASSWORD_RECOVERY', recoveredSession);
  }});
  const {adapter} = makeAdapter(auth);
  const state = await adapter.ready;

  assert.equal(state.status, 'authenticated');
  assert.equal(state.user.id, 'synthetic-user-race');
  assert.equal(state.recovery, true);
  assert.equal(state.recoveryError, false);
});

test('recovery state is cleared when the authenticated user changes', async () => {
  const recoveredSession = makeSession('synthetic-user-old');
  const auth = makeAuth({exchangeSession: recoveredSession});
  const {adapter} = makeAdapter(auth);
  await adapter.ready;
  assert.equal(adapter.getState().recovery, true);

  const nextSession = makeSession('synthetic-user-new');
  auth.setSession(nextSession);
  auth.emit('SIGNED_IN', nextSession);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(adapter.getState().status, 'authenticated');
  assert.equal(adapter.getState().user.id, 'synthetic-user-new');
  assert.equal(adapter.getState().recovery, false);
  assert.equal(adapter.getState().recoveryError, false);
});

test('ordinary sign-in and registration retain their normal behavior and callback target', async () => {
  const auth = makeAuth({signInSession: makeSession('synthetic-login-user'), signUpSession: makeSession('synthetic-signup-user')});
  const {adapter} = makeAdapter(auth, 'https://1stprincipleai-planning-demo.pages.dev/#/home');
  await adapter.ready;

  assert.equal((await adapter.signIn({email: 'login@example.test', password: 'synthetic-password'})).status, 'authenticated');
  assert.equal(adapter.getState().recovery, false);
  await adapter.signUp({email: 'new@example.test', password: 'synthetic-password-123'});
  assert.equal(auth.calls.signUp[0].options.emailRedirectTo, 'https://1stprincipleai-planning-demo.pages.dev/?auth=callback');
  assert.equal(adapter.getState().recovery, false);
});

test('fresh recovery request uses the current production origin and dedicated recovery route', async () => {
  const auth = makeAuth();
  const {adapter} = makeAdapter(auth, 'https://1stprincipleai-planning-demo.pages.dev/#/home');
  await adapter.ready;

  assert.deepEqual(await adapter.requestPasswordReset({email: 'recovery@example.test'}), {accepted: true});
  assert.deepEqual(auth.calls.reset, [{
    email: 'recovery@example.test',
    options: {redirectTo: 'https://1stprincipleai-planning-demo.pages.dev/?auth=recovery'}
  }]);
});
