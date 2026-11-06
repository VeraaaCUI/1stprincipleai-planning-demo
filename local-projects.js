/* My Projects controller over the existing account repository and workflow draft. */
(function(scope){
  'use strict';
  const ACTIVE_KEY='firstprinciple.active-project.v1';
  const PENDING_KEY='firstprinciple.pending-account-save.v1';
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function init({root,mapApi,navigate,toolbarHost,cloudRepository,auth,onAccountRequired}){
    let active=null,activeOwner=null,suppressed=false,initializing=true,revision=0,lastSignature='',status='draft',message='';
    let projects=[],listEpoch=0,listMessage='',disposed=false,operationTail=Promise.resolve(),identityEpoch=0,pendingSavePromise=null;
    const authState=()=>auth?.getState?.()||{status:'unavailable',user:null};
    const owner=()=>authState().status==='authenticated'?authState().user?.id||null:null;
    let previousOwner=owner();
    const view=scope.FirstPrincipleMyProjectsView?.init(root,{
      onEnquiry:()=>navigate('property'),onOpen:open,onRename:rename,onDelete:remove,onSave:save,
      onAccountRequired:()=>onAccountRequired?.({status:'authentication_required'}),
      onCancelSaveIntent:cancelPendingSave
    });
    if(view?.toolbar)toolbarHost?.append(view.toolbar);
    function setStatus(next,text){status=next;message=text;view?.setSaveState({status:next,message:text,activeId:active?.id||null,authenticated:Boolean(owner()),projectName:active?.projectName||''});}
    function remember(){try{if(active)scope.localStorage.setItem(ACTIVE_KEY,JSON.stringify({id:active.id,source:'account',ownerId:activeOwner}));else scope.localStorage.removeItem(ACTIVE_KEY);}catch(_){}view?.setActiveProject(active);}
    function current(){return mapApi?.exportProjectContext?.()||{version:1,selection:null};}
    function workflowIdentity(c,step){
      return JSON.stringify({name:c?.selection?.name||null,kind:c?.selection?.kind||null,
        propertyId:c?.selection?.propertyId||null,confirmedKey:c?.confirmedKey||null,
        confirmedPropertyId:c?.confirmedPropertyId||null,chosenCandidateId:c?.chosenCandidateId||null,
        projectId:c?.projectChosen?c.projectId:null,projectChosen:c?.projectChosen===true,
        overviewVisited:c?.overviewVisited===true,assessmentVisited:c?.assessmentVisited===true,
        question:c?.question||'',step});
    }
    function mutate(task){const result=operationTail.then(task);operationTail=result.catch(()=>{});return result;}
    function capture(){
      const token={ownerId:owner(),epoch:identityEpoch,repository:cloudRepository};
      if(!token.ownerId)throw new Error('Sign in to access account projects.');
      if(!token.repository)throw new Error('Account project storage is unavailable. Your enquiry is unchanged.');
      return token;
    }
    function assertCurrent(token){if(disposed||token.epoch!==identityEpoch||token.ownerId!==owner())throw new Error('Your account changed. Retry this action in the current account.');}
    function signature(){
      const c=current(),s=mapApi?.getState?.(),p=mapApi?.getSpatialData?.();
      return JSON.stringify({selection:c.selection,confirmedKey:c.confirmedKey,confirmedPropertyId:c.confirmedPropertyId,chosenCandidateId:c.chosenCandidateId,projectId:c.projectId,projectChosen:c.projectChosen,overviewVisited:c.overviewVisited,assessmentVisited:c.assessmentVisited,question:c.question,step:s?.flowPage,retrievedAt:p?.retrievedAt,status:p?.status});
    }
    function snapshot(){
      const c=current(),s=mapApi?.getState?.(),p=mapApi?.getSpatialData?.(),selected=c.selection;
      const sameAddress=Boolean(active?.selectedAddress&&active.selectedAddress===selected?.name);
      const fresh=(p?.provenance||[]).filter(ref=>ref.sourceUrl&&String(ref.sourceUrl).startsWith('https://')).map(ref=>({sourceId:String(ref.layer||'spatial-source').slice(0,100),url:ref.sourceUrl,retrievedAt:ref.retrievedAt||p.retrievedAt||null,status:String(ref.status||p.status||'not_checked').slice(0,80)}));
      const refs=[...new Map([...(sameAddress?active.planningDataReferences:[]),...fresh].map(ref=>[ref.sourceId,ref])).values()];
      return {
        selectedAddress:selected?.kind==='address'?selected.name:'',
        propertyReference:p?.property?{propertyId:String(p.property.id),lotLabels:p.property.lotLabels||[]}:sameAddress?active.propertyReference:null,
        parcelId:p?.property?.lotLabels?.[0]||(sameAddress?active.parcelId:null),councilId:selected?.council_ids?.length===1?selected.council_ids[0]:sameAddress?active.councilId:null,
        developmentType:s?.projectChosen?s.projectId:null,currentWorkflowStep:s?.flowPage||'discovery',
        planningDataReferences:refs,assessmentReferences:s?.projectChosen?[{id:s.projectId,type:'planning-assessment-context',sourceUrl:null,retrievedAt:p?.retrievedAt||null,status:'further_assessment_required'}]:[],
        dataVerificationStatus:refs.length?'previously_retrieved':'not_checked',workflowContext:c
      };
    }
    function fingerprint(draft){return workflowIdentity(draft.workflowContext,draft.currentWorkflowStep);}
    function readPending(){
      try{
        const value=JSON.parse(scope.sessionStorage.getItem(PENDING_KEY)||'null');
        return value&&UUID.test(value.requestId)&&typeof value.fingerprint==='string'?value:null;
      }catch(_){return null;}
    }
    function writePending(value){
      try{scope.sessionStorage.setItem(PENDING_KEY,JSON.stringify(value));return true;}
      catch(_){throw new Error('This tab could not retain the pending save request. Your enquiry is still open; keep this tab open and retry.');}
    }
    function makePending(draft,projectName,requestedId){
      const key=fingerprint(draft),existing=readPending();
      if(existing&&existing.fingerprint===key&&(!requestedId||existing.requestId===requestedId)){
        if(projectName&&existing.projectName!==projectName){existing.projectName=projectName;writePending(existing);}
        return existing;
      }
      if(requestedId&&existing?.requestId!==requestedId)throw new Error('The pending save no longer matches this enquiry. Review My Projects and try again.');
      if(!scope.crypto?.randomUUID)throw new Error('Secure account saving is unavailable in this browser. Your enquiry remains open.');
      return writePending({requestId:scope.crypto.randomUUID(),fingerprint:key,projectName});
    }
    function clearPending(requestId){try{const value=readPending();if(!requestId||value?.requestId===requestId)scope.sessionStorage.removeItem(PENDING_KEY);}catch(_){}}
    function cancelPendingSave(){clearPending();if(status==='authentication_required')setStatus('draft',draftMessage());}
    function draftMessage(){return owner()?'Changes are not saved to your account until you choose Save project.':'Temporary enquiry in this tab. It is not a saved project.';}
    function visibility(){const s=mapApi?.getState?.();if(view?.toolbar)view.toolbar.hidden=!(s?.flowPage==='assessment'&&s.confirmedProperty&&s.projectChosen);}
    function changed(){
      visibility();if(suppressed||initializing||disposed)return;
      const next=signature();if(next===lastSignature)return;
      revision++;lastSignature=next;
      if(active&&active.selectedAddress!==current().selection?.name){active=null;activeOwner=null;remember();}
      setStatus('draft',draftMessage());
    }
    async function save(input={}){
      const draft=snapshot();
      if(!draft.workflowContext?.selection)throw new Error('Choose a property before saving a project.');
      const proposedName=String(input.projectName||active?.projectName||draft.selectedAddress||'My property project').trim().slice(0,120);
      const pending=makePending(draft,proposedName,input.requestId);
      if(!owner()){
        const available=authState().status!=='unavailable';
        setStatus('authentication_required',available?'Sign in to save this enquiry to your account. Your enquiry remains temporary until the write succeeds.':'Sign in is required to save a project. Account services are unavailable. Your enquiry remains temporary.');
        const request={status:'authentication_required',authenticationAvailable:available,requestId:pending.requestId};
        onAccountRequired?.(request);return request;
      }
      const token=capture(),savedRevision=revision,projectName=proposedName;
      return mutate(async()=>{
        assertCurrent(token);setStatus('saving','Saving to your account…');
        try{
          const existingId=activeOwner===token.ownerId&&active?.selectedAddress===draft.selectedAddress?active.id:null;
          const project=existingId
            ?await token.repository.updateProject(existingId,{...draft,projectName})
            :await token.repository.createProject({...draft,projectName},{requestId:pending.requestId});
          assertCurrent(token);
          if(current().selection?.name===draft.selectedAddress){active=project;activeOwner=token.ownerId;remember();}
          clearPending(pending.requestId);
          if(savedRevision===revision)setStatus('saved','Saved to your account.');
          else setStatus('draft','The earlier enquiry was saved to your account. New changes are not saved yet.');
          await refreshList('Project saved to your account.').catch(()=>{});return project;
        }catch(error){if(token.epoch===identityEpoch&&token.ownerId===owner())setStatus('failed','Save failed — '+error.message);throw error;}
      });
    }
    function resumePendingSave(){
      if(!owner())return Promise.resolve(false);
      if(pendingSavePromise)return pendingSavePromise;
      const pending=readPending();if(!pending)return Promise.resolve(false);
      const draft=snapshot();
      if(fingerprint(draft)!==pending.fingerprint){clearPending(pending.requestId);return Promise.resolve(false);}
      pendingSavePromise=save({projectName:pending.projectName,requestId:pending.requestId})
        .then(result=>Boolean(result&&result.status!=='authentication_required'))
        .catch(error=>{setStatus('failed','Save failed — '+error.message);return false;})
        .finally(()=>{pendingSavePromise=null;});
      return pendingSavePromise;
    }
    function create(input){return save(input);}
    async function refreshList(text=listMessage){
      const epoch=++listEpoch,identity=identityEpoch,details=()=>({authenticated:Boolean(owner()),email:authState().user?.email||'',activeId:active?.id||null});
      if(!owner()){
        projects=[];view?.showProjects({status:authState().status==='loading'?'loading':'anonymous',projects,message:'',...details()});return projects;
      }
      view?.showProjects({status:'loading',projects,message:text,...details()});
      try{
        const token=capture(),found=await token.repository.listProjects();assertCurrent(token);
        if(epoch!==listEpoch||identity!==identityEpoch||!owner())return found;
        projects=found;listMessage=text;view?.showProjects({status:'ready',projects,message:text,...details()});return found;
      }catch(error){if(epoch===listEpoch&&identity===identityEpoch&&owner())view?.showProjects({status:'error',projects:[],message:error.message,...details()});throw error;}
    }
    function open(id){const token=capture();return mutate(async()=>{
      assertCurrent(token);const project=await token.repository.getProject(id);assertCurrent(token);if(!project)throw new Error('This saved project is unavailable. Refresh My Projects.');
      suppressed=true;active=project;activeOwner=token.ownerId;remember();
      try{
        mapApi?.restoreProjectContext?.(project.workflowContext||{version:1,selection:null});
        navigate(project.currentWorkflowStep==='discovery'?'property':'property/'+project.currentWorkflowStep);
        lastSignature=signature();setStatus('draft','Opened an account project. Planning data is being rechecked; new changes require Save project.');visibility();
      }finally{suppressed=false;}
      return project;
    });}
    function rename(id,name){const token=capture();return mutate(async()=>{
      assertCurrent(token);const project=await token.repository.updateProject(id,{projectName:name});assertCurrent(token);
      if(active?.id===id&&activeOwner===token.ownerId){active=project;remember();}
      await refreshList('Account project renamed.');return project;
    });}
    function remove(id){const token=capture();return mutate(async()=>{
      assertCurrent(token);await token.repository.deleteProject(id);assertCurrent(token);
      if(active?.id===id&&activeOwner===token.ownerId){active=null;activeOwner=null;remember();setStatus('draft','Project deleted. The current enquiry remains temporary.');}
      await refreshList('Account project deleted.');visibility();
    });}
    function clearAccountContext(){suppressed=true;try{mapApi?.restoreProjectContext?.({version:1,selection:null});}finally{suppressed=false;}}
    function authChanged(){
      const next=owner();view?.setAuthentication?.({authenticated:Boolean(next),email:authState().user?.email||''});
      if(initializing){if(next!==previousOwner)identityEpoch++;previousOwner=next;return;}
      if(next===previousOwner)return;
      identityEpoch++;listEpoch++;previousOwner=next;projects=[];listMessage='';
      if(active){active=null;activeOwner=null;remember();clearAccountContext();}
      setStatus('draft',draftMessage());refreshList().catch(()=>{});
      if(next)void resumePendingSave();
    }
    const listener=()=>changed(),unsubscribe=auth?.subscribe?.(authChanged);
    const ready=(async()=>{
      try{
        await scope.FirstPrincipleProjectStorage?.clearLegacyLocalProjectsOnce?.();
        await auth?.ready;previousOwner=owner();
        let pointer;try{pointer=JSON.parse(scope.localStorage.getItem(ACTIVE_KEY)||'null');}catch(_){}
        if(pointer?.source==='account'){
          if(pointer.ownerId===owner()&&cloudRepository){
            const token=capture();active=await cloudRepository.getProject(pointer.id);assertCurrent(token);
            if(active)activeOwner=token.ownerId;else remember();
          }else remember();
        }
        const c=current(),step=mapApi?.getState?.()?.flowPage||'discovery';
        if(active&&workflowIdentity(c,step)!==workflowIdentity(active.workflowContext,active.currentWorkflowStep)){active=null;activeOwner=null;}
        remember();lastSignature=signature();setStatus('draft',draftMessage());
        await refreshList();return true;
      }catch(error){view?.showProjects({status:'error',projects:[],message:error.message,authenticated:Boolean(owner()),email:authState().user?.email||''});return false;}
      finally{initializing=false;visibility();}
    })();
    operationTail=ready.then(()=>{});
    ready.then(()=>{if(owner())void resumePendingSave();});
    scope.addEventListener('firstprinciple:workflow-context',listener);
    return Object.freeze({ready,repository:cloudRepository,cloudRepository,create,save,open,rename,remove,list:refreshList,resumePendingSave,cancelPendingSave,
      refresh:()=>refreshList().catch(()=>{}),
      getState:()=>({activeId:active?.id||null,activeSource:active?'account':null,scope:'account',status,message,revision,activeProject:active?JSON.parse(JSON.stringify(active)):null,currentDraft:current().selection?snapshot():null,authentication:{status:authState().status,canSaveToAccount:Boolean(owner())}}),
      dispose(){disposed=true;identityEpoch++;unsubscribe?.();scope.removeEventListener('firstprinciple:workflow-context',listener);}
    });
  }
  scope.FirstPrincipleMyProjects=Object.freeze({init});
})(typeof window!=='undefined'?window:globalThis);
