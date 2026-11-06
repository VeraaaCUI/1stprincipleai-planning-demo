/* Original, dependency-free disclosure navigation. See the Stage 3 research report. */
(function (scope) {
  'use strict';
  const TYPES = Object.freeze([
    { id: 'apartments', label: 'Apartments & units', note: 'Apartment projects' },
    { id: 'multi-dwelling', label: 'Townhouses, terraces & villas', note: 'Multi-dwelling housing' },
    { id: 'manor-houses', label: 'Manor houses', note: 'A related NSW housing topic' },
    { id: 'dual-occupancy', label: 'Two homes on one lot', note: 'Dual occupancy' },
    { id: 'secondary-dwellings', label: 'Granny flats', note: 'Secondary dwellings' }
  ]);
  const GOALS = Object.freeze([
    { id: 'build-new-home', label: 'Build a new home' },
    { id: 'add-another-dwelling', label: 'Add another dwelling' },
    { id: 'develop-my-land', label: 'Develop my land' },
    { id: 'renovate-or-extend', label: 'Renovate or extend' },
    { id: 'explore-my-options', label: 'Explore my options' }
  ]);
  let instanceCount = 0;
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function normaliseRoute(route) {
    return String(route || 'home').replace(/^#?\/?/, '').replace(/^explore\/(goals|types)\//, '$1/').replace(/^property(?:\/(?:overview|development|assessment))?$/, 'map').replace(/^project$/, 'services').split('?')[0];
  }
  /** @param {HTMLElement} root @param {{onNavigate?:Function,onLogin?:Function,auth?:object}} options */
  function init(root, options = {}) {
    if (!root) return null;
    const id = 'fp-navigation-' + (++instanceCount);
    const lifecycle = new AbortController();
    const listen = (el, event, action) => el.addEventListener(event, action, { signal: lifecycle.signal });
    const media = scope.matchMedia('(max-width: 900px)');
    let route = 'home';
    const links = [];
    const header = node('header', null, 'fp-site-header');
    const inner = node('div', null, 'fp-header-inner');
    const nav = node('nav', null, 'fp-primary-nav');
    nav.id = id; nav.setAttribute('aria-label', 'Main navigation');
    const list = node('ul', null, 'fp-nav-list');
    const exploreItem = node('li', null, 'fp-explore-item');
    const exploreButton = node('button', null, 'fp-nav-link fp-explore-trigger');
    exploreButton.type = 'button';
    exploreButton.append(node('span', 'Explore'), node('span', '⌄', 'fp-nav-chevron'));
    exploreButton.lastChild.setAttribute('aria-hidden', 'true');
    const panel = node('div', null, 'fp-explore-panel');
    panel.id = id + '-explore'; panel.hidden = true;
    exploreButton.setAttribute('aria-expanded', 'false');
    exploreButton.setAttribute('aria-controls', panel.id);
    const mobileButton = node('button', null, 'fp-mobile-toggle');
    mobileButton.type = 'button';
    const mobileText = node('span', 'Menu');
    const mobileIcon = node('span', '☰', 'fp-mobile-icon'); mobileIcon.setAttribute('aria-hidden', 'true');
    mobileButton.append(mobileText, mobileIcon);
    mobileButton.setAttribute('aria-expanded', 'false'); mobileButton.setAttribute('aria-controls', id);
    function setExplore(open, restoreFocus = false) {
      panel.hidden = !open;
      exploreButton.setAttribute('aria-expanded', String(open));
      if (!open && restoreFocus) exploreButton.focus();
    }
    function setMobile(open, restoreFocus = false) {
      const shouldRestore = !open && (restoreFocus || nav.contains(document.activeElement));
      mobileButton.setAttribute('aria-expanded', String(open));
      mobileText.textContent = open ? 'Close' : 'Menu';
      mobileIcon.textContent = open ? '×' : '☰';
      nav.hidden = media.matches && !open;
      if (!open) setExplore(false);
      if (shouldRestore && media.matches) mobileButton.focus();
    }
    function closeAll() {
      setExplore(false);
      setMobile(false);
    }
    function link(label, destination, className = 'fp-nav-link') {
      const el = node('a', label, className);
      el.href = '#/' + destination;
      el.dataset.route = destination;
      links.push(el);
      listen(el, 'click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if (typeof options.onNavigate === 'function') {
          event.preventDefault();
          // Close before navigation so the router can move focus to the destination.
          closeAll();
          options.onNavigate(destination);
        } else closeAll();
      });
      return el;
    }
    const brand = link('1stprincipleai', 'home', 'fp-site-brand');
    brand.setAttribute('aria-label', '1stprincipleai home');
    function group(title, description, items, kind) {
      const section = node('section', null, 'fp-explore-group');
      const titleEl = node('h2', title); titleEl.id = id + '-' + kind;
      section.setAttribute('aria-labelledby', titleEl.id);
      section.append(titleEl, node('p', description, 'fp-group-description'));
      const children = node('ul', null, 'fp-explore-links');
      items.forEach(item => {
        const a = link('', kind + '/' + item.id, 'fp-topic-link');
        a.append(node('span', item.label, 'fp-topic-name'));
        if (item.note) a.append(node('span', item.note, 'fp-topic-note'));
        const li = node('li'); li.append(a); children.append(li);
      });
      section.append(children); return section;
    }
    const panelGrid = node('div', null, 'fp-explore-grid');
    panelGrid.append(group('By your goal', 'Start with what you want to do.', GOALS, 'goals'), group('By project type', 'Browse familiar housing terms.', TYPES, 'types'));
    const panelFooter = node('div', null, 'fp-explore-footer');
    panelFooter.append(link('Explore all options →', 'explore', 'fp-explore-all'), node('p', 'You can browse before entering an address.'));
    panel.append(panelGrid, panelFooter);
    exploreItem.append(exploreButton, panel);
    const howItem = node('li'); howItem.append(link('How it works', 'how-it-works'));
    const loginItem = node('li');
    const loginButton = node('button', 'Log in', 'fp-nav-link'); loginButton.type = 'button';
    loginButton.setAttribute('aria-haspopup', 'dialog');
    const accountDialog = node('dialog', null, 'fp-account-dialog'); accountDialog.id = id + '-account';
    loginButton.setAttribute('aria-controls', accountDialog.id);
    const accountTitle = node('h2', 'Your account'); accountTitle.id = id + '-account-title';
    const accountMessage = node('p'); accountMessage.id = id + '-account-message';
    accountDialog.setAttribute('aria-labelledby', accountTitle.id);
    accountDialog.setAttribute('aria-describedby', accountMessage.id);
    const accountActions = node('div', null, 'fp-account-actions');
    const closeAccount = node('button', 'Close', 'fp-nav-link'); closeAccount.type = 'button'; closeAccount.autofocus = true;
    const auth = options.auth;
    let authState = auth?.getState?.() || {status:'unavailable',user:null,error:'',recovery:false};
    let authMode = 'login', authBusy = false, authNotice = '', authError = '', saveIntentUnsubmitted = false;
    const accountForm = node('form', null, 'fp-auth-form'); accountForm.dataset.authForm = 'login';
    function field(labelText, name, type, autocomplete) {
      const label = node('label', labelText, 'fp-auth-field');
      const input = node('input'); input.name = name; input.type = type; input.autocomplete = autocomplete;
      input.id = id + '-auth-' + name; label.htmlFor = input.id; label.append(input);
      return {label, input};
    }
    const emailField = field('Email', 'email', 'email', 'email'); emailField.input.maxLength = 254;
    const passwordField = field('Password', 'password', 'password', 'current-password'); passwordField.input.maxLength = 1024;
    const confirmField = field('Confirm password', 'confirm-password', 'password', 'new-password'); confirmField.input.maxLength = 1024;
    const formMessage = node('p', null, 'fp-auth-message'); formMessage.id = id + '-auth-message'; formMessage.setAttribute('role', 'status'); formMessage.setAttribute('aria-live','polite');
    const submitAuth = node('button', 'Log in', 'fp-nav-cta'); submitAuth.type = 'submit'; submitAuth.dataset.authSubmit = '';
    const switchActions = node('div', null, 'fp-auth-switches');
    const signupAction = node('button', 'Create an account', 'fp-nav-link'); signupAction.type = 'button'; signupAction.dataset.authSignup = '';
    const forgotAction = node('button', 'Forgot password?', 'fp-nav-link'); forgotAction.type = 'button'; forgotAction.dataset.authForgot = '';
    const backAction = node('button', 'Back to log in', 'fp-nav-link'); backAction.type = 'button'; backAction.dataset.authBack = '';
    switchActions.append(signupAction, forgotAction, backAction);
    accountForm.append(emailField.label, passwordField.label, confirmField.label, formMessage, submitAuth, switchActions);
    const logoutAction = node('button', 'Log out', 'fp-nav-link'); logoutAction.type = 'button'; logoutAction.dataset.authLogout = '';
    accountActions.append(logoutAction, closeAccount);
    accountDialog.append(accountTitle, accountMessage, accountForm, accountActions);
    loginItem.append(loginButton);
    const projectsItem = node('li'); projectsItem.append(link('My Projects', 'my-projects')); projectsItem.hidden = true;
    let accountReturnFocus = null, accountReturnRoute = null;
    function resetFields() { passwordField.input.value = ''; confirmField.input.value = ''; }
    function renderAccount() {
      const authenticated = authState.status === 'authenticated';
      const available = authState.status === 'anonymous' || authenticated;
      const resetting = authenticated && (authState.recovery || authMode === 'reset');
      if (resetting) authMode = 'reset';
      accountTitle.textContent = resetting ? 'Set a new password' : authenticated ? 'Your account' : authMode === 'signup' ? 'Create your account' : authMode === 'forgot' ? 'Reset your password' : 'Log in';
      accountMessage.textContent = authenticated ? authState.user?.email || 'You are logged in.' : authState.status === 'loading' ? 'Checking your session…' : !available ? authState.error || 'Account services are not configured. Property exploration remains available.' : authMode === 'signup' ? 'Create an account to save and manage planning projects.' : authMode === 'forgot' ? 'Request a reset link for your account email.' : 'Continue with your existing account.';
      accountForm.hidden = !available || (authenticated && !resetting);
      accountForm.dataset.authForm = authMode;
      emailField.label.hidden = resetting; emailField.input.required = !resetting;
      passwordField.label.hidden = authMode === 'forgot'; passwordField.input.required = authMode !== 'forgot';
      passwordField.label.firstChild.textContent = resetting ? 'New password' : 'Password';
      passwordField.input.autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
      passwordField.input.minLength = authMode === 'login' ? 1 : 8;
      confirmField.label.hidden = !['signup','reset'].includes(authMode); confirmField.input.required = !confirmField.label.hidden; confirmField.input.minLength = 8;
      submitAuth.textContent = authBusy ? 'Please wait…' : authMode === 'signup' ? 'Sign up' : authMode === 'forgot' ? 'Send reset link' : resetting ? 'Update password' : 'Log in';
      signupAction.hidden = authMode !== 'login'; forgotAction.hidden = authMode !== 'login'; backAction.hidden = !['signup','forgot'].includes(authMode);
      formMessage.textContent = authError || authNotice || authState.error || (['signup','reset'].includes(authMode) ? 'Use at least 8 characters for your new password.' : '');
      formMessage.classList.toggle('fp-auth-error', Boolean(authError || authState.error));
      formMessage.setAttribute('role', authError ? 'alert' : 'status');
      accountForm.setAttribute('aria-busy', String(authBusy));
      accountForm.querySelectorAll('input,button').forEach(control => { control.disabled = authBusy; });
      logoutAction.hidden = !authenticated; logoutAction.disabled = authBusy;
    }
    function setAuthMode(mode) {
      authMode = mode; authNotice = ''; authError = ''; resetFields(); renderAccount();
      (mode === 'reset' ? passwordField.input : emailField.input).focus();
    }
    function openAccount({intent = 'login'} = {}) {
      accountReturnFocus = document.activeElement; accountReturnRoute = route;
      closeAll();
      if (!auth && typeof options.onLogin === 'function') { options.onLogin({intent}); return; }
      saveIntentUnsubmitted = intent === 'save';
      authMode = authState.recovery || intent === 'recovery' ? 'reset' : 'login';
      authNotice = intent === 'save' ? 'Sign in to save this enquiry to your account. The enquiry will remain temporary until the save succeeds.' : '';
      authError = ''; resetFields(); renderAccount();
      if (!accountDialog.open) accountDialog.showModal();
      if (!accountForm.hidden) (authMode === 'reset' ? passwordField.input : emailField.input).focus();
    }
    function cancelUnsubmittedSaveIntent() {
      if (!saveIntentUnsubmitted || authState.status === 'authenticated') return;
      saveIntentUnsubmitted = false; options.onCancelSaveIntent?.();
    }
    listen(loginButton, 'click', () => openAccount());
    listen(closeAccount, 'click', () => { cancelUnsubmittedSaveIntent(); accountDialog.close(); });
    listen(accountDialog, 'cancel', cancelUnsubmittedSaveIntent);
    listen(signupAction, 'click', () => setAuthMode('signup'));
    listen(forgotAction, 'click', () => setAuthMode('forgot'));
    listen(backAction, 'click', () => setAuthMode('login'));
    listen(accountForm, 'submit', async event => {
      event.preventDefault(); if (authBusy || !auth || !accountForm.reportValidity()) return;
      if (['signup','reset'].includes(authMode) && passwordField.input.value !== confirmField.input.value) {
        authError = 'The passwords do not match.'; renderAccount(); confirmField.input.focus(); return;
      }
      const mode = authMode, input = {email:emailField.input.value, password:passwordField.input.value};
      if (['login','signup'].includes(mode)) saveIntentUnsubmitted = false;
      authBusy = true; authError = ''; authNotice = ''; renderAccount();
      try {
        if (mode === 'login') {
          await auth.signIn(input); await options.onAuthenticated?.(); accountDialog.close(); options.onNavigate?.('my-projects');
        } else if (mode === 'signup') {
          const result = await auth.signUp(input);
          if (result.authenticated) { await options.onAuthenticated?.(); accountDialog.close(); options.onNavigate?.('my-projects'); }
          else { authMode = 'login'; authNotice = 'If your address is eligible, check your email to confirm your account, then log in. Open the link in this browser.'; }
        } else if (mode === 'forgot') {
          await auth.requestPasswordReset(input);
          authNotice = 'If an account exists for this email, check for a reset link. Open it in this browser.';
        } else {
          await auth.updatePassword(input); authMode = 'login'; authNotice = 'Your password has been updated.';
        }
      } catch (error) { authError = error.message || 'The account action could not be completed. Please try again.'; }
      finally { input.password = ''; resetFields(); authBusy = false; authState = auth.getState(); refreshProject(); renderAccount(); }
    });
    listen(logoutAction, 'click', async () => {
      if (authBusy || !auth) return;
      authBusy = true; authError = ''; renderAccount();
      try { await auth.signOut(); accountDialog.close(); }
      catch (error) { authError = error.message || 'Log out could not be completed. Try again.'; }
      finally { authBusy = false; authState = auth.getState(); refreshProject(); renderAccount(); }
    });
    listen(accountDialog, 'close', () => {
      cancelUnsubmittedSaveIntent(); saveIntentUnsubmitted = false;
      resetFields(); authError = ''; authNotice = '';
      if (route !== accountReturnRoute) return;
      const target = accountReturnFocus?.isConnected && accountReturnFocus.getClientRects().length ? accountReturnFocus : media.matches && nav.hidden ? mobileButton : loginButton;
      target.focus({preventScroll: true});
    });
    const checkItem = node('li', null, 'fp-check-item');
    checkItem.append(link('Check a property', 'map', 'fp-nav-cta'));
    list.append(exploreItem, howItem, projectsItem, loginItem, checkItem);
    nav.append(list); inner.append(brand, mobileButton, nav); header.append(inner, accountDialog); root.replaceChildren(header);
    function refreshProject() {
      const authenticated = authState.status === 'authenticated';
      loginItem.hidden = false;
      projectsItem.hidden = !authenticated;
      loginButton.textContent = authenticated ? 'Account' : 'Log in';
      loginButton.setAttribute('aria-label', authenticated ? 'Account menu' : 'Log in');
      if (accountDialog.open && !authBusy) renderAccount();
    }
    function setRoute(next) {
      if (accountDialog.open) { accountReturnRoute = null; accountDialog.close(); }
      route = normaliseRoute(next);
      links.forEach(a => {
        const current = normaliseRoute(a.dataset.route) === route;
        if (current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      const inExplore = /^(explore|types\/|goals\/)/.test(route);
      exploreButton.classList.toggle('fp-current-section', inExplore);
      closeAll(); refreshProject();
    }
    listen(exploreButton, 'click', () => setExplore(panel.hidden));
    listen(mobileButton, 'click', () => setMobile(mobileButton.getAttribute('aria-expanded') !== 'true'));
    listen(header, 'keydown', event => {
      if (event.key !== 'Escape') return;
      if (!panel.hidden) { event.preventDefault(); event.stopPropagation(); setExplore(false, true); }
      else if (media.matches && !nav.hidden) { event.preventDefault(); event.stopPropagation(); setMobile(false, true); }
    });
    listen(document, 'pointerdown', event => {
      if (header.contains(event.target)) return;
      const focusInside = header.contains(document.activeElement);
      if (media.matches && !nav.hidden) setMobile(false, focusInside);
      else if (!panel.hidden) setExplore(false, focusInside);
    });
    listen(header, 'focusout', event => {
      if (event.relatedTarget && !header.contains(event.relatedTarget)) closeAll();
    });
    listen(media, 'change', () => {
      const wasInside = nav.contains(document.activeElement);
      setExplore(false);
      setMobile(false, media.matches && wasInside);
    });
    const unsubscribeAuth = auth?.subscribe?.(next => {
      authState = next; refreshProject();
      if (authState.recovery && !authBusy && !accountDialog.open) openAccount({intent:'recovery'});
    });
    setMobile(false); refreshProject(); renderAccount();
    return Object.freeze({
      setRoute, refreshProject, openAccount,
      destroy() { unsubscribeAuth?.(); if (accountDialog.open) { accountReturnRoute = null; accountDialog.close(); } lifecycle.abort(); root.replaceChildren(); }
    });
  }
  scope.FirstPrincipleSiteNavigation = Object.freeze({ init, TYPES, GOALS });
})(typeof window !== 'undefined' ? window : globalThis);
