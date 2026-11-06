/* Australia location explorer; NSW council content only. Questions stay local. */
(function (scope) {
  'use strict';
  const G = scope.LynnCouncilGuidance;
  const R = scope.FirstPrincipleReport;
  const A = scope.FirstPrincipleAddressSearch;
  const D = scope.FirstPrincipleCouncilDocuments;
  const S = scope.FirstPrincipleNSWSpatial;
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
    const unavailableApi = {
      refresh() {}, loadCase() {}, focusReport() {}, searchAddress() {}, setIntent() {},
      browseCouncil() { return false; }, getReport() { return null; },
      getState() { return { ready: false, selection: null, reportCaseId: null, planningConfidence: 'low', documentCouncilId: null, browsingCouncilId: null, panel: 'planning', library: null, categoryCount: 0, zoom: null, bounds: null }; }
    };
    if (!root) return unavailableApi;
    if (root._lynnCouncilMap) { root._lynnCouncilMap.refresh(); return root._lynnCouncilMap; }
    if (!G || !scope.L) {
      root.append(node('p', "The map component could not load. Please refresh the page.", 'cm-error'));
      root._lynnCouncilMap = unavailableApi;
      return unavailableApi;
    }
    const L = scope.L;
    let features = [], places = [], byId = {}, layers = {}, selection = null, marker = null, streetLayer = null, aerialLayer = null;
    let requestNumber = 0, liveRequest = null, map = null, postcodeGroups = [], ready = false, pendingCase = false, lastReport = null;
    let searchDebounce=null,searchState='idle',suggestionItems=[],activeSuggestion=-1,searchSubmitLabel='Find location';
    let categories = null, categoryById = {}, councilLabels = null, boundaryLayer = null, browsingCouncil = null;
    const spatialClient=S?.createClient();
    let spatialPanel=null,spatialContainer=null,spatialState=S?.initial()||null,spatialRequest=null,spatialEpoch=0;
    let propertyLayer=null,lotLayer=null,zoningLayer=null,spatialGeometryKeys={};
    let assessmentView=null,assessmentModel=null,assessmentSelection={mode:'property',projectId:'other',sampleId:'A',optionId:''};
    let propertyProjectId='other',exampleProjectId='granny',projectChosen=false,overviewVisited=false,assessmentVisited=false;
    let flowView=null,flowPage='discovery',confirmedKey=null,chosenCandidateId=null,confirmedPropertyId=null,restoring=true,pendingCouncilFit=false,lastMapView=null;
    const previewMedia=scope.matchMedia?.('(max-width:1000px)');
    let previewExpanded=false,previewContext='',mapGesturesEnabled=false;
    let locationExpanded=true,locationPhase='initial',locationKey=null,locationFocusPending=false;
    const STORAGE_KEY='firstprinciple.property-flow.v1';
    const layout = node('div', null, 'cm-explorer');
    const journeySteps = node('ol', null, 'cm-journey-steps');journeySteps.setAttribute('aria-label','Property planning progress');
    ['Find a property', 'Planning overview', 'Choose a project', 'Planning assessment'].forEach((label, index) => {
      const li=node('li');li.dataset.journeyStep=String(index+1);
      const action=button(null,()=>{
        navigatePage(['discovery','overview','development','assessment'][index]);
      },'cm-journey-action');
      action.append(node('span',String(index+1),'cm-journey-number'),node('strong',label));li.append(action);journeySteps.append(li);
    });
    const sample = node('div', null, 'cm-sample');
    sample.append(node('div', null, 'cm-sample-copy'), button('Try CASE-0001', loadCase, 'cm-button'));
    sample.firstChild.append(node('strong', 'Follow one project from start to finish'), node('p', R ? R.CASE.address + ' · Reconstructed case enquiry' : 'Hawkesbury secondary dwelling demonstration'));
    const searchForm = node('form', null, 'cm-search-form');
    const searchLabel = node('label', "Property address");
    searchLabel.htmlFor = 'cm-query';
    const searchRow = node('div', null, 'cm-search-row');
    const search = node('input');
    search.type = 'search'; search.id = 'cm-query'; search.autocomplete = 'off';
    search.enterKeyHint='search';search.autocapitalize='words';search.spellcheck=false;
    search.placeholder = "Enter a property address...";
    search.maxLength = 180; search.setAttribute('aria-controls', 'cm-suggestions');
    search.setAttribute('role','combobox');search.setAttribute('aria-autocomplete','list');search.setAttribute('aria-haspopup','listbox');
    search.setAttribute('aria-expanded', 'false');search.setAttribute('aria-busy','false');
    const searchSubmit = node('button', "Find location", 'cm-button cm-primary');
    searchSubmit.type = 'submit';
    const searchClear=button('Clear',()=>{
      pendingCase=false;cancelRequest();search.value='';searchRetry.hidden=true;closeSuggestions();
      beginLocationSearch();
      previousSelectionNote.hidden=!selection;
      previousSelectionNote.textContent=selection?'Selected property: '+selection.name+'. Clearing the search does not change it.':'';
      setSearchState('idle');searchStatus.textContent='Enter a street address, suburb or council.';updateSearchControls();saveContext();search.focus();
    },'cm-search-clear');searchClear.setAttribute('aria-label','Clear address search');searchClear.hidden=true;
    searchRow.append(search, searchClear, searchSubmit);
    const searchHelp = node('p', "Address lookup: NSW Spatial Services / Photon–OpenStreetMap. Project questions stay in this browser.", 'cm-privacy');
    searchHelp.id = 'cm-search-help'; search.setAttribute('aria-describedby', searchHelp.id);
    const suggestions = node('ul', null, 'cm-suggestions');
    suggestions.id = 'cm-suggestions';suggestions.setAttribute('role','listbox'); suggestions.setAttribute('aria-label', "Location suggestions. Please choose one."); suggestions.hidden = true;
    const searchStatus = node('p', "Loading NSW localities and council boundaries…", 'cm-search-status');
    searchStatus.setAttribute('role', 'status');
    const previousSelectionNote=node('p',null,'cm-privacy');previousSelectionNote.hidden=true;
    const searchRetry=button('Retry search',()=>performSearch(true),'cm-button cm-search-retry');searchRetry.hidden=true;
    const searchCancel=button('Cancel address edit',cancelSearchEdit,'cm-text-button cm-search-cancel');searchCancel.id='cm-search-cancel';searchCancel.hidden=true;
    searchForm.append(searchLabel, searchRow, searchHelp, suggestions, searchStatus,searchRetry,previousSelectionNote,searchCancel);
    const addressDetails = node('details', null, 'cm-address-details');
    addressDetails.append(node('summary', 'Enter address details · street number, unit and postcode'));
    const addressForm = node('form', null, 'cm-address-form');
    const addressFields = {};
    [['unit','Unit / suite (optional)','e.g. 3'],['number','Street number','e.g. 58'],['street','Street name and type','e.g. Mitchell Drive'],['suburb','Suburb / locality','e.g. Glossodia'],['postcode','Postcode','e.g. 2756']].forEach(([key,label,placeholder]) => {
      const wrapper = node('div',null,'cm-address-field'); const fieldLabel=node('label',label); fieldLabel.htmlFor='cm-address-'+key;
      const input=node('input'); input.id=fieldLabel.htmlFor; input.placeholder=placeholder; input.maxLength=key==='street'?100:50; input.autocomplete='off';input.enterKeyHint='next';input.spellcheck=false;
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
      pendingCase=false;cancelRequest();
      search.value=(value.unit?'Unit '+value.unit+', ':'')+value.number+' '+value.street+', '+value.suburb+' '+stateSelect.value+(value.postcode?' '+value.postcode:'');
      performSearch(true);search.scrollIntoView({block:'nearest',behavior:'instant'});
    });
    addressDetails.append(addressForm);
    const coverageBanner=node('div',null,'cm-coverage-banner');
    coverageBanner.append(node('strong','Australia-wide search · NSW planning data'),node('span','Council selection explores an area; confirm a property to continue.'));
    const workspace = node('div', null, 'cm-workspace');
    const mapColumn = node('div', null, 'cm-map-column');
    const mapToolbar = node('div', null, 'cm-map-toolbar');
    const areaText = node('span', 'Australia · NSW council detail');
    const viewButtons=node('div',null,'cm-view-buttons');
    const allButton = button("Australia", resetView, 'cm-text-button');allButton.id='cm-view-australia';
    const nswButton = button('Explore NSW',viewNSW,'cm-text-button');nswButton.id='cm-view-nsw';
    viewButtons.append(allButton,nswButton);mapToolbar.append(areaText, viewButtons);
    const propertyViews=node('div',null,'cm-property-views');propertyViews.setAttribute('aria-label','Property map views');
    const widerButton=button('Wider area',()=>focusProperty(12));
    const streetButton=button('Street detail',()=>focusProperty(18));
    const recenterButton=button('Recenter property',()=>focusProperty());
    propertyViews.append(widerButton,streetButton,recenterButton);
    const mapCanvas = node('div', null, 'cm-map');
    mapCanvas.id = 'cm-leaflet-map'; mapCanvas.setAttribute('aria-label', "Australia map with NSW council boundaries. Choose a council to explore its area, or search for a property.");
    mapCanvas.setAttribute('role','region');mapCanvas.setAttribute('aria-describedby','cm-map-interaction-hint');
    const mapGestureBar=node('div',null,'cm-map-gesture-bar');
    const mapGestureToggle=button('Enable map gestures',()=>{mapGesturesEnabled=!mapGesturesEnabled;syncMapGestures();},'cm-map-gesture-toggle');
    mapGestureToggle.dataset.mapGestureToggle='true';mapGestureToggle.setAttribute('aria-controls',mapCanvas.id);
    mapGestureBar.append(node('span','Explore the map','cm-map-gesture-label'),mapGestureToggle);
    const mapFrame=node('div',null,'cm-map-frame');mapFrame.append(mapGestureBar,mapCanvas);
    const mapStatus = node('p', "Loading boundaries…", 'cm-map-status'); mapStatus.setAttribute('role', 'status');
    const mapLegend=node('details',null,'cm-map-legend');mapLegend.append(node('summary','Council colour key'));
    const legendContent=node('div',null,'cm-legend-content');mapLegend.append(legendContent);
    const councilRow = node('div', null, 'cm-council-row');
    const councilLabel = node('label', "Or choose a council"); councilLabel.htmlFor = 'cm-council-select';
    const councilSelect = node('select'); councilSelect.id = 'cm-council-select'; councilSelect.disabled = true;
    const emptyOption = node('option', "Select a council / area"); emptyOption.value = ''; councilSelect.append(emptyOption);
    if(D){D.COUNCIL_IDS.map(id=>({id,entry:D.getCouncil(id)})).sort((a,b)=>a.entry.name.localeCompare(b.entry.name)).forEach(({id,entry})=>{byId[id]={properties:{id,name:entry.name,council_name:entry.name,state:'NSW'}};const option=node('option',entry.name);option.value=id;councilSelect.append(option);});councilSelect.disabled=false;}
    councilSelect.addEventListener('change', () => {
      if (byId[councilSelect.value]) selectCouncil(byId[councilSelect.value]);
      else { browsingCouncil=null;updateMapContext();syncFlow();saveContext(); }
    });
    councilRow.append(councilLabel, councilSelect);
    const documentPanel=node('section',null,'cm-property-controls');documentPanel.setAttribute('aria-label','Property planning attributes');
    const sourceLine = node('div', null, 'cm-map-sources');
    sourceLine.append(node('span', "NSW boundaries: © State of NSW (Spatial Services) · "), externalLink({ title: "Data source", url: 'https://data.nsw.gov.au/data/en/dataset/nsw-administrative-boundaries' }), node('span', ' · '), externalLink({ title: 'CC BY 3.0 AU', url: 'https://creativecommons.org/licenses/by/3.0/au/' }), node('p'),externalLink({title:'Street map & national search: © OpenStreetMap contributors',url:'https://www.openstreetmap.org/copyright'}),node('span',' · '),externalLink({title:'Photon',url:'https://photon.komoot.io/'}),node('p','NSW aerial capture dates vary. Address points and imagery are not surveyed lot boundaries or planning-risk layers.'));
    const wheelHint=node('p',scope.matchMedia?.('(pointer: coarse)').matches?'Pan inside the map. Pinch or use + and − to zoom; scroll outside the map.':'Hold Ctrl and scroll to zoom. Scroll normally to move the page.','cm-wheel-hint');
    wheelHint.id='cm-map-interaction-hint';
    const sourceDisclosure=node('details',null,'cm-source-disclosure');sourceDisclosure.append(node('summary','Map sources and limitations'),sourceLine);
    // The map is the primary workspace; search and confirmation use a separate rail.
    mapToolbar.append(propertyViews);
    sourceDisclosure.append(coverageBanner, searchHelp);
    mapColumn.append(mapToolbar, mapFrame,wheelHint,mapStatus,mapLegend,sourceDisclosure);
    const side = node('aside', null, 'cm-side'); side.setAttribute('aria-label', "Location summary and property selection");
    const previewToggle=button(null,()=>setPreviewExpanded(!previewExpanded),'cm-preview-toggle');previewToggle.dataset.previewToggle='true';
    previewToggle.setAttribute('aria-controls','cm-preview-body');
    const previewHandle=node('span',null,'cm-preview-handle');previewHandle.setAttribute('aria-hidden','true');
    const previewTitle=node('span','Find a property','cm-preview-title');
    const previewStatus=node('span','Choose an address or council','cm-preview-status');
    const previewAction=node('span','Open preview','cm-preview-action');
    previewToggle.append(previewHandle,previewTitle,previewStatus,previewAction);
    const previewBody=node('div',null,'cm-preview-body');previewBody.id='cm-preview-body';
    side.append(previewToggle,previewBody);
    side.addEventListener('keydown',event=>{if(event.key==='Escape'&&previewMedia?.matches&&previewExpanded){event.preventDefault();setPreviewExpanded(false,true);}});
    const questionForm = node('form', null, 'cm-question-form');
    const questionLabel = node('label', "What would you like to do here?"); questionLabel.htmlFor = 'cm-question';
    const question = node('textarea'); question.id = 'cm-question'; question.rows = 3; question.maxLength = 600;
    let questionOrigin='suggested';
    question.placeholder = "For example: What should I prepare before building a granny flat?";
    const quickTopics = node('div', null, 'cm-topics'); quickTopics.setAttribute('aria-label', "Example questions");
    const questionContext=node('p',null,'cm-question-context');questionContext.id='cm-question-context';questionContext.setAttribute('role','status');
    question.setAttribute('aria-describedby',questionContext.id);
    const caseQuestionNote = node('p', null, 'cm-case-question-note'); caseQuestionNote.hidden = true;
    const questionSubmit = node('button', 'Get planning preview', 'cm-button cm-primary cm-full'); questionSubmit.type = 'submit';
    const questionHint = node('p', 'A short, evidence-based preview with confidence and next steps. Professional review is still required.', 'cm-question-hint');
    questionForm.append(questionLabel, questionContext, question, caseQuestionNote, quickTopics, questionSubmit, questionHint);

    workspace.append(mapColumn, side);
    const guidancePanel = node('section', null, 'cm-guidance'); guidancePanel.hidden = true; guidancePanel.setAttribute('aria-label', "Preparation guidance and sources");
    const assessmentRoot=node('div',null,'cm-assessment-root');assessmentRoot.id='cm-planning-assessment';
    const footnote = node('p', "Council selection locates an area. Confirm a property to review its available planning attributes. Display boundaries are simplified; mapped data does not determine permission.", 'cm-footnote');
    const discoveryPage=node('section',null,'cm-discovery-page');discoveryPage.dataset.flowPage='discovery';
    const flowRoot=node('div',null,'cm-property-flow-root');
    const discoveryControls=node('section',null,'cm-discovery-controls');
    discoveryControls.setAttribute('aria-label','Project location');
    const locationHeading=node('h2',null,'cm-location-heading');
    const locationToggle=button(null,()=>setLocationExpanded(!locationExpanded),'cm-location-toggle');
    locationToggle.id='cm-location-toggle';locationToggle.setAttribute('aria-controls','cm-location-fields');
    const locationTitle=node('span','Project location');
    const locationIndicator=node('img',null,'cm-location-indicator');
    locationIndicator.src='./assets/icons/check-circle-fill.svg';locationIndicator.alt='';locationIndicator.width=18;locationIndicator.height=18;
    const locationChevron=node('img',null,'cm-location-chevron');
    locationChevron.src='./assets/icons/chevron-down.svg';locationChevron.alt='';locationChevron.width=18;locationChevron.height=18;
    locationToggle.append(locationTitle,locationIndicator,locationChevron);locationHeading.append(locationToggle);
    const locationSummary=node('div',null,'cm-location-summary');locationSummary.id='cm-location-summary';
    const locationAddress=node('p',null,'cm-location-address');
    const locationCouncil=node('p',null,'cm-location-council');
    const locationStatus=node('p',null,'cm-location-status');locationStatus.setAttribute('role','status');
    const locationEdit=button('Edit',()=>{setLocationExpanded(true);search.focus({preventScroll:true});},'cm-location-edit');
    locationEdit.id='cm-location-edit';locationEdit.setAttribute('aria-label','Edit project location');
    locationSummary.append(locationAddress,locationEdit,locationCouncil,locationStatus);
    const locationFields=node('div',null,'cm-location-fields');locationFields.id='cm-location-fields';
    const searchMountPoint=document.createComment('Property address search mount point');
    locationFields.append(searchMountPoint,searchForm,councilRow,addressDetails);
    discoveryControls.append(locationHeading,locationSummary,locationFields);
    const locationCard=scope.FirstPrincipleProgressiveCards.create({root:discoveryControls,toggle:locationToggle,content:locationFields,summary:locationSummary,listen:false,onChange(card){
      locationExpanded=card.expanded;
      discoveryControls.dataset.locationExpanded=String(card.expanded);
      locationToggle.setAttribute('aria-label',(card.expanded?'Collapse':'Expand')+' project location');
    }});
    const discoveryRail=node('div',null,'cm-discovery-rail');discoveryRail.append(discoveryControls);
    discoveryPage.append(sample,discoveryRail,workspace,footnote);
    layout.append(journeySteps,discoveryPage,flowRoot);root.append(layout);
    if(scope.FirstPrinciplePropertyFlowView){
      flowView=scope.FirstPrinciplePropertyFlowView.init(flowRoot,{
        onConfirm:confirmProperty,onDiscover(){navigatePage('discovery');setLocationExpanded(true,false);requestAnimationFrame(()=>{search.focus();search.select();});},onOverview(){navigatePage('overview');},
        onDevelopment(){navigatePage('development');},onProject:chooseProject,
        onAssessment(){navigatePage('assessment');},onStartNewSearch:startNewSearch,
        onQuery(){querySpatial();},onCandidate(id){querySpatial(id);},onLayer:setSpatialVisibility
      });
      previewBody.append(flowView.slots.discoveryPreview);
      flowView.slots.overviewControls.append(documentPanel);
      const followUp=node('details',null,'cm-assessment-followup');followUp.dataset.assessmentAssistance='true';
      const followUpToggle=node('summary');followUpToggle.dataset.assistanceToggle='true';
      followUpToggle.append(node('span','Ask a follow-up question','cm-assistance-title'),node('span','Optional assistance','cm-assistance-hint'));
      const followUpBody=node('div',null,'cm-assistance-body');followUpBody.id='cm-assistance-body';
      followUpBody.append(questionForm,guidancePanel);followUp.append(followUpToggle,followUpBody);
      followUp.addEventListener('toggle',()=>{if(!followUp.open&&followUpBody.contains(document.activeElement))followUpToggle.focus({preventScroll:true});});
      flowView.slots.assessmentContent.append(assessmentRoot,followUp);
    }else{
      previewBody.append(node('p','Property navigation could not load. Refresh to retry. The map and address search remain available.','cm-error'));
    }
    placePreview();
    previewMedia?.addEventListener('change',()=>{mapGesturesEnabled=false;placePreview();syncMapGestures();requestAnimationFrame(refreshMap);});
    if(scope.FirstPrincipleAssessmentView&&scope.FirstPrincipleAssessmentModel){
      assessmentView=scope.FirstPrincipleAssessmentView.init(assessmentRoot,{
        onChange(next){
          const previous=assessmentSelection;
          if(next.mode!==previous.mode)next.projectId=next.mode==='example'?exampleProjectId:propertyProjectId;
          assessmentSelection={...next};
          if(next.mode==='property'&&next.projectId!==propertyProjectId){
            propertyProjectId=next.projectId;
            const project=scope.FirstPrincipleAssessmentModel.PROJECTS.find(p=>p.id===propertyProjectId);
            if(project){setProjectQuestion(project);clearReport('question');}
          }else if(next.mode==='example')exampleProjectId=next.projectId;
          projectChosen=true;refreshAssessment();syncFlow();saveContext();
        },
        onContinue(){
          if(assessmentSelection.mode!=='property'||!selection)return;
          if(!question.value.trim())question.value=assessmentModel.project.question;
          continueToServices();
        },
        onQueryGIS(){if(selection)querySpatial();},
        onViewProperty(){navigatePage('discovery');requestAnimationFrame(()=>{fitSpatialProperty();mapCanvas.scrollIntoView({block:'center',behavior:'instant'});});}
      });
    }else{
      assessmentRoot.dataset.moduleStatus='unavailable';
      const notice=node('section',null,'cm-error');notice.setAttribute('role','status');
      notice.append(node('h2','Detailed assessment unavailable'),node('p','This component could not load. Refresh the page to retry. Address search, available GIS information and the preliminary planning preview remain accessible.'));
      assessmentRoot.append(notice);
    }
    const spatialRoot=node('div',null,'cm-spatial-root');spatialContainer=spatialRoot;documentPanel.append(spatialRoot);
    if(S&&scope.FirstPrincipleSpatialPanel)spatialPanel=scope.FirstPrincipleSpatialPanel.init(spatialRoot,{onQuery(){querySpatial();},onCandidate(id){querySpatial(id);},onFit(){navigatePage('discovery');requestAnimationFrame(fitSpatialProperty);},onLayer:setSpatialVisibility});
    else spatialRoot.append(node('p','Property planning data is unavailable. Refresh to retry.','cm-error'));
    renderSelection();updateJourney();refreshAssessment();
    searchForm.addEventListener('submit', event => { event.preventDefault(); performSearch(true); });
    search.addEventListener('input', event => { pendingCase=false;cancelRequest();closeSuggestions();searchRetry.hidden=true;if(event.isComposing)setSearchState('typing');else performSearch(false);updateSearchControls();saveContext(); });
    search.addEventListener('compositionstart',()=>{cancelRequest();closeSuggestions();});
    search.addEventListener('compositionend',()=>performSearch(false));
    question.addEventListener('input', () => { questionOrigin='user';updateQuestionContext();clearReport('question');saveContext(); if (!caseQuestionNote.hidden) caseQuestionNote.textContent = 'Edited from the reconstructed case enquiry.'; });
    search.addEventListener('keydown', event => {
      if(event.isComposing)return;
      if((event.key==='ArrowDown'||event.key==='ArrowUp')&&!suggestions.hidden&&suggestionItems.length){event.preventDefault();setActiveSuggestion(activeSuggestion<0?(event.key==='ArrowDown'?0:suggestionItems.length-1):(activeSuggestion+(event.key==='ArrowDown'?1:-1)+suggestionItems.length)%suggestionItems.length);}
      if(event.key==='Enter'&&!suggestions.hidden&&activeSuggestion>=0){event.preventDefault();chooseResult(suggestionItems[activeSuggestion]);}
      if(event.key==='Escape'){event.preventDefault();cancelRequest();closeSuggestions();setSearchState('idle');searchStatus.textContent='Suggestions closed. Continue typing or select Find location to search again.';}
      if(event.key==='Tab'){cancelRequest();closeSuggestions();setSearchState('idle');}
    });
    searchForm.addEventListener('focusout',event=>{if(!searchForm.contains(event.relatedTarget)){if(['typing','searching','suggestions'].includes(searchState)){cancelRequest();setSearchState('idle');}closeSuggestions();}});
    questionForm.addEventListener('submit', event => {
      event.preventDefault();
      if (!isConfirmed()||!projectChosen) return;
      if (!question.value.trim()) { questionHint.textContent = "Briefly describe what you want to build, alter or operate."; question.focus(); return; }
      renderGuidance();
      guidancePanel.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'nearest' });
    });
    createMap({type:'FeatureCollection',features:[]});
    ready=true;root.dataset.ready='true';setSearchState('idle');searchStatus.textContent='Enter a street address, or browse a NSW council.';
    restoreContext();syncFlow();
    const loadWarnings=[];
    function loadPart(url,onReady,label){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
      fetchJson(url,controller.signal).then(onReady).catch(()=>{
        loadWarnings.push(label);root.dataset.partialFailure=loadWarnings.join(',');
        mapStatus.textContent=label+' could not load. Address search and available references remain usable.';
        const retry=button('Retry '+label,()=>{retry.remove();loadPart(url,onReady,label);},'cm-text-button');mapStatus.append(' ',retry);
      }).finally(()=>clearTimeout(timer));
    }
    loadPart('./data/nsw-councils.geojson',geo=>{
      if(!Array.isArray(geo.features))throw new Error('Invalid boundaries');
      features=geo.features;features.forEach(feature=>{feature.properties.id=feature.properties.id||feature.id;});
      byId={...byId,...Object.fromEntries(features.map(feature=>[feature.properties.id,feature]))};
      boundaryLayer.clearLayers();layers={};boundaryLayer.addData(geo);
      councilSelect.replaceChildren(emptyOption);
      features.slice().sort((a,b)=>displayCouncil(a).localeCompare(displayCouncil(b))).forEach(feature=>{const option=node('option',displayCouncil(feature));option.value=feature.properties.id;councilSelect.append(option);});
      councilSelect.value=browsingCouncil?.properties.id||(selection?.council_ids.length===1?selection.council_ids[0]:'');
      councilSelect.disabled=false;root.dataset.boundariesReady='true';
      const count=features.filter(f=>!f.properties.is_unincorporated).length;
      mapStatus.textContent=count+' councils · '+(features.length-count)+' special areas · Display boundaries are simplified';
      areaText.textContent='Australia · '+count+' NSW councils';updateMapContext();
      if(browsingCouncil){browsingCouncil=byId[browsingCouncil.properties.id]||browsingCouncil;if(pendingCouncilFit){pendingCouncilFit=false;fitCouncil(browsingCouncil);}}
      syncFlow();
      if(pendingCase)loadCase();
    },'Council boundaries');
    loadPart('./data/places.json',gazetteer=>{
      if(!Array.isArray(gazetteer.places))throw new Error('Invalid localities');places=gazetteer.places;
      const postcodeMap=new Map();places.forEach(place=>{if(!place.postcode)return;if(!postcodeMap.has(place.postcode))postcodeMap.set(place.postcode,[]);postcodeMap.get(place.postcode).push(place);});
      postcodeGroups=[...postcodeMap].map(([postcode,members])=>({id:'postcode-'+postcode,kind:'postcode',name:postcode,members,council_ids:[...new Set(members.flatMap(p=>p.council_ids))],bbox:extendBox(members.map(p=>p.bbox))}));
      root.dataset.localitiesReady='true';
    },'Locality suggestions');
    loadPart('./data/council-map-categories.json',classification=>{
      if(!Array.isArray(classification.categories))throw new Error('Invalid classifications');
      categories=classification;categoryById=Object.fromEntries(categories.categories.map(c=>[c.id,c]));renderLegend();updateMapContext();
    },'Council type colours');

    function refreshAssessment(){
      if(!assessmentView||!isConfirmed()||!projectChosen){assessmentModel=null;return;}
      assessmentModel=scope.FirstPrincipleAssessmentModel.build({...assessmentSelection,location:selection,spatial:spatialState},scope.FirstPrinciplePrototypeExamples);
      assessmentSelection={...assessmentModel.selection};assessmentView.update(assessmentModel);
    }
    function selectionKey(value=selection){
      return value?.kind==='address'?[value.name,value.propertyId||chosenCandidateId||'',...(value.center||[])].join('|'):null;
    }
    function confirmationIssue(){
      if(spatialState?.address!==selection?.name)return '';
      if(spatialState.match?.status==='identity_conflict')return 'identity_conflict';
      return ['ambiguous','point_candidate'].includes(spatialState.match?.status)?'ambiguous':'';
    }
    function officialPropertyMatched(){
      return Boolean(selection?.state==='NSW'&&spatialState?.address===selection.name&&spatialState.property?.id&&spatialState.property.feature?.geometry&&['exact_property_id','confirmed_candidate'].includes(spatialState.match?.status));
    }
    function confirmationMode(){return selection?.kind==='address'&&selection.precision==='address_point'?(officialPropertyMatched()?'parcel':'address_only'):'';}
    function isConfirmed(){return Boolean(canConfirm()&&confirmedKey&&confirmedKey===selectionKey()&&(!spatialState?.property||!confirmedPropertyId||String(spatialState.property.id)===confirmedPropertyId));}
    function canConfirm(){
      if(!selectionKey()||selection.precision!=='address_point'||!Array.isArray(selection.center)||selection.center.length!==2||!selection.center.every(Number.isFinite))return false;
      if(!['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'].includes(selection.state)||confirmationIssue())return false;
      if(selection.state==='NSW'&&selection.propertyId&&spatialState?.property&&String(selection.propertyId)!==String(spatialState.property.id))return false;
      // Confirming the chosen address is a user workflow action. An unavailable
      // optional parcel service cannot turn it into a verified parcel or a dead end.
      return selection.state==='NSW'||selection.coverage==='outside_nsw';
    }
    function navigatePage(page,replace=false){scope.dispatchEvent(new CustomEvent('firstprinciple:property-navigation',{detail:{page,replace}}));}
    function confirmProperty(){
      if(!canConfirm())return;
      confirmedKey=selectionKey();confirmedPropertyId=officialPropertyMatched()?String(spatialState.property.id):null;assessmentSelection={...assessmentSelection,mode:'property'};locationPhase='located';setLocationExpanded(false);syncFlow();updateJourney();saveContext();
    }
    function chooseProject(id){
      const project=scope.FirstPrincipleAssessmentModel?.PROJECTS.find(item=>item.id===id);
      if(!project||!isConfirmed()||!overviewVisited)return;
      propertyProjectId=id;projectChosen=true;assessmentSelection={...assessmentSelection,mode:'property',projectId:id,optionId:''};
      setProjectQuestion(project);assessmentVisited=false;clearReport('question');refreshAssessment();syncFlow();saveContext();
    }
    function updateQuestionContext(){
      const project=scope.FirstPrincipleAssessmentModel?.PROJECTS.find(item=>item.id===propertyProjectId);
      questionContext.textContent=(question.value.trim()&&questionOrigin!=='suggested'?'Your existing question is kept. Review it for this project. ':'')+'Current project: '+(project?.label||'Not selected')+'.';
    }
    function setProjectQuestion(project){
      // Only untouched suggestions follow a changed project. Explicit or saved
      // questions are the user's draft and must not be overwritten.
      if(!question.value.trim()||questionOrigin==='suggested'){question.value=project.question;questionOrigin='suggested';caseQuestionNote.hidden=true;}
      question.placeholder=project.question;
      quickTopics.replaceChildren();
      const topic=button('Project preparation',()=>{question.value=project.question;questionOrigin='user';caseQuestionNote.hidden=true;updateQuestionContext();clearReport('question');saveContext();question.focus({preventScroll:true});},'cm-topic');
      quickTopics.append(topic);updateQuestionContext();
    }
    function startNewSearch(){
      cancelRequest();closeSuggestions();question.value='';questionOrigin='suggested';search.value='';caseQuestionNote.hidden=true;
      propertyProjectId='other';assessmentSelection={...assessmentSelection,mode:'property',projectId:'other',optionId:''};
      clearSelection();navigatePage('discovery');requestAnimationFrame(()=>search.focus());
    }
    function showPage(page){
      let next=['discovery','overview','development','assessment'].includes(page)?page:'discovery';
      if(!flowView)next='discovery';
      if(next!=='discovery'&&!isConfirmed())next='discovery';
      if(next==='development'&&!overviewVisited)next='overview';
      if(next==='assessment'&&(!overviewVisited||!projectChosen))next=overviewVisited?'development':'overview';
      if(next==='overview')overviewVisited=true;
      if(next==='assessment')assessmentVisited=true;
      flowPage=next;discoveryPage.hidden=next!=='discovery';guidancePanel.hidden=next!=='assessment'||!lastReport;
      root.dataset.propertyPage=next;syncFlow();refreshAssessment();updateJourney();
      if(next==='discovery')requestAnimationFrame(refreshMap);
      saveContext();
      return {page:next};
    }
    function syncFlow(){
      const councilName=selectedCouncilName();
      flowView?.update({page:flowPage,selection,spatial:spatialState,confirmed:isConfirmed(),canConfirm:canConfirm(),confirmationMode:confirmationMode(),confirmationIssue:confirmationIssue(),councilName,projectChosen,projectId:propertyProjectId,browsingCouncil,querying:spatialState?.status==='loading',visibleLayers:spatialState?.visibleLayers});
      root.dataset.confirmedProperty=String(isConfirmed());root.dataset.projectChosen=String(projectChosen);
      syncLocationCard(councilName);syncPreview();updateSearchControls();updateJourney();
    }
    function hasLocatedAddress(){
      return Boolean(selection?.kind==='address'&&selection.precision==='address_point'&&Array.isArray(selection.center)&&selection.center.length===2&&selection.center.every(Number.isFinite));
    }
    function selectedCouncilName(){
      return (spatialState?.address===selection?.name?spatialState?.layers.council?.features?.map(feature=>feature.properties.COUNCILNAME||feature.properties.LGANAME).filter(Boolean).join(' · '):'')||selection?.council_ids.map(id=>byId[id]).filter(Boolean).map(displayCouncil).join(' · ')||'';
    }
    function syncLocationCard(councilName=selectedCouncilName()){
      const located=hasLocatedAddress(),key=located?selectionKey():null;
      // Collapse once for a newly selected address, not on every parcel/layer update.
      // Reopening this form never clears selection or a user's confirmation.
      if(key!==locationKey){locationKey=key;locationPhase=located?'located':'initial';}
      const busy=['searching','locating'].includes(locationPhase);
      // The completion target must be focusable before its old form is hidden.
      locationToggle.disabled=!located||busy;
      locationCard.update(locationCardState());
      locationExpanded=locationCard.getState().expanded;
      if(!locationExpanded&&locationFocusPending){locationCard.setExpanded(false,{focusPending:true,animate:false});locationFocusPending=false;}
      locationToggle.disabled=!located||busy;
      locationToggle.setAttribute('aria-expanded',String(locationExpanded));
      locationToggle.setAttribute('aria-label',(locationExpanded?'Collapse':'Expand')+' project location');
      locationIndicator.hidden=!located||locationPhase!=='located';
      locationChevron.hidden=!located;
      locationSummary.hidden=locationExpanded||!located;
      locationAddress.textContent=located?selection.name:'';
      locationCouncil.textContent=councilName||'Council not verified';
      locationStatus.textContent=located?'Location found':'';
      discoveryControls.dataset.locationState=isConfirmed()?'confirmed':locationPhase;
      discoveryControls.dataset.locationExpanded=String(locationExpanded);
      discoveryControls.setAttribute('aria-busy',String(busy));
    }
    function locationCardState(){
      const complete=hasLocatedAddress()&&locationPhase==='located';
      return {key:hasLocatedAddress()?selectionKey():null,complete,status:complete?'completed':['searching','locating'].includes(locationPhase)?'loading':['error','no_match'].includes(locationPhase)?'error':locationPhase==='initial'?'idle':'active'};
    }
    function setLocationExpanded(expanded,animate=true){
      locationToggle.disabled=!hasLocatedAddress()||['searching','locating'].includes(locationPhase);
      locationCard.update(locationCardState());
      locationCard.setExpanded(expanded,{animate,focusPending:locationFocusPending});
      locationExpanded=locationCard.getState().expanded;
      locationToggle.disabled=!hasLocatedAddress()||['searching','locating'].includes(locationPhase);
      if(!locationExpanded)locationFocusPending=false;
      locationToggle.setAttribute('aria-label',(locationExpanded?'Collapse':'Expand')+' project location');
      discoveryControls.dataset.locationExpanded=String(locationExpanded);
      saveContext();
    }
    function beginLocationSearch(phase='editing'){
      locationPhase=phase;setLocationExpanded(true);syncLocationCard();
    }
    function updateSearchControls(){searchClear.hidden=!search.value;searchCancel.hidden=!selection||G.normalize(search.value)===G.normalize(selection.name);}
    function setSearchState(value){searchState=value;root.dataset.searchState=value;searchForm.dataset.searchState=value;search.setAttribute('aria-busy',String(value==='searching'));updateSearchControls();}
    function cancelSearchEdit(){
      if(!selection)return;
      cancelRequest();closeSuggestions();search.value=selection.name;previousSelectionNote.hidden=true;searchRetry.hidden=true;
      locationPhase=hasLocatedAddress()?'located':'initial';syncLocationCard();
      if(hasLocatedAddress()){setLocationExpanded(false);locationToggle.focus({preventScroll:true});}
      else search.focus({preventScroll:true});
      setSearchState(officialPropertyMatched()?'property_matched':'location_selected');
      searchStatus.textContent='Returned to the selected location. Your project has not changed.';saveContext();
    }
    function setPreviewExpanded(expanded,focusToggle=false){
      previewExpanded=Boolean(expanded)||isConfirmed();
      const sheet=Boolean(previewMedia?.matches);
      if(sheet&&!previewExpanded&&previewBody.contains(document.activeElement))focusToggle=true;
      side.dataset.previewExpanded=String(previewExpanded);
      previewToggle.setAttribute('aria-expanded',String(sheet?previewExpanded:true));
      previewAction.textContent=previewExpanded?'Close preview':'Open preview';
      previewBody.hidden=sheet&&!previewExpanded;
      if(focusToggle)previewToggle.focus({preventScroll:true});
    }
    function placePreview(){
      const sheet=Boolean(previewMedia?.matches);
      side.dataset.previewMode=sheet?'sheet':'sidebar';previewToggle.hidden=!sheet||isConfirmed();
      if(sheet)mapFrame.append(side);else discoveryRail.append(side);
      setPreviewExpanded(previewExpanded);
      syncMapGestures();
    }
    function syncPreview(){
      const key=selection?[selection.kind,selection.name].join(':'):browsingCouncil?.properties.id||'';
      if(key!==previewContext){previewContext=key;previewExpanded=Boolean(key);}
      previewTitle.textContent=selection?.name||(browsingCouncil?displayCouncil(browsingCouncil):'Find a property');
      previewStatus.textContent=selection?.kind==='address'?(isConfirmed()?'Address confirmed · continue below':confirmationIssue()?'Property match needs checking':spatialState?.status==='loading'?'Address located · parcel check in progress':canConfirm()?'Ready to confirm address':'Property match needs checking'):key?'Area selected · choose a property':'Choose an address or council';
      // Once confirmed, the task's own Review control is the single disclosure.
      previewToggle.hidden=!previewMedia?.matches||isConfirmed();
      setPreviewExpanded(previewExpanded);
    }
    function revealPreview(){
      setPreviewExpanded(true);
      if(previewMedia?.matches)previewToggle.focus({preventScroll:true});
      else {previewBody.tabIndex=-1;previewBody.focus({preventScroll:true});}
    }
    function syncMapGestures(){
      const small=Boolean(previewMedia?.matches),enabled=!small||mapGesturesEnabled;
      mapGestureBar.hidden=!small;
      mapGestureToggle.textContent=enabled?'Scroll page':'Enable map gestures';
      mapGestureToggle.setAttribute('aria-pressed',String(small&&enabled));
      mapCanvas.dataset.mapGestureMode=enabled?'map':'page';
      ['dragging','touchZoom','doubleClickZoom','boxZoom'].forEach(name=>map?.[name]?.[enabled?'enable':'disable']());
      wheelHint.textContent=small?(enabled?'Pan or pinch to zoom. Select Scroll page to resume page scrolling.':'Page scrolling is on. Use + and −, or enable map gestures to pan and pinch.'):'Hold Ctrl and scroll to zoom. Scroll normally to move the page.';
    }
    function exportProjectContext(){
      const allowed=['kind','name','center','state','precision','coverage','source','sourceUrl','origin','provider','propertyId','sourceCenter','sourceWkid','mapCoordinateStatus','mapCRS','unitNumber','exact','council_ids','methods'];
      const location=selection?Object.fromEntries(allowed.filter(key=>selection[key]!==undefined).map(key=>[key,selection[key]])):null;
      return JSON.parse(JSON.stringify({version:1,selection:location,locationExpanded,chosenCandidateId,confirmedKey,confirmedPropertyId,overviewVisited,assessmentVisited,projectId:propertyProjectId,projectChosen,question:question.value,search:search.value,browsingCouncilId:browsingCouncil?.properties.id||null,map:lastMapView||null,visibleLayers:spatialState?.visibleLayers}));
    }
    function saveContext(){
      if(restoring)return;
      const context=exportProjectContext();
      try{scope.sessionStorage.setItem(STORAGE_KEY,JSON.stringify(context));}catch(_){/* Current workflow remains available in memory. */}
      scope.dispatchEvent(new CustomEvent('firstprinciple:workflow-context'));
    }
    function restoreContext(projectContext){
      let saved;try{saved=projectContext||JSON.parse(scope.sessionStorage.getItem(STORAGE_KEY)||'null');}catch(_){restoring=false;return;}
      if(saved?.version!==1){restoring=false;return;}
      const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=100&&p[0]<=170&&p[1]>=-57&&p[1]<=-3;
      restoring=true;
      search.value=typeof saved.search==='string'?saved.search.slice(0,180):'';
      const value=saved.selection;
      if(value&&value.kind==='address'&&typeof value.name==='string'&&value.name.length<=300&&validPoint(value.center)&&['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'].includes(value.state)&&value.precision==='address_point'){
        const restored={kind:'address',name:value.name,center:value.center,state:value.state,precision:'address_point',coverage:value.state==='NSW'?'nsw':'outside_nsw',source:String(value.source||'Saved address selection').slice(0,180),council_ids:Array.isArray(value.council_ids)?value.council_ids.filter(id=>D?.COUNCIL_IDS.includes(id)):[],exact:false};
        if(value.provider==='nsw_spatial'&&/^\d+$/.test(String(value.propertyId))){restored.provider='nsw_spatial';restored.propertyId=String(value.propertyId);}
        if(validPoint(value.sourceCenter)&&[4283,4326].includes(value.sourceWkid)){restored.sourceCenter=value.sourceCenter;restored.sourceWkid=value.sourceWkid;}
        if(['wgs84','server_projected'].includes(value.mapCoordinateStatus)){restored.mapCoordinateStatus=value.mapCoordinateStatus;restored.mapCRS='EPSG:4326';}
        if(value.unitNumber)restored.unitNumber=String(value.unitNumber).slice(0,40);
        try{const url=new URL(value.sourceUrl);if(url.protocol==='https:')restored.sourceUrl=url.href;}catch(_){}
        setSelection(restored);drawPoint(restored.center,true);
        if(/^\d+$/.test(String(saved.chosenCandidateId))&&Number(saved.chosenCandidateId)>0)chosenCandidateId=String(saved.chosenCandidateId);
        if(saved.confirmedKey===selectionKey())confirmedKey=saved.confirmedKey;
        if(/^\d+$/.test(String(saved.confirmedPropertyId))&&Number(saved.confirmedPropertyId)>0)confirmedPropertyId=String(saved.confirmedPropertyId);
        overviewVisited=Boolean(confirmedKey&&(saved.overviewVisited===true||(saved.overviewVisited===undefined&&saved.projectChosen===true)));
        assessmentVisited=Boolean(overviewVisited&&saved.assessmentVisited===true);
        if(scope.FirstPrincipleAssessmentModel?.PROJECTS.some(p=>p.id===saved.projectId)){propertyProjectId=saved.projectId;projectChosen=saved.projectChosen===true;assessmentSelection={...assessmentSelection,projectId:propertyProjectId};}
        question.value=String(saved.question||'').slice(0,600);questionOrigin='saved';search.value=String(saved.search||restored.name).slice(0,180);
        const restoredProject=scope.FirstPrincipleAssessmentModel?.PROJECTS.find(item=>item.id===propertyProjectId);if(restoredProject)setProjectQuestion(restoredProject);
        setLocationExpanded(saved.locationExpanded===true,false);
        if(saved.visibleLayers&&spatialState)spatialState.visibleLayers={property:saved.visibleLayers.property===true,lots:saved.visibleLayers.lots===true,zoning:saved.visibleLayers.zoning===true};
        if(restored.state==='NSW')querySpatial();
      }else if(saved.browsingCouncilId&&byId[saved.browsingCouncilId]){browsingCouncil=byId[saved.browsingCouncilId];councilSelect.value=saved.browsingCouncilId;search.value=String(saved.search||'').slice(0,180);}
      if(saved.map&&validPoint(saved.map.center)&&Number.isFinite(saved.map.zoom)&&saved.map.zoom>=3&&saved.map.zoom<=19)map.setView([saved.map.center[1],saved.map.center[0]],saved.map.zoom,{animate:false});
      restoring=false;
    }
    function fitCouncil(feature){
      if(!mapVisible()){pendingCouncilFit=true;return;}
      const layer=layers[feature.properties.id],bounds=layer?.getBounds();
      if(bounds?.isValid()){if(!map.hasLayer(boundaryLayer))boundaryLayer.addTo(map);map.fitBounds(bounds,{padding:[28,28],maxZoom:12,animate:!reducedMotion()});}
      else if(Array.isArray(feature.properties.bbox))zoomBox(feature.properties.bbox,12);
      else pendingCouncilFit=true;
    }
    function mapVisible(){return Boolean(map&&mapCanvas.getClientRects().length&&mapCanvas.clientWidth&&mapCanvas.clientHeight);}
    function refreshMap(){
      if(!mapVisible())return;
      const view=lastMapView;
      map.invalidateSize({pan:true,animate:false});
      if(view)map.setView([view.center[1],view.center[0]],view.zoom,{animate:false});
      if(pendingCouncilFit&&browsingCouncil){pendingCouncilFit=false;fitCouncil(browsingCouncil);}
    }
    function focusProperty(zoom){
      if(!selection?.center||!map)return;map.setView([selection.center[1],selection.center[0]],zoom||map.getZoom(),{animate:!reducedMotion()});
    }
    function reducedMotion() { return scope.matchMedia && scope.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function displayCouncil(feature) {
      const props = feature.properties;
      return props.is_unincorporated ? props.name + " · Unincorporated / special area" : props.council_name || props.name;
    }
    function cancelRequest() {
      requestNumber += 1;
      clearTimeout(searchDebounce);searchDebounce=null;
      locationFocusPending=false;
      if (liveRequest) liveRequest.abort();
      liveRequest = null;
      if(searchState==='searching')setSearchState('idle');
      if(['searching','locating'].includes(locationPhase)){locationPhase=selection?'editing':'initial';syncLocationCard();}
      searchSubmit.disabled = false; searchSubmit.textContent = searchSubmitLabel;
    }
    function resetSpatial(value) {
      spatialEpoch++;spatialRequest?.abort();spatialRequest=null;spatialGeometryKeys={};
      [propertyLayer,lotLayer,zoningLayer].filter(Boolean).forEach(layer=>{layer.clearLayers();if(map?.hasLayer(layer))map.removeLayer(layer);});
      const supported=value?.state==='NSW'&&value?.kind==='address'&&value?.precision==='address_point';
      spatialState=S?.initial(value?.name||'')||null;
      root.dataset.spatialStatus=spatialState?.status||'unavailable';
      if(spatialContainer)spatialContainer.hidden=!value;
      if(spatialState&&!supported&&value){spatialState.status='unsupported';spatialState.message='Live property queries require a NSW street-address result. A locality, interstate address or saved case point has not been matched to a property.';}
      spatialPanel?.update(spatialState||{});
      refreshAssessment();syncFlow();
    }
    function fitSpatialProperty(){
      if(map&&propertyLayer?.getLayers().length){const bounds=propertyLayer.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[36,36],maxZoom:18,animate:!reducedMotion()});}
    }
    function setSpatialVisibility(id,enabled){
      const layer={property:propertyLayer,lots:lotLayer,zoning:zoningLayer}[id];
      if(!layer||!spatialState?.mapLayers[id])return;
      spatialState.visibleLayers[id]=enabled;if(enabled)layer.addTo(map);else map.removeLayer(layer);
      spatialPanel?.update(spatialState);syncFlow();saveContext();
    }
    function renderSpatialLayers(){
      if(!map||!spatialState)return;
      const items={property:spatialState.property?.feature?[spatialState.property.feature]:[],lots:spatialState.layers.lots?.features||[],zoning:spatialState.layers.zoning?.features||[]};
      Object.entries({property:propertyLayer,lots:lotLayer,zoning:zoningLayer}).forEach(([id,layer])=>{
        if(!layer)return;const key=items[id].map(f=>String(f.properties.OBJECTID||f.properties.PROPID||f.properties.CADID)).join(',');
        if(spatialGeometryKeys[id]!==key){layer.clearLayers();layer.addData({type:'FeatureCollection',features:items[id]});spatialGeometryKeys[id]=key;}
        if(spatialState.mapLayers[id]&&spatialState.visibleLayers[id])layer.addTo(map);else if(map.hasLayer(layer))map.removeLayer(layer);
      });
    }
    async function querySpatial(propertyId){
      if(!selection||!spatialClient)return;
      if(propertyId!==undefined&&/^\d+$/.test(String(propertyId))&&String(propertyId)!==String(chosenCandidateId)){
        chosenCandidateId=String(propertyId);confirmedKey=null;confirmedPropertyId=null;projectChosen=false;overviewVisited=false;assessmentVisited=false;
        if(flowPage!=='discovery')navigatePage('discovery',true);
      }
      spatialRequest?.abort();const epoch=++spatialEpoch,controller=new AbortController();spatialRequest=controller;
      const value={...selection},visibility={...spatialState.visibleLayers};spatialGeometryKeys={};
      if(lastReport)clearReport('question');
      spatialState=S.initial(value.name);spatialState.visibleLayers=visibility;spatialState.status='loading';renderSpatialLayers();spatialPanel?.update(spatialState);refreshAssessment();syncFlow();
      try {
        await spatialClient.query(value,{propertyId:chosenCandidateId||undefined,signal:controller.signal,onUpdate(next){
          if(epoch!==spatialEpoch||selection?.name!==value.name)return;
          const visible=spatialState.visibleLayers;spatialState=next;spatialState.visibleLayers=visible;
          if(officialPropertyMatched()&&G.normalize(search.value)===G.normalize(selection?.name))setSearchState('property_matched');
          if(confirmedKey&&!isConfirmed()){
            confirmedKey=null;confirmedPropertyId=null;projectChosen=false;overviewVisited=false;assessmentVisited=false;
            assessmentModel=null;clearReport('location');navigatePage('discovery',true);
          }
          if(next.layers.council?.status==='ready'){
            const raw=next.layers.council.features.map(f=>'LGA-'+f.properties.CADID),ids=[...new Set(raw)];
            const known=ids.length&&ids.every(id=>D?.COUNCIL_IDS.includes(id));
            const changed=JSON.stringify(selection.council_ids)!==JSON.stringify(known?ids:[]);
            if(changed){
              spatialState.match.note+=' The polygon council result differs from the earlier point result; review the responsible authority.';
              if(lastReport)clearReport('question');
              selection={...selection,council_ids:known?ids:[],exact:false};renderSelection();
              root.dataset.selectedCouncils=selection.council_ids.join(',');
            }
          }
          spatialPanel?.update(spatialState);renderSpatialLayers();refreshAssessment();syncFlow();saveContext();
          root.dataset.spatialStatus=spatialState.status;
        }});
      }catch(error){if(error.name!=='AbortError'&&epoch===spatialEpoch){spatialState.status='error';spatialState.error=error.message;spatialPanel?.update(spatialState);refreshAssessment();syncFlow();}}
      finally {
        if(epoch===spatialEpoch){
          spatialRequest=null;
          // A preview may have been requested while the official layers loaded.
          if(lastReport&&selection?.name===value.name&&question.value.trim())renderGuidance();
          syncFlow();saveContext();
        }
      }
    }
    function clearSelection() {
      selection = null;browsingCouncil=null;confirmedKey=null;confirmedPropertyId=null;chosenCandidateId=null;projectChosen=false;overviewVisited=false;assessmentVisited=false;assessmentModel=null;
      locationKey=null;locationPhase='initial';setLocationExpanded(true);
      resetSpatial(null);
      if (marker && map) { map.removeLayer(marker); marker = null; }
      councilSelect.value = '';
      Object.entries(layers).forEach(([id, layer]) => layer.setStyle(styleFor(byId[id], false)));
      renderSelection(); clearReport(); guidancePanel.replaceChildren();
      refreshAssessment();
      root.dataset.selectionKind = ''; root.dataset.selectedCouncils = ''; root.dataset.guidanceConfidence = '';
      syncFlow();saveContext();
    }
    function clearReport(reason='location') {
      lastReport = null; guidancePanel.hidden = true; root.dataset.guidanceConfidence = '';
      updateJourney();
      scope.dispatchEvent(new CustomEvent('firstprinciple:report-cleared',{detail:{reason}}));
    }
    function closeSuggestions() { suggestions.hidden = true; search.setAttribute('aria-expanded', 'false');search.removeAttribute('aria-activedescendant');activeSuggestion=-1;suggestions.querySelectorAll('[role="option"]').forEach(option=>option.setAttribute('aria-selected','false')); }
    function setActiveSuggestion(index){
      activeSuggestion=index;
      const options=[...suggestions.querySelectorAll('[role="option"]')];
      options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===index)));
      if(options[index]){search.setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'});}
    }
    function showResults(items, message) {
      beginLocationSearch(items.length?'results':'no_match');
      searchRetry.hidden=Boolean(items.length);
      closeSuggestions();suggestionItems=items;suggestions.replaceChildren();
      items.forEach((item,index) => {
        const row = node('li');row.setAttribute('role','presentation');
        const action = button(null, () => chooseResult(item), 'cm-suggestion');
        action.id='cm-suggestion-'+index;action.setAttribute('role','option');action.setAttribute('aria-selected','false');action.tabIndex=-1;
        action.addEventListener('mousedown',event=>event.preventDefault());
        action.addEventListener('mousemove',()=>setActiveSuggestion(index));
        const title = item.kind === 'council' ? displayCouncil(item.feature) : item.kind==='postcode'&&item.members?'Postcode '+item.name:item.name;
        const description = item.kind === 'council' ? "Council / local government area" : item.source ? (item.precision === 'address_point' ? 'Street-number address point' : (item.precision || item.kind || 'Approximate').replace(/_/g,' ') + ' result') + ' · ' + (item.state || 'State not confirmed') + ' · ' + (item.exact ? 'Check its council next' : 'Check carefully; location not verified') : item.kind === 'postcode' ? item.members.length + " localities · Select a specific locality next" : 'Suburb / Locality · ' + (item.council_ids || []).length + " council / area candidates";
        action.append(node('strong', title), node('small', description+(item.propertyLabel?' · '+item.propertyLabel:'')));
        row.append(action); suggestions.append(row);
      });
      suggestions.hidden = !items.length; search.setAttribute('aria-expanded', String(Boolean(items.length)));
      setSearchState(items.length?'suggestions':'no_results');
      searchStatus.textContent = message;
    }
    function localResults(query) {
      const normalized = G.normalize(query);
      const tokens = normalized.split(' ').filter(Boolean);
      const matches = value => tokens.every(token => G.normalize(value).includes(token));
      const councils = Object.values(byId).filter(feature => matches(feature.properties.name + ' ' + feature.properties.council_name)).map(feature => ({ kind: 'council', feature, score: G.councilKey(feature.properties.name) === G.councilKey(query) ? 0 : 2 }));
      const postcodes = postcodeGroups.filter(group => /^\d{1,4}$/.test(query.trim()) && group.name.startsWith(query.trim())).map(group => ({ ...group, score: group.name === query.trim() ? 0 : 5 }));
      const localities = places.filter(place => matches(place.name + ' NSW ' + place.postcode)).map(place => ({ ...place, name:place.name+(place.postcode?' NSW '+place.postcode:''),kind: 'place', score: G.normalize(place.name) === normalized ? 1 : 3 }));
      return [...councils, ...postcodes, ...localities].sort((a, b) => a.score - b.score || String(a.name || a.feature.properties.name).localeCompare(String(b.name || b.feature.properties.name)));
    }
    async function performSearch(submitted, autoCase = false, debounced = false) {
      beginLocationSearch();
      const query = search.value.trim();
      updateSearchControls();searchRetry.hidden=true;
      previousSelectionNote.hidden=!selection||G.normalize(query)===G.normalize(selection.name);
      previousSelectionNote.textContent=selection?'Your current project remains at '+selection.name+' until you choose another location.':'';
      if (!ready) return;
      if (!query) { cancelRequest();closeSuggestions();setSearchState('idle');searchStatus.textContent = "Enter a council, suburb, postcode or complete street address."; return; }
      const results = localResults(query);
      if (results.length) { showResults(results.slice(0, 12), results.length > 12 ? "Found " + results.length + " locations. Showing the first 12; add more detail to narrow the search." : "Choose a location to zoom the map. The first suggestion is not selected automatically."); return; }
      if(!submitted&&!debounced){
        closeSuggestions();setSearchState('typing');
        if(query.length<4||search.matches(':invalid')){searchStatus.textContent='Enter at least 4 characters, or select Find location to search.';return;}
        searchStatus.textContent='Keep typing, or pause to search Australian addresses.';
        const epoch=requestNumber;searchDebounce=setTimeout(()=>{searchDebounce=null;if(epoch===requestNumber&&search.value.trim()===query&&!search.matches(':invalid'))performSearch(false,false,true);},650);return;
      }
      if (!A) { locationPhase='error';syncLocationCard();closeSuggestions();setSearchState('provider_error');searchStatus.textContent='Address search is unavailable. Refresh the page to retry.';return; }
      cancelRequest();
      const number = requestNumber;
      const controller = new AbortController(); liveRequest = controller;
      const timer = setTimeout(() => controller.abort(), 22000);
      beginLocationSearch('searching');
      setSearchState('searching');
      // Disabling a focused submit control can blur it outside the form and
      // cancel its own request. Keep focus on the combobox before disabling.
      if(document.activeElement===searchSubmit)search.focus({preventScroll:true});
      searchSubmit.disabled = true; searchSubmit.textContent = "Searching…";
      searchStatus.textContent = "Finding address candidates. Confirm the street number, suburb, state and match precision before choosing one."; closeSuggestions();
      try {
        const addresses=await A.search(query,{signal:controller.signal,limit:12});
        if (number !== requestNumber) return;
        if (autoCase && addresses.length === 1 && addresses[0].exact && R.caseMatches(addresses[0])) {
          await chooseResult(addresses[0]);
        } else if (autoCase) selectSavedCase();
        else showResults(addresses, addresses.length ? (A.parse(query)?.kind==='street'?'Street search results. Add a street number to narrow the list. Choose a returned address to continue.':'Choose a result after checking its street number, locality and state. NSW planning data is the current coverage.') : "No matching address found. Try adding a suburb or state. Address coverage may be incomplete.");
      } catch (error) {
        if (number === requestNumber) {
          if (autoCase) selectSavedCase();
          else {beginLocationSearch('error');closeSuggestions();setSearchState('provider_error');searchStatus.textContent = error.name === 'AbortError' ? "The address service timed out. Retry the search." : "The address service is unavailable. Retry the search or choose a NSW locality or council.";}
          searchRetry.hidden=false;
        }
      } finally {
        clearTimeout(timer);
        if (number === requestNumber) { searchSubmit.disabled = false; searchSubmit.textContent = searchSubmitLabel; liveRequest = null; }
      }
    }
    function loadCase() {
      if (!R) return;
      if (!ready) { pendingCase = true; searchStatus.textContent = 'Loading the example project…'; return; }
      propertyProjectId='granny';assessmentSelection={...assessmentSelection,mode:'property',projectId:'granny'};
      pendingCase = false; cancelRequest(); clearSelection(); closeSuggestions();
      search.value = R.CASE.address; question.value = R.CASE.question;questionOrigin='historical';
      caseQuestionNote.hidden = false; caseQuestionNote.textContent = R.CASE.questionBasis;
      questionHint.textContent = 'The same project continues from this question to the preview and specialist workspace.';
      performSearch(true, true);
      workspace.scrollIntoView({behavior:reducedMotion() ? 'instant' : 'smooth',block:'start'});
    }
    function selectSavedCase() {
      let council = features.find(G.isPilot);
      if (!council&&D) { const id=D.COUNCIL_IDS.find(id=>D.getCouncil(id).name===R.CASE.council);if(id){council={properties:{id,name:R.CASE.council,council_name:R.CASE.council,state:'NSW'}};byId[id]=council;} }
      if (!council) {pendingCase=true;return;}
      cancelRequest(); closeSuggestions();
      setSelection({kind:'address',name:R.CASE.address,center:[...R.CASE.center],council_ids:[council.properties.id],exact:false,state:'NSW',precision:'saved_case_point',coverage:'nsw',origin:'saved_case_point',methods:['Saved case point; not verified live']});
      if (map) map.setView([R.CASE.center[1],R.CASE.center[0]],18,{animate:!reducedMotion()});
      showCaseImagery();
      drawPoint(R.CASE.center,true);
      searchStatus.textContent = 'Showing the saved case address point checked on 29 October 2026. Live matching is unavailable; location confidence remains Low.';
    }
    async function chooseResult(item) {
      const fromLocationForm=locationFields.contains(document.activeElement);
      cancelRequest();locationFocusPending=fromLocationForm;closeSuggestions();
      beginLocationSearch('locating');
      setSearchState('location_selected');
      if(previewMedia?.matches){search.blur();addressFields.postcode.blur();}
      if (item.kind === 'council') { selectCouncil(item.feature); return; }
      if (item.kind === 'postcode' && item.members) {
        clearReport(selection?.name===item.name?'question':'location');browsingCouncil=null;
        search.value = item.name;
        if (marker && map) { map.removeLayer(marker); marker = null; }
        setSelection({ kind: 'postcode', name: "Postcode " + item.name, council_ids: item.council_ids, bbox: item.bbox });
        zoomBox(item.bbox, 11);
        showResults(item.members.slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, 24).map(place => ({ ...place, kind: 'place' })), "A postcode is not a council boundary. Choose a specific locality or enter a complete address.");
        return;
      }
      if (item.kind === 'place') {
        clearReport(selection?.name===item.name?'question':'location');browsingCouncil=null;
        search.value = item.name;
        setSelection({ ...item, kind: 'place',state:'NSW',coverage:'nsw' }); zoomBox(item.bbox, 13); drawPoint(item.center, false);
        searchStatus.textContent = "Zoomed to " + item.name + ". Use a complete address to confirm the property's council.";
        return;
      }
      if (!item.center || !item.source) return;
      // The NSW address API can return GDA94 despite a WGS84 request. Transform
      // using its actual CRS before placing a Web-map marker or point query.
      if(item.provider==='nsw_spatial'&&item.sourceWkid!==4326){
        if(!spatialClient){beginLocationSearch('error');setSearchState('provider_error');searchStatus.textContent='The coordinate verification component could not load. Refresh before selecting this NSW address.';return;}
        const epoch=requestNumber,controller=new AbortController();liveRequest=controller;searchStatus.textContent='Converting the official address coordinate for map display…';
        try{item=await spatialClient.projectAddress(item,{signal:controller.signal});if(epoch!==requestNumber)return;}
        catch(error){if(epoch===requestNumber){beginLocationSearch('error');setSearchState('provider_error');searchRetry.hidden=false;searchStatus.textContent='The address was found, but its map coordinate could not be verified. Retry the address search. No new property was selected.';}return;}
        finally {if(epoch===requestNumber)liveRequest=null;}
      }
      clearReport(selection?.name===item.name?'question':'location');browsingCouncil=null;
      search.value = item.name;
      const inNSW=item.state==='NSW';
      const zoom=item.precision==='address_point'||item.kind==='address'?18:item.kind==='street'?16:12;
      setSelection({ ...item, council_ids: [], exact: false,coverage:inNSW?'nsw':item.state?'outside_nsw':'unconfirmed' });
      if(previewMedia?.matches){revealPreview();requestAnimationFrame(()=>mapCanvas.scrollIntoView({block:'start',behavior:'instant'}));}
      if(inNSW&&item.kind==='address'&&item.precision==='address_point')querySpatial();
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
        response.features.forEach(feature=>{const a=feature.attributes||{},id='LGA-'+a.cadid;if(!byId[id]&&D?.COUNCIL_IDS.includes(id))byId[id]={properties:{id,name:a.lganame,council_name:a.councilname||D.getCouncil(id).name,state:'NSW'}};});
        const unrecognized = rawIds.some(id => !id || !byId[id]);
        // Never discard an unknown returned council and turn a multiple match
        // into one known match. A newer/unrecognized boundary remains unresolved.
        const matched = unrecognized ? [] : rawIds;
        // A high match requires both the service's exact-input statement and
        // one official point-in-boundary result. Adjusted/nearest matches stay low.
        setSelection({ ...item,state:'NSW',coverage:'nsw', council_ids: matched, exact: item.exact && item.kind==='address' && matched.length === 1 });
        searchStatus.textContent = matched.length === 1 ? "Address located. Review the property marker and boundary, then confirm the property." : matched.length ? "The address point intersects multiple areas. The responsible authority needs confirmation." : "This address point could not be matched to a council in this map. Confirm the responsible authority with the official service.";
      } catch (error) {
        if (number === requestNumber) { setSelection({ ...item,state:'NSW',coverage:'nsw', council_ids: [], exact: false }); searchStatus.textContent = "The address point is located, but the council checking service is temporarily unavailable. The responsible authority remains unconfirmed."; }
      } finally { clearTimeout(timer); if (number === requestNumber) liveRequest = null; }
    }
    function selectCouncil(feature) {
      cancelRequest();closeSuggestions();clearSelection();
      question.value='';questionOrigin='suggested';search.value='';caseQuestionNote.hidden=true;
      browsingCouncil=feature;councilSelect.value=feature.properties.id;
      fitCouncil(feature);updateMapContext();syncFlow();saveContext();
      searchStatus.textContent = 'Exploring '+displayCouncil(feature)+'. Search a street-number address to choose a property.';
      if(flowPage!=='discovery')navigatePage('discovery',true);
    }
    function setSelection(value) {
      const changed=!selection||selection.name!==value.name||selection.propertyId!==value.propertyId||selection.precision!==value.precision||JSON.stringify(selection.center)!==JSON.stringify(value.center);
      if(changed){confirmedKey=null;confirmedPropertyId=null;chosenCandidateId=null;projectChosen=false;overviewVisited=false;assessmentVisited=false;lastReport=null;guidancePanel.hidden=true;resetSpatial(value);}
      selection = value;browsingCouncil=null;previousSelectionNote.hidden=true;
      if(!hasLocatedAddress())locationPhase='initial';
      // Reselecting the same address also completes an edit, without discarding
      // its current property confirmation. Council/parcel refreshes do not.
      if(hasLocatedAddress()&&locationPhase==='locating'&&selectionKey()===locationKey){locationPhase='located';setLocationExpanded(false);}
      councilSelect.value = value.council_ids.length === 1 ? value.council_ids[0] : '';
      Object.entries(layers).forEach(([id, layer]) => layer.setStyle(styleFor(byId[id], value.council_ids.includes(id))));
      renderSelection();
      if(G.normalize(search.value)===G.normalize(value.name))setSearchState(officialPropertyMatched()?'property_matched':'location_selected');
      if (!guidancePanel.hidden && question.value.trim()) renderGuidance();
      root.dataset.selectionKind = value.kind;
      root.dataset.selectedCouncils = value.council_ids.join(',');
      refreshAssessment();updateJourney();syncFlow();saveContext();scope.dispatchEvent(new CustomEvent('firstprinciple:location-selected',{detail:{kind:value.kind}}));
    }
    function updateJourney(){
      const current=['discovery','overview','development','assessment'].indexOf(flowPage)+1;
      const confirmed=isConfirmed(),completed=[confirmed,overviewVisited,projectChosen,assessmentVisited];
      journeySteps.querySelectorAll('li').forEach((li,index)=>{
        const action=li.querySelector('button');action.disabled=index===0?false:index===1?!confirmed:index===2?!confirmed||!overviewVisited:!confirmed||!overviewVisited||!projectChosen;
        if(index+1===current)action.setAttribute('aria-current','step');else action.removeAttribute('aria-current');
        li.dataset.complete=String(completed[index]&&index+1!==current);
        li.dataset.stepState=index+1===current?'current':completed[index]?'completed':'upcoming';
        action.setAttribute('aria-label','Step '+(index+1)+': '+action.querySelector('strong').textContent+' · '+(index+1===current?'current step':completed[index]?'completed':action.disabled?'complete earlier steps first':'available'));
      });
    }
    function renderSelection() {
      [widerButton,streetButton,recenterButton].forEach(control=>control.disabled=!selection?.center);
    }
    function renderLegend(){
      legendContent.replaceChildren();
      if(!categories)return;
      const list=node('ul',null,'cm-legend-list');
      categories.categories.forEach(category=>{const li=node('li');const swatch=node('span',null,'cm-legend-swatch');swatch.style.backgroundColor=category.color;swatch.setAttribute('aria-hidden','true');li.append(swatch,node('span',category.label+' · '+category.count));list.append(li);});
      legendContent.append(list,node('p',categories.legend_note||'Council types describe population and urban character. They do not indicate zoning, risk or development eligibility.','cm-legend-note'),node('p',categories.edition_note||'Published classification edition; not a current planning-control assessment.','cm-legend-note'));
      const source=categories.sources&&categories.sources[0];if(source)legendContent.append(externalLink({title:'Official OLG classification source',url:source.url}));
    }
    function categoryFor(feature){return categoryById[categories?.councils?.[feature.properties.id]?.category_id];}
    function continueToServices(){
      if(!isConfirmed()||!projectChosen||!question.value.trim())return;
      renderGuidance();
      if(lastReport)scope.dispatchEvent(new CustomEvent('firstprinciple:advanced-services',{detail:{location:lastReport.location,question:lastReport.question,report:lastReport}}));
    }
    function renderGuidance() {
      if(!isConfirmed()||!projectChosen)return;
      if (!R) { searchStatus.textContent = 'The preview component could not load. Refresh to try again.'; return; }
      const result = R.buildReport(question.value, selection, byId);
      const project=scope.FirstPrincipleAssessmentModel?.PROJECTS.find(p=>p.id===propertyProjectId);
      if(project)result.projectIntent={id:project.id,label:project.label,status:'user_selected_intent',legalApplicabilityAssessed:false};
      const assessment=scope.FirstPrincipleAssessmentModel?.build({...assessmentSelection,mode:'property',projectId:propertyProjectId,location:selection,spatial:spatialState},scope.FirstPrinciplePrototypeExamples);
      if(assessment)result.missing=[...new Set([...result.missing,...assessment.sections[4].missing.map(item=>item.label+': '+item.reason)])];
      lastReport = result;
      guidancePanel.hidden = false; guidancePanel.replaceChildren();
      const titleRow = node('div', null, 'cm-guidance-title');
      titleRow.append(node('div'), node('span', result.confidenceLabel, 'cm-confidence cm-confidence-low'));
      titleRow.firstChild.append(node('p', result.mode + ' · Prepared ' + result.preparedOn, 'cm-kicker'), node('h3', 'Your preliminary planning report'));
      guidancePanel.append(titleRow, node('p', result.location.name + ' · ' + (result.location.councilNames.join(', ') || 'Council not confirmed'), 'cm-report-location'), node('p', result.summary, 'cm-report-summary'), node('p', result.confidenceReason, 'cm-guidance-reason'));
      if(spatialState?.property&&spatialState.address===selection.name){
        const zones=[...new Set((spatialState.layers.zoning?.features||[]).map(f=>f.properties.SYM_CODE).filter(Boolean))];
        result.spatialEvidence={propertyId:spatialState.property.id,lotLabels:[...spatialState.property.lotLabels],zones,retrievedAt:spatialState.retrievedAt,status:spatialState.status,sourceUrl:spatialState.layers.zoning?.sourceUrl||spatialState.property.sourceUrl,legalApplicabilityAssessed:false};
        const context=node('div',null,'cm-spatial-report-context');
        context.append(node('h4','Live spatial context'),node('p','Property '+spatialState.property.id+' · '+(spatialState.property.lotLabels.join(' · ')||'Lot labels unresolved')+'. '+(zones.length?'Returned zone codes: '+zones.join(' / ')+'. ':'Zoning remains unresolved. ')+(zones.length>1?'Multiple zone intersections require boundary and applicability review. ':'')),node('p','Queried '+(spatialState.retrievedAt||'during this session')+'. These mapped attributes supplement the preview; they do not determine permission, DA / CDC eligibility or hazard status.'));
        if(spatialState.layers.zoning?.sourceUrl){context.append(externalLink({title:'Official zoning query source',url:spatialState.layers.zoning.sourceUrl}));result.sources.push({title:'Live spatial query · NSW EPI Land Zoning',url:spatialState.layers.zoning.sourceUrl,note:'Property polygon intersections; legal applicability not assessed.'});}
        guidancePanel.append(context);
      }
      const next = node('div', null, 'cm-report-next');
      const nextCopy = node('div'); nextCopy.append(node('h4', 'Need a clearer scope, budget or application plan?'), node('p', 'Continue with this location, question and evidence gaps. Plan the work an AI Agent and human specialists would review.'));
      const continueButton = button('Continue to advanced services →', continueToServices, 'cm-button cm-primary');
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
      mapCanvas.addEventListener('wheel',event=>{if(!event.ctrlKey){event.stopImmediatePropagation();}},{capture:true,passive:true});
      mapCanvas.addEventListener('keydown',event=>{if(event.key==='Escape'&&previewMedia?.matches&&mapGesturesEnabled){event.preventDefault();mapGesturesEnabled=false;syncMapGestures();mapGestureToggle.focus({preventScroll:true});}});
      map = L.map(mapCanvas, { trackResize:false,scrollWheelZoom: true,wheelPxPerZoomLevel:120,wheelDebounceTime:80, minZoom: 3, maxZoom: 19, zoomSnap: 0.25, zoomDelta: 0.5, zoomControl: true, preferCanvas: false,maxBounds:[[-57,100],[-3,170]],maxBoundsViscosity:0.8 });
      const tiles = L.tileLayer(BASEMAP, { maxZoom: 19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>' });
      let tileFailed = false;
      tiles.on('tileerror', () => { if (!tileFailed) { tileFailed = true; mapStatus.textContent = "Some base map tiles could not load. Council boundaries and the list remain available."; } });
      tiles.addTo(map);
      streetLayer = tiles;
      aerialLayer = L.tileLayer(AERIAL,{maxZoom:19,bounds:[[-37.86,140.97],[-27.70,159.50]],attribution:'© NSW Spatial Services · NSW aerial imagery; capture dates vary'});
      aerialLayer.on('tileerror',()=>{mapStatus.textContent='Some aerial tiles are unavailable. Switch to Street map; the address point remains visible.';});
      const baseLayers=L.control.layers({'Street map · Australia':streetLayer}, {'NSW aerial imagery':aerialLayer}, {collapsed:false,position:'topright'}).addTo(map);
      ['cm-zoning','cm-lots','cm-property'].forEach((name,index)=>{map.createPane(name);map.getPane(name).style.zIndex=String(430+index*10);});
      propertyLayer=L.geoJSON(null,{pane:'cm-property',style:{color:'#153e31',weight:3,fillColor:'#1f634c',fillOpacity:0.035},onEachFeature(feature,layer){layer.bindTooltip(node('span','Official mapped property '+feature.properties.PROPID+' · not a survey'));layer.on('click',fitSpatialProperty);}});
      lotLayer=L.geoJSON(null,{pane:'cm-lots',style:{color:'#495c89',weight:2,dashArray:'5 4',fillOpacity:0},onEachFeature(feature,layer){const p=feature.properties;layer.bindTooltip(node('span','Cadastral lot '+(p.LOTIDSTRING||[p.LOTNUMBER,p.PLANLABEL].join(' / '))));}});
      zoningLayer=L.geoJSON(null,{pane:'cm-zoning',style(feature){const code=String(feature.properties.SYM_CODE||''),colour=/^RU/.test(code)?'#80a677':/^R\d/.test(code)?'#c89b62':/^C\d/.test(code)?'#5e9a9b':'#9381b3';return {color:colour,weight:1.5,fillColor:colour,fillOpacity:0.27};},onEachFeature(feature,layer){const p=feature.properties;const copy=node('div');copy.append(node('strong',(p.SYM_CODE||'Zone')+' · '+(p.LAY_CLASS||'Mapped feature')),node('p',p.EPI_NAME||''),node('p','Queried zoning polygon. Colour is for distinction, not permission or risk.'));layer.bindPopup(copy);}});
      boundaryLayer=L.geoJSON(geo, { style: feature => styleFor(feature, false), onEachFeature: (feature, layer) => {
        layers[feature.properties.id] = layer;
        const tooltip = node('span', displayCouncil(feature)+(categoryFor(feature)?' · '+categoryFor(feature).label:''));
        layer.bindTooltip(tooltip, { sticky: true });
        layer.on('click', () => selectCouncil(feature));
        layer.on('mouseover', () => layer.setStyle({ fillOpacity: map.getZoom()>=15?0.04:0.52 }));
        layer.on('mouseout', () => layer.setStyle(styleFor(feature, browsingCouncil?.properties.id===feature.properties.id||Boolean(selection?.council_ids.includes(feature.properties.id)))));
        layer.on('add',()=>layer.getElement()?.setAttribute('data-council-id',feature.properties.id));
      } }).addTo(map);
      baseLayers.addOverlay(boundaryLayer,'NSW council boundaries');
      councilLabels=L.layerGroup().addTo(map);
      map.on('zoomend moveend',()=>{updateMapContext();if(mapVisible())lastMapView={center:[map.getCenter().lng,map.getCenter().lat],zoom:map.getZoom()};saveContext();});
      map.on('overlayadd overlayremove',event=>{if(event.layer===boundaryLayer)updateMapContext();});
      resetView();
      const councilCount = features.filter(feature => !feature.properties.is_unincorporated).length;
      mapStatus.textContent = councilCount + " councils · " + (features.length - councilCount) + " unincorporated / special areas · Boundaries simplified for display";
      areaText.textContent = 'Australia · ' + councilCount + ' NSW councils';
      if (scope.ResizeObserver) new ResizeObserver(refreshMap).observe(mapCanvas);
      syncMapGestures();
    }
    function showCaseImagery() {
      if (map && aerialLayer) aerialLayer.addTo(map);
    }
    function zoomBox(box, maxZoom) {
      if (map && box) map.fitBounds([[box[1], box[0]], [box[3], box[2]]], { padding: [24, 24], maxZoom, animate: !reducedMotion() });
    }
    function resetView() {
      if (!map) return;
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
      Object.entries(layers).forEach(([id,layer])=>layer.setStyle(styleFor(byId[id],browsingCouncil?.properties.id===id||Boolean(selection?.council_ids.includes(id)))));
      if(councilLabels)councilLabels.clearLayers();
      if(map.getZoom()>=8&&map.hasLayer(boundaryLayer)){
        features.forEach(feature=>{const p=feature.properties,b=p.bbox;if(!map.getBounds().intersects([[b[1],b[0]],[b[3],b[2]]]))return;const a=map.latLngToContainerPoint([b[1],b[0]]),z=map.latLngToContainerPoint([b[3],b[2]]);if(Math.abs(z.x-a.x)<95||Math.abs(z.y-a.y)<38||!map.getBounds().contains([p.center[1],p.center[0]]))return;L.tooltip({permanent:true,direction:'center',className:'cm-council-label',interactive:false}).setLatLng([p.center[1],p.center[0]]).setContent(node('span',p.name)).addTo(councilLabels);});
      }
    }
    function drawPoint(center, address) {
      if (!map || !Array.isArray(center) || !center.every(Number.isFinite)) return;
      if (marker) map.removeLayer(marker);
      marker = L.marker([center[1], center[0]], {keyboard:true,bubblingMouseEvents:false,title:address?'Selected street address point · check unit details':'Area or street reference · not a property address',alt:address?'Selected address point':'Area reference point',icon:L.divIcon({className:'cm-property-marker'+(address?'':' cm-area-marker'),html:'<span aria-hidden="true"></span>',iconSize:[44,44],iconAnchor:[22,38]})}).addTo(map);
      marker.bindTooltip(node('span', address ? "Selected street address point · check number and unit" : "Area or street reference point · not a property address"));
      marker.on('click',revealPreview);
    }
    const api = {
      loadCase,
      mountAddressSearch(target){
        if(target){searchSubmitLabel='Find property';target.append(searchForm);if(searchState==='idle'&&!search.value)searchStatus.textContent='';}
        else{searchSubmitLabel='Find location';searchMountPoint.after(searchForm);if(searchState==='idle'&&!search.value)searchStatus.textContent='Enter a street address, or browse a NSW council.';}
        if(!searchSubmit.disabled)searchSubmit.textContent=searchSubmitLabel;
        return searchForm;
      },
      exportProjectContext,
      restoreProjectContext(context){
        if(!context||context.version!==1)throw new Error('Unsupported saved workflow.');
        restoring=true;cancelRequest();clearSelection();closeSuggestions();question.value='';search.value='';
        restoreContext(context);syncFlow();saveContext();refreshMap();
      },
      resetProject:startNewSearch,
      showPage,confirmProperty,chooseProject,
      getReport(){return lastReport;},
      focusReport(){if(flowPage==='assessment'){const assistance=question.closest('details[data-assessment-assistance]');if(assistance)assistance.open=true;if(!guidancePanel.hidden)guidancePanel.scrollIntoView({behavior:'instant',block:'start'});else question.focus({preventScroll:true});}else navigatePage(isConfirmed()?'overview':'discovery');},
      searchAddress(query){pendingCase=false;cancelRequest();closeSuggestions();search.value=String(query||'').slice(0,180);performSearch(true);search.focus();},
      setIntent(intent){
        const id=({'secondary-dwellings':'granny','dual-occupancy':'dual','manor-houses':'manor-house','renovate-or-extend':'storey','build-new-home':'new-home','add-another-dwelling':'other','develop-my-land':'other','explore-my-options':'other'})[intent?.typeId||intent?.goalId]||intent?.typeId;
        const project=scope.FirstPrincipleAssessmentModel?.PROJECTS.find(p=>p.id===id);
        if(project){
          const changed=propertyProjectId!==id;
          propertyProjectId=id;assessmentSelection={...assessmentSelection,mode:'property',projectId:id};
          setProjectQuestion(project);
          if(changed){assessmentVisited=false;clearReport('question');}
        }
        if(intent?.question){question.value=String(intent.question).slice(0,600);questionOrigin='provided';caseQuestionNote.hidden=true;updateQuestionContext();clearReport('question');}refreshAssessment();syncFlow();saveContext();
      },
      browseCouncil(id,topicId){
        let feature=byId[id];if(!feature&&D?.COUNCIL_IDS.includes(id)){const entry=D.getCouncil(id);feature={properties:{id,name:entry.name,council_name:entry.name,state:'NSW'}};byId[id]=feature;}
        if(!feature)return false;selectCouncil(feature);return true;
      },
      refresh:refreshMap,
      querySpatial,
      getSpatialData(){return spatialState?JSON.parse(JSON.stringify(spatialState)):null;},
      getAssessment(){return assessmentModel?JSON.parse(JSON.stringify(assessmentModel)):null;},
      getState() { return { ready,flowPage,searchState,locationCard:{expanded:locationExpanded,phase:isConfirmed()?'confirmed':locationPhase},confirmedProperty:isConfirmed(),confirmationMode:confirmationMode(),confirmationIssue:confirmationIssue(),overviewVisited,assessmentVisited,projectChosen,projectId:propertyProjectId,selection: selection ? {kind:selection.kind,name:selection.name,propertyId:selection.propertyId,center:selection.center,state:selection.state,precision:selection.precision,coverage:selection.coverage,source:selection.source,origin:selection.origin,council_ids:[...selection.council_ids],locationConfidence:G.describeLocation(selection).level}:null,reportCaseId:lastReport?.caseId||null,planningConfidence:'low',documentCouncilId:null,browsingCouncilId:browsingCouncil?.properties.id||null,panel:flowPage,library:null,spatial:spatialPanel?.getState(),categoryCount:categories?.categories?.length||0,zoom:map?.getZoom(),bounds:map?.getBounds().toBBoxString(),flow:flowView?.getState()}; }
    };
    root._lynnCouncilMap = api;
    return api;
  }
  scope.LynnCouncilMap = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
