/* Australia location explorer; NSW council content only. Questions stay local. */
(function (scope) {
  'use strict';
  const G = scope.LynnCouncilGuidance;
  const R = scope.FirstPrincipleReport;
  const A = scope.FirstPrincipleAddressSearch;
  const D = scope.FirstPrincipleCouncilDocuments;
  const COUNCIL_ENDPOINT = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Administrative_Boundaries/MapServer/1/query';
  const BASEMAP = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
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
    let categories = null, categoryById = {}, councilLabels = null, boundaryLayer = null, currentDocumentId = null;
    const layout = node('div', null, 'cm-explorer');
    const heading = node('div', null, 'cm-heading');
    const headingCopy = node('div');
    headingCopy.append(node('p', 'Your project, from the first question', 'cm-kicker'), node('h2', 'Explore Australia. Plan your next step.'), node('p', 'Find a street address anywhere in Australia. Explore council boundaries and planning document references across NSW, then carry your project into specialist preparation.', 'cm-subtitle'));
    heading.append(headingCopy, node('span', 'Early access', 'cm-tag'));
    const journeySteps = node('ol', null, 'cm-journey-steps');
    ['Locate your property', 'Council & controls', 'Ask & preview', 'Plan with specialists'].forEach((label, index) => {
      const li=node('li');li.dataset.journeyStep=String(index+1);
      const action=button(null,()=>{
        if(index===0){search.focus();search.scrollIntoView({block:'center',behavior:'instant'});}
        if(index===1){if(!selection){viewNSW();mapCanvas.scrollIntoView({block:'center',behavior:'instant'});}else documentPanel.scrollIntoView({block:'center',behavior:'instant'});}
        if(index===2){question.focus();question.scrollIntoView({block:'center',behavior:'instant'});}
        if(index===3&&lastReport)scope.dispatchEvent(new CustomEvent('firstprinciple:advanced-services',{detail:{location:lastReport.location,question:lastReport.question,report:lastReport}}));
      },'cm-journey-action');
      action.append(node('span',String(index+1),'cm-journey-number'),node('strong',label));li.append(action);journeySteps.append(li);
    });
    const sample = node('div', null, 'cm-sample');
    sample.append(node('div', null, 'cm-sample-copy'), button('Try CASE-0001', loadCase, 'cm-button'));
    sample.firstChild.append(node('strong', 'Follow one project from start to finish'), node('p', R ? R.CASE.address + ' · Reconstructed case enquiry' : 'Hawkesbury secondary dwelling demonstration'));
    const searchForm = node('form', null, 'cm-search-form');
    const searchLabel = node('label', "Project location");
    searchLabel.htmlFor = 'cm-query';
    const searchRow = node('div', null, 'cm-search-row');
    const search = node('input');
    search.type = 'search'; search.id = 'cm-query'; search.autocomplete = 'off';
    search.placeholder = "Street number, street, suburb, state & postcode";
    search.maxLength = 180; search.setAttribute('aria-controls', 'cm-suggestions');
    search.setAttribute('aria-expanded', 'false');
    const searchSubmit = node('button', "Find location", 'cm-button cm-primary');
    searchSubmit.type = 'submit';
    searchRow.append(search, searchSubmit);
    const searchHelp = node('p', "NSW council and locality suggestions use the local index. Find location sends your search to NSW Spatial Services or Photon / OpenStreetMap for wider Australia. Questions are not sent.", 'cm-privacy');
    searchHelp.id = 'cm-search-help'; search.setAttribute('aria-describedby', searchHelp.id);
    const suggestions = node('ul', null, 'cm-suggestions');
    suggestions.id = 'cm-suggestions'; suggestions.setAttribute('aria-label', "Location suggestions. Please choose one."); suggestions.hidden = true;
    const searchStatus = node('p', "Loading NSW localities and council boundaries…", 'cm-search-status');
    searchStatus.setAttribute('role', 'status');
    searchForm.append(searchLabel, searchRow, searchHelp, suggestions, searchStatus);
    const addressDetails = node('details', null, 'cm-address-details');
    addressDetails.append(node('summary', 'Enter address details · street number, unit and postcode'));
    const addressForm = node('form', null, 'cm-address-form');
    const addressFields = {};
    [['unit','Unit / suite (optional)','e.g. 3'],['number','Street number','e.g. 58'],['street','Street name and type','e.g. Mitchell Drive'],['suburb','Suburb / locality','e.g. Glossodia'],['postcode','Postcode','e.g. 2756']].forEach(([key,label,placeholder]) => {
      const wrapper = node('div',null,'cm-address-field'); const fieldLabel=node('label',label); fieldLabel.htmlFor='cm-address-'+key;
      const input=node('input'); input.id=fieldLabel.htmlFor; input.placeholder=placeholder; input.maxLength=key==='street'?100:50; input.autocomplete='off';
      if(key==='postcode'){input.inputMode='numeric';input.maxLength=4;}
      addressFields[key]=input; wrapper.append(fieldLabel,input); addressForm.append(wrapper);
    });
    const stateField=node('div',null,'cm-address-field'),stateLabel=node('label','State / territory'); stateLabel.htmlFor='cm-address-state';
    const stateSelect=node('select');stateSelect.id=stateLabel.htmlFor;
    ['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'].forEach(state=>{const option=node('option',state);option.value=state;stateSelect.append(option);});
    stateField.append(stateLabel,stateSelect);addressForm.append(stateField);
    const addressSubmit=node('button','Find this street address','cm-button cm-primary');addressSubmit.type='submit';
    addressForm.append(addressSubmit,node('p','Include the street number and suburb. A building address point does not confirm a unit, a legal lot boundary or planning permission.','cm-address-note'));
    addressForm.addEventListener('submit',event=>{
      event.preventDefault();
      const value=Object.fromEntries(Object.entries(addressFields).map(([key,field])=>[key,field.value.trim()]));
      if(!value.number||!value.street||(!value.suburb&&!/^\d{4}$/.test(value.postcode))){searchStatus.textContent='Enter a street number, street name and a suburb or four-digit postcode.';return;}
      pendingCase=false;cancelRequest();clearSelection();
      search.value=(value.unit?'Unit '+value.unit+', ':'')+value.number+' '+value.street+', '+value.suburb+' '+stateSelect.value+(value.postcode?' '+value.postcode:'');
      performSearch(true);search.scrollIntoView({block:'nearest',behavior:'instant'});
    });
    addressDetails.append(addressForm);
    const coverageBanner=node('div',null,'cm-coverage-banner');
    coverageBanner.append(node('strong','Australia-wide map · NSW planning focus'),node('span','128 NSW councils have document references. Other states currently provide location search only.'));
    const workspace = node('div', null, 'cm-workspace');
    const mapColumn = node('div', null, 'cm-map-column');
    const mapToolbar = node('div', null, 'cm-map-toolbar');
    const areaText = node('span', 'Australia · NSW council detail');
    const viewButtons=node('div',null,'cm-view-buttons');
    const allButton = button("Australia", resetView, 'cm-text-button');allButton.id='cm-view-australia';
    const nswButton = button('Explore NSW',viewNSW,'cm-text-button');nswButton.id='cm-view-nsw';
    viewButtons.append(allButton,nswButton);mapToolbar.append(areaText, viewButtons);
    const mapCanvas = node('div', null, 'cm-map');
    mapCanvas.id = 'cm-leaflet-map'; mapCanvas.setAttribute('aria-label', "Australia map with NSW council boundaries. Zoom in and choose a NSW council to view its planning documents.");
    const mapStatus = node('p', "Loading boundaries…", 'cm-map-status'); mapStatus.setAttribute('role', 'status');
    const mapLegend=node('details',null,'cm-map-legend');mapLegend.open=!(scope.matchMedia&&scope.matchMedia('(max-width:700px)').matches);mapLegend.append(node('summary','Council colours · official OLG council types'));
    const legendContent=node('div',null,'cm-legend-content');mapLegend.append(legendContent);
    const councilRow = node('div', null, 'cm-council-row');
    const councilLabel = node('label', "Or choose a council"); councilLabel.htmlFor = 'cm-council-select';
    const councilSelect = node('select'); councilSelect.id = 'cm-council-select'; councilSelect.disabled = true;
    const emptyOption = node('option', "Select a council / area"); emptyOption.value = ''; councilSelect.append(emptyOption);
    councilSelect.addEventListener('change', () => {
      if (byId[councilSelect.value]) selectCouncil(byId[councilSelect.value]);
      else { cancelRequest(); clearSelection(); closeSuggestions(); searchStatus.textContent = "Select a location before viewing guidance."; }
    });
    councilRow.append(councilLabel, councilSelect);
    const documentPanel=node('section',null,'cm-document-panel');documentPanel.setAttribute('aria-label','NSW council planning documents');
    const documentHint=node('p','Zoom into NSW and click a coloured council, or choose one above, to see its planning documents.','cm-document-hint');
    documentPanel.append(node('p','Council planning library','cm-kicker'),node('h3','Explore the local controls'),documentHint);
    const sourceLine = node('div', null, 'cm-map-sources');
    sourceLine.append(node('span', "NSW boundaries: © State of NSW (Spatial Services) · "), externalLink({ title: "Data source", url: 'https://data.nsw.gov.au/data/en/dataset/nsw-administrative-boundaries' }), node('span', ' · '), externalLink({ title: 'CC BY 3.0 AU', url: 'https://creativecommons.org/licenses/by/3.0/au/' }), node('p'),externalLink({title:'Street map & national search: © OpenStreetMap contributors',url:'https://www.openstreetmap.org/copyright'}),node('span',' · '),externalLink({title:'Photon',url:'https://photon.komoot.io/'}),node('p','NSW aerial capture dates vary. Address points and imagery are not surveyed lot boundaries or planning-risk layers.'));
    mapColumn.append(mapToolbar, mapCanvas, mapStatus,mapLegend, councilRow, sourceLine);
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
    workspace.append(mapColumn, side,documentPanel);
    const guidancePanel = node('section', null, 'cm-guidance'); guidancePanel.hidden = true; guidancePanel.setAttribute('aria-label', "Preparation guidance and sources");
    const footnote = node('p', "Australian map coverage is broader than planning coverage. NSW document links are reference material; the evidence-based case pilot remains Hawkesbury. Boundaries are simplified for display.", 'cm-footnote');
    layout.append(heading, journeySteps, sample,coverageBanner, searchForm,addressDetails, workspace, guidancePanel, footnote); root.append(layout);
    renderSelection();updateJourney();
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
    Promise.all([fetchJson('./data/nsw-councils.geojson', abortLoad.signal), fetchJson('./data/places.json', abortLoad.signal),fetchJson('./data/council-map-categories.json',abortLoad.signal)]).then(([geo, gazetteer, classification]) => {
      if (!Array.isArray(geo.features) || !Array.isArray(gazetteer.places)) throw new Error('Invalid map data');
      features = geo.features; places = gazetteer.places;
      categories=classification; categoryById=Object.fromEntries((categories.categories||[]).map(category=>[category.id,category]));renderLegend();
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
      renderDocuments(null);
      root.dataset.selectionKind = ''; root.dataset.selectedCouncils = ''; root.dataset.guidanceConfidence = '';
    }
    function clearReport() {
      lastReport = null; guidancePanel.hidden = true; root.dataset.guidanceConfidence = '';
      updateJourney();
      scope.dispatchEvent(new CustomEvent('firstprinciple:report-cleared'));
    }
    function closeSuggestions() { suggestions.hidden = true; search.setAttribute('aria-expanded', 'false'); }
    function showResults(items, message) {
      suggestions.replaceChildren();
      items.forEach(item => {
        const row = node('li');
        const action = button(null, () => chooseResult(item), 'cm-suggestion');
        const title = item.kind === 'council' ? displayCouncil(item.feature) : item.kind==='postcode'&&item.members?'Postcode '+item.name:item.name;
        const description = item.kind === 'council' ? "Council / local government area" : item.source ? (item.precision === 'address_point' ? 'Street-number address point' : (item.precision || item.kind || 'Approximate').replace(/_/g,' ') + ' result') + ' · ' + (item.state || 'State not confirmed') + ' · ' + (item.exact ? 'Check its council next' : 'Check carefully; location not verified') : item.kind === 'postcode' ? item.members.length + " localities · Select a specific locality next" : 'Suburb / Locality · ' + (item.council_ids || []).length + " council / area candidates";
        action.append(node('strong', title), node('small', description+(item.propertyLabel?' · '+item.propertyLabel:'')));
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
      const localities = places.filter(place => matches(place.name + ' NSW ' + place.postcode)).map(place => ({ ...place, name:place.name+(place.postcode?' NSW '+place.postcode:''),kind: 'place', score: G.normalize(place.name) === normalized ? 1 : 3 }));
      return [...councils, ...postcodes, ...localities].sort((a, b) => a.score - b.score || String(a.name || a.feature.properties.name).localeCompare(String(b.name || b.feature.properties.name)));
    }
    async function performSearch(submitted, autoCase = false) {
      const query = search.value.trim();
      if (!ready) return;
      if (!query) { closeSuggestions(); searchStatus.textContent = "Enter a council, suburb, postcode or complete street address."; return; }
      const results = localResults(query);
      if (results.length) { showResults(results.slice(0, 12), results.length > 12 ? "Found " + results.length + " locations. Showing the first 12; add more detail to narrow the search." : "Choose a location to zoom the map. The first suggestion is not selected automatically."); return; }
      if (!submitted) { closeSuggestions(); searchStatus.textContent = "Select Find location to search Australia. For a property, include the street number, street, suburb, state and postcode."; return; }
      if (!A) { closeSuggestions();searchStatus.textContent='The address component could not load. Refresh the page to try again.';return; }
      cancelRequest();
      const number = requestNumber;
      const controller = new AbortController(); liveRequest = controller;
      const timer = setTimeout(() => controller.abort(), 22000);
      searchSubmit.disabled = true; searchSubmit.textContent = "Searching…";
      searchStatus.textContent = "Finding address candidates. Confirm the street number, suburb, state and match precision before choosing one."; closeSuggestions();
      try {
        const addresses=await A.search(query,{signal:controller.signal,limit:12});
        if (number !== requestNumber) return;
        if (autoCase && addresses.length === 1 && addresses[0].exact && R.caseMatches(addresses[0])) {
          await chooseResult(addresses[0]);
        } else if (autoCase) selectSavedCase();
        else showResults(addresses, addresses.length ? "Choose a result after checking its street number and locality. National search uses OpenStreetMap; NSW planning documents are the current content coverage." : "No matching location was returned. Check the street number, street name, suburb, state and postcode. Address coverage is incomplete.");
      } catch (error) {
        if (number === requestNumber) {
          if (autoCase) selectSavedCase();
          else searchStatus.textContent = error.name === 'AbortError' ? "The address service timed out. Retry or choose a NSW locality or council first." : "Address search is unavailable or the input needs more detail. Enter the street number, street, suburb, state and postcode, then retry.";
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
      setSelection({kind:'address',name:R.CASE.address,center:[...R.CASE.center],council_ids:[council.properties.id],exact:false,state:'NSW',precision:'saved_case_point',coverage:'nsw',origin:'saved_case_point',methods:['Saved case point; not verified live']});
      if (map) map.setView([R.CASE.center[1],R.CASE.center[0]],18,{animate:!reducedMotion()});
      showCaseImagery();
      drawPoint(R.CASE.center,true);
      searchStatus.textContent = 'Showing the saved case address point checked on 29 October 2026. Live matching is unavailable; location confidence remains Low.';
    }
    async function chooseResult(item) {
      cancelRequest(); closeSuggestions();
      clearReport();
      if (item.kind === 'council') { selectCouncil(item.feature); return; }
      if (item.kind === 'postcode' && item.members) {
        search.value = item.name;
        if (marker && map) { map.removeLayer(marker); marker = null; }
        setSelection({ kind: 'postcode', name: "Postcode " + item.name, council_ids: item.council_ids, bbox: item.bbox });
        zoomBox(item.bbox, 11);
        showResults(item.members.slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, 24).map(place => ({ ...place, kind: 'place' })), "A postcode is not a council boundary. Choose a specific locality or enter a complete address.");
        return;
      }
      if (item.kind === 'place') {
        search.value = item.name;
        setSelection({ ...item, kind: 'place',state:'NSW',coverage:'nsw' }); zoomBox(item.bbox, 13); drawPoint(item.center, false);
        searchStatus.textContent = "Zoomed to " + item.name + ". Use a complete address to confirm the property's council.";
        return;
      }
      if (!item.center || !item.source) return;
      search.value = item.name;
      const inNSW=item.state==='NSW';
      const zoom=item.precision==='address_point'||item.kind==='address'?18:item.kind==='street'?16:12;
      setSelection({ ...item, council_ids: [], exact: false,coverage:inNSW?'nsw':item.state?'outside_nsw':'unconfirmed' });
      if (map) map.setView([item.center[1], item.center[0]], zoom, { animate: !reducedMotion() });
      if (R && R.caseMatches(item)) showCaseImagery();
      drawPoint(item.center, item.kind==='address');
      if(!inNSW){
        if(map&&aerialLayer&&map.hasLayer(aerialLayer)){map.removeLayer(aerialLayer);streetLayer.addTo(map);}
        searchStatus.textContent='Location shown using '+item.source+'. Council boundaries and planning documents outside NSW are not connected. Check the returned address; national matches remain unverified.';return;
      }
      searchStatus.textContent = "Location selected. Checking the council with the official NSW boundary service…";
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
        setSelection({ ...item,state:'NSW',coverage:'nsw', council_ids: matched, exact: item.exact && item.kind==='address' && matched.length === 1 });
        searchStatus.textContent = matched.length === 1 ? "The selected address point's council has been checked. Describe your project next." : matched.length ? "The address point intersects multiple areas. The responsible authority needs confirmation." : "This address point could not be matched to a council in this map. Confirm the responsible authority with the official service.";
      } catch (error) {
        if (number === requestNumber) { setSelection({ ...item,state:'NSW',coverage:'nsw', council_ids: [], exact: false }); searchStatus.textContent = "The address point is located, but the council checking service is temporarily unavailable. The responsible authority remains unconfirmed."; }
      } finally { clearTimeout(timer); if (number === requestNumber) liveRequest = null; }
    }
    function selectCouncil(feature) {
      cancelRequest(); closeSuggestions();clearReport();
      search.value = displayCouncil(feature);
      if (marker && map) { map.removeLayer(marker); marker = null; }
      const props = feature.properties;
      setSelection({ kind: 'council', name: displayCouncil(feature), state:'NSW',coverage:'nsw',council_ids: [props.id], bbox: props.bbox });
      zoomBox(props.bbox, 12);
      searchStatus.textContent = "Selected " + displayCouncil(feature) + ". This is an area selection; a specific property has not been located.";
    }
    function setSelection(value) {
      selection = value;
      councilSelect.value = value.council_ids.length === 1 ? value.council_ids[0] : '';
      Object.entries(layers).forEach(([id, layer]) => layer.setStyle(styleFor(byId[id], value.council_ids.includes(id))));
      renderSelection();
      renderDocuments(value.council_ids.length===1?byId[value.council_ids[0]]:null);
      if (!guidancePanel.hidden && question.value.trim()) renderGuidance();
      root.dataset.selectionKind = value.kind;
      root.dataset.selectedCouncils = value.council_ids.join(',');
      updateJourney();
    }
    function updateJourney(){
      const current=lastReport?3:selection?2:1;
      journeySteps.querySelectorAll('li').forEach((li,index)=>{
        const action=li.querySelector('button');action.disabled=index===2?!selection:index===3?!lastReport:false;
        if(index+1===current)action.setAttribute('aria-current','step');else action.removeAttribute('aria-current');
        li.dataset.complete=String(index===0?Boolean(selection):index===1?Boolean(selection?.council_ids?.length):index===2?Boolean(lastReport):false);
      });
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
        selectionPanel.append(node('p', 'Match precision: '+String(selection.precision||'unconfirmed').replace(/_/g,' ')+'. '+(selection.source||'Saved case reference')+'. An address point does not establish a surveyed lot boundary or confirm a unit.', 'cm-coordinate-note'));
        if (!selection.exact && selection.methods && selection.methods.length) selectionPanel.append(node('p', "Service matching notes: " + selection.methods.join(' / '), 'cm-coordinate-note'));
      }
      if(selection.sourceUrl)selectionPanel.append(externalLink({title:'Address data source',url:selection.sourceUrl}));
    }
    function renderLegend(){
      legendContent.replaceChildren();
      if(!categories)return;
      const list=node('ul',null,'cm-legend-list');
      categories.categories.forEach(category=>{const li=node('li');const swatch=node('span',null,'cm-legend-swatch');swatch.style.backgroundColor=category.color;swatch.setAttribute('aria-hidden','true');li.append(swatch,node('span',category.label+' · '+category.count));list.append(li);});
      legendContent.append(list,node('p',categories.legend_note||'Council types describe population and urban character. They do not indicate zoning, risk or development eligibility.','cm-legend-note'),node('p',categories.edition_note||'Published classification edition; not a current planning-control assessment.','cm-legend-note'));
      const source=categories.sources&&categories.sources[0];if(source)legendContent.append(externalLink({title:'Official OLG classification source',url:source.url}));
    }
    function renderDocuments(feature,fromMapCentre=false){
      const id=feature?.properties.id||null;
      if(currentDocumentId===id&&documentPanel.dataset.rendered==='true'&&documentPanel.dataset.context===(fromMapCentre?'centre':'selected'))return;
      currentDocumentId=id;documentPanel.dataset.councilId=id||'';documentPanel.dataset.rendered='true';documentPanel.dataset.context=fromMapCentre?'centre':'selected';
      documentPanel.replaceChildren(node('p','Council planning library','cm-kicker'));
      if(!feature||!D){documentPanel.append(node('h3','Explore the local controls'),node('p',!D?'The document directory could not load. Refresh to try again.':'Zoom into NSW and click a coloured council, or choose one above, to see its planning documents. Other states currently have location search only.','cm-document-hint'));return;}
      const entry=D.getCouncil(feature.properties);
      documentPanel.append(node('h3',entry.name||displayCouncil(feature)),node('span',fromMapCentre?'At the map centre · not your selected project':'Selected NSW council','cm-document-context'),node('p',entry.summary,'cm-document-hint'));
      if(fromMapCentre)documentPanel.append(button('Select this council',()=>selectCouncil(feature),'cm-text-button'));
      const category=categoryById[categories?.councils?.[id]?.category_id];
      if(category)documentPanel.append(node('p','OLG council type: '+category.label,'cm-document-type'));
      const makeList=documents=>{const list=node('ul',null,'cm-document-list');documents.forEach(source=>{const li=node('li');li.append(node('span',source.kind||'Reference','cm-document-kind'),externalLink(source),node('small',source.status==='find_current_controls'?'Council website · DCP still to locate':source.status==='official_reference'?'Official reference · text not verified':'Official page checked · '+(source.checkedOn||entry.checkedOn||'')),node('p',source.note||'Applicability needs checking'));list.append(li);});return list;};
      documentPanel.append(makeList((entry.documents||[]).filter(source=>source.kind==='LEP'||source.kind==='DCP')));
      const statewide=(entry.documents||[]).filter(source=>source.kind!=='LEP'&&source.kind!=='DCP');
      if(statewide.length){const more=node('details',null,'cm-statewide-documents');more.append(node('summary','Statewide planning & building references · '+statewide.length),makeList(statewide));documentPanel.append(more);}
      documentPanel.append(node('p','Confirm the instrument, version, zoning and overlays for the actual address. DCPs support assessment and have a different legal role from LEPs. These references do not establish development permission.','cm-document-caution'));
      if(entry.missing?.length){const detail=node('details');detail.append(node('summary','Still to verify'));const missing=node('ul');entry.missing.forEach(item=>missing.append(node('li',item)));detail.append(missing);documentPanel.append(detail);}
      documentPanel.dataset.coverageStatus=entry.coverageStatus;
    }
    function categoryFor(feature){return categoryById[categories?.councils?.[feature.properties.id]?.category_id];}
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
      updateJourney();
      scope.dispatchEvent(new CustomEvent('firstprinciple:report-ready',{detail:{location:result.location,question:result.question,report:result}}));
    }
    function styleFor(feature, selected) {
      const category=categoryFor(feature),close=map&&map.getZoom()>=15;
      return { color: selected ? '#263c35' : category?.color||'#88949a', weight: selected ? 2.5 : 1, fillColor: category?.color||'#88949a', fillOpacity:close?0.025:selected?0.55:0.32, dashArray: feature.properties.is_unincorporated ? '3 3' : undefined };
    }
    function createMap(geo) {
      map = L.map(mapCanvas, { scrollWheelZoom: false, minZoom: 3, maxZoom: 19, zoomSnap: 0.25, zoomDelta: 0.5, zoomControl: true, preferCanvas: false,maxBounds:[[-57,100],[-3,170]],maxBoundsViscosity:0.8 });
      const tiles = L.tileLayer(BASEMAP, { maxZoom: 19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>' });
      let tileFailed = false;
      tiles.on('tileerror', () => { if (!tileFailed) { tileFailed = true; mapStatus.textContent = "Some base map tiles could not load. Council boundaries and the list remain available."; } });
      tiles.addTo(map);
      streetLayer = tiles;
      aerialLayer = L.tileLayer(AERIAL,{maxZoom:19,bounds:[[-37.86,140.97],[-27.70,159.50]],attribution:'© NSW Spatial Services · NSW aerial imagery; capture dates vary'});
      aerialLayer.on('tileerror',()=>{mapStatus.textContent='Some aerial tiles are unavailable. Switch to Street map; the address point remains visible.';});
      const baseLayers=L.control.layers({'Street map · Australia':streetLayer}, {'NSW aerial imagery':aerialLayer}, {collapsed:false,position:'topright'}).addTo(map);
      boundaryLayer=L.geoJSON(geo, { style: feature => styleFor(feature, false), onEachFeature: (feature, layer) => {
        layers[feature.properties.id] = layer;
        const tooltip = node('span', displayCouncil(feature)+(categoryFor(feature)?' · '+categoryFor(feature).label:''));
        layer.bindTooltip(tooltip, { sticky: true });
        layer.on('click', () => selectCouncil(feature));
        layer.on('mouseover', () => layer.setStyle({ fillOpacity: map.getZoom()>=15?0.04:0.52 }));
        layer.on('mouseout', () => layer.setStyle(styleFor(feature, selection && selection.council_ids.includes(feature.properties.id))));
      } }).addTo(map);
      baseLayers.addOverlay(boundaryLayer,'NSW council boundaries');
      councilLabels=L.layerGroup().addTo(map);
      map.on('zoomend moveend',updateMapContext);
      map.on('overlayadd overlayremove',event=>{if(event.layer===boundaryLayer)updateMapContext();});
      resetView();
      const councilCount = features.filter(feature => !feature.properties.is_unincorporated).length;
      mapStatus.textContent = councilCount + " councils · " + (features.length - councilCount) + " unincorporated / special areas · Boundaries simplified for display";
      areaText.textContent = 'Australia · ' + councilCount + ' NSW councils';
      if (scope.ResizeObserver) new ResizeObserver(() => { if (map) map.invalidateSize({ pan: false }); }).observe(mapCanvas);
    }
    function showCaseImagery() {
      if (map && aerialLayer) aerialLayer.addTo(map);
    }
    function zoomBox(box, maxZoom) {
      if (map && box) map.fitBounds([[box[1], box[0]], [box[3], box[2]]], { padding: [24, 24], maxZoom, animate: !reducedMotion() });
    }
    function resetView() {
      if (!map || !features.length) return;
      if(aerialLayer&&map.hasLayer(aerialLayer))map.removeLayer(aerialLayer);
      if(streetLayer&&!map.hasLayer(streetLayer))streetLayer.addTo(map);
      zoomBox([112,-44.5,155,-10],5);
    }
    function viewNSW(){
      if(!map||!features.length)return;
      const mainland = features.filter(feature => feature.properties.center[0] < 155);
      zoomBox(extendBox(mainland.map(feature => feature.properties.bbox)), 7);
    }
    function pointInRing(point,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
    function pointInFeature(point,feature){const geometry=feature.geometry;const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;return polygons.some(rings=>pointInRing(point,rings[0])&&!rings.slice(1).some(ring=>pointInRing(point,ring)));}
    function updateMapContext(){
      if(!map)return;
      Object.entries(layers).forEach(([id,layer])=>layer.setStyle(styleFor(byId[id],Boolean(selection?.council_ids.includes(id)))));
      if(councilLabels)councilLabels.clearLayers();
      if(map.getZoom()>=8&&map.hasLayer(boundaryLayer)){
        features.forEach(feature=>{const p=feature.properties,b=p.bbox;if(!map.getBounds().intersects([[b[1],b[0]],[b[3],b[2]]]))return;const a=map.latLngToContainerPoint([b[1],b[0]]),z=map.latLngToContainerPoint([b[3],b[2]]);if(Math.abs(z.x-a.x)<95||Math.abs(z.y-a.y)<38||!map.getBounds().contains([p.center[1],p.center[0]]))return;L.tooltip({permanent:true,direction:'center',className:'cm-council-label',interactive:false}).setLatLng([p.center[1],p.center[0]]).setContent(node('span',p.name)).addTo(councilLabels);});
      }
      if(!selection&&map.getZoom()>=9){const centre=map.getCenter();const feature=features.find(f=>pointInFeature([centre.lng,centre.lat],f));renderDocuments(feature||null,Boolean(feature));}
    }
    function drawPoint(center, address) {
      if (!map || !Array.isArray(center) || !center.every(Number.isFinite)) return;
      if (marker) map.removeLayer(marker);
      marker = L.circleMarker([center[1], center[0]], { radius: address ? 8 : 6, color: '#fffefa', weight: 2, fillColor: '#a95f3d', fillOpacity: 1 }).addTo(map);
      marker.bindTooltip(node('span', address ? "Selected street address point · check number and unit" : "Area or street reference point · not a property address"));
    }
    const api = { loadCase, getReport(){return lastReport;}, focusReport(){if(!guidancePanel.hidden)guidancePanel.scrollIntoView({behavior:'instant',block:'start'});}, refresh() { if (map) map.invalidateSize({ pan: false }); }, getState() { return { ready, selection: selection ? { kind: selection.kind, name:selection.name, center:selection.center,state:selection.state,precision:selection.precision,coverage:selection.coverage,source:selection.source, origin:selection.origin, council_ids: [...selection.council_ids], locationConfidence: G.describeLocation(selection).level } : null, reportCaseId:lastReport?.caseId || null, planningConfidence: 'low',documentCouncilId:currentDocumentId,categoryCount:categories?.categories?.length||0,zoom:map?.getZoom(),bounds:map?.getBounds().toBBoxString() }; } };
    root._lynnCouncilMap = api;
    return api;
  }
  scope.LynnCouncilMap = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
