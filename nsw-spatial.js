/* Official, bounded, property-driven spatial queries. No legal inference or saved fallback data. */
(function (scope) {
  'use strict';
  const SIX = 'https://maps.six.nsw.gov.au/arcgis/rest/services';
  const EPI = 'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/EPI_Primary_Planning_Layers/MapServer';
  const SOURCES = Object.freeze({
    property: {url:SIX+'/public/NSW_Property/MapServer/4',fields:'propid,housenumber,address,RID',catalogue:'https://data.nsw.gov.au/data/dataset/nsw-property-web-service'},
    lots: {url:SIX+'/public/NSW_Cadastre/MapServer/9',fields:'objectid,cadid,lotnumber,sectionnumber,planlabel,lotidstring,lastupdate',catalogue:'https://www.data.nsw.gov.au/data/dataset/nsw-cadastre-web-service'},
    council: {url:SIX+'/public/NSW_Administrative_Boundaries/MapServer/1',fields:'cadid,lganame,councilname,lastupdate',catalogue:'https://data.nsw.gov.au/data/dataset/lpi-web-services-nsw-administrative-boundaries'},
    zoning: {url:EPI+'/2',fields:'OBJECTID,EPI_NAME,LGA_NAME,SYM_CODE,LAY_CLASS,CURRENCY_DATE,COMMENCED_DATE,PUBLISHED_DATE,AMENDMENT,PCO_REF_KEY'},
    height: {url:EPI+'/5',fields:'OBJECTID,EPI_NAME,MAX_B_H,MAX_B_H_M,MAX_B_H_RL,UNITS,CURRENCY_DATE,PCO_REF_KEY'},
    fsr: {url:EPI+'/1',fields:'OBJECTID,EPI_NAME,FSR,CURRENCY_DATE,PCO_REF_KEY'},
    lotSize: {url:EPI+'/4',fields:'OBJECTID,EPI_NAME,LOT_SIZE,UNITS,CURRENCY_DATE,PCO_REF_KEY'},
    heritage: {url:EPI+'/0',fields:'OBJECTID,EPI_NAME,H_ID,H_NAME,SIG,LAY_CLASS,CURRENCY_DATE,PCO_REF_KEY'}
  });
  const PROJECT = SIX+'/Utilities/Geometry/GeometryServer/project';
  const LIMIT = 100;
  const copy = value => JSON.parse(JSON.stringify(value));
  const positiveId = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value)>0 ? Number(value) : null;
  function abortError() { const error=new Error('Spatial query cancelled'); error.name='AbortError'; return error; }
  function checkAbort(signal) { if(signal?.aborted)throw abortError(); }
  function point(value) { return Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)&&value[0]>=112&&value[0]<=160&&value[1]>=-44.5&&value[1]<=-9; }
  function normalizedFeature(feature) {
    const properties={};Object.entries(feature.properties||{}).forEach(([key,value])=>{properties[key.toUpperCase()]=value;});
    return {type:'Feature',properties,geometry:feature.geometry||null};
  }
  function polygon(geometry) {
    if(!geometry||!['Polygon','MultiPolygon'].includes(geometry.type))throw new Error('A polygon boundary was not returned');
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
    let vertices=0;
    if(!Array.isArray(polygons)||!polygons.length)throw new Error('Empty polygon boundary');
    for(const rings of polygons){
      if(!Array.isArray(rings)||!rings.length)throw new Error('Invalid polygon rings');
      for(const ring of rings){
        if(!Array.isArray(ring)||ring.length<4||ring.some(p=>!point(p))||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw new Error('Invalid WGS84 polygon coordinates');
        vertices+=ring.length;
      }
    }
    if(vertices>250000)throw new Error('Boundary is too complex for this browser pilot');
    return geometry;
  }
  function esriPolygon(geometry) {
    polygon(geometry);
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates,rings=[];
    // Esri JSON uses clockwise outer rings and counterclockwise holes.
    polygons.forEach(part=>part.forEach((ring,index)=>{
      let area=0;for(let i=0;i<ring.length-1;i++)area+=ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1];
      rings.push((index===0?area>0:area<0)?[...ring].reverse():ring);
    }));
    return {rings,spatialReference:{wkid:4326}};
  }
  function initial(address='') {
    return {status:'idle',address,retrievedAt:null,match:{status:'not_checked',note:'Choose a NSW street address, then query the official property services.'},property:null,propertyCandidates:[],layers:{},mapLayers:{property:false,lots:false,zoning:false},visibleLayers:{property:true,lots:false,zoning:false},provenance:[]};
  }
  function createClient(options={}) {
    const fetcher=options.fetch||((...args)=>scope.fetch(...args)),timeoutMs=options.timeoutMs||18000;
    async function request(url,params,signal,post=false) {
      checkAbort(signal);
      const controller=new AbortController(),onAbort=()=>controller.abort();signal?.addEventListener('abort',onAbort,{once:true});
      const timer=setTimeout(()=>controller.abort(),timeoutMs),start=Date.now();
      try {
        const search=new URLSearchParams(params),response=await fetcher(post?url:url+'?'+search,{method:post?'POST':'GET',body:post?search:undefined,signal:controller.signal,credentials:'omit',mode:'cors'});
        if(!response.ok)throw new Error('Official service returned HTTP '+response.status);
        const raw=await response.text();if(raw.length>10000000)throw new Error('Spatial response exceeds the pilot size limit');
        const data=JSON.parse(raw);
        if(data.error)throw new Error('Official service: '+(data.error.message||'query unavailable'));
        if(data.exceededTransferLimit||data.properties?.exceededTransferLimit)throw new Error('Official query was truncated; a complete result cannot be shown');
        return {data,durationMs:Date.now()-start,retrievedAt:new Date().toISOString()};
      }catch(error){if(signal?.aborted)throw abortError();if(controller.signal.aborted)throw new Error('Official spatial service timed out; retry the query');throw error;}
      finally {clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
    }
    async function features(key,params,signal,post=false) {
      // This legacy LGA service rejects resultRecordCount (pagination is unsupported).
      // Still reject transfer-limit flags and oversized/over-limit responses.
      const source=SOURCES[key],result=await request(source.url+'/query',{outFields:source.fields,returnGeometry:'true',outSR:'4326',f:'geojson',...(key==='council'?{}:{resultRecordCount:String(LIMIT+1)}),...params},signal,post);
      const data=result.data;
      if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw new Error('Official service returned an unexpected feature format');
      if(data.features.length>LIMIT)throw new Error('Too many intersecting records; specialist review is needed');
      if(data.crs&&!/4326|CRS84/.test(JSON.stringify(data.crs)))throw new Error('Unexpected coordinate system in spatial result');
      const items=data.features.map(normalizedFeature);
      if(params.returnGeometry!=='false'&&items.some(item=>!item.geometry))throw new Error('Official service returned attributes without the requested polygon geometry');
      items.forEach(item=>{if(item.geometry)polygon(item.geometry);});
      return {status:items.length?'ready':'empty',features:items,sourceUrl:source.url,retrievedAt:result.retrievedAt,durationMs:result.durationMs,queryBasis:params.geometryType==='esriGeometryPolygon'?'property_polygon':params.geometryType==='esriGeometryPoint'?'point_only':'property_id',inputCRS:params.inSR||null,outputCRS:'EPSG:4326',relation:params.relationParam||params.spatialRel||'attribute_identity'};
    }
    async function projectAddress(address,{signal}={}) {
      const original=address.sourceCenter||address.center,wkid=address.sourceWkid||(/^EPSG:(4283|4326)$/.test(address.coordinateSystem||'')?Number(address.coordinateSystem.slice(5)):null);
      if(!point(original))throw new Error('No valid NSW address coordinate was returned');
      if(wkid===4326)return {...address,center:[...original],mapCoordinateStatus:'wgs84'};
      if(wkid!==4283)throw new Error('The address coordinate system is unverified. Choose a verified NSW address.');
      const result=await request(PROJECT,{inSR:'4283',outSR:'4326',geometries:JSON.stringify({geometryType:'esriGeometryPoint',geometries:[{x:original[0],y:original[1]}]}),f:'json'},signal);
      const value=result.data.geometries?.[0],center=[value?.x,value?.y];if(!point(center))throw new Error('The official coordinate transformation failed');
      return {...address,sourceCenter:[...original],sourceWkid:4283,center,mapCoordinateStatus:'server_projected',mapCRS:'EPSG:4326',projection:{sourceUrl:PROJECT,retrievedAt:result.retrievedAt,method:'Official ArcGIS server default datum transformation; not survey precision'}};
    }
    async function query(address,{signal,onUpdate,propertyId,includeControls=true}={}) {
      const state=initial(address?.name||'');state.status='loading';
      const emit=()=>{checkAbort(signal);if(onUpdate)onUpdate(copy(state));};
      if(address?.state!=='NSW'||address.kind!=='address'||address.precision!=='address_point'){
        state.status='unsupported';state.match.note='Live property queries currently require a NSW street-address result. Areas, saved case points and unverified units do not establish a legal parcel.';emit();return state;
      }
      const selectedId=positiveId(propertyId),officialId=address.provider==='nsw_spatial'?positiveId(address.propertyId):null;
      let params;
      if(selectedId||officialId)params={where:'propid='+String(selectedId||officialId)};
      else {
        const coordinates=address.sourceCenter||address.center,wkid=address.sourceWkid||(address.mapCoordinateStatus==='wgs84'||address.mapCRS==='EPSG:4326'?4326:null);
        if(!point(coordinates)||![4283,4326].includes(wkid)){state.status='error';state.match.note='The source CRS or official property ID is missing. No parcel has been inferred.';emit();return state;}
        params={geometry:coordinates.join(','),geometryType:'esriGeometryPoint',inSR:String(wkid),spatialRel:'esriSpatialRelIntersects'};
      }
      emit();
      try {
        const result=await features('property',params,signal);state.provenance.push({layer:'property',...result,features:undefined});
        const expectedId=selectedId||officialId;
        if(expectedId&&result.features.some(f=>positiveId(f.properties.PROPID)!==expectedId)){
          state.match.status='identity_conflict';
          throw new Error('Returned Property ID does not match the official address or confirmed candidate. No boundary was selected.');
        }
        // SIX repeats a shared footprint for street and unit-address aliases.
        // Collapse only byte-identical geometry with the same verified ID, retain
        // every address alias, and never turn this into a unit/title verification.
        const addressAliases=[...new Set(result.features.map(f=>f.properties.ADDRESS).filter(Boolean))];
        const originalCount=result.features.length;
        if(expectedId&&result.features.length>1&&result.features.every(f=>JSON.stringify(f.geometry)===JSON.stringify(result.features[0].geometry)))result.features=[result.features[0]];
        if(result.features.length!==1||(!selectedId&&!officialId)){
          state.status=result.features.length?'partial':'error';
          state.match={status:result.features.length>1?'ambiguous':result.features.length?'point_candidate':'no_match',note:result.features.length?'Address-point intersections are candidates. Confirm a property before querying its planning overlays. A unit or strata title is not established.':'No property was returned. Check the address or the official Spatial Viewer; no nearby parcel has been substituted.'};
          const counts=new Map();result.features.forEach(f=>counts.set(f.properties.PROPID,(counts.get(f.properties.PROPID)||0)+1));
          state.propertyCandidates=result.features.filter(f=>positiveId(f.properties.PROPID)&&counts.get(f.properties.PROPID)===1).map(f=>({id:f.properties.PROPID,label:(f.properties.ADDRESS||'Property')+' · Property '+f.properties.PROPID}));
          if(result.features.length&&!state.propertyCandidates.length)state.match.note+=' Multiple non-identical footprints share a Property ID; a source review is required and an ID-only choice cannot resolve it.';
          emit();return state;
        }
        const feature=result.features[0];polygon(feature.geometry);
        state.property={id:feature.properties.PROPID,lotLabels:[],sourceUrl:SOURCES.property.url,currency:null,feature,queryBasis:result.queryBasis,addressAliases,sourceFeatureCount:originalCount};
        state.match={status:officialId&&!selectedId?'exact_property_id':'confirmed_candidate',note:officialId&&!selectedId?'Address record and property share the official Property ID. The mapped boundary is not a survey or title search.':'You confirmed an address-point property candidate. Identity and title still need independent checking.'};
        if(address.unitNumber)state.match.note+=' The unit or strata lot is not verified.';
        if(originalCount>1)state.match.note+=' '+originalCount+' address records share this identical mapped footprint. Address aliases were retained; unit and title entitlements remain unverified.';
        state.mapLayers.property=true;state.retrievedAt=result.retrievedAt;
        const geometry=JSON.stringify(esriPolygon(feature.geometry));
        const intersect={geometry,geometryType:'esriGeometryPolygon',inSR:'4326',spatialRel:'esriSpatialRelRelation',relationParam:'T********'};
        // Interior intersection retains possible split zones while excluding line-only touches.
        const core=['lots','council','zoning'];for(const key of core)state.layers[key]={status:'loading',features:[],sourceUrl:SOURCES[key].url,queryBasis:'property_polygon'};emit();
        async function load(key) {
          try {
            const layer=await features(key,{...intersect,returnGeometry:key==='council'?'false':'true'},signal,true);checkAbort(signal);state.layers[key]=layer;
            state.provenance.push({layer:key,...layer,features:undefined});
            if(key==='lots') {state.property.lotLabels=[...new Set(layer.features.map(f=>{const p=f.properties;return p.LOTIDSTRING||[p.LOTNUMBER,p.SECTIONNUMBER,p.PLANLABEL].filter(Boolean).join(' / ');} ))];state.mapLayers.lots=layer.status==='ready';}
            if(key==='zoning')state.mapLayers.zoning=layer.status==='ready';
          }catch(error){if(signal?.aborted)throw abortError();state.layers[key]={status:'error',features:[],sourceUrl:SOURCES[key].url,queryBasis:'property_polygon',error:error.message,note:error.message};}
          emit();
        }
        await Promise.all(core.map(load));
        if(includeControls){
          // At most three parallel service requests. Never load statewide polygons.
          for(const keys of [['height','fsr','lotSize'],['heritage']]){
            keys.forEach(key=>{state.layers[key]={status:'loading',features:[],sourceUrl:SOURCES[key].url,queryBasis:'property_polygon'};});emit();
            await Promise.all(keys.map(load));
          }
        }
        state.status=core.every(key=>state.layers[key].status==='ready')&&!Object.values(state.layers).some(layer=>layer.status==='error')?'ready':'partial';
        state.retrievedAt=new Date().toISOString();emit();return state;
      }catch(error){if(signal?.aborted)throw abortError();state.status='error';state.match.note=error.message;emit();return state;}
    }
    return {query,projectAddress};
  }
  const api={SOURCES,createClient,initial,esriPolygon};scope.FirstPrincipleNSWSpatial=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
