/* Local expert correspondence drafts. No network transport or message send. */
(function (scope) {
  'use strict';
  const MAILTO_MAX_LENGTH = 2000;
  const ROLES = ['Town planner', 'Accredited certifier', 'Designer / architect', 'Bushfire consultant', 'Arborist', 'Flood / civil engineer', 'Registered surveyor', 'Other specialist'];
  let mounts = 0;
  const clip = (value, max = 1200) => typeof value === 'string' ? value.slice(0, max) : '';
  const line = (value, max = 250) => clip(value, max).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const clone = value => JSON.parse(JSON.stringify(value));
  const crlf = value => String(value || '').replace(/\r\n|\r|\n/g, '\n').replace(/\n/g, '\r\n');

  function validEmail(value) {
    const email = typeof value === 'string' ? value : '';
    if (email.length > 254 || email !== email.trim() || /[\s,;<>\u0000-\u001f\u007f]/.test(email)) return false;
    const parts = email.split('@');
    if (parts.length !== 2 || !parts[0] || parts[0].length > 64 || /^\.|\.$|\.\./.test(parts[0])) return false;
    return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(parts[0]) && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(parts[1]);
  }
  function normalizeContext(value) {
    const location = value?.location || {}, report = value?.report || value?.preliminaryReport || {};
    return {
      hasContext: Boolean(value?.location && (value?.report || value?.preliminaryReport)),
      address: line(location.name || location.address, 250),
      councilNames: Array.isArray(location.councilNames) ? location.councilNames.map(name => line(name, 150)).filter(Boolean).slice(0, 4) : [],
      question: clip(value?.question, 1200).trim(),
      caseId: line(report.caseId, 80),
      confidence: /^(high|medium|low)$/i.test(report.confidence || '') ? report.confidence.toLowerCase() : 'low',
      missing: Array.isArray(report.missing) ? report.missing.map(item => line(item, 220)).filter(Boolean).slice(0, 6) : []
    };
  }
  function normalizeProject(value) {
    const project = value || {}, drawing = project.drawingSummary || {}, document = drawing.document || {};
    const explicitConfirmed = Array.isArray(project.confirmedFacts);
    const facts = explicitConfirmed ? project.confirmedFacts : (Array.isArray(drawing.facts) ? drawing.facts : []);
    const confirmedFacts = facts.filter(item => item && (item.status === 'confirmed' || item.confirmed === true || explicitConfirmed && !item.status && item.confirmed !== false)).slice(0, 12).map(item => ({
      label: line(typeof item === 'string' ? 'Drawing note' : item.label || item.field || item.id, 120),
      value: line(typeof item === 'string' ? item : String(item.value ?? ''), 260),
      page: Number.isInteger(item.page) && item.page > 0 ? item.page : null
    })).filter(item => item.label && item.value);
    return {
      route: line(project.route, 80),
      drawing: {
        name: line(document.name || drawing.name, 180),
        pages: Number.isInteger(document.pages || drawing.pages) ? document.pages || drawing.pages : null,
        status: line(drawing.status, 60),
        illustrative: Boolean(drawing.illustrative || drawing.demo || document.illustrative || document.demo)
      },
      confirmedFacts,
      specialists: Array.isArray(project.specialists) ? project.specialists.map(item => line(typeof item === 'string' ? item : item?.title || item?.id, 100)).filter(Boolean).slice(0, 8) : []
    };
  }
  function validateContacts(contacts) {
    const errors = {};
    if (!validEmail(contacts?.clientEmail)) errors.clientEmail = 'Enter one valid client email address.';
    if (!validEmail(contacts?.expertEmail)) errors.expertEmail = 'Enter one valid expert email address.';
    return errors;
  }
  function buildDraft(contextInput, projectInput, contacts, includeDrawingNotes = false) {
    const context = normalizeContext(contextInput), project = normalizeProject(projectInput);
    const expert = line(contacts?.expertName, 100), client = line(contacts?.clientName, 100);
    const role = line(contacts?.role, 100) || 'Town planner';
    const subject = line('Planning review enquiry: ' + (context.address || 'Project address to confirm'), 180);
    const body = [
      expert ? 'Hello ' + expert + ',' : 'Hello,', '',
      'I would like to discuss a ' + role.toLowerCase() + ' review for ' + (context.address || 'the project address to be confirmed') + '.',
      context.councilNames.length ? 'Council: ' + context.councilNames.join(' / ') + '.' : 'Responsible authority: to confirm.',
      context.question ? 'Proposal: ' + context.question : '',
      '', 'The preliminary planning preview has ' + context.confidence.toUpperCase() + ' confidence. It is not professional approval.',
      context.missing.length ? 'Items to scope: ' + context.missing.slice(0, 3).join(' ') : 'Please identify the site evidence and applicable controls that need checking.',
      '',
      includeDrawingNotes && project.drawing.name ? 'Drawing reference: ' + project.drawing.name + (project.drawing.pages ? ' (' + project.drawing.pages + ' pages)' : '') + '. No PDF is attached automatically.' : '',
      includeDrawingNotes && project.drawing.illustrative ? 'ILLUSTRATIVE DEMO DOCUMENT: these drawing notes are not actual project records or verified site measurements.' : '',
      includeDrawingNotes && project.confirmedFacts.length ? 'User-confirmed drawing notes for discussion (not professional verification):' : '',
      ...(includeDrawingNotes ? project.confirmedFacts.map(item => '- ' + item.label + ': ' + item.value + (item.page ? ' [page ' + item.page + ']' : '')) : []),
      '', 'Could you advise the information you need, your scope, availability and fee basis?',
      'Please confirm whether an online discussion or site inspection would be appropriate.', '',
      client || 'Client name to be added',
      validEmail(contacts?.clientEmail) ? contacts.clientEmail : 'Reply email to be added', '',
      'Prepared using the 1stprincipleai demo. This draft has not been sent; no expert is engaged.'
    ].filter((item, index, all) => item !== '' || all[index - 1] !== '').join('\n').trim();
    return { subject, body, includedDrawingNotes: Boolean(includeDrawingNotes), illustrativeDrawing: Boolean(includeDrawingNotes && project.drawing.illustrative) };
  }
  function base64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return typeof scope.btoa === 'function' ? scope.btoa(binary) : Buffer.from(bytes).toString('base64');
  }
  function encodedHeader(value) {
    const safe = line(value, 400), chunks = []; let chunk = '';
    for (const character of safe) {
      if (new TextEncoder().encode(chunk + character).length > 42) { chunks.push(chunk); chunk = ''; }
      chunk += character;
    }
    if (chunk) chunks.push(chunk);
    return chunks.map(part => '=?UTF-8?B?' + base64(part) + '?=').join('\r\n ');
  }
  function validateMessage(message) {
    if (!message || !line(message.subject, 400) || !clip(message.body, 12000).trim()) throw new Error('Add a subject and message before exporting the draft.');
    if (/[\r\n]/.test(message.subject)) throw new Error('The subject must be a single line.');
    if (message.subject.length > 200 || message.body.length > 12000) throw new Error('Keep the subject within 200 characters and the message within 12,000 characters.');
  }
  function makeEml(contacts, message, date = new Date()) {
    const errors = validateContacts(contacts); if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    validateMessage(message);
    const mailbox = (name, email) => line(name) ? encodedHeader(name) + ' <' + email + '>' : email;
    const encodedBody = base64(crlf(message.body)).match(/.{1,76}/g)?.join('\r\n') || '';
    return [
      'From: ' + mailbox(contacts.clientName, contacts.clientEmail),
      'To: ' + mailbox(contacts.expertName, contacts.expertEmail),
      'Reply-To: ' + contacts.clientEmail,
      'Subject: ' + encodedHeader(message.subject),
      'Date: ' + date.toUTCString(),
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64',
      'X-Unsent: 1', 'X-1stprincipleai-Delivery-Status: draft-only', '', encodedBody, ''
    ].join('\r\n');
  }
  function makeMailto(contacts, message, maxLength = MAILTO_MAX_LENGTH) {
    if (Object.keys(validateContacts(contacts)).length) return { available: false, uri: '', reason: 'Add valid client and expert email addresses.' };
    try { validateMessage(message); } catch (error) { return { available: false, uri: '', reason: error.message }; }
    const uri = 'mailto:' + encodeURIComponent(contacts.expertEmail).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(message.subject) + '&body=' + encodeURIComponent(crlf(message.body));
    return uri.length <= maxLength ? { available: true, uri, reason: 'Your email app will open a draft for you to review and send.' } : { available: false, uri: '', reason: 'This draft is too long for a reliable email-app link. Download the .eml draft or shorten the message.' };
  }
  function providerPayload(context, project, contacts, message, draftPrepared, includeDrawingNotes) {
    return {
      schemaVersion: 'expert-email-reservation-0.1', operation: 'correspondence.draft',
      delivery: { status: 'draft_only', connected: false, sent: false, recipientAcceptanceRecorded: false },
      adapter: { provider: null, credentialsRequiredOnServer: true, outbound: 'reserved', inbound: 'reserved', inboundConnected: false },
      client: { name: line(contacts.clientName, 100), email: clip(contacts.clientEmail, 254) },
      expert: { name: line(contacts.expertName, 100), email: clip(contacts.expertEmail, 254), requestedRole: line(contacts.role, 100) },
      project: { address: context.address, councilNames: [...context.councilNames], question: context.question, reportConfidence: context.confidence, caseId: context.caseId },
      message: draftPrepared ? { subject: message.subject, body: message.body } : null,
      drawing: includeDrawingNotes ? { ...project.drawing, confirmedFacts: clone(project.confirmedFacts) } : null,
      attachments: [], noPdfAttached: true, draftPrepared: Boolean(draftPrepared)
    };
  }
  function el(tag, text, className) {
    const element = document.createElement(tag); if (text !== undefined && text !== null) element.textContent = String(text); if (className) element.className = className; return element;
  }
  function mount(root, options = {}) {
    if (!root) return { setContext() {}, updateProject() {}, reset() {}, getState() { return { draftPrepared: false, emailDeliveryConnected: false, emailSent: false }; } };
    if (root._firstPrincipleExpertContact) return root._firstPrincipleExpertContact;
    const prefix = 'fpc-' + (++mounts) + '-';
    let context = normalizeContext(null), project = normalizeProject(null), contextSignature = '', projectSignature = '';
    let draftPrepared = false, includeDrawingNotes = false, revision = 0;
    const contacts = { clientName: '', clientEmail: '', expertName: '', expertEmail: '', role: ROLES[0] }, fields = {};
    const shell = el('section', null, 'fpc-workspace'); shell.setAttribute('aria-label', 'Client and expert email preparation');
    const heading = el('div', null, 'fpc-heading'); const headingCopy = el('div');
    headingCopy.append(el('p', 'Specialist collaboration', 'fpc-kicker'), el('h3', 'Prepare a focused introduction.'), el('p', 'Keep your project context together and draft a message to the specialist you choose.', 'fpc-lead'));
    heading.append(headingCopy, el('span', 'Email draft · delivery not connected', 'fpc-status-pill'));
    const projectLine = el('p', 'Return to a planning report to bring its location and question here.', 'fpc-project-line');
    const form = el('form', null, 'fpc-form'); form.noValidate = true;
    const grid = el('div', null, 'fpc-contact-grid');
    [['clientName', 'Client name', 'text', 'Your name'], ['clientEmail', 'Client email', 'email', 'you@example.com'], ['expertName', 'Expert name (optional)', 'text', 'Name of your chosen specialist'], ['expertEmail', 'Expert email', 'email', 'specialist@example.com']].forEach(([key, title, type, placeholder]) => {
      const field = el('div', null, 'fpc-field'), label = el('label', title); label.htmlFor = prefix + key;
      const input = el('input'); input.id = label.htmlFor; input.type = type; input.maxLength = type === 'email' ? 254 : 100; input.placeholder = placeholder; input.autocomplete = 'off'; input.dataset.contact = key;
      input.addEventListener('input', () => { contacts[key] = input.value; input.removeAttribute('aria-invalid'); fields[key].error.textContent = ''; invalidate('Contact details changed. Prepare an updated draft.'); });
      const error = el('small', '', 'fpc-field-error'); error.id = input.id + '-error'; input.setAttribute('aria-describedby', error.id);
      fields[key] = { input, error }; field.append(label, input, error); grid.append(field);
    });
    const roleField = el('div', null, 'fpc-field'), roleLabel = el('label', 'Specialist role'); roleLabel.htmlFor = prefix + 'role';
    const roleSelect = el('select'); roleSelect.id = roleLabel.htmlFor; roleSelect.dataset.contact = 'role';
    ROLES.forEach(role => { const option = el('option', role); option.value = role; roleSelect.append(option); });
    roleSelect.addEventListener('change', () => { contacts.role = roleSelect.value; invalidate('Specialist role changed. Prepare an updated draft.'); });
    roleField.append(roleLabel, roleSelect); grid.append(roleField);
    const share = el('label', null, 'fpc-share'); const shareInput = el('input'); shareInput.type = 'checkbox'; shareInput.dataset.contact = 'includeDrawingNotes';
    const shareCopy = el('span'); shareCopy.append(el('strong', 'Include confirmed drawing notes'), el('small', 'Optional. Includes the document name and user-confirmed fields, with page references. PDF files are never attached automatically.'));
    shareInput.addEventListener('change', () => { includeDrawingNotes = shareInput.checked; invalidate('Drawing-note sharing changed. Prepare an updated draft.'); });
    share.append(shareInput, shareCopy);
    const drawingHint = el('p', 'No confirmed drawing notes are available yet.', 'fpc-drawing-hint');
    const prepare = el('button', 'Prepare email draft', 'fpc-button fpc-primary'); prepare.type = 'button'; prepare.dataset.contactAction = 'prepare-draft';
    const status = el('p', 'Add the addresses of the client and their chosen expert. No message will be sent.', 'fpc-feedback'); status.setAttribute('role', 'status');
    const prepareRow = el('div', null, 'fpc-prepare-row'); prepareRow.append(prepare, status);
    form.append(grid, share, drawingHint, prepareRow);
    const preview = el('section', null, 'fpc-preview'); preview.hidden = true;
    const subjectField = el('div', null, 'fpc-field'), subjectLabel = el('label', 'Email subject'); subjectLabel.htmlFor = prefix + 'subject';
    const subject = el('input'); subject.id = subjectLabel.htmlFor; subject.maxLength = 200; subject.dataset.contact = 'subject'; subjectField.append(subjectLabel, subject);
    const messageField = el('div', null, 'fpc-field'), messageLabel = el('label', 'Email message'); messageLabel.htmlFor = prefix + 'message';
    const message = el('textarea'); message.id = messageLabel.htmlFor; message.rows = 13; message.maxLength = 12000; message.dataset.contact = 'body'; messageField.append(messageLabel, message);
    const exportRow = el('div', null, 'fpc-export-row');
    const download = el('button', 'Download email draft (.eml)', 'fpc-button'); download.type = 'button'; download.dataset.contactAction = 'download-eml';
    const open = el('button', 'Open email app', 'fpc-button'); open.type = 'button'; open.dataset.contactAction = 'open-mail';
    const mailtoHint = el('p', '', 'fpc-mailto-hint');
    const draftNote = el('p', 'Review the recipient, message and any drawing notes before sending from your own email app. Expert availability, engagement and replies have not been confirmed.', 'fpc-notice');
    exportRow.append(download, open); preview.append(el('h4', 'Your editable draft'), subjectField, messageField, exportRow, mailtoHint, draftNote);
    const reserve = el('details', null, 'fpc-reservation'); reserve.append(el('summary', 'Email connection and reply tracking'));
    reserve.append(el('p', 'Outbound email delivery and inbound reply tracking have reserved integration fields. No mailbox or provider is connected, no expert has been contacted, and no reply or appointment is recorded. A production connector will need server-side credentials, delivery events and a case-linked conversation history.'));
    shell.append(heading, projectLine, form, preview, reserve, el('p', 'Contacts and drafts stay in this page’s memory. Downloaded drafts are saved on your device; refreshing clears the page. Attach and share any PDF yourself after review.', 'fpc-privacy')); root.append(shell);

    const currentMessage = () => ({ subject: subject.value, body: message.value });
    function emit() { if (typeof options.onChange === 'function') options.onChange(getState()); }
    function updateExports() {
      let valid = draftPrepared && context.hasContext && !Object.keys(validateContacts(contacts)).length;
      try { validateMessage(currentMessage()); } catch (_) { valid = false; }
      download.disabled = !valid;
      const mailto = valid ? makeMailto(contacts, currentMessage()) : { available: false, reason: 'Prepare a valid draft before opening an email app.' };
      open.disabled = !valid || !mailto.available; mailtoHint.textContent = mailto.reason;
      return mailto;
    }
    function invalidate(text) {
      revision += 1; const wasPrepared = draftPrepared; draftPrepared = false;
      if (wasPrepared) status.textContent = text || 'Project details changed. Prepare an updated draft.';
      updateExports(); emit();
    }
    function renderProject() {
      projectLine.textContent = context.hasContext ? context.address + ' · Report confidence: ' + context.confidence.toUpperCase() : 'Return to a planning report to bring its location and question here.';
      const count = project.confirmedFacts.length;
      const available = Boolean(project.drawing.name || count);
      shareInput.disabled = !available || !context.hasContext;
      if (!available) { includeDrawingNotes = false; shareInput.checked = false; }
      drawingHint.textContent = available ? (project.drawing.name || 'Drawing notes') + ' · ' + count + ' user-confirmed field' + (count === 1 ? '' : 's') + (project.drawing.illustrative ? ' · ILLUSTRATIVE DEMO, not actual project records' : '') : 'No confirmed drawing notes are available yet.';
      prepare.disabled = !context.hasContext; updateExports();
    }
    function clearInputs() {
      Object.keys(contacts).forEach(key => { contacts[key] = key === 'role' ? ROLES[0] : ''; });
      Object.values(fields).forEach(({ input, error }) => { input.value = ''; input.removeAttribute('aria-invalid'); error.textContent = ''; });
      roleSelect.value = ROLES[0]; includeDrawingNotes = false; shareInput.checked = false;
      subject.value = ''; message.value = ''; preview.hidden = true; draftPrepared = false;
      status.textContent = 'Add the addresses of the client and their chosen expert. No message will be sent.';
      renderProject();
    }
    function prepareDraft() {
      if (!context.hasContext) return;
      const errors = validateContacts(contacts); let first;
      Object.entries(fields).forEach(([key, field]) => { field.error.textContent = errors[key] || ''; if (errors[key]) { field.input.setAttribute('aria-invalid', 'true'); first ||= field.input; } else field.input.removeAttribute('aria-invalid'); });
      if (Object.keys(errors).length) { status.textContent = 'Check the email addresses before preparing the draft.'; first?.focus(); return; }
      const next = buildDraft({ location: { name: context.address, councilNames: context.councilNames }, question: context.question, report: { confidence: context.confidence, missing: context.missing, caseId: context.caseId } }, { route: project.route, drawingSummary: { document: project.drawing, illustrative: project.drawing.illustrative }, confirmedFacts: project.confirmedFacts, specialists: project.specialists }, contacts, includeDrawingNotes);
      subject.value = next.subject; message.value = next.body; draftPrepared = true; preview.hidden = false; revision += 1;
      status.textContent = 'Draft prepared locally. Review it below; nothing has been sent.'; updateExports(); emit(); subject.focus();
    }
    form.addEventListener('submit', event => { event.preventDefault(); prepareDraft(); }); prepare.addEventListener('click', prepareDraft);
    [subject, message].forEach(input => input.addEventListener('input', () => {
      revision += 1;
      try { validateMessage(currentMessage()); draftPrepared = context.hasContext && !Object.keys(validateContacts(contacts)).length; }
      catch (_) { draftPrepared = false; }
      updateExports(); emit();
    }));
    download.addEventListener('click', () => {
      if (download.disabled) return;
      try {
        const content = makeEml(contacts, currentMessage()), blob = new Blob([content], { type: 'message/rfc822' });
        const url = URL.createObjectURL(blob), anchor = el('a'); anchor.href = url; anchor.download = '1stprincipleai-expert-introduction.eml'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = 'Email draft downloaded. It has not been sent or delivered.';
      } catch (error) { status.textContent = error.message; }
    });
    open.addEventListener('click', () => {
      const mailto = updateExports(); if (!draftPrepared || !mailto.available) return;
      status.textContent = 'Opening your email app for review. Sending remains your action; delivery is not tracked here.';
      scope.location.href = mailto.uri;
    });
    function getState() {
      return {
        hasContext: context.hasContext, draftPrepared, emailDeliveryConnected: false, emailSent: false,
        recipientEntered: Boolean(contacts.expertEmail.trim()), recipientValid: validEmail(contacts.expertEmail),
        includeDrawingNotes, confirmedDrawingNotes: includeDrawingNotes ? project.confirmedFacts.length : 0,
        illustrativeDrawing: Boolean(includeDrawingNotes && project.drawing.illustrative), revision,
        contacts: { ...contacts }, message: draftPrepared ? { ...currentMessage() } : null,
        providerAdapter: { connected: false, outbound: 'draft_only', inbound: 'reserved', inboundConnected: false },
        attachments: [], expertEngaged: false, replyReceived: false
      };
    }
    const api = {
      setContext(input, settings = {}) {
        const next = normalizeContext(input), nextSignature = JSON.stringify(next);
        if (nextSignature !== contextSignature || settings.reset) { context = next; contextSignature = nextSignature; project = normalizeProject(null); projectSignature = JSON.stringify(project); clearInputs(); revision += 1; emit(); }
        else renderProject();
        return api;
      },
      updateProject(input) {
        const next = normalizeProject(input), nextSignature = JSON.stringify(next);
        if (nextSignature === projectSignature) return api;
        project = next; projectSignature = nextSignature; renderProject(); invalidate('Drawing or project details changed. Prepare an updated email draft.'); return api;
      },
      reset() { project = normalizeProject(null); projectSignature = JSON.stringify(project); clearInputs(); revision += 1; emit(); return api; },
      getState,
      getProviderPayload() { return providerPayload(context, project, contacts, currentMessage(), draftPrepared, includeDrawingNotes); }
    };
    root._firstPrincipleExpertContact = api; api.setContext(null); return api;
  }
  const api = { mount, validEmail, validateContacts, normalizeContext, normalizeProject, buildDraft, encodedHeader, makeEml, makeMailto, MAILTO_MAX_LENGTH, ROLES };
  scope.FirstPrincipleExpertContact = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
