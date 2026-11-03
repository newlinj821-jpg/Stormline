import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { sanitizeRules } from './intel-core.mjs';

export const json = (body, status=200) => new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export const digest = str => createHash('sha256').update(str).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export function equalSecret(value, hashed) {
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)||typeof hashed!=='string'||!/^[a-f0-9]{64}$/.test(hashed))return false;
  return timingSafeEqual(Buffer.from(digest(value),'hex'),Buffer.from(hashed,'hex'));
}
export const keysConfigured = ()=>Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);
export const validCoordinates = (lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180;
export const safeLocations = arr => Array.isArray(arr)?arr.slice(0,12).filter(l=>l&&validCoordinates(Number(l.latitude),Number(l.longitude))).map(l=>({name:String(l.name||'Location').slice(0,65),latitude:Number(l.latitude),longitude:Number(l.longitude),timezone:String(l.timezone||'UTC').slice(0,100),country_code:String(l.country_code||'').slice(0,2)})):[];
export const safePrefs = input => Object.fromEntries(['tornado','thunderstorm','flood','snow','rain','wind','heat','cold','daily'].map(k=>[k,input?.[k]===true]));
export const isUS = l => l.country_code==='US'||(!l.country_code&&l.latitude>=18&&l.latitude<=72&&l.longitude>=-171&&l.longitude<=-65);
export const validSubscription = sub => {
  if(!sub||typeof sub!=='object'||typeof sub.endpoint!=='string'||!sub.keys||typeof sub.keys.p256dh!=='string'||typeof sub.keys.auth!=='string')return false;
  if(sub.endpoint.length>2048||sub.keys.p256dh.length>512||sub.keys.auth.length>512)return false;
  try{const u=new URL(sub.endpoint);if(u.protocol!=='https:')return false;const host=u.hostname;
    // Never allow the server to send push data to an arbitrary attacker-controlled host.
    return host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='push.services.mozilla.com'||host.endsWith('.push.apple.com')||host==='web.push.apple.com'||host.endsWith('.notify.windows.com')||host==='wns2-by3p.notify.windows.com';
  }catch{return false;}
};
export const severityRank = a => ({Extreme:0,Severe:1,Moderate:2,Minor:3,Unknown:4})[a.severity]??4;
export function categoryForEvent(event){
  const e=String(event||'').toLowerCase();
  if(e.includes('tornado')||e.includes('hurricane')||e.includes('tsunami')||e.includes('storm surge'))return 'tornado';
  if(e.includes('thunderstorm'))return 'thunderstorm';
  if(e.includes('flood')||e.includes('hydrologic'))return 'flood';
  if(/snow|ice|blizzard|winter|freez.*rain/.test(e))return 'snow';
  if(e.includes('wind')||e.includes('dust storm'))return 'wind';
  if(e.includes('heat'))return 'heat';
  if(/cold|freeze|frost|wind chill/.test(e))return 'cold';
  return null;
}
export function officialCandidates(features, prefs, locName){
  return (features||[]).map(x=>({...x.properties, id:x.id||x.properties?.id})).filter(a=>a&&categoryForEvent(a.event)&&prefs[categoryForEvent(a.event)]&&a.status!=='Test').sort((a,b)=>severityRank(a)-severityRank(b)).map(a=>({
    key:`nws:${digest(a.id||a.event+String(a.sent)).slice(0,40)}:${a.severity||''}`,
    title:`${a.event} · ${locName}`,
    body:String(a.headline||a.description||'Official weather bulletin in effect.').replace(/\s+/g,' ').slice(0,220),
    tag:`nws-${digest(a.id||a.event).slice(0,24)}`,
    urgent: a.severity==='Extreme'||a.event?.toLowerCase().includes('tornado')||(a.severity==='Severe'&&/warning/i.test(a.event||'')),
    url:'/?tab=alerts'
  }));
}
export function forecastCandidates(w,prefs,locName,now=new Date(),rulesInput={}){
  const rules=sanitizeRules(rulesInput);
  if(!w?.hourly?.time?.length)return [];
  const h=w.hourly, start=Math.max(0,h.time.findIndex(t=>t>=String(w.current?.time||'').slice(0,13)+':00')),end=Math.min(start+7,h.time.length),samples=key=>(h[key]||[]).slice(start,end).filter(x=>x!==null&&x!==undefined&&x!=='').map(Number).filter(Number.isFinite),max=key=>Math.max(0,...samples(key)),min=key=>Math.min(Infinity,...samples(key)),sum=key=>samples(key).reduce((a,b)=>a+b,0),codes=samples('weather_code');
  const hour=Math.floor(now.getTime()/3600000),bucket=Math.floor(hour/6),out=[];
  const add=(k,title,body)=>{if(prefs[k])out.push({key:`forecast:${k}:${locName}:${bucket}`,title:`${title} · ${locName}`,body,tag:`forecast-${k}-${digest(locName).slice(0,8)}`,url:'/',urgent:false});};
  if(codes.some(x=>[95,96,99].includes(x)))add('thunderstorm','Thunderstorms forecast','A forecast model indicates thunderstorms in the next several hours. This is lightning risk, not a detected nearby strike.');
  if(sum('snowfall')>=rules.snowIn*2.54)add('snow','Snow forecast',`${sum('snowfall').toFixed(1)} cm of modeled snow in the next several hours.`);
  if(max('precipitation_probability')>=80 && sum('precipitation')>=rules.rainIn)add('rain','Heavy precipitation potential',`High precipitation chance; modeled amount approximately ${sum('precipitation').toFixed(2)} inches over the next several hours.`);
  if(max('wind_gusts_10m')>=rules.windMph)add('wind','Strong gusts forecast',`Forecast gusts may reach ${Math.round(max('wind_gusts_10m'))} mph in the next several hours.`);
  if(max('temperature_2m')>=rules.hotF)add('heat','Extreme heat forecast',`Forecast high temperatures may reach ${Math.round(max('temperature_2m'))}°F soon.`);
  if(min('temperature_2m')<=rules.coldF)add('cold','Very cold temperatures forecast',`Forecast temperatures may fall to ${Math.round(min('temperature_2m'))}°F soon.`);
  return out;
}
export async function fetchOfficial(l){
  const point=`${l.latitude},${l.longitude}`;
  const url=`https://api.weather.gov/alerts/active?point=${encodeURIComponent(point)}`;
  const response=await fetch(url,{headers:{Accept:'application/geo+json','User-Agent':process.env.NWS_USER_AGENT||'StormlineWeather/1.0 (personal self-hosted weather dashboard)'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`NWS ${response.status}`);
  const data=await response.json();if(!Array.isArray(data.features))throw new Error('NWS returned invalid format');return data;
}
export async function fetchRiskForecast(l){
  const q=new URLSearchParams({latitude:String(l.latitude),longitude:String(l.longitude),timezone:'auto',temperature_unit:'fahrenheit',wind_speed_unit:'mph',precipitation_unit:'inch',forecast_days:'2',current:'temperature_2m',hourly:'temperature_2m,precipitation_probability,precipitation,snowfall,wind_gusts_10m,weather_code'});
  const response=await fetch(`https://api.open-meteo.com/v1/forecast?${q}`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`Forecast ${response.status}`);
  const data=await response.json();if(!data.hourly?.time)throw new Error('Forecast incomplete');return data;
}
export const trimSeen=seen=>Object.fromEntries(Object.entries(seen||{}).filter(([,stamp])=>Number(stamp)>Date.now()-4*86400000).slice(-200));
