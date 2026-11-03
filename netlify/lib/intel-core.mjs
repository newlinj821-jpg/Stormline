export function coords(lat, lon) {
  const latitude=Number(lat),longitude=Number(lon);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<-90||latitude>90||longitude<-180||longitude>180) return null;
  return {latitude,longitude};
}
export function inUS(l) {return l.latitude>=18&&l.latitude<=72&&l.longitude>=-171&&l.longitude<=-65;}
export function milesBetween(a,b) {
  const toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.latitude-a.latitude),dLon=toRad(b.longitude-a.longitude);
  const x=Math.sin(dLat/2)**2+Math.cos(toRad(a.latitude))*Math.cos(toRad(b.latitude))*Math.sin(dLon/2)**2;
  return 3958.76*2*Math.asin(Math.min(1,Math.sqrt(x)));
}
export const categories={2:'General thunderstorms',3:'Marginal',4:'Slight',5:'Enhanced',6:'Moderate',8:'High'};
export function spcSummary(features,kind) {
  const values=(Array.isArray(features)?features:[]).map(f=>f.attributes||f.properties||{});
  if(!values.length)return {available:true,label:'Outside outlined area',value:0,issued:null};
  const best=values.reduce((a,b)=>Number(b.dn)>Number(a.dn)?b:a,values[0]);
  const v=Number(best.dn);
  return {available:true,label:kind==='categorical'?(categories[v]||best.label||`Tier ${v}`):`${Number.isFinite(v)?v:'—'}%`,value:Number.isFinite(v)?v:0,issued:best.issue||best.valid||null};
}
export function normalizeReports(features,l,maxMiles=110){
  if(!Array.isArray(features))return [];
  return features.map(f=>{
    const a=f.properties||f.attributes||{},c=f.geometry?.coordinates;
    const lat=Array.isArray(c)?Number(c[1]):Number(f.geometry?.y),lon=Array.isArray(c)?Number(c[0]):Number(f.geometry?.x);
    if(!coords(lat,lon))return null;
    const distance=Math.round(milesBetween(l,{latitude:lat,longitude:lon}));
    return {id:String(a.objectid||a.OBJECTID||`${lat},${lon},${a.descript||''}`),type:String(a.descript||'Weather report').slice(0,60),where:String(a.loc_desc||a.state||'').slice(0,80),magnitude:String(a.magnitude||'').slice(0,35),units:String(a.units||'').slice(0,20),remarks:String(a.remarks||'').slice(0,230),time:a.lsr_validtime||a.valid_time||null,lat,lon,distance};
  }).filter(x=>x&&x.distance<=maxMiles).sort((a,b)=>a.distance-b.distance).slice(0,30);
}
export function stationReading(station,observation,l){
  const p=observation?.properties||{};
  const value=k=>Number.isFinite(p[k]?.value)?p[k].value:null;
  return {name:String(station?.properties?.name||p.station||'Nearest NWS station').slice(0,100),stationId:String(station?.properties?.stationIdentifier||'').slice(0,20),observedAt:p.timestamp||null,distanceMiles:station?.geometry?.coordinates?Math.round(milesBetween(l,{latitude:station.geometry.coordinates[1],longitude:station.geometry.coordinates[0]})):null,
    tempF:value('temperature')===null?null:Math.round(value('temperature')*9/5+32),windMph:value('windSpeed')===null?null:Math.round(value('windSpeed')*0.621371),gustMph:value('windGust')===null?null:Math.round(value('windGust')*0.621371),humidity:value('relativeHumidity')===null?null:Math.round(value('relativeHumidity'))};
}
export function sanitizeRules(value={}){
  const clamp=(v,min,max,dflt)=>{const n=Number(v);return v==null||!Number.isFinite(n)?dflt:Math.min(max,Math.max(min,n));};
  const quietStart=String(value.quietStart||'22:00'),quietEnd=String(value.quietEnd||'07:00');
  const time=v=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)?v:null;
  return {windMph:clamp(value.windMph,15,100,45),snowIn:clamp(value.snowIn,.5,24,3),rainIn:clamp(value.rainIn,.1,10,1),hotF:clamp(value.hotF,80,125,100),coldF:clamp(value.coldF,-40,40,10),quiet:Boolean(value.quiet),quietStart:time(quietStart)||'22:00',quietEnd:time(quietEnd)||'07:00'};
}
export function isQuietLocal(timeZone,rules,now=new Date()){
  if(!rules?.quiet)return false;
  let local;
  try{local=new Intl.DateTimeFormat('en-GB',{timeZone:timeZone||'UTC',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);}catch{return false;}
  const m=x=>Number(x.slice(0,2))*60+Number(x.slice(3,5));
  const n=m(local),a=m(rules.quietStart),b=m(rules.quietEnd);
  return a===b?false:a<b?n>=a&&n<b:n>=a||n<b;
}
export function describeMotion(text){
  const s=String(text||'').replace(/\s+/g,' ');
  const m=s.match(/\bMOVING\s+(NORTH(?:EAST|WEST)?|SOUTH(?:EAST|WEST)?|EAST|WEST|NNE|ENE|ESE|SSE|SSW|WSW|WNW|NNW|NE|SE|SW|NW|N|S|E|W)\s+AT\s+(\d{1,3})\s+MPH\b/i);
  return m?{direction:m[1].toUpperCase(),speedMph:Number(m[2])}:null;
}
