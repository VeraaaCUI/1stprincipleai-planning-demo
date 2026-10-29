/* Public process guidance only. This module never decides planning eligibility. */
(function (scope) {
  'use strict';
  const SOURCES = {
    viewer: { title: "NSW Planning Portal · Property planning layers", url: 'https://www.planningportal.nsw.gov.au/spatialviewer/' },
    council: { title: "NSW Office of Local Government · Council directory", url: 'https://www.olg.nsw.gov.au/public/find-your-local-council' },
    homeowners: { title: "NSW Planning · Homeowner guidance", url: 'https://www.planning.nsw.gov.au/for-homeowners' },
    granny: { title: "NSW Planning · Granny flats", url: 'https://www.planning.nsw.gov.au/the-planning-system/development-assessment/planning-approval-pathways/development-types/granny-flats' },
    cdc: { title: 'NSW Planning · Complying development', url: 'https://www.planning.nsw.gov.au/the-planning-system/development-assessment/planning-approval-pathways/complying-development' },
    trees: { title: "NSW Planning · Tree removal and protection", url: 'https://www.planning.nsw.gov.au/the-planning-system/development-assessment/planning-approval-pathways/development-types/tree-removal-and-protection' },
    business: { title: "NSW Planning · Home-based enterprises", url: 'https://www.planning.nsw.gov.au/the-planning-system/development-assessment/planning-approval-pathways/development-types/home-based-enterprises' },
    hawkesbury: { title: "Hawkesbury Council · Official website", url: 'https://www.hawkesbury.nsw.gov.au/' },
    hawkesburyTrees: { title: "Hawkesbury Council · Trees on private property", url: 'https://www.hawkesbury.nsw.gov.au/your-spaces/tree-removal/tree-removal-on-private-property' }
  };
  const TOPICS = [
    { id: 'secondary', label: "Secondary dwelling / Granny flat", pattern: /granny|secondary\s*dwelling|附属住宅|次住宅|副住宅|两居|祖母房/i,
      steps: ["Clarify whether the proposal is a self-contained dwelling, its relationship to the main home and the full scope of work.", "Gather the address or lot details, current photos, a sketch and floor-area measurements. Then check zoning, title restrictions and site risks.", "Ask a planner and certifier to review the applicable documents for a DA or CDC pathway. Selecting a map area does not establish eligibility."],
      missing: ["Specific lot and existing main dwelling", "Proposed dimensions, floor area and setbacks", "Applicable planning documents and a named professional review"], sources: ['granny', 'viewer'] },
    { id: 'trees', label: "Trees and vegetation", pattern: /tree|arbor|vegetation|砍树|树木|剪树|移树|植被/i,
      steps: ["Record the tree species, location, size, condition and reasons for removal or pruning.", "Check the selected council's local tree protection controls and permit process.", "If building work, heritage or ecological constraints are involved, obtain the relevant professional review before deciding on further applications."],
      missing: ["Tree identification and site photos", "Local tree protection controls", "Scope of the proposed work"], sources: ['trees', 'viewer'] },
    { id: 'bushfire', label: "Bushfire and access", pattern: /bush\s*fire|bushfire|\bbal\b|山火|林火|防火/i,
      steps: ["Check official planning layers and site certificates to establish whether further bushfire investigation is needed.", "Gather the building location, access arrangements, water supply details and proposed design.", "Ask a relevant professional to assess building and access conditions. An absent map flag or a nearby case does not rule out risk."],
      missing: ["Current site risk information", "Building and access locations", "Specialist assessment and design response"], sources: ['viewer', 'homeowners'] },
    { id: 'flood', label: "Flooding and drainage", pattern: /flood|stormwater|drain|洪水|水灾|排水|积水/i,
      steps: ["Check the selected council's flood and drainage information against the specific location of the proposed work.", "Gather the survey, proposed levels, drainage design and any certificates already obtained.", "Ask the council or a water or civil engineering professional whether further assessment is needed. A postcode or council area does not establish an individual site's safety."],
      missing: ["Flood information for the specific property", "Survey and proposed levels", "Drainage information and specialist review"], sources: ['viewer', 'homeowners'] },
    { id: 'business', label: "Home-based business", pattern: /business|cafe|café|food|shop|营业|经营|咖啡|餐饮|食品|生意/i,
      steps: ["Describe the business activity, operating arrangements, people, equipment, traffic and noise.", "Check with the selected council about planning, health, fire safety and other registration processes for the activity.", "Confirm the required process using the actual activity and site. The label 'home-based business' alone is not enough."],
      missing: ["Specific business activity and scale", "Site use and potential impacts", "Local approval and registration requirements"], sources: ['business', 'viewer'] },
    { id: 'pathway', label: "DA / CDC pathway", pattern: /\bcdc\b|\bda\b|approv|permit|approval|申请|审批|许可|能建|可以建/i,
      steps: ["Define the full development type, existing buildings and all proposed work.", "Check zoning, site constraints and proposal dimensions. Retain the sources and dates checked.", "Ask a planner or certifier to check each pathway requirement. Being unable to use CDC does not establish that a DA will be approved."],
      missing: ["Development type and full scope of work", "Site constraints and proposal evidence", "Applicable rules and professional assessment"], sources: ['cdc', 'viewer'] }
  ];

  function normalize(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ').trim();
  }
  function councilKey(value) {
    return normalize(value).replace(/\b(council|city|shire|municipal|municipality|of)\b/g, '').replace(/\s+/g, ' ').trim();
  }
  function isPilot(feature) {
    const props = feature && feature.properties || feature || {};
    return /\bhawkesbury\b/i.test(String(props.name || '') + ' ' + String(props.council_name || ''));
  }
  function describeLocation(selection) {
    if (!selection) return { level: 'none', title: "No location selected", reason: "Select a council, locality or address." };
    if(isOutsideCoverage(selection))return {level:'low',title:'Low · National result not verified',reason:'Check the returned street number and locality. National results use community mapping; the responsible council and local planning documents are not connected outside NSW.'};
    if (selection.kind === 'address') {
      if (selection.origin === 'saved_case_point') return {level:'low',title:'Low · Saved case location',reason:'Showing the saved case reference point. Live address and council verification is unavailable; confirm the location before relying on it.'};
      if (selection.exact && (selection.council_ids || []).length === 1) return { level: 'high', title: "High · Address and council matched", reason: "The official service returned an exact input match and the address point was checked against the council boundary. This is not a lot survey or a planning conclusion." };
      return { level: 'low', title: "Low · Address needs confirmation", reason: "The service used an approximate or adjusted match, or the council is not uniquely confirmed. Please check the displayed address." };
    }
    if (selection.kind === 'council') return { level: 'high', title: "High · Council area selected", reason: "You have selected an official council area. A specific property has not been located." };
    if (selection.kind === 'place') return { level: 'medium', title: "Medium · Locality area matched", reason: "The suburb or locality area has been located. It may cross council boundaries; use a complete address to confirm." };
    if(selection.kind==='street')return {level:'low',title:'Low · Street reference only',reason:'A street has been located, but the requested street number has not been verified. Enter and check a complete address.'};
    if(selection.kind==='locality')return {level:'low',title:'Low · Locality reference only',reason:'The result identifies a locality, not a particular property. National search results and the responsible authority remain unverified.'};
    return { level: 'low', title: "Low · Postcode area", reason: "A postcode may cover several localities and councils. Select a locality or enter a complete address." };
  }
  function isOutsideCoverage(selection){return Boolean(selection&&(selection.coverage==='outside_nsw'||selection.coverage==='unconfirmed'||selection.state&&selection.state!=='NSW'));}
  function buildGuidance(question, selection, featuresById) {
    const text = String(question || '').trim();
    if(isOutsideCoverage(selection))return {
      questionProvided:Boolean(text),topicLabels:['Location search only'],location:describeLocation(selection),planningConfidence:'low',planningConfidenceLabel:'Low · Local planning content not connected',planningConfidenceReason:'The location is outside the verified NSW content coverage, or its state remains unconfirmed. Local planning rules and council responsibility have not been connected.',
      steps:['Confirm the full street address, state and responsible planning authority.','Gather the proposed work, site survey and current zoning and constraint information for that jurisdiction.','Ask a local planner or certifier to identify the applicable state and council controls.'],
      missing:['Confirmed address and responsible authority','Local planning and building instruments for this jurisdiction','Current site evidence and professional review'],sources:[],pilot:false,scopeNote:'Australian navigation does not extend NSW planning rules to other states or territories. No local legal assessment is available for this selection.',canAuthorizeProgression:false,professionalVerificationCompleted:false
    };
    const topics = TOPICS.filter(topic => topic.pattern.test(text));
    const selected = selection ? (selection.council_ids || []).map(id => featuresById[id]).filter(Boolean) : [];
    const oneCouncil = selected.length === 1 && !selected[0].properties.is_unincorporated;
    const pilot = oneCouncil && isPilot(selected[0]);
    const unincorporated = selected.some(feature => feature.properties.is_unincorporated);
    const matchedTopics = topics.length ? topics.slice(0, 3) : [{ id: 'general', label: "General project preparation",
      steps: ["Describe what you want to build, alter or operate and the current site conditions.", "Confirm the specific address and responsible council, then gather zoning information, site evidence and a proposal.", "Keep unresolved conditions visible and verify them with the relevant planning or specialist professional."],
      missing: ["Specific address and responsible authority", "Development type and scope of work", "Site evidence and professional review"], sources: ['homeowners', 'viewer'] }];
    const sourceKeys = [...new Set(matchedTopics.flatMap(topic => topic.sources))];
    if (!oneCouncil) sourceKeys.push('council');
    if (pilot) sourceKeys.push('hawkesbury');
    if (pilot && topics.some(topic => topic.id === 'trees')) sourceKeys.push('hawkesburyTrees');
    return {
      questionProvided: Boolean(text), topicLabels: matchedTopics.map(topic => topic.label),
      location: describeLocation(selection), planningConfidence: 'low',
      planningConfidenceLabel: "Low · Planning evidence incomplete",
      planningConfidenceReason: "The property's applicable rules, full proposal and professional sign-off have not been verified. These are preparation steps and contact sources, not a buildability assessment.",
      steps: [...new Set(matchedTopics.flatMap(topic => topic.steps))],
      missing: [...new Set(matchedTopics.flatMap(topic => topic.missing))],
      sources: [...new Set(sourceKeys)].map(key => SOURCES[key]), pilot,
      scopeNote: unincorporated ? "The selected area includes unincorporated land. The responsible authority needs further confirmation." : !oneCouncil ? "The responsible council is not uniquely confirmed. Complete the location check first." : pilot ? "A development case walkthrough is available for Hawkesbury. This location still needs its own assessment; historical outcomes cannot be applied to it." : "This council can be located on the map. Its professionally confirmed rule pack is not yet connected; the following is general NSW preparation guidance.",
      canAuthorizeProgression: false, professionalVerificationCompleted: false
    };
  }

  const ROAD_TYPES = ['Street','St','Road','Rd','Avenue','Ave','Drive','Dr','Lane','Court','Ct','Crescent','Cr','Cres','Parade','Pde','Place','Pl','Highway','Hwy','Terrace','Tce','Circuit','Cct','Close','Cl','Way','Boulevard','Bvd','Esplanade','Esp','Walk','Track','Trk'];
  function parseAddress(value) {
    let text = String(value || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s+Australia$/i, '').replace(/\s+NSW\b/i, '');
    const match = text.match(new RegExp('^(\\d+[A-Za-z]?(?:-\\d+[A-Za-z]?)?)\\s+(.+?)\\s+(' + ROAD_TYPES.join('|') + ')\\b(?:\\s+(.*?))?(?:\\s+(\\d{4}))?$', 'i'));
    if (!match) return null;
    let suburb = (match[4] || '').trim();
    let postcode = match[5] || '';
    const inSuburb = suburb.match(/(?:^|\s)(\d{4})$/);
    if (inSuburb) { postcode = inSuburb[1]; suburb = suburb.slice(0, inSuburb.index).trim(); }
    if ((!suburb && !postcode) || !match[2].trim()) return null;
    if (postcode && !/^(?:2\d{3}|0(?:8\d{2}|9\d{2}))$/.test(postcode)) return null;
    return { houseNumber: match[1], roadName: match[2].trim(), roadType: match[3], suburb, postCode: postcode, projection: 'EPSG:4326' };
  }
  const api = { SOURCES, TOPICS, normalize, councilKey, isPilot, describeLocation, buildGuidance, parseAddress,isOutsideCoverage };
  scope.LynnCouncilGuidance = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
