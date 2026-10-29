/* Browser-local PDF intake. Drawings are not uploaded; no AI or OCR call is made. */
(function (scope) {
  'use strict';
  const LIMITS=Object.freeze({bytes:15*1024*1024,pages:30,thumbnails:8,pageCharacters:25000,facts:40,timeoutMs:60000});
  const moduleBase=typeof document!=='undefined'?new URL('./vendor/pdfjs/',document.currentScript?.src||scope.location.href):null;
  let libraryPromise=null,mountCount=0;
  const blank=()=>({status:'empty',document:null,facts:[],pagesProcessed:0,textPageCount:0,unreadablePageCount:0,unreadablePages:[],needsOCR:false,confirmedCount:0,reviewComplete:false,needsReview:true,confidence:'low',aiConnected:false,ocrConnected:false,professionalReviewRequired:true,extractionMode:'pdf_text',illustrative:false,demo:false,warnings:[]});
  const copy=value=>JSON.parse(JSON.stringify(value));
  function clean(value,max=220){return String(value||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max);}
  function extractFacts(pages,illustrative=false){
    const results=[],seen=new Set();
    const patterns=[
      {key:'floor_area',label:'Declared floor / building area',re:/\b(?:(?:proposed|existing|gross|total|internal)\s+)?(?:floor|building|secondary\s+dwelling)\s+area\s*[:=]?\s*(\d[\d,.]*(?:\s*\d)?\s*(?:m\s*[²2]|sq\.?\s*m|sqm))(?=\s|$|[.,;])/gi},
      {key:'bedrooms',label:'Declared bedroom count',re:/\b(?:bedrooms?\s*[:=]\s*(\d{1,2})\b|(\d{1,2})[ \t-]+bedroom\b)/gi},
      {key:'scale',label:'Printed drawing scale',re:/\bscale\s*[:=]?\s*(1\s*:\s*\d{1,5}|not\s+to\s+scale|NTS)\b/gi},
      {key:'sheet',label:'Sheet / drawing reference',re:/\b(?:sheet|drawing)\s*(?:(?:no|number)\.?\s*)?[:#]?\s*([A-Z]{1,3}[- ]?\d{1,4})\b/gi},
      {key:'revision',label:'Printed revision',re:/\b(?:revision|rev)\.?\s*[:#]?\s*([A-Z]\d{1,3}|[A-Z]|\d{1,3})(?![A-Z0-9])/gi},
      {key:'address',label:'Printed site address',re:/\b(?:site\s+address|property\s+address|address)\s*:\s*([^\n]{8,160})/gi}
    ];
    for(const page of pages){
      const text=String(page.text||'');
      for(const pattern of patterns){pattern.re.lastIndex=0;let match;
        while((match=pattern.re.exec(text))&&results.length<LIMITS.facts){
          const value=clean(match[1]||match[2]||'',160).trim();if(!value)continue;
          const key=page.page+'|'+pattern.key+'|'+value.toLowerCase();if(seen.has(key))continue;seen.add(key);
          const start=Math.max(0,text.lastIndexOf('\n',match.index)+1),end=text.indexOf('\n',match.index+match[0].length);
          let quote=text.slice(start,end<0?Math.min(text.length,start+220):Math.min(end,start+220)).trim();
          if(!quote.includes(match[0]))quote=match[0];
          results.push({id:'pdf-'+page.page+'-'+pattern.key+'-'+results.length,key:pattern.key,label:pattern.label,value,page:page.page,quote:clean(quote,220),status:'candidate',confidence:'low',illustrative:Boolean(illustrative),source:'PDF text layer',verifiedAgainstSite:false});
        }
      }
    }
    return results;
  }
  function classification(pages,facts){
    const textPages=pages.filter(page=>String(page.text||'').replace(/\s/g,'').length>=25).length;
    const imageOnlyPages=pages.filter(page=>String(page.text||'').replace(/\s/g,'').length<25).map(page=>page.page);
    return {status:textPages?'review':'needs_ocr',textPageCount:textPages,imageOnlyPages,factCount:facts.length};
  }
  function validateFile(file){
    if(!file||!Number.isFinite(file.size)||file.size<5)return 'Choose a non-empty PDF file.';
    if(file.size>LIMITS.bytes)return 'This PDF exceeds the 15 MB demo limit. Export a smaller drawing set and try again.';
    if(!/\.pdf$/i.test(file.name||'')&&file.type!=='application/pdf')return 'Choose a PDF drawing, not an image, CAD file or office document.';
    return null;
  }
  function loadLibrary(){
    if(!libraryPromise)libraryPromise=import(new URL('pdf.mjs',moduleBase).href).then(library=>{library.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.mjs',moduleBase).href;return library;}).catch(error=>{libraryPromise=null;throw error;});
    return libraryPromise;
  }
  function el(tag,text,className){const result=document.createElement(tag);if(text!==undefined&&text!==null)result.textContent=String(text);if(className)result.className=className;return result;}
  function button(label,handler,className='fpi-button'){const result=el('button',label,className);result.type='button';result.addEventListener('click',handler);return result;}
  function mount(root,options={}){
    if(!root)return {setContext(){},reset(){},getState:blank,loadDemo(){}};
    if(root._firstPrinciplePDFIntake)return root._firstPrinciplePDFIntake;
    const prefix='fpi-'+(++mountCount)+'-';let state=blank(),contextKey='',run=0,activeTask=null,pdfDocument=null,pages=[],previewRun=0;
    const shell=el('section',null,'fpi-intake');shell.setAttribute('aria-label','PDF drawing intake');
    const header=el('div',null,'fpi-header'),copyBlock=el('div');
    copyBlock.append(el('p','Drawing intake','fpi-kicker'),el('h3','Start with the drawings you already have.'),el('p','Read a PDF in this browser, inspect its pages and check the extracted notes before using them in your project brief.','fpi-lead'));
    header.append(copyBlock,el('span','Local PDF extraction','fpi-mode'));
    const upload=el('div',null,'fpi-upload');
    const fileInput=el('input');fileInput.id=prefix+'file';fileInput.type='file';fileInput.accept='.pdf,application/pdf';fileInput.dataset.pdfUpload='true';fileInput.className='fpi-file-input';fileInput.tabIndex=-1;fileInput.setAttribute('aria-label','Drawing PDF file');
    const uploadLabel=button('Choose a drawing PDF',()=>fileInput.click(),'fpi-button fpi-file-select');uploadLabel.setAttribute('aria-controls',fileInput.id);
    const submit=button('Read drawing PDF',()=>readChosen(),'fpi-button fpi-primary');submit.disabled=true;
    const sample=button('Try an illustrative PDF',()=>loadDemo(),'fpi-button');
    const remove=button('Clear drawing',()=>reset(),'fpi-button');remove.hidden=true;
    const chosen=el('p','No drawing selected.','fpi-file-name');
    const actions=el('div',null,'fpi-actions');actions.append(submit,sample,remove);
    upload.append(uploadLabel,fileInput,chosen,actions,el('p','PDF only · Up to 15 MB and 30 pages. File contents stay in this page’s memory. AI interpretation, OCR and cloud storage are not connected.','fpi-privacy'));
    const status=el('p','Select a PDF, then read its text layer. Scanned image-only pages need OCR or manual review.','fpi-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const progress=el('progress');progress.max=1;progress.value=0;progress.hidden=true;progress.setAttribute('aria-label','Pages read from PDF');
    const result=el('div',null,'fpi-result');result.hidden=true;
    const metadata=el('div',null,'fpi-metadata'),warnings=el('ul',null,'fpi-warnings');
    const reviewLayout=el('div',null,'fpi-review-layout'),previewColumn=el('div',null,'fpi-preview-column'),factColumn=el('div',null,'fpi-fact-column');
    const previewHeading=el('div',null,'fpi-preview-heading'),pageLabel=el('label','Inspect page');pageLabel.htmlFor=prefix+'page';
    const pageSelect=el('select');pageSelect.id=pageLabel.htmlFor;pageSelect.addEventListener('change',()=>showPage(Number(pageSelect.value)));
    previewHeading.append(pageLabel,pageSelect);
    const previewStatus=el('p','','fpi-page-status');previewStatus.setAttribute('role','status');
    const canvasWrap=el('div',null,'fpi-page-preview');
    const thumbnails=el('div',null,'fpi-thumbnails');thumbnails.setAttribute('aria-label','Drawing page thumbnails');
    const textDetails=el('details',null,'fpi-page-text');textDetails.append(el('summary','Read this page’s extracted text'));
    const pageText=el('pre');textDetails.append(pageText);
    previewColumn.append(previewHeading,canvasWrap,previewStatus,thumbnails,textDetails);
    const factHeading=el('h4','Check the drawing notes'),factNote=el('p','Each note is copied from a PDF text layer. Check the cited page before confirming the transcription. No geometric measurement or compliance check has been performed.','fpi-fact-note');
    const factCount=el('p','','fpi-fact-count');factCount.setAttribute('aria-live','polite');
    const facts=el('div',null,'fpi-facts');
    factColumn.append(factHeading,factNote,factCount,facts);
    reviewLayout.append(previewColumn,factColumn);result.append(metadata,warnings,reviewLayout);
    shell.append(header,upload,status,progress,result);root.append(shell);
    let chosenFile=null;
    fileInput.addEventListener('change',()=>{const next=fileInput.files?.[0]||null;cancel();chosenFile=next;state=blank();state.status=next?'ready':'empty';chosen.textContent=next?clean(next.name,180)+' · '+(next.size/1024/1024).toFixed(2)+' MB':'No drawing selected.';const error=next?validateFile(next):null;if(error){state.status='error';state.warnings=[error];status.textContent=error;}else status.textContent=next?'Ready to read the selected PDF. It has not been uploaded.':'Choose a drawing PDF.';result.hidden=true;progress.hidden=true;submit.textContent='Read drawing PDF';sample.disabled=false;submit.disabled=!next||Boolean(error);remove.hidden=!next;notify();});
    function notify(){state.confirmedCount=state.facts.filter(fact=>fact.status==='confirmed').length;state.reviewComplete=state.status==='review'&&state.facts.length>0&&state.confirmedCount===state.facts.length&&!state.needsOCR;state.needsReview=!state.reviewComplete;if(typeof options.onChange==='function')options.onChange(getState());shell.dataset.status=state.status;}
    function getState(){return copy(state);}
    function cancel(){run++;previewRun++;if(activeTask){activeTask.destroy().catch(()=>{});activeTask=null;}pdfDocument=null;pages=[];canvasWrap.replaceChildren();thumbnails.replaceChildren();}
    function reset(){cancel();state=blank();chosenFile=null;fileInput.value='';chosen.textContent='No drawing selected.';result.hidden=true;progress.hidden=true;submit.disabled=true;submit.textContent='Read drawing PDF';sample.disabled=false;remove.hidden=true;status.textContent='Select a PDF, then read its text layer. Scanned image-only pages need OCR or manual review.';notify();}
    function setContext(context,config={}){const key=JSON.stringify({location:context?.location?.name||context?.location?.address||'',question:context?.question||'',caseId:context?.report?.caseId||'',summary:context?.report?.summary||''});if(config.reset||key!==contextKey){contextKey=key;reset();}}
    async function readChosen(){if(chosenFile)await processFile(chosenFile,false);}
    async function loadDemo(){
      cancel();const token=run;sample.disabled=true;status.textContent='Loading an illustrative drawing PDF. It is not an actual case drawing.';
      try{const response=await fetch('./data/demo-concept-plan.pdf',{credentials:'omit'});if(!response.ok)throw new Error('Sample unavailable');const bytes=await response.arrayBuffer();if(token!==run)return;const file=new File([bytes],'illustrative-concept-plan.pdf',{type:'application/pdf'});chosenFile=file;fileInput.value='';chosen.textContent=file.name+' · Illustrative sample';await processFile(file,true);}
      catch(error){if(token===run){state=blank();state.status='error';state.warnings=['The illustrative PDF could not load. Choose your own PDF or retry.'];status.textContent=state.warnings[0];notify();}}
      finally{if(token===run)sample.disabled=false;}
    }
    async function processFile(file,illustrative){
      cancel();const token=run;const validation=validateFile(file);if(validation){state=blank();state.status='error';state.warnings=[validation];status.textContent=validation;notify();return;}
      state=blank();state.status='extracting';state.illustrative=Boolean(illustrative);state.demo=Boolean(illustrative);state.document={name:clean(file.name,180),bytes:file.size,pages:0,illustrative:Boolean(illustrative),demo:Boolean(illustrative)};
      result.hidden=true;remove.hidden=false;submit.disabled=true;sample.disabled=true;submit.textContent='Reading PDF…';progress.hidden=false;progress.max=1;progress.value=0;status.textContent='Opening PDF locally. No file upload or AI model request is being made.';notify();
      let timedOut=false;const timeout=setTimeout(()=>{if(token===run){timedOut=true;activeTask?.destroy().catch(()=>{});}},LIMITS.timeoutMs);
      try{
        const buffer=new Uint8Array(await file.arrayBuffer());if(token!==run)return;
        const signature=new TextDecoder('latin1').decode(buffer.slice(0,1024));if(!signature.includes('%PDF-'))throw new Error('NOT_PDF');
        const pdfjs=await loadLibrary();if(token!==run)return;
        const task=pdfjs.getDocument({data:buffer,isEvalSupported:false,enableXfa:false,useSystemFonts:true,disableAutoFetch:true,wasmUrl:new URL('wasm/',moduleBase).href,verbosity:0});activeTask=task;
        task.onPassword=()=>{task.destroy().catch(()=>{});};
        const loaded=await task.promise;if(token!==run){task.destroy().catch(()=>{});return;}pdfDocument=loaded;
        if(pdfDocument.numPages>LIMITS.pages)throw new Error('TOO_MANY_PAGES');state.document.pages=pdfDocument.numPages;progress.max=pdfDocument.numPages;
        const collected=[];
        for(let number=1;number<=pdfDocument.numPages;number++){
          if(token!==run)return;if(timedOut)throw new Error('TIMEOUT');status.textContent='Reading text on page '+number+' of '+pdfDocument.numPages+'…';
          const page=await pdfDocument.getPage(number),content=await page.getTextContent();if(token!==run)return;
          const fullText=content.items.filter(item=>typeof item.str==='string').map(item=>item.str+(item.hasEOL?'\n':' ')).join('');
          if(fullText.length>LIMITS.pageCharacters)state.warnings.push('Page '+number+' text exceeded the demo limit and was truncated; review the original.');
          collected.push({page:number,text:fullText.slice(0,LIMITS.pageCharacters)});state.pagesProcessed=number;progress.value=number;notify();
        }
        pages=collected;state.facts=extractFacts(pages,illustrative);const classified=classification(pages,state.facts);state.status=classified.status;state.textPageCount=classified.textPageCount;state.unreadablePages=classified.imageOnlyPages;state.unreadablePageCount=classified.imageOnlyPages.length;state.needsOCR=classified.imageOnlyPages.length>0;
        if(illustrative)state.warnings.unshift('Illustrative sample: all drawing values are fictional. They are not measurements or verified facts for CASE-0001 or the selected property.');
        if(classified.imageOnlyPages.length)state.warnings.push('Pages '+classified.imageOnlyPages.join(', ')+' have little or no searchable text. OCR or manual review is required; no AI reading of the image has occurred.');
        if(!state.facts.length&&state.status==='review')state.warnings.push('Readable text was found, but no supported labelled drawing notes were identified. Review the pages manually; no missing values were guessed.');
        if(state.facts.length>=LIMITS.facts)state.warnings.push('The first '+LIMITS.facts+' supported notes are shown. Review other drawing information manually.');
        if(state.document.pages>LIMITS.thumbnails)state.warnings.push('Thumbnails show the first '+LIMITS.thumbnails+' pages. Use the page selector to inspect every page.');
        renderResult();notify();
        status.textContent=state.status==='needs_ocr'?'PDF opened, but no usable text layer was found. OCR or manual review is needed.':'Read '+state.document.pages+' pages. Review '+state.facts.length+' extracted notes before including them in your brief.';
        await showPage(1);if(token!==run)return;
        await renderThumbnails(token);
      }catch(error){
        if(token!==run)return;state.status='error';state.facts=[];
        const message=timedOut||error.message==='TIMEOUT'?'Reading exceeded the demo time limit. Export a smaller drawing set and retry.':error.message==='TOO_MANY_PAGES'?'This PDF exceeds the 30-page demo limit. Split the drawing set and retry.':error.message==='NOT_PDF'?'The selected file does not contain a PDF header. Choose a valid PDF.':/password|Password|destroyed/i.test(error.message||error.name||'')?'The PDF is locked or could not be opened. Unlock a copy locally, then choose it again.':'This PDF could not be read. It may be damaged, unsupported or require a different export. Choose another PDF or request manual review.';
        state.warnings=[message];status.textContent=message;result.hidden=true;notify();
      }finally{clearTimeout(timeout);if(token===run){submit.disabled=!chosenFile;submit.textContent='Read drawing PDF';sample.disabled=false;progress.hidden=true;}}
    }
    function renderResult(){
      result.hidden=false;metadata.replaceChildren(el('strong',state.document.name),el('span',state.document.pages+' pages · '+state.textPageCount+' with readable text'),el('span','Low · Transcriptions need review','fpi-confidence'));
      warnings.replaceChildren();state.warnings.forEach(message=>warnings.append(el('li',message)));warnings.hidden=!state.warnings.length;
      pageSelect.replaceChildren();for(let number=1;number<=state.document.pages;number++){const option=el('option','Page '+number);option.value=String(number);pageSelect.append(option);}
      renderFacts();
    }
    function renderFacts(){
      facts.replaceChildren();factCount.textContent=reviewCountText();
      if(!state.facts.length){facts.append(el('p',state.status==='needs_ocr'?'No text-derived drawing facts are available. Request OCR or manual review before using image-only pages.':'No supported labelled notes were identified. The preview and extracted page text are available for manual review.','fpi-empty'));return;}
      state.facts.forEach(fact=>{
        const article=el('article',null,'fpi-fact');article.dataset.factId=fact.id;article.dataset.factStatus=fact.status;
        const top=el('div',null,'fpi-fact-top');top.append(el('span',fact.label),button('Page '+fact.page,()=>{pageSelect.value=String(fact.page);showPage(fact.page);},'fpi-page-link'));
        article.append(top,el('strong',fact.value,'fpi-fact-value'),el('blockquote',fact.quote));
        const label=el('label',null,'fpi-confirm');const check=el('input');check.type='checkbox';check.checked=fact.status==='confirmed';check.dataset.pdfFactConfirm=fact.id;
        const labelCopy=el('span','I checked this transcription against the cited page'+(fact.illustrative?' (illustrative sample).':'.'));
        check.addEventListener('change',()=>{fact.status=check.checked?'confirmed':'candidate';article.dataset.factStatus=fact.status;notify();factCount.textContent=reviewCountText();});label.append(check,labelCopy);article.append(label);facts.append(article);
      });
    }
    function reviewCountText(){return state.confirmedCount+' of '+state.facts.length+' notes checked by you.'+(state.needsOCR?' '+state.unreadablePageCount+' pages still need OCR or manual review.':'')+' Professional review is still required.';}
    async function renderPage(number,width){
      const page=await pdfDocument.getPage(number),base=page.getViewport({scale:1}),scale=Math.min(2,width/base.width),viewport=page.getViewport({scale});
      const canvas=el('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.setAttribute('role','img');canvas.setAttribute('aria-label','PDF drawing page '+number);await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;return canvas;
    }
    async function showPage(number){
      if(!pdfDocument||!Number.isInteger(number)||number<1||number>state.document.pages)return;
      const token=run,preview=++previewRun;previewStatus.textContent='Rendering page '+number+'…';pageText.textContent=pages.find(page=>page.page===number)?.text||'No searchable text on this page.';
      try{const canvas=await renderPage(number,640);if(token!==run||preview!==previewRun)return;canvasWrap.replaceChildren(canvas);previewStatus.textContent='Page '+number+' · Visual preview, not a scale measurement.';}
      catch(error){if(token===run&&preview===previewRun){canvasWrap.replaceChildren();previewStatus.textContent='This page could not be previewed. Check the original PDF in your PDF viewer. Text extraction does not verify image content.';}}
    }
    async function renderThumbnails(token){
      thumbnails.replaceChildren();for(let number=1;number<=Math.min(LIMITS.thumbnails,state.document.pages);number++){
        if(token!==run)return;
        const action=button(null,()=>{pageSelect.value=String(number);showPage(number);},'fpi-thumbnail');action.setAttribute('aria-label','Inspect PDF page '+number);
        try{const canvas=await renderPage(number,140);if(token!==run)return;action.append(canvas);}catch(error){if(token!==run)return;action.append(el('span','Preview unavailable'));}
        action.append(el('span','Page '+number));thumbnails.append(action);
      }
    }
    const api={setContext,reset,getState,loadDemo};root._firstPrinciplePDFIntake=api;notify();return api;
  }
  const api={mount,LIMITS,extractFacts,classification,validateFile};scope.FirstPrinciplePDFIntake=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
