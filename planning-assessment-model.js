/* Assessment presentation model. Official mapped facts never establish permission. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FirstPrincipleAssessmentModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const OFFICIAL='verified_official_data', EXAMPLE='prototype_example', REVIEW='unverified_assessment', MISSING='missing_data';
  const PROJECTS=Object.freeze([
    {id:'granny',label:'Secondary dwelling',question:'What should I check before adding a secondary dwelling?'},
    {id:'dual',label:'Dual occupancy',question:'What should I check before developing a dual occupancy?'},
    {id:'storey',label:'Extension',question:'What should I check before extending or adding a second storey?'},
    {id:'pool',label:'Swimming pool',question:'What should I check before building a swimming pool?'},
    {id:'shed',label:'Shed or garage',question:'What should I check before building a shed or garage?'},
    {id:'carport',label:'Carport',question:'What should I check before adding a carport?'},
    {id:'subdiv',label:'Subdivision',question:'What should I check before subdividing this property?'},
    {id:'home',label:'Home business',question:'What should I check before operating a business from home?'},
    {id:'new-home',label:'New home',question:'What should I check before building a new home?'},
    {id:'apartments',label:'Apartments',question:'What should I check before considering apartments here?'},
    {id:'multi-dwelling',label:'Multi-dwelling housing',question:'What should I check before considering multi-dwelling housing?'},
    {id:'manor-house',label:'Manor house',question:'What should I check before considering a manor house?'},
    {id:'other',label:'Other project',question:'What planning information should I check for my project?'}
  ].map(Object.freeze));
  const TITLES=["Whether it's allowed, and how","Every approval you'll need, in order","What could change the answer","Indicative costs and timeframes","What we couldn't check"];
  const unique=values=>[...new Set(values.filter(v=>v!==null&&v!==undefined&&v!==''))];
  const str=value=>value===null||value===undefined?'':String(value);
  function date(value){if(value===null||value===undefined||value==='')return 'Not supplied';const d=new Date(value);return Number.isNaN(d.getTime())?str(value):d.toISOString().slice(0,10);}
  function section(index,status,summary,extra){return {id:['permission','approvals','constraints','costs','missing'][index],title:TITLES[index],status,summary,...extra};}
  function geometryOK(g){
    if(!g||!['Polygon','MultiPolygon'].includes(g.type)||!Array.isArray(g.coordinates)||!g.coordinates.length)return false;
    const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;
    return polygons.every(rings=>Array.isArray(rings)&&rings.length&&rings.every(ring=>Array.isArray(ring)&&ring.length>=4&&ring.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90)&&ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1]));
  }
  function rows(layer){return layer?.status==='ready'&&Array.isArray(layer.features)?layer.features:[];}
  function officialRow(label,value,layer,p){return {label,value:str(value),status:OFFICIAL,sourceUrl:layer?.sourceUrl||null,currency:'Map currency: '+date(p?.CURRENCY_DATE)+' · Queried: '+date(layer?.retrievedAt)};}
  function reviewPaths(){return [
    {label:'Exempt development review',status:REVIEW,detail:'A review topic only. Applicable codes, exclusions and the complete proposal have not been checked.',checks:[{label:'Eligibility',detail:'Requires the current instrument, site exclusions and all relevant standards.',status:MISSING}],steps:[{label:'Verify the proposal',detail:'Confirm the development definition, scope and applicable provisions.'},{label:'Record the review',detail:'A qualified reviewer should document whether this route is available.'}]},
    {label:'Complying development (CDC) review',status:REVIEW,detail:'A possible route to investigate; no CDC eligibility determination has been made.',checks:[{label:'Complete site and design checks',detail:'Zoning alone does not establish eligibility. Title, exclusions, hazards, design and other applicable controls remain unresolved.',status:MISSING}],steps:[{label:'Check all applicable criteria',detail:'Review current legislation and obtain the missing site evidence.'},{label:'Confirm with the appropriate certifier',detail:'Confirm whether certification is available and the required documentation.'}]},
    {label:'Development application (DA) review',status:REVIEW,detail:'A possible route to investigate; consent permissibility and the consent authority still need verification.',checks:[{label:'Permission with consent',detail:'Check the land-use table, applicable SEPPs, mapped provisions and proposal-specific requirements.',status:MISSING}],steps:[{label:'Confirm permissibility and authority',detail:'Resolve the land-use definition, applicable controls and consent authority.'},{label:'Agree the application scope',detail:'Confirm reports, referrals and application requirements with the relevant authority.'},{label:'Confirm later approvals',detail:'Construction, occupation or other approvals must be determined for this proposal, if applicable.'}]}
  ];}
  function realModel(input,base){
    const loc=input.location||null, raw=input.spatial;
    const supported=Boolean(loc&&loc.state==='NSW'&&loc.kind==='address'&&loc.precision==='address_point');
    const associated=Boolean(supported&&raw&&raw.address===loc.name&&(!loc.propertyId||!raw.property||str(loc.propertyId)===str(raw.property.id)));
    const spatial=associated?raw:null;
    const property=spatial?.property&&geometryOK(spatial.property.feature?.geometry)?spatial.property:null;
    const layers=property?spatial.layers||{}:{};
    const zones=unique(rows(layers.zoning).map(f=>f.properties?.SYM_CODE));
    const councils=unique(rows(layers.council).map(f=>f.properties?.COUNCILNAME||f.properties?.LGANAME));
    const official=[];
    if(property){
      official.push(officialRow('NSW Property ID',property.id,{sourceUrl:property.sourceUrl,retrievedAt:spatial.retrievedAt},null));
      official.push(officialRow('Lot / plan labels',(property.lotLabels||[]).join(' · ')||'Not returned',{sourceUrl:layers.lots?.sourceUrl||property.sourceUrl,retrievedAt:spatial.retrievedAt},null));
      rows(layers.council).forEach(f=>official.push(officialRow('Council intersection',f.properties?.COUNCILNAME||f.properties?.LGANAME,layers.council,f.properties)));
      rows(layers.zoning).forEach(f=>{const p=f.properties||{};official.push(officialRow('Land zoning',[p.SYM_CODE,p.LAY_CLASS,p.EPI_NAME].filter(Boolean).join(' · '),layers.zoning,p));});
    }
    const controls=[];
    rows(layers.height).forEach(f=>{const p=f.properties||{},v=p.MAX_B_H_M??p.MAX_B_H;controls.push(officialRow('Mapped height',v===null||v===undefined?'Value not supplied':str(v)+' '+(p.UNITS||'m'),layers.height,p));});
    rows(layers.fsr).forEach(f=>{const p=f.properties||{};controls.push(officialRow('Mapped floor space ratio',p.FSR??p.FSR_RATIO??p.MAX_FSR??'Value not supplied',layers.fsr,p));});
    rows(layers.lotSize).forEach(f=>{const p=f.properties||{};controls.push(officialRow('Mapped minimum lot size',p.LOT_SIZE===null||p.LOT_SIZE===undefined?'No numeric value returned':str(p.LOT_SIZE)+' '+(p.UNITS||''),layers.lotSize,p));});
    rows(layers.heritage).forEach(f=>{const p=f.properties||{};controls.push(officialRow('Mapped heritage feature',[p.H_NAME||p.ITEM_NAME||p.HERITAGE_NAME||p.NAME,p.H_ID||p.ITEM_NO||p.HERITAGE_ID,p.SIG||p.SIGNIFICANCE].filter(Boolean).join(' · ')||'Feature returned; view official attributes',layers.heritage,p));});
    const gaps=[
      {label:'Current permissibility and approval route',reason:'The current legislative text, land-use definition, exclusions and full design have not been assessed.',how:'Planner or certifier to verify the applicable LEP, SEPPs and other provisions for the actual proposal.',status:MISSING},
      {label:'Survey, title and existing buildings',reason:'An official mapped polygon is not a registered survey, title search, easement check or measured building plan.',how:'Provide a recent detail survey, title documents and existing / proposed drawings.',status:MISSING},
      {label:'Bushfire, flooding and other hazards',reason:'These hazard services and council-specific studies have not been integrated. No absence of risk is inferred.',how:'Check the official hazard sources and applicable council studies; obtain specialist assessment where indicated.',status:MISSING},
      {label:'Site layout and buildable area',reason:'Setbacks, levels, trees, services, access and design constraints have not been resolved.',how:'A designer and relevant specialists should establish the site envelope from verified evidence.',status:MISSING},
      {label:'Fees, professional quotes and construction budget',reason:'No current fee schedule, detailed scope or verified supplier quotes have been attached.',how:'Confirm the authority, fee schedule date, scope, taxes, exclusions and quotes before preparing a budget.',status:MISSING},
      {label:'Comparable applications and timeframes',reason:'No verified matched DA dataset, document links or comparable cohort has been attached to this address.',how:'Add official case records with proposal, outcome, dates, council and matching rationale.',status:MISSING}
    ];
    if(!property)gaps.unshift({label:'Verified property chain',reason:!supported?'Select a NSW street-number address to query official property data.':!associated?'No current GIS result is associated with the selected address.':'The property is unresolved or its polygon was not returned.',how:'Query official property data and resolve any candidate or service error before relying on mapped controls.',status:MISSING});
    if(property)Object.entries({council:'Council',zoning:'Zoning',height:'Height',fsr:'FSR',lotSize:'Minimum lot size',heritage:'Heritage'}).forEach(([id,label])=>{
      const layer=layers[id];if(layer?.status!=='ready')gaps.push({label:label+' map coverage',reason:layer?.status==='empty'?'This query returned no feature. That does not establish that no other control applies.':'This layer is '+(layer?.status||'not queried')+'.',how:'Review the official source, map coverage and applicable written provisions.',status:MISSING});
    });
    const contextNote=!loc?'Choose a property above. You can explore project types before entering an address.':!supported?'NSW planning assessment is unavailable for this location selection.':property?'Official mapped context is available. The legal assessment remains incomplete.':'The address is selected; the official property chain still needs verification.';
    return {...base,context:{address:loc?.name||'No property selected',hasLocation:Boolean(loc),councilNames:councils,propertyId:property?.id||null,lotLabels:property?.lotLabels||[],gisStatus:spatial?.status||(!supported&&loc?'unsupported':'idle')},
      evidence:{associated,propertyVerified:Boolean(property),zones,sourceStatus:property?OFFICIAL:MISSING,legalApplicabilityAssessed:false},
      permission:{status:REVIEW,determination:null},status:{label:'Assessment not verified',confidence:'low',note:contextNote},
      sections:[
        section(0,REVIEW,'Permission has not been determined for this '+base.project.label.toLowerCase()+'. Mapped zoning describes an intersection with a planning map; it does not establish that the proposal is permitted or eligible for a particular route.',{official,items:zones.length>1?[{label:'Multiple zoning intersections',detail:'Returned codes: '+zones.join(' / ')+'. Review boundary alignment and the applicable written provisions before interpreting this as a split-zone site.',status:REVIEW}]:[]}),
        section(1,REVIEW,'This is the order of review, rather than a confirmed sequence of approvals. Establish the available route before preparing or lodging an application.',{pathways:supported?reviewPaths():[],items:!supported?[{label:'Select a NSW address',detail:'The current regulatory integration covers NSW only.',status:MISSING}]:[]}),
        section(2,REVIEW,'Mapped attributes are shown as returned by the official services. Their legal applicability, exceptions and relationship to the design still need assessment.',{official:controls,items:[{label:'Hazards and title restrictions',detail:'Bushfire, flooding, easements, trees, services and access remain unchecked. A zoning or heritage query is not a complete constraints assessment.',status:MISSING}],sketch:property?{kind:'parcel',label:'Official mapped property outline',note:'NSW Spatial Services polygon only. No building, setback, survey boundary or buildable area is inferred.',geometry:property.feature.geometry}:null}),
        section(3,MISSING,'A reliable cost or duration estimate cannot yet be calculated for this property. No sample-lot budget or historical average has been applied.',{costs:[{label:'Authority fees',amount:'Not calculated',basis:'Requires the applicable current schedule and proposal value / scope.'},{label:'Reports and design',amount:'Quotes needed',basis:'Requires an agreed application scope and specialist requirements.'},{label:'Construction and contingency',amount:'Not estimated',basis:'Requires design, site conditions and supplier estimates.'}],timing:null,comparables:[]}),
        section(4,MISSING,'These are the evidence gaps to resolve before relying on a site-specific planning conclusion.',{missing:gaps})
      ],canContinue:Boolean(loc)};
  }
  function exampleSketch(lot,answer,optionId){
    if(!lot)return null;
    let candidate=null;
    if(answer?.project&&['granny','pool','shed'].includes(answer.project.kind)){
      const sizes={granny:[10,6],pool:[8,4],shed:[6,6]},size=sizes[answer.project.kind];
      const house=lot.house||{},end=(house.x||0)+(house.d||0);
      const breadth=lot.shape==='battleaxe'?lot.body?.w||lot.frontage:lot.frontage;
      candidate={x:end+1,y:Math.max(1,(breadth-size[1])/2),w:size[0],d:size[1]};
      if(optionId==='attached')candidate.x=end;
      if(optionId==='beside'){candidate.x=house.x||0;candidate.y=(house.y||0)+(house.w||0)+1;}
    }
    return {kind:'example',label:'Illustrative sample layout',note:'Fictional dimensions and assumed footprints, in metres. Placement is an interaction example, not a buildable envelope or compliance calculation. No verified setbacks are drawn.',lot:{shape:lot.shape,depth:lot.depth,frontage:lot.frontage,body:lot.body,handle:lot.handle,house:lot.house,features:lot.features},candidate,envelope:null,fit:{status:'uncertain',label:'Siting and compliance not assessed',margin:null},geometry:null};
  }
  function exampleModel(input,base,examples){
    const lot=examples?.lots?.find(l=>l.id===base.selection.sampleId),answer=examples?.assessments?.[lot?.id]?.[base.selection.projectId];
    const opts=answer?.toggle?.opts||[];base.selection.optionId=opts.some(o=>o.k===input.optionId)?input.optionId:opts[0]?.k||'';
    base.choices.options=opts.map(o=>({id:o.k,label:o.t}));
    const sourceNote='Engineer-provided prototype example. Claims, dimensions, costs and case summaries are unverified and apply only to this fictional composite lot.';
    const project=examples?.projects?.find(p=>p.id===base.selection.projectId),stat=examples?.statistics?.[project?.statKey];
    const items=(lot?.constraints||[]).map(c=>({label:c.k,detail:c.v,status:EXAMPLE}));
    const costs=(answer?.pros||[]).map(row=>({label:row[0],amount:row[1],basis:'Unverified prototype allowance; scope, tax, fee date and exclusions not established.'}));
    if(answer?.project?.cost)costs.unshift({label:'Assumed project value',amount:new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(answer.project.cost),basis:'Static prototype assumption; not a quote or calculated estimate.'});
    const missing=[...(examples?.missing?.[lot?.id]||[]),...(examples?.projectMissing?.[base.selection.projectId]?[examples.projectMissing[base.selection.projectId]]:[])].map(m=>({label:m.title,reason:m.context,how:m.nextAction,status:EXAMPLE}));
    missing.unshift({label:'Official verification of this example',reason:'No real Property ID, surveyed title or source-linked legal review is attached to this composite lot.',how:'Do not transfer this result to a searched address. Query that property and verify its own evidence.',status:MISSING});
    const checklist=(answer?.checklist||[]).map(row=>({label:row[0],detail:row[1],status:EXAMPLE}));
    return {...base,context:{address:lot?'Sample lot '+lot.id+' · '+lot.chip:'No sample available',councilNames:[],propertyId:null,lotLabels:[],gisStatus:'example'},evidence:{associated:false,propertyVerified:false,zones:[],sourceStatus:EXAMPLE,legalApplicabilityAssessed:false},permission:{status:EXAMPLE,determination:null},status:{label:'Prototype example',confidence:'low',note:sourceNote},sections:[
      section(0,EXAMPLE,answer?sourceNote:'This project type has no engineer-supplied example. Return to your property to organise its evidence gaps.',{items:answer?[{label:'Original example conclusion — unverified',detail:answer.head,status:EXAMPLE},{label:'Original example reasoning — unverified',detail:answer.why,status:EXAMPLE}]:[],official:lot?[{label:'Assumed sample zoning',value:lot.zone,status:EXAMPLE},{label:'Assumed sample area',value:lot.area+' m²',status:EXAMPLE}]:[]}),
      section(1,EXAMPLE,'The original pathway functions have been omitted because their eligibility and fee assumptions have not been verified. This checklist demonstrates how preparation items can be organised; it is not an approved lodgement sequence.',{items:checklist.length?checklist:[{label:'Detailed sequence not supplied',detail:'This scenario contains a short example answer only. Its approval and documentation requirements remain unresolved.',status:MISSING}],pathways:[]}),
      section(2,EXAMPLE,'These are the prototype’s assumed conditions and a schematic layout. They are not official hazard findings, surveyed dimensions or an approval.',{items,sketch:exampleSketch(lot,answer,base.selection.optionId)}),
      section(3,EXAMPLE,'Illustrative allowances and historical aggregates from the supplied prototype. They are not an estimate or forecast for your property.',{costs,timing:stat?{...stat,note:'Unverified engineer aggregate. Returned is shown as a percentage in the original prototype; underlying rows, sampling and date definitions were not supplied. Days are not a forecast or service commitment.'}:null,comparables:(answer?.precedents||[]).map(p=>({reference:p.da,outcome:p.o,summary:p.t,status:EXAMPLE,sourceUrl:null}))}),
      section(4,MISSING,'The example illustrates how to explain missing evidence and who can help resolve it. Each claim still needs its own source verification.',{missing})
    ],canContinue:false};
  }
  function build(input={},examples){
    const project=PROJECTS.find(p=>p.id===input.projectId)||PROJECTS[0];
    const mode=input.mode==='example'?'example':'property';
    const lots=examples?.lots||[],sampleId=lots.some(l=>l.id===input.sampleId)?input.sampleId:lots[0]?.id||'A';
    const base={project,selection:{mode,projectId:project.id,sampleId,optionId:str(input.optionId)},choices:{projects:PROJECTS.map(p=>({...p})),samples:lots.map(l=>({id:l.id,label:'Sample '+l.id+' · '+l.chip})),options:[],examplesAvailable:lots.length>0}};
    return mode==='example'?exampleModel(input,base,examples):realModel(input,base);
  }
  return Object.freeze({build,PROJECTS,TITLES:Object.freeze(TITLES)});
});
