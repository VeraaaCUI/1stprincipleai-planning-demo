/* Official spatial-query results. Presentation only: no fetches or legal inference. */
(function (scope) {
  'use strict';
  const LAYERS = Object.freeze([
    { id: 'council', title: 'Council', noun: 'council areas' },
    { id: 'zoning', title: 'Land zoning', noun: 'zoning features' },
    { id: 'height', title: 'Building height', noun: 'height features' },
    { id: 'fsr', title: 'Floor space ratio', noun: 'FSR features' },
    { id: 'lotSize', title: 'Minimum lot size', noun: 'lot-size features' },
    { id: 'heritage', title: 'Heritage', noun: 'heritage features' }
  ]);
  const STATUSES = ['idle', 'loading', 'ready', 'partial', 'error', 'unsupported'];
  const LAYER_STATUSES = ['ready', 'empty', 'error', 'not_queried', 'loading'];
  const text = (value, max = 600) => value === null || value === undefined ? '' : String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const distinct = values => [...new Set(values.filter(Boolean))];
  function sourceUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
    catch (_) { return ''; }
  }
  function dateLabel(value, withTime = false) {
    if (value === null || value === undefined || value === '') return 'Not supplied';
    const date = new Date(value);
    if (!Number.isFinite(date.valueOf())) return 'Not supplied';
    if (withTime) return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
    return date.toISOString().slice(0, 10);
  }
  function normalize(input = {}) {
    if (!input || typeof input !== 'object') input = {};
    const layers = {};
    [...LAYERS,{id:'lots'}].forEach(({ id }) => {
      const layer = input.layers?.[id] || {};
      layers[id] = {
        status: LAYER_STATUSES.includes(layer.status) ? layer.status : 'not_queried',
        queryBasis: layer.queryBasis === 'property_polygon' ? 'property_polygon' : layer.queryBasis === 'point_only' ? 'point_only' : '',
        sourceUrl: sourceUrl(layer.sourceUrl), retrievedAt: layer.retrievedAt || '', note: text(layer.note),
        features: (Array.isArray(layer.features) ? layer.features : []).filter(feature => feature && typeof feature.properties === 'object').slice(0, 100)
      };
    });
    return {
      status: STATUSES.includes(input.status) ? input.status : 'idle', address: text(input.address, 300), retrievedAt: input.retrievedAt || '',
      match: { status: text(input.match?.status, 60), note: text(input.match?.note) },
      property: input.property ? { id: text(input.property.id, 100), lotLabels: distinct((Array.isArray(input.property.lotLabels) ? input.property.lotLabels : []).map(value => text(value, 180))), sourceUrl: sourceUrl(input.property.sourceUrl), currency: input.property.currency || '' } : null,
      propertyCandidates: (Array.isArray(input.propertyCandidates) ? input.propertyCandidates : []).map(item => ({ id: text(item?.id, 100), label: text(item?.label, 250) })).filter(item => item.id).slice(0, 50),
      layers, mapLayers: { property: input.mapLayers?.property === true, lots: input.mapLayers?.lots === true, zoning: input.mapLayers?.zoning === true },
      visibleLayers: input.visibleLayers && typeof input.visibleLayers === 'object' ? input.visibleLayers : null,
      message: text(input.message), error: text(input.error)
    };
  }
  function node(tag, copy, className) {
    const item = document.createElement(tag);
    if (copy !== undefined && copy !== null) item.textContent = copy;
    if (className) item.className = className;
    return item;
  }
  function action(copy, callback, className = 'fsp-button') {
    const item = node('button', copy, className); item.type = 'button';
    item.addEventListener('click', callback); return item;
  }
  function link(copy, url) {
    const item = node('a', copy, 'fsp-source-link'); item.href = url; item.target = '_blank'; item.rel = 'noopener noreferrer';
    item.title = 'Opens official source in a new tab'; return item;
  }
  const value = (props, key) => text(props[key], 350);
  function attributeRows(id, props) {
    if (id === 'council') return [['Council', value(props, 'COUNCILNAME') || value(props, 'LGANAME') || 'Name not supplied'], ['LGA', value(props, 'LGANAME') || 'Not supplied'], ['CAD ID', value(props, 'CADID') || 'Not supplied'], ['Record last update', dateLabel(props.LASTUPDATE)]];
    const rows = [['Planning instrument', value(props, 'EPI_NAME') || 'Not supplied']];
    if (id === 'zoning') rows.push(['Mapped zone', [value(props, 'SYM_CODE'), value(props, 'LAY_CLASS')].filter(Boolean).join(' · ') || 'Not supplied']);
    if (id === 'height') {
      const metres = props.MAX_B_H_M;
      rows.push(['Mapped height', metres !== null && metres !== undefined && metres !== '' ? text(metres) + ' m' : [value(props, 'MAX_B_H'), value(props, 'UNITS')].filter(Boolean).join(' ') || 'Not supplied']);
      if (props.MAX_B_H_RL !== null && props.MAX_B_H_RL !== undefined) rows.push(['Mapped reduced level', text(props.MAX_B_H_RL) + ' (as returned)']);
    }
    if (id === 'fsr') rows.push(['Mapped ratio', props.FSR !== null && props.FSR !== undefined && props.FSR !== '' ? text(props.FSR) + ':1' : 'Not supplied']);
    if (id === 'lotSize') rows.push(['Mapped lot size', [value(props, 'LOT_SIZE'), value(props, 'UNITS')].filter(Boolean).join(' ') || 'Not supplied']);
    if (id === 'heritage') rows.push(['Mapped item / area', value(props, 'H_NAME') || value(props, 'LAY_CLASS') || 'Name not supplied'], ['Heritage ID', value(props, 'H_ID') || 'Not supplied']);
    rows.push(['Record currency', dateLabel(props.CURRENCY_DATE)]);
    if (props.LEGIS_REF_CLAUSE) rows.push(['Clause reference returned', value(props, 'LEGIS_REF_CLAUSE')]);
    else if (props.AMENDMENT) rows.push(['Map amendment', value(props, 'AMENDMENT')]);
    return rows;
  }
  function init(root, callbacks = {}) {
    if (!root) return { update() {}, getState() { return { status: 'idle', address: '', canAuthorizeProgression: false }; } };
    if (root._firstPrincipleSpatialPanel) return root._firstPrincipleSpatialPanel;
    let state = normalize(), visibility = { property: true, lots: true, zoning: false }, lastAnnouncement = '', signature = '';
    const disclosures = scope.FirstPrincipleProgressiveCards?.createDisclosureMemory();
    const contextKey = current => [current.address, current.property?.id || 'unresolved'].join('|');
    const disclosureId=details=>details.dataset.spatialCategory||details.dataset.spatialDisclosure||'provenance';
    const shell = node('section', null, 'fsp-panel'); shell.setAttribute('aria-label', 'Official property spatial data');
    const head = node('div', null, 'fsp-header');
    const title = node('h3', 'Mapped planning information', 'fsp-title'); title.tabIndex = -1;
    const address = node('p', '', 'fsp-address');
    head.append(title, address);
    const status = node('p', '', 'fsp-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    const query = action('Query official property data', () => { if (typeof callbacks.onQuery === 'function') callbacks.onQuery(); }, 'fsp-button'); query.dataset.spatialQuery = 'true';
    const controls = node('div', null, 'fsp-actions'); controls.append(query);
    const content = node('div', null, 'fsp-results');
    const boundaryNote = node('p', 'Mapped features are spatial evidence. They do not establish planning permission, a surveyed boundary or the legal requirements for your proposal.', 'fsp-boundary-note');
    shell.append(head, status, content, controls, boundaryNote); root.append(shell);
    function statusCopy() {
      if (state.status === 'loading') return 'Checking official sources. Available results appear below.';
      if (state.status === 'unsupported') return state.message || 'Property-level planning data is connected for NSW addresses only. No NSW controls have been applied to this location.';
      if (state.status === 'error') return state.error || state.message || 'Official property data could not be retrieved. Retry the query or check the official source.';
      if (state.status === 'ready') return 'Official query complete. Legal applicability has not been assessed.';
      if (state.status === 'partial') return 'Partial results. Unavailable layers still need checking.';
      return state.address ? 'Query this address to identify its property boundary, council and mapped zoning.' : 'Choose a NSW street address to query its property boundary and mapped planning data.';
    }
    function definitionList(rows) {
      const list = node('dl', null, 'fsp-attributes'); rows.forEach(([label, copy]) => { list.append(node('dt', label), node('dd', copy)); }); return list;
    }
    function renderSummary() {
      const grid=node('div',null,'fsp-summary-grid');grid.setAttribute('aria-label','Property planning summary');
      const identity=node('section',null,'fsp-summary-group fsp-summary-identity');identity.setAttribute('aria-label','Property record');
      const controls=node('section',null,'fsp-summary-group fsp-summary-controls');controls.setAttribute('aria-label','Mapped planning attributes');
      identity.append(node('h4','Property record','fsp-group-title'));controls.append(node('h4','Mapped planning attributes','fsp-group-title'));
      const cards=[
        {id:'property',title:'Property ID',layer:null,values:state.property?[state.property.id]:[],source:state.property?.sourceUrl},
        {id:'lots',title:'Lot / plan',layer:state.layers.lots,values:state.property?.lotLabels||[],source:state.layers.lots?.sourceUrl||state.property?.sourceUrl},
        ...LAYERS.map(config=>{
          const layer=state.layers[config.id],labels={council:'Council',zoning:'Mapped zone',height:'Mapped height',fsr:'Mapped ratio',lotSize:'Mapped lot size',heritage:'Mapped item / area'};
          const values=layer.status==='ready'?distinct(layer.features.map(feature=>attributeRows(config.id,feature.properties).find(row=>row[0]===labels[config.id])?.[1]).filter(item=>item&&item!=='Not supplied')):[];
          return {id:config.id,title:config.title,layer,values,source:layer.sourceUrl};
        })
      ];
      cards.forEach(card=>{
        const item=node('article',null,'fsp-summary-card');item.dataset.spatialSummary=card.id;
        const available=card.id==='property'?Boolean(state.property):card.layer?.status==='ready'&&card.values.length>0;
        const availability=available?'Official mapped record':card.layer?.status==='ready'?'Value not supplied':card.layer?layerLabel(card.layer):state.status==='loading'?'Querying…':'Not checked';
        item.dataset.dataQuality=available?'verified_official_data':'missing_data';
        item.append(node('h4',card.title),node('p',card.values.length?card.values.join(' · '):card.layer?.status==='empty'?'No features returned':card.layer?.status==='error'?'Unavailable':card.layer?.status==='loading'?'Checking…':card.layer?.status==='ready'?'Value not supplied':'Not checked','fsp-summary-value'),node('span',availability,'fsp-summary-status'));
        if(card.source)item.append(link('Official source',card.source));
        (['property','lots','council'].includes(card.id)?identity:controls).append(item);
      });
      grid.append(identity,controls);
      content.append(grid,node('p','Values describe returned mapped features. Multiple zoning intersections, empty results and missing values need review; none establishes permission or an absence of restrictions.','fsp-summary-note'));
      const zoneCodes=distinct(state.layers.zoning.features.map(feature=>value(feature.properties,'SYM_CODE')));
      if(state.layers.zoning.status==='ready'&&zoneCodes.length>1)content.append(node('p','Multiple zoning intersections: '+zoneCodes.join(' / ')+'. Boundary alignment and the applicable written provisions need review before applying a zone to the whole property.','fsp-warning'));
    }
    function renderChain(parent=content) {
      const chain = node('ol', null, 'fsp-chain'); chain.setAttribute('aria-label', 'Official property query chain');
      const council = state.layers.council, zoning = state.layers.zoning;
      [['Address', state.address ? 'Selected' : 'Choose an address', Boolean(state.address)], ['Property / lot', state.property?.id ? 'Property ' + state.property.id : state.propertyCandidates.length ? 'Choose a candidate' : 'Not matched', Boolean(state.property?.id)], ['Council', council.status === 'ready' ? council.features.length + (council.features.length === 1 ? ' area returned' : ' areas returned') : layerLabel(council), council.status === 'ready'], ['Land zoning', zoning.status === 'ready' ? distinct(zoning.features.map(feature => value(feature.properties, 'SYM_CODE') || value(feature.properties, 'LAY_CLASS'))).join(' · ') || 'Features returned' : layerLabel(zoning), zoning.status === 'ready']].forEach(([label, copy, available], index) => {
        const item = node('li'); item.dataset.spatialStep = String(index + 1); item.dataset.available = String(available);
        item.append(node('span', String(index + 1), 'fsp-step-number'), node('strong', label), node('small', copy)); chain.append(item);
      });
      parent.append(chain);
    }
    function renderProperty() {
      if (state.match.note&&!state.property) content.append(node('p', state.match.note, 'fsp-match-note'));
      if (state.match.status === 'point_candidate' || state.match.status === 'ambiguous') content.append(node('p', 'A spatial candidate is not an address-to-property identity check. Confirm the property before relying on its mapped controls.', 'fsp-warning'));
      if (state.propertyCandidates.length && !state.property?.id) {
        const box = node('fieldset', null, 'fsp-candidates'); box.append(node('legend', 'Choose a property candidate'));
        state.propertyCandidates.forEach(candidate => { const choose = action(candidate.label || 'Property ' + candidate.id, () => { if (typeof callbacks.onCandidate === 'function') callbacks.onCandidate(candidate.id); }); choose.dataset.propertyCandidate = candidate.id; box.append(choose); });
        content.append(box);
      }
      if (!state.property?.id) return;
      if(state.match.status!=='exact_property_id')content.append(node('p','User-selected property candidate. Address, title and unit identity still require verification.','fsp-warning'));
      const box = node('details', null, 'fsp-property'); box.dataset.propertyId = state.property.id;box.dataset.spatialDisclosure='identity';
      const body = node('div', null, 'fsp-disclosure-body');
      const identity = state.match.status === 'exact_property_id' ? 'Address record linked by Property ID' : 'Selected property candidate';
      box.append(node('summary', 'Property matching & boundary'),body);
      body.append(node('h4', identity), definitionList([['Property ID', state.property.id], ['Lot / plan labels', state.property.lotLabels.length ? state.property.lotLabels.join(' · ') : 'Not returned / not verified'], ['Property record last update', dateLabel(state.property.currency)]]));
      if(state.match.note)body.append(node('p',state.match.note,'fsp-match-note'));
      const actions = node('div', null, 'fsp-property-actions');
      if (typeof callbacks.onFit === 'function' && state.mapLayers.property) { const fit = action('Show property boundary', () => callbacks.onFit(), 'fsp-text-button'); fit.dataset.spatialFit = 'true'; actions.append(fit); }
      if (state.property.sourceUrl) actions.append(link('Property source', state.property.sourceUrl));
      if (actions.childElementCount) body.append(actions);
      body.append(node('p', 'Lot labels are returned from the cadastral query. Spatial overlap does not by itself prove title ownership, a unit entitlement or a surveyed boundary.', 'fsp-fine-print'));
      content.append(box);
    }
    function renderMapLayers(parent=content) {
      const available = [['property', 'Property boundary'], ['lots', 'Lot boundaries'], ['zoning', 'Queried zoning features']].filter(([id]) => state.mapLayers[id]);
      if (!available.length || typeof callbacks.onLayer !== 'function') return;
      const box = node('fieldset', null, 'fsp-map-layers'); box.append(node('legend', 'Show on map'));
      available.forEach(([id, label]) => {
        const row = node('label', null, 'fsp-layer-toggle'); const input = node('input'); input.type = 'checkbox'; input.checked = visibility[id]; input.dataset.spatialLayer = id;
        input.addEventListener('change', () => { visibility[id] = input.checked; callbacks.onLayer(id, input.checked); }); row.append(input, node('span', label)); box.append(row);
      });
      box.append(node('p', 'Only features returned for this property are shown. This is not a statewide planning-layer display.', 'fsp-fine-print')); parent.append(box);
      if(state.mapLayers.zoning)box.append(node('p', 'Zoning colours: residential = amber; rural = green; conservation = teal; other codes = purple. These display categories do not indicate permission, risk or official map symbology.', 'fsp-fine-print'));
    }
    function layerLabel(layer) {
      return { ready: 'Features returned', empty: 'No features returned', error: 'Unavailable · retry needed', not_queried: 'Not queried', loading: 'Querying…' }[layer.status];
    }
    function renderLayer(config) {
      const layer = state.layers[config.id], box = node('details', null, 'fsp-layer'); box.dataset.spatialCategory = config.id;
      const summary = node('summary'); summary.append(node('span', config.title), node('small', layerLabel(layer))); box.append(summary);
      const detail = node('div', null, 'fsp-layer-detail fsp-disclosure-body');
      if (layer.status === 'empty') detail.append(node('p', 'No ' + config.noun + ' were returned for this query. This does not confirm that the land is unrestricted or unaffected.', 'fsp-warning'));
      if (layer.status === 'error') detail.append(node('p', 'The service did not return a usable result. This layer remains unknown; other available results can still be reviewed.', 'fsp-warning'));
      if (layer.status === 'not_queried') detail.append(node('p', 'This layer has not been queried. No property-specific result is available.', 'fsp-fine-print'));
      if (layer.status === 'loading') detail.append(node('p', 'Waiting for the official service…', 'fsp-fine-print'));
      if (layer.note) detail.append(node('p', layer.note, 'fsp-match-note'));
      if (layer.queryBasis) detail.append(node('p', layer.queryBasis === 'property_polygon' ? 'Query basis: property polygon. Returned features may represent partial overlaps; their extent and applicability need review.' : 'Query basis: address point only. This does not assess the whole property or split controls.', 'fsp-query-basis'));
      if (layer.status === 'ready') {
        if (!layer.features.length) detail.append(node('p', 'The response contains no displayable features. Check the source before making any inference.', 'fsp-warning'));
        if (config.id === 'zoning' && distinct(layer.features.map(feature => value(feature.properties, 'SYM_CODE'))).length > 1) detail.append(node('p', 'Multiple zone codes intersect the queried geometry. Do not apply one zone to the whole property; small boundary overlaps and split zoning require confirmation.', 'fsp-warning'));
        layer.features.forEach((feature, index) => {
          const record = node('article', null, 'fsp-feature'); record.dataset.spatialFeature = text(feature.properties.OBJECTID, 100) || String(index);
          if (layer.features.length > 1) record.append(node('h5', 'Returned feature ' + (index + 1)));
          record.append(definitionList(attributeRows(config.id, feature.properties))); detail.append(record);
        });
      }
      if (layer.sourceUrl) detail.append(link('Open official ' + config.title.toLowerCase() + ' layer', layer.sourceUrl));
      if (layer.retrievedAt) detail.append(node('p', 'Retrieved: ' + dateLabel(layer.retrievedAt, true), 'fsp-fine-print'));
      box.append(detail); content.append(box);
    }
    function renderProvenance() {
      const details = node('details', null, 'fsp-provenance'); details.dataset.spatialProvenance = 'true'; details.append(node('summary', 'Sources, currency & limits'));
      const body = node('div', null, 'fsp-disclosure-body'); details.append(body);
      renderChain(body);
      if (state.retrievedAt) body.append(node('p', 'Query retrieved: ' + dateLabel(state.retrievedAt, true), 'fsp-fine-print'));
      body.append(node('p', 'Retrieval time records when this website queried a service. Record currency and last-update fields describe the returned source records; none is an independent check of the current law.', 'fsp-fine-print'));
      body.append(node('p', 'SIX source geometry uses Web Mercator; EPI planning geometry uses GDA94. Queries request WGS84 output for display. Official server default datum transformations are used; this is not survey precision.', 'fsp-fine-print'));
      body.append(node('p', '© State of NSW (Spatial Services / Department of Customer Service; Department of Planning, Housing and Infrastructure). Selected and displayed by 1stprincipleai. Source geometry is reprojected for display; zone colours distinguish categories and are not official symbology.', 'fsp-fine-print'));
      body.append(link('Property data · CC Attribution 3.0', 'https://data.nsw.gov.au/data/dataset/nsw-property-web-service'),link('Cadastre data · CC Attribution 3.0', 'https://www.data.nsw.gov.au/data/dataset/nsw-cadastre-web-service'),link('Council data · CC Attribution', 'https://data.nsw.gov.au/data/dataset/lpi-web-services-nsw-administrative-boundaries'),link('Planning data · CC Attribution', 'https://www.data.nsw.gov.au/data/dataset/environment-planning-instrument-local-environmental-plan-land-zoning'));
      body.append(node('p', 'Spatial overlap, a mapped attribute and the legal requirements for a specific development are separate questions. This panel has not assessed legal applicability or determined a DA / CDC pathway.', 'fsp-fine-print'));
      body.append(node('p', 'Base-map labels and transport icons are background context. Flood, bushfire and other hazards are not assessed by an empty or missing planning-layer result.', 'fsp-fine-print'));
      content.append(details);
    }
    function update(input) {
      const next = normalize(input), nextSignature = JSON.stringify(next);
      if (nextSignature === signature) return api;
      const sameAddress = next.address === state.address;
      const sameProperty = contextKey(next) === contextKey(state);
      disclosures?.capture(content, contextKey(state), disclosureId);
      // A refresh temporarily removes the returned property object. Carry only
      // disclosure choices through that loading context, never property facts.
      if(sameAddress&&next.status==='loading'&&!next.property?.id)disclosures?.capture(content,contextKey(next),disclosureId);
      if (!sameAddress || !sameProperty) visibility = { property: true, lots: true, zoning: false };
      if (next.visibleLayers) ['property', 'lots', 'zoning'].forEach(id => { if (typeof next.visibleLayers[id] === 'boolean') visibility[id] = next.visibleLayers[id]; });
      const focused = content.contains(document.activeElement) ? document.activeElement : null;
      const focusKey = focused?.dataset.spatialLayer ? { kind: 'spatialLayer', value: focused.dataset.spatialLayer } : focused?.dataset.propertyCandidate ? { kind: 'propertyCandidate', value: focused.dataset.propertyCandidate } : focused?.dataset.spatialFit ? { kind: 'spatialFit', value: 'true' } : focused?.tagName === 'SUMMARY' ? { kind: 'summary', value: disclosureId(focused.parentElement) } : null;
      state = next; signature = nextSignature;
      shell.dataset.spatialStatus = state.status; shell.dataset.propertyMatch = state.match.status; shell.setAttribute('aria-busy', String(state.status === 'loading'));
      address.textContent = state.address || 'No property selected';
      const queryUnavailable = !state.address || state.status === 'loading' || state.status === 'unsupported' || typeof callbacks.onQuery !== 'function';
      // A disabled focused button is blurred by Chromium. Keep keyboard focus
      // on the persistent visible panel heading before the refresh disables it.
      if(queryUnavailable&&document.activeElement===query)title.focus({preventScroll:true});
      query.disabled = queryUnavailable;
      query.textContent = state.status === 'loading' ? 'Querying official services…' : state.status === 'error' || state.status === 'partial' ? 'Retry official property query' : state.status === 'ready' ? 'Refresh official property data' : 'Query official property data';
      const announcement = statusCopy(); if (lastAnnouncement !== announcement) { status.textContent = announcement; lastAnnouncement = announcement; }
      content.replaceChildren(); renderSummary(); renderProperty();
      const mapControls=node('details',null,'fsp-map-options');mapControls.dataset.spatialDisclosure='map';mapControls.append(node('summary','Map display options'));
      const mapBody=node('div',null,'fsp-disclosure-body');mapControls.append(mapBody);renderMapLayers(mapBody);
      if(mapControls.querySelector('fieldset'))content.append(mapControls);
      if (state.status !== 'idle' && state.status !== 'unsupported') LAYERS.forEach(renderLayer);
      renderProvenance();
      disclosures?.restore(content, contextKey(state), disclosureId);
      if (focusKey && sameAddress) {
        const replacement = [...content.querySelectorAll('input,button,summary')].find(item => focusKey.kind === 'summary' ? item.tagName === 'SUMMARY' && disclosureId(item.parentElement) === focusKey.value : item.dataset[focusKey.kind] === focusKey.value);
        (replacement || query).focus({ preventScroll: true });
      }
      return api;
    }
    function getState() {
      return { status: state.status, address: state.address, propertyId: state.property?.id || null, matchStatus: state.match.status, layerStatuses: Object.fromEntries(LAYERS.map(({ id }) => [id, state.layers[id].status])), availableMapLayers: { ...state.mapLayers }, visibleLayers: { ...visibility }, canAuthorizeProgression: false, legalApplicabilityAssessed: false };
    }
    const api = { update, getState }; root._firstPrincipleSpatialPanel = api; update({}); return api;
  }
  const api = Object.freeze({ init, normalize, LAYERS }); scope.FirstPrincipleSpatialPanel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
