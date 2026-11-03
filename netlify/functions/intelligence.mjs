import {coords,inUS,spcSummary,normalizeReports,stationReading} from '../lib/intel-core.mjs';
import {json} from '../lib/shared.mjs';

const SPC='https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer';
const LSR='https://mapservices.weather.noaa.gov/vector/rest/services/obs/nws_local_storm_reports/MapServer/0/query';
const WMS='https://nowcoast.noaa.gov/geoserver/observations/lightning_detection/ows';
let lightningCache={at:0,name:null,error:''};
const fetchJson=async(url,headers={})=>{
  const r=await fetch(url,{headers:{'Accept':'application/json',...headers},signal:AbortSignal.timeout(8500)});
  if(!r.ok)throw Error(`Weather source HTTP ${r.status}`);
  const data=await r.json();if(data.error)throw Error('Weather source returned an error');return data;
};
function spcQuery(id,l){
  const p=new URLSearchParams({f:'json',geometry:JSON.stringify({x:l.longitude,y:l.latitude,spatialReference:{wkid:4326}}),geometryType:'esriGeometryPoint',spatialRel:'esriSpatialRelIntersects',inSR:'4326',outFields:'dn,label,valid,issue',returnGeometry:'false'});
  return fetchJson(`${SPC}/${id}/query?${p}`);
}
async function reports(l){
  const delta=2;
  const p=new URLSearchParams({f:'geojson',geometry:JSON.stringify({xmin:l.longitude-delta,ymin:l.latitude-delta,xmax:l.longitude+delta,ymax:l.latitude+delta,spatialReference:{wkid:4326}}),geometryType:'esriGeometryEnvelope',spatialRel:'esriSpatialRelIntersects',inSR:'4326',outSR:'4326',outFields:'objectid,lsr_validtime,valid_time,descript,loc_desc,state,magnitude,units,remarks',returnGeometry:'true',resultRecordCount:'140'});
  const data=await fetchJson(`${LSR}?${p}`);return normalizeReports(data.features,l);
}
async function observation(l){
  const headers={'User-Agent':process.env.NWS_USER_AGENT||'StormlineWeather/2.0 (https://github.com/newlinj821-jpg/Stormline)','Accept':'application/geo+json'};
  const info=await fetchJson(`https://api.weather.gov/points/${l.latitude.toFixed(4)},${l.longitude.toFixed(4)}`,headers);
  const stationsUrl=info.properties?.observationStations;
  if(!stationsUrl?.startsWith('https://api.weather.gov/'))throw Error('No observation stations for location');
  const stations=await fetchJson(stationsUrl,headers),first=stations.features?.[0];
  if(!first)return null;
  const ref=first.properties?.stationIdentifier;
  if(!/^[A-Z0-9-]{3,12}$/i.test(ref||''))return null;
  const last=await fetchJson(`https://api.weather.gov/stations/${encodeURIComponent(ref)}/observations/latest`,headers);
  return stationReading(first,last,l);
}
async function getLightningLayer(){
  if(Date.now()-lightningCache.at<3600000)return lightningCache;
  try{
    const url=`${WMS}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities`;
    const r=await fetch(url,{signal:AbortSignal.timeout(8500)});if(!r.ok)throw Error('NOAA lightning service unavailable');
    const xml=await r.text();const found=[...xml.matchAll(/<Name>\s*([^<>]+)\s*<\/Name>/g)].map(x=>x[1].trim()).filter(x=>/^[a-z0-9:_-]+$/i.test(x));
    const layers=found.filter(x=>/strike|lightning|density/i.test(x)&&x.toUpperCase()!=='WMS');
    if(!layers.length)throw Error('No supported lightning-density layer published');
    lightningCache={at:Date.now(),name:layers.find(x=>/dens/i.test(x))||layers[0],error:''};
  }catch(e){lightningCache={at:Date.now(),name:null,error:'NOAA lightning-density imagery is temporarily unavailable.'};}
  return lightningCache;
}
export default async function handler(req){
  if(req.method!=='GET')return json({error:'Method not allowed'},405);
  const u=new URL(req.url);
  if(u.searchParams.get('resource')==='lightning'){
    const layer=await getLightningLayer();return json({available:Boolean(layer.name),layer:layer.name,service:WMS,updatedAt:new Date(layer.at).toISOString(),error:layer.error});
  }
  const l=coords(u.searchParams.get('lat'),u.searchParams.get('lon'));
  if(!l)return json({error:'Invalid location'},400);
  if(!inUS(l))return json({available:false,outsideUS:true,checkedAt:new Date().toISOString(),message:'U.S. NOAA intelligence layers are not available for this location.'});
  const tasks={category:()=>spcQuery(1,l),tornado:()=>spcQuery(3,l),hail:()=>spcQuery(5,l),wind:()=>spcQuery(7,l),reports:()=>reports(l),station:()=>observation(l)};
  const settled=await Promise.all(Object.entries(tasks).map(async([key,fn])=>{try{return [key,{ok:true,value:await fn()}];}catch(error){console.warn('Stormline intelligence source unavailable',key,String(error.message).slice(0,130));return [key,{ok:false,error:'Source temporarily unavailable'}];}}));
  const source=Object.fromEntries(settled),result={available:true,checkedAt:new Date().toISOString(),sources:Object.fromEntries(settled.map(([k,v])=>[k,{ok:v.ok,error:v.error||null}]))};
  result.outlook=Object.fromEntries(['category','tornado','hail','wind'].map(k=>[k,source[k].ok?spcSummary(source[k].value.features,k==='category'?'categorical':k):{available:false,label:'Data unavailable',value:null}]));
  result.reports=source.reports.ok?source.reports.value:[];
  result.station=source.station.ok?source.station.value:null;
  return json(result,200);
}
