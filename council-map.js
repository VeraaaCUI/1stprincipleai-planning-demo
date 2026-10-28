/* NSW public-data location explorer. No question text is sent to a server. */
(function (scope) {
  'use strict';
  const G = scope.LynnCouncilGuidance;
  const R = scope.FirstPrincipleReport;
  const ADDRESS_ENDPOINT = 'https://mapsq.six.nsw.gov.au/services/public/Address_Location';
  const COUNCIL_ENDPOINT = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Administrative_Boundaries/MapServer/1/query';
  const BASEMAP = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Base_Map/MapServer/tile/{z}/{y}/{x}';
  const AERIAL = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}';
  const levelLabels = { high: 'High', medium: 'Medium', low: 'Low', none: "Not located" };
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined && text !== null) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }
  function button(text, onClick, className) {
    const element = node('button', text, className || 'cm-button');
    element.type = 'button';
    element.addEventListener('click', onClick);
    return element;
  }
  function externalLink(source) {
    const anchor = node('a', source.title);
    anchor.href = source.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }
  function extendBox(boxes) {
    const values = boxes.filter(box => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite));
    return values.length ? [Math.min(...values.map(box => box[0])), Math.min(...values.map(box => box[1])), Math.max(...values.map(box => box[2])), Math.max(...values.map(box => box[3]))] : null;
  }
  function fetchJson(url, signal) {
    return fetch(url, { signal, credentials: 'omit' }).then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
  }
  function mount(root) {
    if (!root) return { refresh() {} };
    if (root._lynnCouncilMap) { root._lynnCouncilMap.refresh(); return root._lynnCouncilMap; }
    if (!G || !scope.L) {
      root.append(node('p', "The map component could not load. Please refresh the page.", 'cm-error'));
      return { refresh() {} };
    }
    const L = scope.L;
    let features = [], places = [], byId = {}, layers = {}, selection = null, marker = null, streetLayer = null, aerialLayer = null;
    let requestNumber = 0, liveRequest = null, map = null, postcodeGroups = [], ready = false, pendingCase = false, lastReport = null;
    const layout = node('div', null, 'cm-explorer');
    const heading = node('div', null, 'cm-heading');
    const headingCopy = node('div');
    headingCopy.append(node('p', 'Your project, from the first question', 'cm-kicker'), node('h2', 'Find your property. Ask your question.'), node('p', 'Get a short planning preview, then carry the same project into cost planning, application preparation and expert review.', 'cm-subtitle'));
    heading.append(headingCopy, node('span', 'Early access', 'cm-tag'));
    const journeySteps = node('ol', null, 'cm-journey-steps');
    ['Locate your property', 'Ask & preview', 'Plan with specialists'].forEach((label, index) => { const li = node('li'); li.append(node('span', String(index + 1)), node('strong', label)); journeySteps.append(li); });
    const sample = node('div', null, 'cm-sample');
    sample.append(node('div', null, 'cm-sample-copy'), button('Try CASE-0001', loadCase, 'cm-button'));
    sample.firstChild.append(node('strong', 'Follow one project from start to finish'), node('p', R ? R.CASE.address + ' · Reconstructed case enquiry' : 'Hawkesbury secondary dwelling demonstration'));
    const searchForm = node('form', null, 'cm-search-form');
    const searchLabel = node('label', "Project location");
    searchLabel.htmlFor = 'cm-query';
    const searchRow = node('div', null, 'cm-search-row');
    const search = node('input');
    search.type = 'search'; search.id = 'cm-query'; search.autocomplete = 'off';
    search.placeholder = "Council, suburb, postcode or complete street address";
    search.maxLength = 180; search.setAttribute('aria-controls', 'cm-suggestions');
    search.setAttribute('aria-expanded', 'false');
    const searchSubmit = node('button', "Find location", 'cm-button cm-primary');
    searchSubmit.type = 'submit';
    searchRow.append(search, searchSubmit);
    const searchHelp = node('p', "Name and postcode searches stay on this page. Submitting a complete address sends it to the official NSW service. Questions are not uploaded or saved.", 'cm-privacy');
    searchHelp.id = 'cm-search-help'; search.setAttribute('aria-describedby', searchHelp.id);
    const suggestions = node('ul', null, 'cm-suggestions');
    suggestions.id = 'cm-suggestions'; suggestions.setAttribute('aria-label', "Location suggestions. Please choose one."); suggestions.hidden = true;
    const searchStatus = node('p', "Loading NSW localities and council boundaries…", 'cm-search-status');
    searchStatus.setAttribute('role', 'status');
    searchForm.append(searchLabel, searchRow, searchHelp, suggestions, searchStatus);
    const workspace = node('div', null, 'cm-workspace');
    const mapColumn = node('div', null, 'cm-map-column');
    const mapToolbar = node('div', null, 'cm-map-toolbar');
    const areaText = node('span', 'NSW Council Map');
    const allButton = button("View all NSW", resetView, 'cm-text-button');
    mapToolbar.append(areaText, allButton);
    const mapCanvas = node('div', null, 'cm-map');
    mapCanvas.id = 'cm-leaflet-map'; mapCanvas.setAttribute('aria-label', "NSW council map. Zoom or click to select an area, or use the council list below.");
    const mapStatus = node('p', "Loading boundaries…", 'cm-map-status'); mapStatus.setAttribute('role', 'status');
    const councilRow = node('div', null, 'cm-council-row');
    const councilLabel = node('label', "Or choose a council"); councilLabel.htmlFor = 'cm-council-select';
    const councilSelect = node('select'); councilSelect.id = 'cm-council-select'; councilSelect.disabled = true;
    const emptyOption = node('option', "Select a council / area"); emptyOption.value = ''; councilSelect.append(emptyOption);
    councilSelect.addEventListener('change', () => {
      if (byId[councilSelect.value]) selectCouncil(byId[councilSelect.value]);
      else { cancelRequest(); clearSelection(); closeSuggestions(); searchStatus.textContent = "Select a location before viewing guidance."; }
    });
    councilRow.append(councilLabel, councilSelect);
    const sourceLine = node('div', null, 'cm-map-sources');
    sourceLine.append(node('span', "Boundaries: © State of NSW (Spatial Services) · "), externalLink({ title: "Data source", url: 'https://data.nsw.gov.au/data/en/dataset/nsw-administrative-boundaries' }), node('span', ' · '), externalLink({ title: 'CC BY 3.0 AU', url: 'https://creativecommons.org/licenses/by/3.0/au/' }), node('p','Aerial capture dates vary. Imagery and address points are not planning-risk layers or a lot survey.'));
    mapColumn.append(mapToolbar, mapCanvas, mapStatus, councilRow, sourceLine);
    const side = node('aside', null, 'cm-side'); side.setAttribute('aria-label', "Selected area and question");
    const selectionPanel = node('div', null, 'cm-selection-panel');
    const questionForm = node('form', null, 'cm-question-form');
    const questionLabel = node('label', "What would you like to do here?"); questionLabel.htmlFor = 'cm-question';
    const question = node('textarea'); question.id = 'cm-question'; question.rows = 3; question.maxLength = 600;
    question.placeholder = "For example: What should I prepare before building a granny flat?";
    const quickTopics = node('div', null, 'cm-topics'); quickTopics.setAttribute('aria-label', "Example questions");
    [["Granny flat", "What should I prepare before building a granny flat?"], ["Trees", "What should I check before pruning or removing a tree?"], ["Flooding", "What information do I need to check flooding and drainage?"]].forEach(([label, text]) => {
      quickTopics.append(button(label, () => { question.value = text; clearReport(); caseQuestionNote.hidden = true; question.focus(); }, 'cm-topic'));
    });
    const caseQuestionNote = node('p', null, 'cm-case-question-note'); caseQuestionNote.hidden = true;
    const questionSubmit = node('button', 'Get planning preview', 'cm-button cm-primary cm-full'); questionSubmit.type = 'submit';
    const questionHint = node('p', 'A short, evidence-based preview with confidence and next steps. Professional review is still required.', 'cm-question-hint');
    questionForm.append(questionLabel, question, caseQuestionNote, quickTopics, questionSubmit, questionHint);
    side.append(selectionPanel, questionForm);
    workspace.append(mapColumn, side);
    const guidancePanel = node('section', null, 'cm-guidance'); guidancePanel.hidden = true; guidancePanel.setAttribute('aria-label', "Preparation guidance and sources");
    const footnote = node('p', "Boundaries are simplified for display and do not replace a lot survey. Location search covers NSW; the professional case pilot currently covers Hawkesbury.", 'cm-footnote');
    layout.append(heading, journeySteps, sample, searchForm, workspace, guidancePanel, footnote); root.append(layout);
    renderSelection();
    searchForm.addEventListener('submit', event => { event.preventDefault(); performSearch(true); });
    search.addEventListener('input', () => { pendingCase=false; cancelRequest(); clearSelection(); performSearch(false); });
    question.addEventListener('input', () => { clearReport(); if (!caseQuestionNote.hidden) caseQuestionNote.textContent = 'Edited from the reconstructed case enquiry.'; });
    search.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { const first = suggestions.querySelector('button'); if (first) { event.preventDefault(); first.focus(); } }
      if (event.key === 'Escape') closeSuggestions();
    });
    suggestions.addEventListener('keydown', event => {
      const buttons = [...suggestions.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' && buttons.length) { event.preventDefault(); buttons[(index + 1) % buttons.length].focus(); }
      if (event.key === 'ArrowUp' && buttons.length) { event.preventDefault(); buttons[(index - 1 + buttons.length) % buttons.length].focus(); }
      if (event.key === 'Escape') { closeSuggestions(); search.focus(); }
    });
    questionForm.addEventListener('submit', event => {
      event.preventDefault();
      if (!selection) { searchStatus.textContent = "Choose a location on the map, from the suggestions or from the council list first."; search.focus(); return; }
      if (!question.value.trim()) { questionHint.textContent = "Briefly describe what you want to build, alter or operate."; question.focus(); return; }
      renderGuidance();
      guidancePanel.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'nearest' });
    });
    const abortLoad = new AbortController();
    const loadTimer = setTimeout(() => abortLoad.abort(), 25000);
    Promise.all([fetchJson('./data/nsw-councils.geojson', abortLoad.signal), fetchJson('./data/places.json', abortLoad.signal)]).then(([geo, gazetteer]) => {
      if (!Array.isArray(geo.features) || !Array.isArray(gazetteer.places)) throw new Error('Invalid map data');
      features = geo.features; places = gazetteer.places;
      if (/^\d{4}-\d{2}-\d{2}$/.test(gazetteer.retrieved_on || '')) sourceLine.append(node('span', " · Retrieved " + gazetteer.retrieved_on));
      byId = Object.fromEntries(features.map(feature => [feature.properties.id || feature.id, feature]));
      features.forEach(feature => { feature.properties.id = feature.properties.id || feature.id; });
      const postcodeMap = new Map();
      places.forEach(place => {
        if (!place.postcode) return;
        if (!postcodeMap.has(place.postcode)) postcodeMap.set(place.postcode, []);
        postcodeMap.get(place.postcode).push(place);
      });
      postcodeGroups = [...postcodeMap].map(([postcode, members]) => ({ id: 'postcode-' + postcode, kind: 'postcode', name: postcode, members, council_ids: [...new Set(members.flatMap(place => place.council_ids))], bbox: extendBox(members.map(place => place.bbox)) }));
      features.slice().sort((a, b) => displayCouncil(a).localeCompare(displayCouncil(b))).forEach(feature => {
        const option = node('option', displayCouncil(feature)); option.value = feature.properties.id; councilSelect.append(option);
      });
      councilSelect.disabled = false;
      createMap(geo); ready = true; root.dataset.ready = 'true';
      searchStatus.textContent = "Search for a location and choose a suggestion to zoom the map.";
      if (pendingCase) loadCase();
      else if (search.value.trim()) performSearch(false);
    }).catch(() => {
      searchStatus.textContent = "Location data could not load. Check your connection and refresh. For a local preview, use the website's HTTP preview address rather than opening the file directly.";
      mapStatus.textContent = "Map data is temporarily unavailable."; root.dataset.error = 'data-unavailable';
    }).finally(() => clearTimeout(loadTimer));

    function reducedMotion() { return scope.matchMedia && scope.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function displayCouncil(feature) {
      const props = feature.properties;
      return props.is_unincorporated ? props.name + " · Unincorporated / special area" : props.council_name || props.name;
    }
    function cancelRequest() {
      requestNumber += 1;
      if (liveRequest) liveRequest.abort();
      liveRequest = null;
      searchSubmit.disabled = false; searchSubmit.textContent = "Find location";
    }
    function clearSelection() {
      selection = null;
      if (marker && map) { map.removeLayer(marker); marker = null; }
      councilSelect.value = '';
      Object.entries(layers).forEach(([id, layer]) => layer.setStyle(styleFor(byId[id], false)));
      renderSelection(); clearReport(); guidancePanel.replaceChildren();
      root.dataset.selectionKind = ''; root.dataset.selectedCouncils = ''; root.dataset.guidanceConfidence = '';
    }
    function clearReport() {
      lastReport = null; guidancePanel.hidden = true; root.dataset.guidanceConfidence = '';
      scope.dispatchEvent(new CustomEvent('firstprinciple:report-cleared'));
    }
    function closeSuggestions() { suggestions.hidden = true; search.setAttribute('aria-expanded', 'false'); }
    function showResults(items, message) {
      suggestions.replaceChildren();
      items.forEach(item => {
        const row = node('li');
        const action = button(null, () => chooseResult(item), 'cm-suggestion');
        const title = item.kind === 'council' ? displayCouncil(item.feature) : item.kind === 'address' ? item.name : item.kind === 'postcode' ? "Postcode " + item.name : item.name + (item.postcode ? ' NSW ' + item.postcode : '');
        const description = item.kind === 'council' ? "Council / local government area" : item.kind === 'address' ? (item.exact ? "Official address candidate · Select to check its council" : "Approximate address candidate · Input may have changed; check carefully") : item.kind === 'postcode' ? item.members.length + " localities · Select a specific locality next" : 'Suburb / Locality · ' + item.council_ids.length + " council / area candidates";
        action.append(node('strong', title), node('small', description));
        row.append(action); suggestions.append(row);
      });
      suggestions.hidden = !items.length; search.setAttribute('aria-expanded', String(Boolean(items.length)));
      searchStatus.textContent = message;
    }
    function localResults(query) {
      const normalized = G.normalize(query);
      const tokens = normalized.split(' ').filter(Boolean);
      const matches = value => tokens.every(token => G.normalize(value).includes(token));
      const councils = features.filter(feature => matches(feature.properties.name + ' ' + feature.properties.council_name)).map(feature => ({ kind: 'council', feature, score: G.councilKey(feature.properties.name) === G.councilKey(query) ? 0 : 2 }));
      const postcodes = postcodeGroups.filter(group => /^\d{1,4}$/.test(query.trim()) && group.name.startsWith(query.trim())).map(group => ({ ...group, score: group.name === query.trim() ? 0 : 5 }));
      const localities = places.filter(place => matches(place.name + ' ' + place.postcode)).map(place => ({ ...place, kind: 'place', score: G.normalize(place.name) === normalized ? 1 : 3 }));
      return [...councils, ...postcodes, ...localities].sort((a, b) => a.score - b.score || String(a.name || a.feature.properties.name).localeCompare(String(b.name || b.feature.properties.name)));
    }
    async function performSearch(submitted, autoCase = false) {
      const query = search.value.trim();
      if (!ready) return;
      if (!query) { closeSuggestions(); searchStatus.textContent = "Enter a council, suburb, postcode or complete street address."; return; }
      const results = localResults(query);
      if (results.length) { showResults(results.slice(0, 12), results.length > 12 ? "Found " + results.length + " locations. Showing the first 12; add more detail to narrow the search." : "Choose a location to zoom the map. The first suggestion is not selected automatically."); return; }
      if (!submitted) { closeSuggestions(); searchStatus.textContent = /\d/.test(query) ? "For a complete address, select Find location. For example: 346 Panorama Ave, Bathurst NSW 2795." : "No local match found. Try a fuller name or a complete street address."; return; }
      const parts = G.parseAddress(query);
      if (!parts) { closeSuggestions(); searchStatus.textContent = "No match found. Try an address such as 346 Panorama Ave, Bathurst NSW 2795. NSW only; include a street number, street type and suburb or postcode."; return; }
      cancelRequest();
      const number = requestNumber;
      const controller = new AbortController(); liveRequest = controller;
      const timer = setTimeout(() => controller.abort(), 16000);
      searchSubmit.disabled = true; searchSubmit.textContent = "Searching…";
      searchStatus.textContent = "Searching the official NSW address service. Please check the complete address returned."; closeSuggestions();
      try {
        const params = new URLSearchParams(Object.entries(parts).filter(([, value]) => value));
        const result = (await fetchJson(ADDRESS_ENDPOINT + '?' + params, controller.signal)).addressResult;
        if (number !== requestNumber) return;
        if (!result || result.errMsg) throw new Error('Address result unavailable');
        const methods = result.searchMethod && result.searchMethod.methodDescriptions || [];
        const exact = Number(result.numRecs) === 1 && methods.includes('Input parameters matched') && !methods.some(method => /ignored|closest|alternate|not matched/i.test(method));
        const addresses = (result.addresses || []).filter(item => {
          const point = item.addressPoint || {};
          return Number.isFinite(point.centreX) && Number.isFinite(point.centreY) && point.centreX >= 140 && point.centreX <= 160 && point.centreY <= -27 && point.centreY >= -38;
        }).slice(0, 12).map(item => ({ kind: 'address', name: item.shortAddressString + (item.postCode ? ' NSW ' + item.postCode : ''), center: [item.addressPoint.centreX, item.addressPoint.centreY], council_ids: [], exact, methods, coordinateSystem: item.addressPoint.coordRefSys, addressCouncil: item.council || '' }));
        if (autoCase && addresses.length === 1 && addresses[0].exact && R.caseMatches(addresses[0])) {
          await chooseResult(addresses[0]);
        } else if (autoCase) selectSavedCase();
        else showResults(addresses, addresses.length ? "Choose and check a returned address. Its council will then be checked using the address point. Approximate results will not be labelled exact." : "The official service found no NSW address. Check the input or start with a suburb or postcode.");
      } catch (error) {
        if (number === requestNumber) {
          if (autoCase) selectSavedCase();
          else searchStatus.textContent = error.name === 'AbortError' ? "The address service timed out. Retry or choose a suburb or council first." : "The address service is temporarily unavailable. Retry or choose a suburb or council first.";
        }
      } finally {
        clearTimeout(timer);
        if (number === requestNumber) { searchSubmit.disabled = false; searchSubmit.textContent = "Find location"; liveRequest = null; }
      }
    }
    function loadCase() {
      if (!R) return;
      if (!ready) { pendingCase = true; searchStatus.textContent = 'Loading the example project…'; return; }
      pendingCase = false; cancelRequest(); clearSelection(); closeSuggestions();
      search.value = R.CASE.address; question.value = R.CASE.question;
      caseQuestionNote.hidden = false; caseQuestionNote.textContent = R.CASE.questionBasis;
      questionHint.textContent = 'The same project continues from this question to the preview and specialist workspace.';
      performSearch(true, true);
      workspace.scrollIntoView({behavior:reducedMotion() ? 'instant' : 'smooth',block:'start'});
    }
    function selectSavedCase() {
      const council = features.find(G.isPilot);
      if (!council) return;
      cancelRequest(); closeSuggestions();
      setSelection({kind:'address',name:R.CASE.address,center:[...R.CASE.center],council_ids:[council.properties.id],exact:false,origin:'saved_case_point',methods:['Saved case point; not verified live']});
      if (map) map.setView([R.CASE.center[1],R.CASE.center[0]],18,{animate:!reducedMotion()});
      showCaseImagery();
      drawPoint(R.CASE.center,true);
      searchStatus.textContent = 'Showing the saved case address point checked on 29 October 2026. Live matching is unavailable; location confidence remains Low.';
    }
    async function chooseResult(item) {
      cancelRequest(); closeSuggestions();
      if (item.kind === 'council') { selectCouncil(item.feature); return; }
      if (item.kind === 'postcode') {
        search.value = item.name;
        if (marker && map) { map.removeLayer(marker); marker = null; }
        setSelection({ kind: 'postcode', name: "Postcode " + item.name, council_ids: item.council_ids, bbox: item.bbox });
        zoomBox(item.bbox, 11);
        showResults(item.members.slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, 24).map(place => ({ ...place, kind: 'place' })), "A postcode is not a council boundary. Choose a specific locality or enter a complete address.");
        return;
      }
      if (item.kind === 'place') {
        search.value = item.name + (item.postcode ? ' NSW ' + item.postcode : '');
        setSelection({ ...item, kind: 'place' }); zoomBox(item.bbox, 13); drawPoint(item.center, false);
        searchStatus.textContent = "Zoomed to " + item.name + ". Use a complete address to confirm the property's council.";
        return;
      }
      if (item.kind !== 'address') return;
      search.value = item.name;
      setSelection({ ...item, council_ids: [], exact: false });
      if (map) map.setView([item.center[1], item.center[0]], 18, { animate: !reducedMotion() });
      if (R && R.caseMatches(item)) showCaseImagery();
      drawPoint(item.center, true); searchStatus.textContent = "Address selected. Checking the council with the official boundary service…";
      const number = requestNumber;
      const controller = new AbortController(); liveRequest = controller;
      const timer = setTimeout(() => controller.abort(), 16000);
      try {
        const params = new URLSearchParams({ geometry: item.center.join(','), geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'cadid,lganame,councilname,abscode', returnGeometry: 'false', f: 'json' });
        const response = await fetchJson(COUNCIL_ENDPOINT + '?' + params, controller.signal);
        if (number !== requestNumber) return;
        if (response.error || !Array.isArray(response.features)) throw new Error('Council query unavailable');
        const rawIds = [...new Set(response.features.map(feature => {
          const id = feature.attributes && feature.attributes.cadid;
          return /^\d+$/.test(String(id)) ? 'LGA-' + id : null;
        }))];
        const unrecognized = rawIds.some(id => !id || !byId[id]);
        // Never discard an unknown returned council and turn a multiple match
        // into one known match. A newer/unrecognized boundary remains unresolved.
        const matched = unrecognized ? [] : rawIds;
        // A high match requires both the service's exact-input statement and
        // one official point-in-boundary result. Adjusted/nearest matches stay low.
        setSelection({ ...item, council_ids: matched, exact: item.exact && matched.length === 1 });
        searchStatus.textContent = matched.length === 1 ? "The selected address point's council has been checked. Describe your project next." : matched.length ? "The address point intersects multiple areas. The responsible authority needs confirmation." : "This address point could not be matched to a council in this map. Confirm the responsible authority with the official service.";
      } catch (error) {
        if (number === requestNumber) { setSelection({ ...item, council_ids: [], exact: false }); searchStatus.textContent = "The address point is located, but the council checking service is temporarily unavailable. The responsible authority remains unconfirmed."; }
      } finally { clearTimeout(timer); if (number === requestNumber) liveRequest = null; }
    }
    function selectCouncil(feature) {
      cancelRequest(); closeSuggestions();
      search.value = displayCouncil(feature);
      if (marker && map) { map.removeLayer(marker); marker = null; }
      const props = feature.properties;
      setSelection({ kind: 'council', name: displayCouncil(feature), council_ids: [props.id], bbox: props.bbox });
      zoomBox(props.bbox, 12);
      searchStatus.textContent = "Selected " + displayCouncil(feature) + ". This is an area selection; a specific property has not been located.";
    }
    function setSelection(value) {
      selection = value;
      councilSelect.value = value.council_ids.length === 1 ? value.council_ids[0] : '';
      Object.entries(layers).forEach(([id, layer]) => layer.setStyle(styleFor(byId[id], value.council_ids.includes(id))));
      renderSelection();
      if (!guidancePanel.hidden && question.value.trim()) renderGuidance();
      root.dataset.selectionKind = value.kind;
      root.dataset.selectedCouncils = value.council_ids.join(',');
    }
    function renderSelection() {
      selectionPanel.replaceChildren();
      selectionPanel.append(node('p', "Selected location", 'cm-panel-label'));
      if (!selection) {
        selectionPanel.append(node('h3', "Where would you like to start?"), node('p', "Choose a location to see candidate council areas and organise the questions for your project.", 'cm-selection-help'));
        return;
      }
      selectionPanel.append(node('h3', selection.name));
      const selectedFeatures = selection.council_ids.map(id => byId[id]).filter(Boolean);
      if (selectedFeatures.length) {
        const list = node('ul', null, 'cm-selected-councils');
        selectedFeatures.slice(0, 8).forEach(feature => list.append(node('li', displayCouncil(feature))));
        if (selectedFeatures.length > 8) list.append(node('li', "Plus " + (selectedFeatures.length - 8) + " more area candidates. Narrow the location to continue."));
        selectionPanel.append(list);
      } else selectionPanel.append(node('p', "The responsible council is not yet confirmed.", 'cm-selection-help'));
      const confidence = G.describeLocation(selection);
      const badge = node('span', confidence.title, 'cm-confidence cm-confidence-' + confidence.level);
      selectionPanel.append(badge, node('p', confidence.reason, 'cm-confidence-reason'));
      if (selection.kind === 'address') {
        selectionPanel.append(node('p', "The point comes from the official address service and may use GDA94 coordinates. It is not a precise lot boundary survey.", 'cm-coordinate-note'));
        if (!selection.exact && selection.methods && selection.methods.length) selectionPanel.append(node('p', "Service matching notes: " + selection.methods.join(' / '), 'cm-coordinate-note'));
      }
    }
    function renderGuidance() {
      if (!R) { searchStatus.textContent = 'The preview component could not load. Refresh to try again.'; return; }
      const result = R.buildReport(question.value, selection, byId);
      lastReport = result;
      guidancePanel.hidden = false; guidancePanel.replaceChildren();
      const titleRow = node('div', null, 'cm-guidance-title');
      titleRow.append(node('div'), node('span', result.confidenceLabel, 'cm-confidence cm-confidence-low'));
      titleRow.firstChild.append(node('p', result.mode + ' · Prepared ' + result.preparedOn, 'cm-kicker'), node('h3', 'Your preliminary planning report'));
      guidancePanel.append(titleRow, node('p', result.location.name + ' · ' + (result.location.councilNames.join(', ') || 'Council not confirmed'), 'cm-report-location'), node('p', result.summary, 'cm-report-summary'), node('p', result.confidenceReason, 'cm-guidance-reason'));
      const next = node('div', null, 'cm-report-next');
      const nextCopy = node('div'); nextCopy.append(node('h4', 'Need a clearer scope, budget or application plan?'), node('p', 'Continue with this location, question and evidence gaps. Plan the work an AI Agent and human specialists would review.'));
      const continueButton = button('Continue to advanced services →', () => scope.dispatchEvent(new CustomEvent('firstprinciple:advanced-services', {detail:{location:result.location,question:result.question,report:result}})), 'cm-button cm-primary');
      continueButton.id = 'cm-advanced-services'; next.append(nextCopy,continueButton); guidancePanel.append(next);
      const details = node('details', null, 'cm-report-evidence');
      details.append(node('summary', 'Why this confidence? View risks, missing evidence and sources'));
      details.append(node('p', result.evidenceNote, 'cm-scope-note'));
      if (result.risks.length) {
        const cards = node('div', null, 'cm-risk-grid');
        result.risks.forEach(risk => { const card = node('article', null, 'cm-risk-card'); card.append(node('h4',risk.label),node('span',risk.state,'cm-risk-state'),node('p',risk.detail),node('small',risk.evidence)); cards.append(card); });
        details.append(cards);
      }
      const columns = node('div', null, 'cm-guidance-columns');
      const missingColumn = node('div'); missingColumn.append(node('h4','What needs checking next'));
      const missing = node('ul'); result.missing.forEach(item => missing.append(node('li',item))); missingColumn.append(missing);
      const sourceColumn = node('div'); sourceColumn.append(node('h4','Source basis'));
      const links = node('ul',null,'cm-source-links'); result.sources.forEach(source => { const li=node('li'); li.append(externalLink(source)); if(source.note) li.append(node('small',source.note)); links.append(li); }); sourceColumn.append(links);
      columns.append(missingColumn,sourceColumn); details.append(columns);
      if (result.caseId) details.append(button('Explore the historical case evidence', () => scope.dispatchEvent(new CustomEvent('firstprinciple:evidence-tour')), 'cm-button'));
      guidancePanel.append(details,node('p',result.modeNote,'cm-guidance-footnote'));
      root.dataset.guidanceConfidence = result.confidence;
      scope.dispatchEvent(new CustomEvent('firstprinciple:report-ready',{detail:{location:result.location,question:result.question,report:result}}));
    }
    function styleFor(feature, selected) {
      return { color: selected ? '#a25838' : '#5b7169', weight: selected ? 2.3 : 0.8, fillColor: selected ? '#b7794e' : feature.properties.is_unincorporated ? '#9ba3a0' : '#c3d5c6', fillOpacity: selection?.kind === 'address' ? 0.02 : selected ? 0.5 : 0.22, dashArray: feature.properties.is_unincorporated ? '3 3' : undefined };
    }
    function createMap(geo) {
      map = L.map(mapCanvas, { scrollWheelZoom: false, minZoom: 4, maxZoom: 19, zoomSnap: 0.25, zoomDelta: 0.5, zoomControl: true, preferCanvas: false });
      const tiles = L.tileLayer(BASEMAP, { maxZoom: 19, bounds: [[-37.86, 140.97], [-27.70, 159.50]], attribution: '© <a href="https://www.spatial.nsw.gov.au/" target="_blank" rel="noopener">NSW Spatial Services</a>' });
      let tileFailed = false;
      tiles.on('tileerror', () => { if (!tileFailed) { tileFailed = true; mapStatus.textContent = "Some base map tiles could not load. Council boundaries and the list remain available."; } });
      tiles.addTo(map);
      streetLayer = tiles;
      aerialLayer = L.tileLayer(AERIAL,{maxZoom:19,attribution:'© NSW Spatial Services · Aerial imagery; capture dates vary'});
      aerialLayer.on('tileerror',()=>{mapStatus.textContent='Some aerial tiles are unavailable. Switch to Street map; the address point remains visible.';});
      L.control.layers({'Street map':streetLayer,'Aerial imagery':aerialLayer},null,{collapsed:false,position:'topright'}).addTo(map);
      L.geoJSON(geo, { style: feature => styleFor(feature, false), onEachFeature: (feature, layer) => {
        layers[feature.properties.id] = layer;
        const tooltip = node('span', displayCouncil(feature));
        layer.bindTooltip(tooltip, { sticky: true });
        layer.on('click', () => selectCouncil(feature));
        layer.on('mouseover', () => layer.setStyle({ fillOpacity: selection?.kind === 'address' ? 0.04 : 0.48 }));
        layer.on('mouseout', () => layer.setStyle(styleFor(feature, selection && selection.council_ids.includes(feature.properties.id))));
      } }).addTo(map);
      resetView();
      const councilCount = features.filter(feature => !feature.properties.is_unincorporated).length;
      mapStatus.textContent = councilCount + " councils · " + (features.length - councilCount) + " unincorporated / special areas · Boundaries simplified for display";
      areaText.textContent = 'NSW · ' + councilCount + ' Councils';
      if (scope.ResizeObserver) new ResizeObserver(() => { if (map) map.invalidateSize({ pan: false }); }).observe(mapCanvas);
    }
    function showCaseImagery() {
      if (map && aerialLayer) { if (streetLayer) map.removeLayer(streetLayer); aerialLayer.addTo(map); }
    }
    function zoomBox(box, maxZoom) {
      if (map && box) map.fitBounds([[box[1], box[0]], [box[3], box[2]]], { padding: [24, 24], maxZoom, animate: !reducedMotion() });
    }
    function resetView() {
      if (!map || !features.length) return;
      const mainland = features.filter(feature => feature.properties.center[0] < 155);
      zoomBox(extendBox(mainland.map(feature => feature.properties.bbox)), 7);
    }
    function drawPoint(center, address) {
      if (!map || !Array.isArray(center) || !center.every(Number.isFinite)) return;
      if (marker) map.removeLayer(marker);
      marker = L.circleMarker([center[1], center[0]], { radius: address ? 8 : 6, color: '#fffefa', weight: 2, fillColor: '#a95f3d', fillOpacity: 1 }).addTo(map);
      marker.bindTooltip(node('span', address ? "Selected address point (not a lot boundary)" : "Locality reference centre (not a property location)"));
    }
    const api = { loadCase, getReport(){return lastReport;}, focusReport(){if(!guidancePanel.hidden)guidancePanel.scrollIntoView({behavior:'instant',block:'start'});}, refresh() { if (map) map.invalidateSize({ pan: false }); }, getState() { return { ready, selection: selection ? { kind: selection.kind, name:selection.name, center:selection.center, origin:selection.origin, council_ids: [...selection.council_ids], locationConfidence: G.describeLocation(selection).level } : null, reportCaseId:lastReport?.caseId || null, planningConfidence: 'low',zoom:map?.getZoom() }; } };
    root._lynnCouncilMap = api;
    return api;
  }
  scope.LynnCouncilMap = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
