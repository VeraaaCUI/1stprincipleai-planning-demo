/* Render-only planning assessment. The model owns all facts, assumptions and rules. */
(function (scope) {
  'use strict';
  const TITLES = ["Whether it's allowed, and how", 'Approval pathways', 'Planning constraints', 'Indicative costs and timeframes', "What we couldn't check"];
  const QUALITIES = Object.freeze({verified_official_data:'Verified official data',prototype_example:'Prototype example',unverified_assessment:'Unverified assessment',missing_data:'Missing data'});
  const array = value => Array.isArray(value) ? value : [];
  const text = (value,max=1800) => typeof value==='string'||typeof value==='number' ? String(value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max) : '';
  const number = value => typeof value==='number'&&Number.isFinite(value) ? value : null;
  function sourceUrl(value) { try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch(_){return '';} }
  function el(tag,copy,cls){const node=document.createElement(tag);if(copy!==null&&copy!==undefined)node.textContent=copy;if(cls)node.className=cls;return node;}
  function svg(tag,attrs={}){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,String(value)));return node;}
  function external(copy,value){const url=sourceUrl(value);if(!url)return null;const a=el('a',copy,'fpa-source');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.title='Opens source in a new tab';return a;}
  function badge(status){const key=Object.hasOwn(QUALITIES,status)?status:'unverified_assessment';const node=el('span',QUALITIES[key],'fpa-quality');node.dataset.dataQuality=key;return node;}
  function action(copy,control,callback,primary=false){const button=el('button',copy,'fpa-button'+(primary?' fpa-primary':''));button.type='button';button.dataset.assessmentControl=control;button.addEventListener('click',callback);return button;}
  function safeSelection(model){const selection=model?.selection||{};return{mode:selection.mode==='example'?'example':'property',projectId:text(selection.projectId,100),sampleId:text(selection.sampleId,100),optionId:text(selection.optionId,100)};}
  function rangeRect(item,house=false){
    if(!item||typeof item!=='object')return null;
    if(['x0','x1','y0','y1'].every(key=>number(item[key])!==null))return{x:item.x0,y:item.y0,w:item.x1-item.x0,h:item.y1-item.y0};
    if(number(item.x)!==null&&number(item.y)!==null){
      const w=number(house?item.d:item.w),h=number(house?item.w:item.d);
      if(w!==null&&h!==null)return{x:item.x,y:item.y,w,h};
    }
    return null;
  }
  function officialRings(input){
    if(!input||typeof input!=='object')return[];
    if(input.type==='FeatureCollection')return array(input.features).flatMap(officialRings);
    if(input.type==='Feature')return officialRings(input.geometry);
    if(input.type==='Polygon')return Array.isArray(input.coordinates)?[input.coordinates]:[];
    if(input.type==='MultiPolygon')return array(input.coordinates);
    return[];
  }
  let mountCount=0;
  function init(root,callbacks={}){
    if(!root)return{update(){},getState(){return{mode:'property',sectionCount:0,canContinue:false};}};
    if(root._firstPrincipleAssessmentView)return root._firstPrincipleAssessmentView;
    let model={},selection=safeSelection(),signature='',renderCount=0;
    const disclosures=scope.FirstPrincipleProgressiveCards?.createDisclosureMemory();
    const disclosureContext=(current,currentSelection)=>[currentSelection.mode,currentSelection.mode==='property'?text(current.context?.address,350)+'|'+text(current.context?.propertyId,100):currentSelection.sampleId,currentSelection.projectId,currentSelection.optionId].join('|');
    const disclosureKey=item=>(item.closest('[data-assessment-section]')?.dataset.assessmentSection||'context')+'|'+item.dataset.assessmentDisclosure;
    const prefix='fpa-'+(++mountCount)+'-';
    const shell=el('section',null,'fpa-assessment');shell.setAttribute('aria-label','Project planning assessment');
    const content=el('div'),announcement=el('p','','fpa-sr-only');announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');announcement.setAttribute('aria-atomic','true');shell.append(content,announcement);root.append(shell);
    function change(patch){if(typeof callbacks.onChange==='function')callbacks.onChange({...selection,...patch});}
    function paragraph(copy,cls='fpa-copy'){return el('p',text(copy),cls);}
    function choiceGroup(legend,items,key){
      const group=el('fieldset',null,'fpa-choice-group');group.append(el('legend',legend));
      const choices=el('div',null,'fpa-choice-grid');
      array(items).forEach(item=>{
        if(!text(item?.id,100))return;
        const button=action(text(item.label,200)||text(item.id,100),key+':'+text(item.id,100),()=>change({[key]:text(item.id,100)}));
        button.setAttribute('aria-pressed',String(selection[key]===text(item.id,100)));choices.append(button);
      });group.append(choices);return group;
    }
    function dropdown(legend,items,key){
      const field=el('div',null,'fpa-select-field'),label=el('label',legend);label.htmlFor=prefix+key;
      const select=el('select');select.id=label.htmlFor;select.dataset.assessmentControl=key;
      array(items).forEach(item=>{if(!text(item?.id,100))return;const option=el('option',text(item.label,200)||text(item.id,100));option.value=text(item.id,100);select.append(option);});
      select.value=selection[key];select.addEventListener('change',()=>change({[key]:select.value}));field.append(label,select);return field;
    }
    function renderSelector(){
      const block=el('section',null,'fpa-selector'),heading=el('h2','Assessment context');heading.id=prefix+'project-title';
      block.setAttribute('aria-labelledby',heading.id);block.append(heading);
      const mode=el('fieldset',null,'fpa-choice-group fpa-mode-group');mode.append(el('legend','Assessment context','fpa-sr-only'));
      const modes=el('div',null,'fpa-mode-options');
      [['property','My selected property'],['example','Prototype examples']].forEach(([id,label])=>{const button=action(label,'mode:'+id,()=>change({mode:id}));button.setAttribute('aria-pressed',String(selection.mode===id));if(id==='example'&&model.choices?.examplesAvailable===false)button.disabled=true;modes.append(button);});mode.append(modes);block.append(mode);
      if(model.choices?.examplesAvailable===false)block.append(paragraph('Prototype examples could not load. Real-property checks remain available. Refresh the page to retry the example data.','fpa-notice'));
      const context=el('details',null,'fpa-context');context.dataset.assessmentContext='true';context.dataset.assessmentDisclosure='context';context.open=selection.mode==='example';
      const contextSummary=el('summary',selection.mode==='example'?'Sample and project options':'Property and project details');contextSummary.dataset.assessmentControl='context-toggle';context.append(contextSummary);
      const contextBody=el('div',null,'fpa-context-body');contextBody.append(choiceGroup('Project type',model.choices?.projects,'projectId'));
      if(selection.mode==='example'){
        const notice=el('div',null,'fpa-example-banner');notice.append(badge('prototype_example'),el('strong','Illustrative lots, separate from your property'),paragraph('Dimensions and layouts are unverified prototype assumptions. They do not assess your address.','fpa-fine'));block.append(notice);
        const examples=el('div',null,'fpa-example-choices');if(array(model.choices?.samples).length)examples.append(dropdown('Illustrative lot',model.choices.samples,'sampleId'));if(array(model.choices?.options).length)examples.append(dropdown('Proposal option',model.choices.options,'optionId'));contextBody.append(examples);
      }else{
        const hasLocation=model.context?.hasLocation===true||(model.context?.hasLocation===undefined&&Boolean(model.context?.propertyId||model.evidence?.propertyVerified));
        const address=hasLocation?text(model.context?.address,350):'';contextBody.append(el('h3',address||'Choose a property'));
        const details=[array(model.context?.councilNames).map(item=>text(item,200)).filter(Boolean).join(' / '),model.context?.propertyId?'Property '+text(model.context.propertyId,100):'',array(model.context?.lotLabels).map(item=>text(item,180)).filter(Boolean).join(' · ')].filter(Boolean);
        if(details.length)contextBody.append(paragraph(details.join(' · '),'fpa-property-meta'));
        if(text(model.context?.gisStatus))contextBody.append(paragraph('Spatial data: '+text(model.context.gisStatus,200),'fpa-fine'));
        contextBody.append(paragraph('Permission and approval pathways need the current rules and project evidence to be reviewed.','fpa-fine'));
        const actions=el('div',null,'fpa-inline-actions');if(typeof callbacks.onViewProperty==='function')actions.append(action(hasLocation?'View property on map':'Choose an address','view-property',()=>callbacks.onViewProperty()));if(hasLocation&&model.context?.gisStatus!=='unsupported'&&typeof callbacks.onQueryGIS==='function')actions.append(action('Refresh official data','query-gis',()=>callbacks.onQueryGIS()));contextBody.append(actions);
        if(array(model.choices?.options).length)contextBody.append(dropdown('Proposal option',model.choices.options,'optionId'));
      }
      context.append(contextBody);block.append(context);content.append(block);
    }
    function renderOfficial(records,parent){
      if(!array(records).length)return;
      const quality=record=>Object.hasOwn(QUALITIES,record?.status)?record.status:selection.mode==='example'?'prototype_example':'unverified_assessment';
      const kinds=[...new Set(array(records).map(quality))],allOfficial=kinds.length===1&&kinds[0]==='verified_official_data',allExample=kinds.length===1&&kinds[0]==='prototype_example';
      const box=el('div',null,'fpa-official');box.append(el('h4',allOfficial?'Official spatial attributes':allExample?'Illustrative sample attributes':'Attribute evidence'));
      kinds.forEach(kind=>box.append(badge(kind)));
      array(records).forEach(record=>{const row=el('div',null,'fpa-official-row'),list=el('dl');row.dataset.attributeQuality=quality(record);list.append(el('dt',text(record.label,200)||'Attribute'),el('dd',text(record.value)||'Not supplied'));row.append(list);if(kinds.length>1)row.append(badge(quality(record)));const source=external(quality(record)==='verified_official_data'?'Official source':'Source reference',record.sourceUrl);if(source)row.append(source);if(record.currency)row.append(paragraph(text(record.currency,300),'fpa-fine'));box.append(row);});
      box.append(paragraph(allOfficial?'These values describe returned mapped features. They do not determine which legal provisions apply to the proposed works.':allExample?'These are unverified assumptions about the illustrative sample lot. They are not official attributes of your searched property.':'Review each attribute’s data-quality label and source. Attribute evidence does not establish legal applicability.','fpa-fine'));parent.append(box);
    }
    function renderItems(items,parent){
      if(!array(items).length)return;const list=el('ul',null,'fpa-item-list');
      array(items).forEach(item=>{const row=el('li');row.append(el('strong',text(item.label,350)||'Review item'));if(item.status){row.dataset.dataQuality=text(item.status,80);if(item.status!=='unverified_assessment')row.append(badge(item.status));}if(item.detail)row.append(paragraph(item.detail));const source=external('Source reference',item.sourceUrl);if(source)row.append(source);list.append(row);});parent.append(list);
    }
    function renderPathways(paths,parent){
      if(!array(paths).length)return;const group=el('div',null,'fpa-pathways');
      array(paths).forEach((path,index)=>{
        const details=el('details',null,'fpa-pathway');details.dataset.assessmentDisclosure='path:'+index;
        const summary=el('summary');summary.dataset.assessmentControl='path-toggle:'+index;summary.append(el('span',text(path.label,250)||'Pathway to review'),badge(path.status));details.append(summary);
        const body=el('div',null,'fpa-pathway-body');if(path.detail)body.append(paragraph(path.detail));
        renderItems(path.checks,body);
        if(array(path.steps).length){const title=el('h4','Review sequence'),steps=el('ol',null,'fpa-step-list');body.append(title);array(path.steps).forEach(step=>{const item=el('li');item.append(el('strong',text(step.label,300)||'Review step'));if(step.detail)item.append(paragraph(step.detail));steps.append(item);});body.append(steps);}
        details.append(body);group.append(details);
      });parent.append(group);
    }
    function renderSketch(sketch,parent,index){
      if(!sketch||typeof sketch!=='object')return;
      const figure=el('figure',null,'fpa-sketch'),caption=el('figcaption');caption.append(el('strong',text(sketch.label,250)||'Site sketch'));
      const real=selection.mode==='property'||sketch.kind==='parcel';
      const polygons=real?officialRings(sketch.geometry).filter(rings=>Array.isArray(rings)&&rings.length&&rings.every(ring=>Array.isArray(ring)&&ring.length>=4&&ring.every(p=>Array.isArray(p)&&p.length>=2&&number(p[0])!==null&&number(p[1])!==null))):[];
      caption.append(badge(real?(polygons.length?'verified_official_data':'missing_data'):'prototype_example'));figure.append(caption);
      const graphic=svg('svg',{viewBox:'0 0 600 300',role:'img','aria-labelledby':prefix+'sketch-'+index+' '+prefix+'sketch-desc-'+index});
      const title=svg('title',{id:prefix+'sketch-'+index}),description=svg('desc',{id:prefix+'sketch-desc-'+index});title.textContent=real?'Official mapped property outline':'Illustrative lot and proposal sketch';description.textContent=real?'The supplied official property polygon is shown as a static outline. Buildings and a development envelope have not been inferred.':'Prototype geometry shows assumed existing buildings, an illustrative envelope and a candidate proposal where supplied. This does not establish legal setbacks or fit on a real property.';graphic.append(title,description);
      if(real){
        const points=polygons.flatMap(rings=>rings.flat());
        if(!points.length){figure.append(paragraph('An official parcel outline is not available for this view. Buildings, an envelope and a fit decision have not been inferred.','fpa-notice'));}
        else{
          const bounds=points.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
          const [minX,minY,maxX,maxY]=bounds,factor=Math.cos((minY+maxY)/2*Math.PI/180),dx=(maxX-minX)*factor,dy=maxY-minY;
          const scale=Math.min(500/(dx||1),230/(dy||1)),left=(600-dx*scale)/2,top=(300-dy*scale)/2;
          polygons.forEach(rings=>{const d=rings.map(ring=>ring.map((p,i)=>(i?'L':'M')+(left+(p[0]-minX)*factor*scale).toFixed(2)+','+(top+(maxY-p[1])*scale).toFixed(2)).join(' ')+' Z').join(' ');graphic.append(svg('path',{d,'fill-rule':'evenodd',class:'fpa-parcel-outline'}));});
          figure.append(graphic,paragraph('Official mapped outline · schematic display, not a survey. Building locations and a developable envelope are not connected.','fpa-fine'));
        }
      }else{
        const lot=sketch.lot||{},depth=number(lot.depth),frontage=number(lot.frontage),envelope=rangeRect(sketch.envelope),candidate=rangeRect(sketch.candidate),house=rangeRect(lot.house,true);
        if(depth===null||frontage===null||depth<=0||frontage<=0){figure.append(paragraph('Illustrative dimensions have not been supplied for this option. No sketch or fit has been invented.','fpa-notice'));}
        else{
          const battleaxe=lot.shape==='battleaxe'&&[lot.body?.len,lot.body?.w,lot.handle?.len,lot.handle?.w].every(n=>number(n)!==null&&n>0);
          const lotRects=battleaxe?[{x:lot.handle.len,y:0,w:lot.body.len,h:lot.body.w},{x:0,y:(lot.body.w-lot.handle.w)/2,w:lot.handle.len,h:lot.handle.w}]:[{x:0,y:0,w:depth,h:frontage}];
          const features=lot.features||{},trees=(Array.isArray(features)?features.filter(item=>item.kind==='tree'||item.type==='tree'):features.tree?[features.tree]:[]).filter(tree=>[tree.x,tree.y,tree.r].every(n=>number(n)!==null)&&tree.r>0);
          const flow=Array.isArray(features.flow)&&features.flow.every(p=>Array.isArray(p)&&p.length>=2&&number(p[0])!==null&&number(p[1])!==null)?features.flow:[];
          // Fit the full supplied sketch, including a battle-axe body wider than
          // its street handle and any candidate or tree extending beyond the lot.
          const points=[];[...lotRects,envelope,candidate,house].filter(rect=>rect&&rect.w>0&&rect.h>0).forEach(rect=>points.push([rect.x,rect.y],[rect.x+rect.w,rect.y+rect.h]));
          trees.forEach(tree=>points.push([tree.x-tree.r,tree.y-tree.r],[tree.x+tree.r,tree.y+tree.r]));points.push(...flow);
          const bounds=points.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
          const width=bounds[2]-bounds[0],height=bounds[3]-bounds[1],scale=Math.min(510/width,240/height),ox=(600-width*scale)/2-bounds[0]*scale,oy=(300-height*scale)/2-bounds[1]*scale;
          const rectangle=(rect,cls)=>{if(!rect||rect.w<=0||rect.h<=0)return;graphic.append(svg('rect',{x:ox+rect.x*scale,y:oy+rect.y*scale,width:rect.w*scale,height:rect.h*scale,class:cls}));};
          lotRects.forEach(rect=>rectangle(rect,'fpa-lot-outline'));
          rectangle(envelope,'fpa-assumed-envelope');rectangle(house,'fpa-assumed-house');rectangle(candidate,'fpa-candidate '+(sketch.fit?.status==='outside'?'fpa-candidate-outside':''));
          trees.forEach(tree=>graphic.append(svg('circle',{cx:ox+tree.x*scale,cy:oy+tree.y*scale,r:tree.r*scale,class:'fpa-assumed-tree'})));
          if(flow.length)graphic.append(svg('polyline',{points:flow.map(p=>(ox+p[0]*scale)+','+(oy+p[1]*scale)).join(' '),class:'fpa-assumed-flow'}));
          figure.append(graphic,paragraph(battleaxe?'Illustrative depth: '+depth+' m · street frontage / handle width: '+frontage+' m · body width: '+lot.body.w+' m. Handle alignment is schematic.':'Illustrative depth: '+depth+' m · frontage: '+frontage+' m.','fpa-fine'));
          const legend=el('ul',null,'fpa-sketch-legend');
          [[house,'Existing building assumption','house'],[envelope,'Envelope assumption','envelope'],[candidate,'Candidate proposal','candidate'],[trees.length,'Tree assumption','tree']].forEach(([present,label,kind])=>{if(!present)return;const item=el('li');item.append(el('span',null,'fpa-key fpa-key-'+kind),el('span',label));legend.append(item);});figure.append(legend);
          if(sketch.fit?.label)figure.append(paragraph('Schematic fit: '+text(sketch.fit.label,400),'fpa-fit-note'));
          figure.append(paragraph(envelope?'Illustrative assumptions only. The envelope is not a verified setback rule; visual fit does not establish development permission.':'Illustrative assumptions only. No verified buildable envelope is drawn; the assumed placement does not establish legal fit or development permission.','fpa-fine'));
        }
      }
      if(sketch.note)figure.append(paragraph(sketch.note,'fpa-fine'));parent.append(figure);
    }
    function renderCosts(costs,parent){
      if(!array(costs).length)return;
      const box=el('div',null,'fpa-costs');box.append(el('h4','Cost assumptions to review'));
      array(costs).forEach(cost=>{const row=el('div',null,'fpa-cost-row');row.append(el('strong',text(cost.label,250)||'Cost item'),el('span',text(cost.amount,250)||'Not estimated'));if(cost.basis)row.append(paragraph(cost.basis,'fpa-fine'));box.append(row);});parent.append(box);
    }
    function renderTiming(timing,parent){
      if(!timing||typeof timing!=='object')return;
      const figure=el('figure',null,'fpa-timing'),caption=el('figcaption',text(timing.label,250)||'Timing information');figure.append(caption);
      if(selection.mode==='example')figure.append(paragraph('Engineer-provided historical summary · unverified. These figures do not predict a new application or state a statutory target.','fpa-notice'));
      const metrics=[['Median',number(timing.median)],['90th percentile',number(timing.p90)]].filter(([,n])=>n!==null&&n>=0);
      if(metrics.length){const chart=el('div',null,'fpa-time-bars');const max=Math.max(...metrics.map(([,n])=>n),1);metrics.forEach(([label,n])=>{const row=el('div',null,'fpa-time-row');row.append(el('span',label),el('strong',String(n)+' days'));const track=el('div',null,'fpa-time-track'),bar=el('span');bar.style.width=(n/max*100)+'%';track.setAttribute('aria-hidden','true');track.append(bar);row.append(track);chart.append(row);});figure.append(chart);}
      const counts=el('dl',null,'fpa-time-counts');[['Lodged',timing.lodged],['Determined',timing.determined],['Returned',timing.returned],['Refused',timing.refused]].forEach(([label,n])=>{if(number(n)!==null){counts.append(el('dt',label),el('dd',String(n)+(label==='Returned'&&selection.mode==='example'?'%':'')));}});if(counts.childElementCount)figure.append(counts);
      if(timing.note)figure.append(paragraph(timing.note,'fpa-fine'));if(!metrics.length&&!counts.childElementCount&&!timing.note)figure.append(paragraph('A reliable timeframe has not been supplied.','fpa-fine'));parent.append(figure);
    }
    function renderComparables(cases,parent){
      if(!array(cases).length)return;const box=el('div',null,'fpa-comparables');box.append(el('h4','Reference cases to review'));
      array(cases).forEach(item=>{const card=el('article');card.append(el('strong',text(item.reference,250)||'Reference not supplied'),badge(item.status));if(item.outcome)card.append(paragraph('Recorded outcome: '+text(item.outcome,300),'fpa-fine'));if(item.summary)card.append(paragraph(item.summary));const source=external('Case source',item.sourceUrl);if(source)card.append(source);else card.append(paragraph('Original case source not linked.','fpa-fine'));box.append(card);});box.append(paragraph('A comparable case does not establish the same outcome for another proposal.','fpa-fine'));parent.append(box);
    }
    function renderMissing(items,parent){
      if(!array(items).length)return;const list=el('ul',null,'fpa-missing-list');
      array(items).forEach(item=>{const row=el('li');row.append(el('strong',text(item.label,300)||'Information gap'),badge(item.status||'missing_data'));if(item.reason)row.append(paragraph(item.reason));if(item.how)row.append(paragraph('How to resolve: '+text(item.how),'fpa-resolution'));list.append(row);});parent.append(list);
    }
    function renderAssessment(){
      const assessment=el('section',null,'fpa-detail');const heading=el('div',null,'fpa-detail-heading');
      heading.append(el('h2','Assessment details'));
      const status=el('div',null,'fpa-assessment-status');status.dataset.dataQuality=selection.mode==='example'?'prototype_example':'unverified_assessment';status.append(el('span','Confidence · '+(text(model.status?.confidence,30)||'low'),'fpa-confidence'));heading.append(status);
      if(model.status?.note){const scopeDetails=el('details',null,'fpa-scope');scopeDetails.dataset.assessmentDisclosure='scope';const summary=el('summary','Scope and confidence');summary.dataset.assessmentControl='scope-toggle';scopeDetails.append(summary,paragraph(model.status.note,'fpa-fine'));heading.append(scopeDetails);}assessment.append(heading);
      // Outcome and material limitations remain visible independently of optional
      // evidence disclosures. Opening a section never completes a legal review.
      const permission=model.sections?.[0]||{},gaps=model.sections?.[4]||{},constraints=model.sections?.[2]||{};
      const outcome=el('section',null,'fpa-outcome');outcome.dataset.assessmentOutcome='true';outcome.dataset.dataQuality=permission.status||(selection.mode==='example'?'prototype_example':'unverified_assessment');outcome.setAttribute('aria-label','Main assessment outcome');
      outcome.append(el('h3','Planning outcome'));
      if(outcome.dataset.dataQuality!=='unverified_assessment')outcome.append(badge(outcome.dataset.dataQuality));
      outcome.append(paragraph(permission.summary||'A property-specific permission decision is not available. Further assessment is required.'));
      renderItems(permission.items,outcome);assessment.append(outcome);
      const limitations=el('aside',null,'fpa-material-limitations');limitations.dataset.assessmentLimitations='true';limitations.setAttribute('aria-label','Material limitations');
      limitations.append(el('h3','Further verification required'));
      if(selection.mode==='example')limitations.append(paragraph(constraints.summary||gaps.summary||'Example assumptions have not been verified for a real property.','fpa-fine'));
      else {
        if(model.evidence?.propertyVerified!==true&&model.status?.note)limitations.append(paragraph(model.status.note,'fpa-fine'));
        renderItems(constraints.items,limitations);
        if(!array(constraints.items).length)limitations.append(paragraph(gaps.summary||'The evidence is incomplete. Missing information does not establish that the property is unrestricted.','fpa-fine'));
      }
      if(array(gaps.missing).length)limitations.append(paragraph(array(gaps.missing).length+' evidence gaps remain unresolved. Expand “What we couldn’t check” for sources to obtain and recovery actions.','fpa-fine'));
      assessment.append(limitations);
      const jumps=el('nav',null,'fpa-section-nav');jumps.setAttribute('aria-label','Assessment sections');
      ['Permission','Approval reviews','Site constraints','Costs and timing','Evidence gaps'].forEach((label,index)=>jumps.append(action(String(index+1)+'. '+label,'section:'+index,()=>{const target=document.getElementById(prefix+'section-'+index);const detail=target?.closest('details[data-assessment-section]');if(detail)detail.open=true;target?.scrollIntoView({block:'start',behavior:'instant'});target?.focus({preventScroll:true});})));
      assessment.append(jumps);
      TITLES.forEach((title,index)=>{
        const section=model.sections?.[index]||{},block=el('details',null,'fpa-section');block.dataset.assessmentSection=text(section.id,100)||String(index+1);block.dataset.assessmentDisclosure='section';
        const sectionHeading=el('summary',null,'fpa-section-heading'),h3=el('h3',title);h3.id=prefix+'section-'+index;h3.tabIndex=-1;h3.dataset.assessmentControl='section-heading:'+index;block.setAttribute('aria-labelledby',h3.id);sectionHeading.dataset.assessmentControl='section-toggle:'+index;
        const sectionQuality=section.status||(selection.mode==='example'?'prototype_example':'unverified_assessment');block.dataset.dataQuality=sectionQuality;
        sectionHeading.append(el('span',String(index+1).padStart(2,'0'),'fpa-section-number'),h3);if(sectionQuality!=='unverified_assessment')sectionHeading.append(badge(sectionQuality));block.append(sectionHeading);
        const body=el('div',null,'fpa-section-body');body.append(paragraph(section.summary||'This part is not available yet. The answer remains unresolved.'));
        renderOfficial(section.official,body);if(index!==0)renderItems(section.items,body);renderPathways(section.pathways,body);renderSketch(section.sketch,body,index);renderCosts(section.costs,body);renderTiming(section.timing,body);renderComparables(section.comparables,body);renderMissing(section.missing,body);block.append(body);assessment.append(block);
      });
      const next=el('div',null,'fpa-next');next.append(el('h3','Take the next step with the right evidence.'));
      if(selection.mode==='example')next.append(paragraph('Return to your selected property to prepare a real project handover. This illustrative lot is not connected to that address.'),action('Return to my property','return-property',()=>change({mode:'property'})));
      else if(model.canContinue===true&&typeof callbacks.onContinue==='function')next.append(paragraph('Carry this property and its unresolved questions into the AI Agent and expert preparation workspace.'),action('Continue with AI Agent + experts','continue',()=>callbacks.onContinue(),true));
      else next.append(paragraph('Choose a property and prepare its preliminary report before continuing to project services.','fpa-fine'));
      assessment.append(next);content.append(assessment);
    }
    function update(next={}){
      if(!next||typeof next!=='object')next={};
      const nextSignature=JSON.stringify(next);if(signature===nextSignature)return api;
      const current=document.activeElement,control=content.contains(current)?current.dataset.assessmentControl:null;
      const oldContext=disclosureContext(model,selection),nextSelection=safeSelection(next),nextContext=disclosureContext(next,nextSelection),sameContext=oldContext===nextContext;
      const sameLocationContext=selection.mode===nextSelection.mode&&selection.projectId===nextSelection.projectId&&selection.sampleId===nextSelection.sampleId&&selection.optionId===nextSelection.optionId&&text(model.context?.address,350)===text(next.context?.address,350);
      disclosures?.capture(content,oldContext,disclosureKey);
      if(sameLocationContext&&next.context?.gisStatus==='loading'&&!next.context?.propertyId)disclosures?.capture(content,nextContext,disclosureKey);
      model=next;selection=nextSelection;signature=nextSignature;renderCount++;content.replaceChildren();renderSelector();renderAssessment();
      shell.dataset.assessmentMode=selection.mode;shell.dataset.assessmentProject=selection.projectId;
      disclosures?.restore(content,nextContext,disclosureKey);
      if(control&&(sameContext||sameLocationContext)){
        const replacement=[...content.querySelectorAll('[data-assessment-control]')].find(item=>item.dataset.assessmentControl===control);
        const closed=replacement?.closest('details:not([open])');
        if(replacement&&(!closed||closed.firstElementChild===replacement))replacement.focus({preventScroll:true});
      }
      announcement.textContent=(selection.mode==='example'?'Illustrative example':'Selected property')+' assessment updated. '+(text(model.status?.label,300)||'Review the information and unresolved checks.');return api;
    }
    function getState(){return{...selection,sectionCount:5,renderCount,canContinue:selection.mode==='property'&&model.canContinue===true&&typeof callbacks.onContinue==='function',legalApplicabilityAssessed:false};}
    const api={update,getState};root._firstPrincipleAssessmentView=api;update({});return api;
  }
  const api=Object.freeze({init,TITLES,QUALITIES});scope.FirstPrincipleAssessmentView=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
