/* Explicit-submit address search. Official NSW matches and indicative national
 * community-map results remain distinct; this module never checks planning law. */
(function (scope) {
  'use strict';
  const NSW_ENDPOINT = 'https://mapsq.six.nsw.gov.au/services/public/Address_Location';
  const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';
  const SOURCES = Object.freeze({
    nsw: {title:'NSW Spatial Services · Address Location',url:'https://maps.six.nsw.gov.au/sws/AddressLocation.html'},
    photon: {title:'Photon / OpenStreetMap contributors',url:'https://www.openstreetmap.org/copyright',terms:'https://github.com/komoot/photon#demo-server'}
  });
  const STATES = Object.freeze({NSW:'New South Wales',VIC:'Victoria',QLD:'Queensland',SA:'South Australia',WA:'Western Australia',TAS:'Tasmania',ACT:'Australian Capital Territory',NT:'Northern Territory'});
  const ROAD_PAIRS = 'ACCESS:ACCS ALLEY:ALLY ALLEYWAY:ALWY AMBLE:AMBL APPROACH:APP ARCADE:ARC ARTERIAL:ARTL ARTERY:ART AVENUE:AVE BANAN:BA BEND:BEND BOARDWALK:BWLK BOULEVARD:BVD BRACE:BRCE BRAE:BRAE BREAK:BRK BROADWAY:BDWY BROW:BROW BYPASS:BYPA BYWAY:BYWY CAUSEWAY:CAUS CENTRE:CTR CHASE:CH CIRCLE:CIR CIRCLET:CLT CIRCUIT:CCT CIRCUS:CRCS CLOSE:CL COMMON:CMMN CONCOURSE:CON COPSE:CPS CORNER:CNR COURT:CT COURTYARD:CTYD COVE:COVE CRESCENT:CR CREST:CRST CROSS:CRSS CROSSING:CRSG CUL-DE-SAC:CSAC CUTTING:CUTT DALE:DALE DEVIATION:DEVN DIP:DIP DISTRIBUTOR:DSTR DRIVE:DR DRIVEWAY:DRWY EDGE:EDGE ELBOW:ELB END:END ENTRANCE:ENT ESPLANADE:ESP EXPRESSWAY:EXP EXTENSION:EXTN FAIRWAY:FAWY FIRETRACK:FTRK FIRETRAIL:FITR FOLLOW:FOLW FOOTWAY:FTWY FORMATION:FORM FREEWAY:FWY FRONTAGE:FRTG GAP:GAP GARDEN:GDN GARDENS:GDNS GATE:GATE GLADE:GLD GLEN:GLEN GRANGE:GRA GREEN:GRN GROVE:GR HEIGHTS:HTS HIGHROAD:HRD HIGHWAY:HWY HILL:HILL INTERCHANGE:INTG JUNCTION:JNC KEY:KEY LANE:LANE LANEWAY:LNWY LINE:LINE LINK:LINK LOOKOUT:LKT LOOP:LOOP MALL:MALL MEANDER:MNDR MEWS:MEWS MOTORWAY:MWY NOOK:NOOK OUTLOOK:OTLK PARADE:PDE PARKWAY:PKWY PASS:PASS PASSAGE:PSGE PATH:PATH PATHWAY:PHWY PIAZZA:PIAZ PLACE:PL PLAZA:PLZA POCKET:PKT POINT:PNT PORT:PORT PROMENADE:PROM QUADRANT:QDRT QUAY:QY QUAYS:QYS RAMBLE:RMBL RAMP:RAMP REST:REST RETREAT:RTT RIDGE:RDGE RING:RING RISE:RISE ROAD:RD ROADS:RDS ROTARY:RTY ROUTE:RTE ROW:ROW RUE:RUE SERVICEWAY:SVWY SHUNT:SHUN SPUR:SPUR SQUARE:SQ STAIRS:STRS STEPS:STPS STREET:ST STRIP:STRP SUBWAY:SBWY TARN:TARN TERRACE:TCE THOROUGHFARE:THOR TOLLWAY:TLWY TOP:TOP TOR:TOR TRACK:TRK TRAIL:TRL TURN:TURN UNDERPASS:UPAS VALE:VALE VIADUCT:VIAD VIEW:VIEW VISTA:VSTA WALK:WALK WALKWAY:WKWY WAY:WAY WHARF:WHRF WYND:WYND';
  const ROAD_TYPES = {};
  ROAD_PAIRS.split(' ').forEach(pair => { const [full,short]=pair.split(':'); ROAD_TYPES[full]=full; ROAD_TYPES[short]=full; });
  Object.assign(ROAD_TYPES,{CRES:'CRESCENT',LN:'LANE',BLVD:'BOULEVARD',CIRCT:'CIRCUIT'});
  const roadPattern=Object.keys(ROAD_TYPES).sort((a,b)=>b.length-a.length).join('|');
  const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toUpperCase();
  const numberKey = value => String(value || '').replace(/\s/g,'').replace(/[–—]/g,'-').toUpperCase();
  const stateCode = value => Object.keys(STATES).find(code=>norm(value)===code || norm(value)===norm(STATES[code])) || '';
  const finitePoint = center => Array.isArray(center) && center.length===2 && center.every(Number.isFinite) && center[0]>=112 && center[0]<=160 && center[1]>=-44.5 && center[1]<=-9;
  const cache = new Map();
  let photonStartedAt=0;

  function parseQuery(value) {
    let text=String(value || '').normalize('NFKC').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
    if (!text || text.length>180 || /[\u0000-\u001f<>]/.test(text)) return null;
    const query=text;
    text=text.replace(/(?:,?\s+)Australia\s*$/i,'').trim();
    let postcode='';
    const post=text.match(/(?:^|[\s,])(\d{4})\s*$/);
    if (post) { postcode=post[1]; text=text.slice(0,post.index).trim(); }
    let state='';
    const stateOptions=Object.entries(STATES).flatMap(([code,name])=>[code,name]).sort((a,b)=>b.length-a.length).join('|');
    const stateMatch=text.match(new RegExp('(?:^|[\\s,])('+stateOptions+')\\s*$','i'));
    if (stateMatch) { state=stateCode(stateMatch[1]); text=text.slice(0,stateMatch.index).replace(/[,\s]+$/,''); }
    // Also accept a postcode before a final state abbreviation.
    if (!postcode) { const trailing=text.match(/(?:^|[\s,])(\d{4})\s*$/); if(trailing){postcode=trailing[1];text=text.slice(0,trailing.index).trim();} }
    let unitNumber='',unitType='',level='',unitText='';
    let remainder=text.replace(/,/g,' ').replace(/\s+/g,' ').trim();
    const levelMatch=remainder.match(/^(?:level|lvl|floor)\s+([a-z0-9-]+)\s+/i);
    if(levelMatch){level=levelMatch[1];remainder=remainder.slice(levelMatch[0].length);}
    const unitMatch=remainder.match(/^(?:(unit|apartment|apt|flat|suite|shop|townhouse|villa)\s+)?([a-z]?\d+[a-z]?)\s*\/\s*(?=\d)/i) || remainder.match(/^(unit|apartment|apt|flat|suite|shop|townhouse|villa)\s+([a-z]?\d+[a-z]?)\s+(?=\d)/i);
    if(unitMatch){unitType=unitMatch[1] || 'unit';unitNumber=unitMatch[2];unitText=unitMatch[0].trim();remainder=remainder.slice(unitMatch[0].length);}
    const addressMatch=remainder.match(new RegExp('^(\\d+[a-z]?(?:\\s*-\\s*\\d+[a-z]?)?)\\s+(.+?)\\s+('+roadPattern+')\\.?(?:\\s+(.*))?$','i'));
    if(addressMatch){
      const suburb=(addressMatch[4] || '').trim(),roadSuffix='';
      // Keep a locality such as North Sydney intact. This public API has no
      // documented road-suffix input; never guess where a direction belongs.
      return {query,kind:'address',streetNumber:numberKey(addressMatch[1]),houseNumber:numberKey(addressMatch[1]),roadName:addressMatch[2].trim(),roadType:ROAD_TYPES[addressMatch[3].toUpperCase()],roadSuffix,suburb,state,postcode,postCode:postcode,unitNumber,unitType,unitText,level,hasSubaddress:Boolean(unitNumber || level),complete:Boolean(suburb || postcode)};
    }
    return {query,kind:postcode && !text ? 'postcode':'locality',name:text.replace(/,/g,' ').trim(),state,postcode,unitNumber,unitType,level,hasSubaddress:Boolean(unitNumber || level),complete:false};
  }
  function parseAddress(value){const p=parseQuery(value);return p && p.kind==='address' && p.complete?p:null;}
  function nswParameters(parsed){
    return {houseNumber:parsed.streetNumber,roadName:parsed.roadName,roadType:parsed.roadType,suburb:[parsed.roadSuffix,parsed.suburb].filter(Boolean).join(' '),postCode:parsed.postcode,projection:'EPSG:4326'};
  }
  async function fetchJSON(url,signal) {
    const response=await scope.fetch(url,{signal,credentials:'omit',mode:'cors'});
    if(!response.ok)throw new Error('Location service returned HTTP '+response.status);
    const result=await response.json();if(result.error)throw new Error('Location service is unavailable');return result;
  }
  function normalizeNSW(payload,parsed,limit=12){
    const result=payload && payload.addressResult;
    if(!result || result.errMsg || !Array.isArray(result.addresses))return [];
    const methods=Array.isArray(result.searchMethod?.methodDescriptions)?result.searchMethod.methodDescriptions.map(String):[];
    const serviceExact=Number(result.numRecs)===1 && result.addresses.length===1 && methods.includes('Input parameters matched') && !methods.some(method=>/ignored|closest|alternate|not matched/i.test(method));
    return result.addresses.filter(item=>finitePoint([item.addressPoint?.centreX,item.addressPoint?.centreY])).slice(0,limit).map(item=>{
      const returnedNumber=numberKey(item.houseNumberString || (String(item.houseNumberFirst || '')+(item.houseNumberFirstSuffix || '')+(item.houseNumberSecond?'-'+item.houseNumberSecond+(item.houseNumberSecondSuffix || ''):'')));
      const numberMatches=returnedNumber===numberKey(parsed.streetNumber);
      const streetMatches=norm(item.roadName)===norm(parsed.roadName) && ROAD_TYPES[norm(item.roadType)]===parsed.roadType;
      const suburbMatches=!parsed.suburb || norm(item.suburbName)===norm(parsed.suburb);
      const postcodeMatches=!parsed.postcode || String(item.postCode)===parsed.postcode;
      const suffixMatches=!parsed.roadSuffix && !item.roadSuffix;
      const exact=serviceExact && numberMatches && streetMatches && suburbMatches && postcodeMatches && suffixMatches && !parsed.hasSubaddress;
      const notes=['Address reference point; not a surveyed lot boundary or exact building footprint.'];
      if(parsed.hasSubaddress)notes.push('The public NSW service locates the street address only. Unit or level '+[parsed.unitNumber,parsed.level].filter(Boolean).join(' / ')+' has not been verified.');
      if(!numberMatches)notes.push('The returned street number differs from your input.');
      if(!suburbMatches || !postcodeMatches || !streetMatches || !suffixMatches)notes.push('One or more address components differ from your input. Check the complete returned address.');
      return {kind:'address',name:String(item.shortAddressString || [returnedNumber,item.roadName,item.roadType,item.suburbName].filter(Boolean).join(' '))+(item.postCode?' NSW '+item.postCode:''),center:[item.addressPoint.centreX,item.addressPoint.centreY],council_ids:[],exact,precision:'address_point',state:'NSW',postcode:String(item.postCode || ''),streetNumber:returnedNumber,unitNumber:parsed.unitNumber,unitVerified:false,source:SOURCES.nsw.title,sourceUrl:SOURCES.nsw.url,provider:'nsw_spatial',coverage:'nsw',methods:[...methods,...notes],notes,coordinateSystem:item.addressPoint.coordRefSys,addressCouncil:item.council || '',input:parsed.query};
    });
  }
  function photonName(props,kind){
    const street=kind==='address'?[props.housenumber,props.street].filter(Boolean).join(' '):kind==='street'?(props.street || props.name):props.name;
    const place=props.city || props.district || props.locality || '';
    return [...new Set([street || props.name,place,stateCode(props.state),props.postcode].filter(Boolean))].join(', ');
  }
  function normalizePhoton(payload,parsed,limit=12){
    if(!Array.isArray(payload?.features))return [];
    const list=payload.features.filter(feature=>{
      const p=feature.properties || {};
      if(feature.geometry?.type!=='Point' || !finitePoint(feature.geometry.coordinates) || String(p.countrycode).toUpperCase()!=='AU')return false;
      const area=p.osm_key==='place' || p.osm_key==='boundary' || ['city','district','county','state','country','postcode'].includes(p.type);
      if(parsed.kind!=='address')return area;
      return Boolean(p.housenumber && p.street) || p.type==='street' || p.osm_key==='highway' || area;
    }).map(feature=>{
      const p=feature.properties, state=stateCode(p.state), hasNumber=Boolean(p.housenumber && p.street);
      const isStreet=p.type==='street' || p.osm_key==='highway';
      const kind=hasNumber?'address':isStreet?'street':p.type==='postcode' || p.osm_value==='postcode'?'postcode':'locality';
      const precision=hasNumber?'address_point':isStreet?'street':kind==='postcode'?'postcode':'locality';
      const notes=['Community-map result. This is not official address or council verification; coverage may be incomplete.'];
      if(parsed.hasSubaddress)notes.push('The requested unit or level has not been verified.');
      if(parsed.kind==='address' && !hasNumber)notes.push('No matching street-number point was returned. This result is an area or street reference only.');
      if(state==='NSW')notes.push('Use the NSW official address search to verify this point.');
      if(parsed.postcode && !p.postcode && kind!=='address')notes.push('The requested postcode has not been independently matched for this area.');
      const bbox=Array.isArray(p.extent) && p.extent.length===4 && p.extent.every(Number.isFinite)?[p.extent[0],p.extent[3],p.extent[2],p.extent[1]]:undefined;
      return {kind,name:photonName(p,kind),center:[...feature.geometry.coordinates],bbox,council_ids:[],exact:false,precision,state,postcode:String(p.postcode || (kind==='postcode' && /^\d{4}$/.test(p.name || '')?p.name:'')),streetNumber:String(p.housenumber || ''),unitNumber:parsed.unitNumber || '',unitVerified:false,source:SOURCES.photon.title,sourceUrl:SOURCES.photon.url,provider:'photon_osm',coverage:state?(state==='NSW'?'nsw':'outside_nsw'):'unconfirmed',methods:[...notes],notes,coordinateSystem:'EPSG:4326',input:parsed.query,osmType:p.osm_type,osmId:p.osm_id,propertyLabel:p.name || '',street:p.street || ''};
    }).filter(item=>{
      // A typed number must not quietly become a different property's number.
      if(parsed.kind==='address' && item.kind==='address' && numberKey(item.streetNumber)!==numberKey(parsed.streetNumber))return false;
      if(parsed.kind!=='address' && item.kind==='address')return false;
      if(parsed.state && item.state && parsed.state!==item.state)return false;
      if(parsed.postcode && item.postcode && parsed.postcode!==item.postcode)return false;
      return true;
    });
    const seen=new Set();return list.filter(item=>{const key=item.name+'|'+item.center.join(',');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,limit);
  }
  function abortError(){const error=new Error('Location search cancelled');error.name='AbortError';return error;}
  function wait(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted){reject(abortError());return;}const cancel=()=>{clearTimeout(timer);reject(abortError());};const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);signal?.addEventListener('abort',cancel,{once:true});});}
  async function search(query,options={}){
    const parsed=parseQuery(query);if(!parsed)return [];
    const limit=Math.min(12,Math.max(1,Number(options.limit) || 12));
    const signal=options.signal;if(signal?.aborted)throw abortError();
    // Memory-only caching avoids repeated requests during one demonstration.
    const key=parsed.query.toLowerCase()+'|'+limit;
    if(cache.has(key))return JSON.parse(JSON.stringify(cache.get(key)));
    const nswCandidate=parsed.kind==='address' && parsed.complete && (!parsed.state || parsed.state==='NSW') && (!parsed.postcode || /^2\d{3}$/.test(parsed.postcode));
    if(nswCandidate){
      const params=new URLSearchParams(Object.entries(nswParameters(parsed)).filter(([,value])=>value));
      const candidates=normalizeNSW(await fetchJSON(NSW_ENDPOINT+'?'+params,signal),parsed,limit);
      // Never replace a failed or adjusted NSW result with an undisclosed provider.
      cache.set(key,candidates);return JSON.parse(JSON.stringify(candidates));
    }
    // Explicit searches only. The public demo server permits reasonable use;
    // users see its provider/limitations. No autocomplete, bulk or reverse crawl.
    photonStartedAt=Math.max(Date.now(),photonStartedAt+1000);
    const delay=photonStartedAt-Date.now();if(delay>0)await wait(delay,signal);
    const term=parsed.kind==='locality'?[parsed.name,STATES[parsed.state],'Australia'].filter(Boolean).join(' '):/\bAustralia\b/i.test(parsed.query)?parsed.query:parsed.query+' Australia';
    const params=new URLSearchParams({q:term,lang:'en',limit:String(limit),bbox:'112,-44.5,160,-9'});
    const candidates=normalizePhoton(await fetchJSON(PHOTON_ENDPOINT+'?'+params,signal),parsed,limit);
    cache.set(key,candidates);return JSON.parse(JSON.stringify(candidates));
  }
  const api={SOURCES,STATES,parse:parseQuery,parseQuery,parseAddress,nswParameters,normalizeNSW,normalizePhoton,search};
  scope.FirstPrincipleAddressSearch=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
