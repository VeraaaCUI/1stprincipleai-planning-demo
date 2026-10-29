/* Prepared, cited demonstration analysis. No live LLM or approval decision. */
(function (scope) {
  'use strict';
  const CASE = {
    id: 'CASE-0001', reference: 'TRN-18 · DA0042/25',
    address: '58 Mitchell Drive, Glossodia NSW 2756',
    center: [150.78104647507988, -33.53199023872799],
    council: 'Hawkesbury City Council', geocodeCheckedOn: '2026-10-29',
    question: "We'd like to build a detached two-bedroom granny flat, about 60 m², beside our house for our family's use. We'd rather keep the trees near the front of the block. What planning pathway and site risks should we consider?",
    questionBasis: 'Reconstructed case enquiry, based on historical application material. Not an original client message.',
    addressBasis: 'Case source address, independently matched with NSW Spatial Services on 29 October 2026. The point is not a surveyed building or lot boundary.'
  };
  const SOURCES = [
    {title: 'NSW Planning · Housing SEPP 2021: secondary dwellings', url: 'https://www.planning.nsw.gov.au/the-planning-system/housing/housing-sepp/secondary-dwellings', note: 'Agency guidance updated 17 July 2025; checked 29 October 2026. Instrument year is not a verified consolidation date.'},
    {title: 'NSW Planning · Granny flats: DA and CDC pathways', url: 'https://www.planning.nsw.gov.au/the-planning-system/development-assessment/planning-approval-pathways/development-types/granny-flats', note: 'Agency guidance updated 23 March 2026; checked 29 October 2026.'},
    {title: 'NSW RFS · Check bush fire prone land', url: 'https://www.rfs.nsw.gov.au/plan-and-prepare/building-in-a-bush-fire-area/planning-for-bush-fire-protection/bush-fire-prone-land/check-bfpl', note: 'Current designation still needs checking. Mapping is not a site risk assessment.'},
    {title: 'NSW Planning Portal · Current property planning layers', url: 'https://www.planningportal.nsw.gov.au/spatialviewer/', note: 'Check zoning, overlays and the actual works location.'},
    {title: 'Hawkesbury Council · Trees on private property', url: 'https://www.hawkesbury.nsw.gov.au/your-spaces/tree-removal/tree-removal-on-private-property', note: 'Check local tree controls and whether an arborist assessment is needed.'}
  ];
  function caseMatches(selection) {
    if (!selection || selection.kind !== 'address' || !Array.isArray(selection.center)) return false;
    const near = Math.abs(selection.center[0] - CASE.center[0]) < 0.0003 && Math.abs(selection.center[1] - CASE.center[1]) < 0.0003;
    const named = /\b58\b.*mitchell\s+(?:drive|dr)\b.*glossodia/i.test(selection.name || '');
    return near && named;
  }
  function buildReport(question, selection, byId) {
    const G = scope.LynnCouncilGuidance;
    const guidance = G.buildGuidance(question, selection, byId);
    const isCase = caseMatches(selection);
    const secondary = /granny|secondary\s*dwelling|附属住宅|次住宅|副住宅|祖母房/i.test(question || '');
    const ids = selection?.council_ids || [];
    const confirmedCaseAuthority = ids.length === 1 && G.isPilot(byId[ids[0]]);
    const outsideCoverage=G.isOutsideCoverage(selection);
    const contextualCase = !outsideCoverage && isCase && secondary && confirmedCaseAuthority && (selection.exact || selection.origin === 'saved_case_point');
    const councilNames = outsideCoverage?[]:ids.map(id => byId[id]).filter(Boolean).map(feature => feature.properties.council_name || feature.properties.name);
    let summary;
    if(outsideCoverage){
      summary='This location can be explored on the Australian map, but local council and planning-law content is currently connected only for NSW. Confirm the complete address and responsible authority, then ask a local planner or certifier to check the relevant state and council controls for your proposal. No permission, approval pathway or site-risk conclusion can be provided from this demo for the selected location.';
    } else if (contextualCase) {
      summary = 'The NSW Housing SEPP 2021 provides a pathway for secondary dwellings on qualifying residential land, subject to the applicable requirements; it does not establish that this proposal is permitted at this address. Historical CASE-0001 records indicate R2 zoning, bushfire and biodiversity constraints, so a planner or certifier should check current controls and obtain bushfire and tree advice where triggered. Current planning certificates, title restrictions, specialist reports and key design measurements remain unverified, so DA or CDC eligibility cannot yet be confirmed.';
    } else if (secondary && ids.length === 1) {
      summary = 'NSW guidance on the Housing SEPP 2021 allows secondary dwellings to be considered on qualifying residential land, with DA or CDC depending on all applicable requirements. Confirm this property’s current zoning, existing dwelling, full works, floor area and title, then screen bushfire, flood, biodiversity and tree constraints. A planner or certifier should confirm the pathway and any specialist assessments before detailed pricing or application preparation.';
    } else {
      summary = 'This enquiry needs a property-specific check before a planning conclusion can be made. ' + guidance.steps.slice(0, 2).join(' ') + ' The connected information does not establish permission or rule out site risks.';
    }
    if (!selection || selection.kind !== 'address' || !selection.exact) summary += ' Confirm the exact address and responsible authority before relying on a site-specific assessment.';
    const missing = contextualCase ? [
      'Current zoning and planning certificate; confirm any site exclusions or overlays.',
      'Current title and restrictions; existing dwelling and full scope of work.',
      'Bushfire report, building and access assessment; current bushfire-prone designation.',
      'Arborist advice and biodiversity review where triggered; flood and drainage information.',
      'Consistent survey, floor-area and setback measurements; named professional review.'
    ] : guidance.missing;
    const risks = contextualCase ? [
      {label:'Bushfire',state:'Historical indication',detail:'Case indices refer to mapped bushfire-prone land. The full specialist report is missing; current mapping, building, access and water requirements need review.',evidence:'EV-0010 / EV-0006 / EV-0012'},
      {label:'Trees & biodiversity',state:'Historical indication',detail:'Historical records identify trees and biodiversity mapping. The arborist report is missing; check the proposed works footprint and tree protection.',evidence:'EV-0006 / EV-0013'},
      {label:'Flood & title',state:'Unresolved',detail:'The current planning certificate and title search have not been verified. Historical statements cannot establish no flood risk or no title restrictions.',evidence:'EV-0006 / EV-0004'},
      {label:'Design measurements',state:'Conflicting records',detail:'Source measurements use different definitions or versions. Do not choose a floor-area, lot-area or setback value before checking the originals.',evidence:'EV-0001 / EV-0003 / EV-0006'}
    ] : [];
    return {
      caseId: contextualCase ? CASE.id : null, summary, confidence: 'low',
      confidenceLabel:outsideCoverage?'Low · Local planning content not connected':'Low · Site and proposal evidence incomplete',
      confidenceReason:'Location confidence identifies a place. Planning confidence remains Low because current controls, original evidence and professional review are incomplete; it is not an approval probability.',
      mode:contextualCase ? 'AI-prepared case preview' : 'Prepared guidance preview',
      modeNote:'This demo uses a prepared evidence summary and local topic matching. Live AI analysis and professional sign-off are not connected.',
      preparedOn:'2026-10-29', location:{name:selection?.name || 'Location not confirmed',kind:selection?.kind || 'none',councilNames,address:selection?.kind === 'address' ? selection.name : null},
      question:String(question || '').trim(), missing, risks,
      sources:outsideCoverage?[]:secondary ? (contextualCase ? SOURCES : SOURCES.slice(0,4)) : guidance.sources,
      evidenceNote:contextualCase ? 'Historical case indications are shown as later-file context, not facts verified at the initial enquiry. Evidence IDs refer to the supplied index; original documents have not been independently checked.' : guidance.scopeNote,
      canAuthorizeProgression:false, professionalVerificationCompleted:false
    };
  }
  const api = {CASE,SOURCES,caseMatches,buildReport};
  scope.FirstPrincipleReport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
