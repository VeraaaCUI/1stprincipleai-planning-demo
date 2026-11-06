/* My Projects presentation. Persistence belongs to the account repository. */
(function (scope) {
  'use strict';
  const STEPS = ['Find a property', 'Planning overview', 'Choose a project', 'Planning assessment'];
  const STEP_KEYS = ['discovery', 'overview', 'development', 'assessment'];
  const DEVELOPMENT_NAMES = {
    granny: 'Secondary dwelling', dual: 'Dual occupancy', storey: 'Extension',
    pool: 'Pool', shed: 'Shed or garage', carport: 'Carport', subdiv: 'Subdivision',
    home: 'Home business', 'new-home': 'New home', apartments: 'Apartments',
    'multi-dwelling': 'Multi-dwelling', 'manor-house': 'Manor house', other: 'Other project'
  };
  const text = (value, limit = 350) => typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : '';
  function el(tag, content, className) {
    const item = document.createElement(tag);
    if (content !== undefined && content !== null) item.textContent = String(content);
    if (className) item.className = className;
    return item;
  }
  function button(label, handler, className = '') {
    const item = el('button', label, 'lp-button' + (className ? ' ' + className : ''));
    item.type = 'button'; item.addEventListener('click', handler); return item;
  }
  function nameOf(project) { return text(project?.projectName, 120) || 'Untitled project'; }
  function addressOf(project) {
    return text(project?.selectedAddress?.name || project?.selectedAddress?.address || project?.selectedAddress
      || project?.propertyReference?.address || project?.propertyReference?.name) || 'Property not selected';
  }
  function developmentOf(project) {
    const value = text(project?.developmentType?.label || project?.developmentType?.name
      || project?.developmentType?.id || project?.developmentType, 100);
    return DEVELOPMENT_NAMES[value] || value || 'Development type not selected';
  }
  function stepOf(project) {
    const value = project?.currentWorkflowStep;
    const index = typeof value === 'number' ? value - 1 : STEP_KEYS.indexOf(text(value).replace(/^property\/?/, '') || 'discovery');
    return STEPS[index] || STEPS[0];
  }
  function updatedOf(project) {
    const value = text(project?.updatedAt, 80), date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return 'Not yet saved';
    return new Intl.DateTimeFormat('en-AU', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}).format(date);
  }
  function init(root, callbacks = {}) {
    if (!root) throw new Error('A My Projects container is required.');
    if (root._firstPrincipleMyProjects) return root._firstPrincipleMyProjects;
    root.classList.add('lp-projects');
    let state = {status: 'loading', projects: [], message: '', activeId: null, authenticated: false, email: ''};
    let activeProject = null, saveState = {status: 'draft', message: ''};
    let editingId = null, deletingId = null, busyCount = 0, errorMessage = '';
    const pageHeader = el('header', null, 'lp-heading');
    const heading = el('h1', 'My Projects', 'lp-title'); heading.tabIndex = -1; heading.id = 'lp-page-title';
    root.setAttribute('aria-labelledby', heading.id);
    const kicker = el('p', 'ACCOUNT PROJECTS', 'lp-kicker'), intro = el('p', 'Projects saved to your signed-in account.', 'lp-intro');
    pageHeader.append(kicker, heading, intro);
    const pageMessage = el('p', '', 'lp-message'); pageMessage.dataset.projectStatus = 'list';
    pageMessage.setAttribute('role', 'status'); pageMessage.setAttribute('aria-live', 'polite'); pageMessage.hidden = true;
    const controls = el('div', null, 'lp-controls');
    const enquiryButton = button('Check a property', () => invoke('onEnquiry', [], enquiryButton), 'lp-primary');
    enquiryButton.dataset.projectEnquiry = 'true'; controls.append(enquiryButton);
    const storageNote = el('aside', null, 'lp-storage-note'); storageNote.id = 'lp-storage-note';
    const storageMain = el('p'), storageFine = el('p', null, 'lp-fine'); storageNote.append(storageMain, storageFine);
    const list = el('div', null, 'lp-project-list'); list.dataset.projectList = 'true';
    list.setAttribute('aria-label', 'Account projects');
    root.append(pageHeader, pageMessage, controls, list, storageNote);

    const toolbar = el('section', null, 'lp-savebar lp-draft-actions'); toolbar.hidden = true;
    toolbar.setAttribute('aria-label', 'Save this property enquiry');
    const draftCopy = el('div'); draftCopy.append(el('p', 'Current enquiry', 'lp-unsaved-title'));
    const saveButton = button('Save project', () => {
      if (!saveState.authenticated) { invoke('onSave', [], saveButton); return; }
      saveForm.hidden = false; saveName.value = activeProject?.projectName || saveState.projectName || '';
      saveName.focus();
    }, 'lp-primary'); saveButton.dataset.projectSave = 'true';
    const saveMessage = el('p', 'Temporary enquiry in this tab. It is not a saved project.', 'lp-save-status'); saveMessage.id = 'lp-save-status';
    saveMessage.dataset.projectStatus = 'save'; saveMessage.setAttribute('role', 'status'); saveMessage.setAttribute('aria-live', 'polite');
    const saveForm = el('form', null, 'lp-save-form'); saveForm.hidden = true;
    const saveLabel = el('label', 'Project name', 'lp-active-name'), saveName = el('input');
    saveName.type = 'text'; saveName.maxLength = 120; saveName.required = true; saveName.dataset.projectSaveName = 'true'; saveLabel.append(saveName);
    const saveSubmit = el('button', 'Save to Account', 'lp-button lp-primary'); saveSubmit.type = 'submit'; saveSubmit.dataset.projectSaveSubmit = 'true';
    const saveCancel = button('Cancel', () => { saveForm.hidden = true; saveButton.focus(); });
    saveForm.append(saveLabel, saveSubmit, saveCancel);
    saveForm.addEventListener('submit', async event => {
      event.preventDefault(); const name = saveName.value.trim();
      if (!name) { saveName.setCustomValidity('Enter a project name.'); saveName.reportValidity(); return; }
      if (await invoke('onSave', [{projectName: name}], saveSubmit)) { saveForm.hidden = true; saveButton.focus(); }
    });
    saveName.addEventListener('input', () => saveName.setCustomValidity(''));
    draftCopy.append(saveMessage); toolbar.append(draftCopy, saveButton, saveForm);

    function renderStorage() {
      kicker.textContent = state.authenticated ? 'SAVED TO YOUR ACCOUNT' : 'ACCOUNT PROJECTS';
      intro.textContent = state.authenticated
        ? 'Projects saved to ' + (state.email || 'your account') + '. Planning information is rechecked when you open a project.'
        : 'Sign in to view and manage your account projects.';
      storageMain.textContent = 'Projects are associated with your signed-in account. Access is controlled by Supabase database policies.';
      storageFine.textContent = 'A project is saved only after the account service confirms the write.';
    }
    function setError(message) {
      errorMessage = text(message, 500) || 'The account project operation could not be completed. Try again.';
      renderMessage();
    }
    function renderMessage() {
      const message = errorMessage || text(state.message, 500);
      pageMessage.hidden = !message; pageMessage.textContent = message;
      pageMessage.classList.toggle('lp-error', Boolean(errorMessage || state.status === 'error'));
    }
    async function invoke(name, args = [], control) {
      if (typeof callbacks[name] !== 'function') { setError('This project action is unavailable. Refresh the page and try again.'); return false; }
      if (control?.disabled) return false;
      if (control) control.disabled = true;
      busyCount++; root.setAttribute('aria-busy', 'true');
      try {
        const result = await callbacks[name](...args);
        return result !== false && result?.completed !== false;
      } catch (error) {
        setError(error?.message || 'The project could not be saved to your account. Try again.');
        return false;
      } finally {
        if (control?.isConnected) control.disabled = false;
        busyCount--; root.setAttribute('aria-busy', String(state.status === 'loading' || busyCount > 0));
      }
    }
    function renderToolbar() {
      const status = ['draft', 'authentication_required', 'saving', 'saved', 'failed'].includes(saveState.status) ? saveState.status : 'draft';
      const labels = {
        draft: state.authenticated ? 'Changes are not saved yet.' : 'Temporary enquiry in this tab. It is not a saved project.',
        authentication_required: 'Sign in to save this enquiry to your account.', saving: 'Saving to your account…',
        saved: 'Saved to your account.', failed: 'Save failed. Your enquiry is unchanged.'
      };
      saveMessage.textContent = text(saveState.message, 500) || labels[status];
      saveMessage.dataset.saveState = status; saveMessage.classList.toggle('lp-error', status === 'failed');
      toolbar.setAttribute('aria-busy', String(status === 'saving'));
      saveButton.disabled = status === 'saving'; saveSubmit.disabled = status === 'saving'; saveName.disabled = status === 'saving'; saveCancel.disabled = status === 'saving';
      if (!saveState.authenticated || status === 'saved') saveForm.hidden = true;
    }
    function renderList() {
      renderStorage(); list.replaceChildren(); list.setAttribute('aria-busy', String(state.status === 'loading'));
      if (state.status === 'loading') { list.append(el('p', 'Loading your account projects…', 'lp-empty')); return; }
      if (!state.projects.length) {
        const empty = el('section', null, 'lp-empty');
        const anonymous = state.status === 'anonymous' || !state.authenticated;
        empty.append(
          el('h2', anonymous ? 'Sign in to My Projects' : state.status === 'error' ? 'Account projects could not be loaded' : 'No projects saved yet'),
          el('p', state.status === 'error' ? text(state.message) || 'Your account projects could not be loaded. Try again.'
            : anonymous ? 'Your current property enquiry remains temporary until you sign in and save it.'
              : 'Check a property and choose Save project at the assessment step.')
        );
        if (anonymous) empty.append(button('Log in', () => callbacks.onAccountRequired?.()));
        if (state.status === 'error') empty.append(button('Reload page', () => scope.location.reload()));
        list.append(empty); return;
      }
      state.projects.forEach(project => {
        const id = text(project?.id, 100); if (!id) return;
        const item = el('article', null, 'lp-project'); item.dataset.projectId = id;
        const meta = el('div', null, 'lp-project-meta'), title = el('h2', nameOf(project));
        const titleRow = el('div', null, 'lp-project-title'); titleRow.append(title, el('span', 'Saved to account', 'lp-source'));
        if (id === state.activeId) titleRow.append(el('span', 'Opened in current enquiry', 'lp-current'));
        meta.append(titleRow, el('p', addressOf(project), 'lp-project-address'));
        const facts = el('dl', null, 'lp-project-facts');
        [['Development', developmentOf(project)], ['Workflow', stepOf(project)], ['Updated', updatedOf(project)]].forEach(([label, value]) => {
          const field = el('div'); field.append(el('dt', label), el('dd', value)); facts.append(field);
        }); meta.append(facts);
        const actions = el('div', null, 'lp-project-actions');
        const open = button('Open project', () => invoke('onOpen', [id], open), 'lp-primary'); open.dataset.projectOpen = id;
        const rename = button('Rename', () => { editingId = id; deletingId = null; renderList(); requestAnimationFrame(() => list.querySelector('[data-project-rename-input]')?.focus()); }); rename.dataset.projectRename = id;
        const remove = button('Delete', () => { deletingId = id; editingId = null; renderList(); requestAnimationFrame(() => list.querySelector('[data-project-confirm-delete]')?.focus()); }, 'lp-danger'); remove.dataset.projectDelete = id;
        actions.append(open, rename, remove); item.append(meta, actions);
        if (editingId === id) {
          const form = el('form', null, 'lp-inline-edit'), label = el('label', 'Project name'), input = el('input');
          input.type = 'text'; input.value = nameOf(project); input.maxLength = 120; input.required = true;
          input.dataset.projectRenameInput = id; input.setAttribute('aria-label', 'Rename ' + nameOf(project)); label.append(input);
          const save = el('button', 'Save name', 'lp-button lp-primary'); save.type = 'submit'; save.dataset.projectRenameSave = id;
          const cancel = button('Cancel', () => { editingId = null; renderList(); focusAction(id, 'rename'); }); form.append(label, save, cancel);
          form.addEventListener('submit', async event => {
            event.preventDefault(); const value = input.value.trim();
            if (!value) { input.setCustomValidity('Enter a project name.'); input.reportValidity(); return; }
            if (await invoke('onRename', [id, value], save)) { editingId = null; renderList(); focusAction(id, 'rename'); }
          }); input.addEventListener('input', () => input.setCustomValidity('')); item.append(form);
        }
        if (deletingId === id) {
          const confirm = el('div', null, 'lp-delete-confirm'); confirm.setAttribute('role', 'group'); confirm.setAttribute('aria-label', 'Confirm account project deletion');
          const message = el('p', 'Delete “' + nameOf(project) + '” from your account?');
          const yes = button('Delete project', async () => {
            if (await invoke('onDelete', [id], yes)) { deletingId = null; renderList(); enquiryButton.focus({preventScroll: true}); }
          }, 'lp-danger'); yes.dataset.projectConfirmDelete = id;
          const cancel = button('Keep project', () => { deletingId = null; renderList(); focusAction(id, 'delete'); });
          confirm.append(message, yes, cancel); item.append(confirm);
        }
        list.append(item);
      });
    }
    function focusAction(id, action) {
      requestAnimationFrame(() => [...list.querySelectorAll('[data-project-' + action + ']')]
        .find(item => item.getAttribute('data-project-' + action) === id)?.focus({preventScroll: true}));
    }
    const api = {
      toolbar,
      showProjects(next = {}) {
        const newEmail = text(next.email, 300);
        if (newEmail !== state.email) { editingId = null; deletingId = null; }
        state = {status: ['loading', 'ready', 'error', 'anonymous'].includes(next.status) ? next.status : 'ready',
          projects: Array.isArray(next.projects) ? next.projects : [], message: text(next.message, 500),
          activeId: text(next.activeId, 100) || null, authenticated: next.authenticated === true, email: newEmail};
        errorMessage = ''; renderMessage(); renderList(); root.setAttribute('aria-busy', String(state.status === 'loading' || busyCount > 0));
      },
      setSaveState(next = {}) { saveState = {...next}; renderToolbar(); },
      setAuthentication(next = {}) { state.authenticated = next.authenticated === true; state.email = text(next.email, 300); saveState.authenticated = state.authenticated; renderStorage(); renderToolbar(); },
      setActiveProject(project) { activeProject = project && typeof project === 'object' ? project : null; renderToolbar(); },
      showPage(visible) { root.hidden = !visible; },
      getState() { return {status: state.status, count: state.projects.length, activeId: state.activeId, saveStatus: saveState.status, editingId, deletingId}; }
    };
    root._firstPrincipleMyProjects = api; renderList(); renderToolbar(); return api;
  }
  scope.FirstPrincipleMyProjectsView = Object.freeze({init});
})(typeof window !== 'undefined' ? window : globalThis);
