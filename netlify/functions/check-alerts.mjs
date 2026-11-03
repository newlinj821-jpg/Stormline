import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { keysConfigured, isUS, officialCandidates, forecastCandidates, fetchOfficial, fetchRiskForecast, trimSeen } from '../lib/shared.mjs';

/* Runs every 15 minutes on a published Netlify deploy, not a guaranteed life-safety alert feed.
   Concurrency is deliberately bounded to stay within free-tier usage. */
export default async function handler(){
  if(!keysConfigured()){console.warn('Stormline: VAPID keys missing; skipping scheduled scan.');return;}
  webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  const store=getStore('stormline-subscribers');
  const locCache=new Map();let scanned=0,sent=0,failures=0;
  const loadLoc=async l=>{
    const key=`${l.latitude.toFixed(2)},${l.longitude.toFixed(2)}`;
    if(!locCache.has(key))locCache.set(key,Promise.allSettled([isUS(l)?fetchOfficial(l):Promise.resolve({features:[]}),fetchRiskForecast(l)]));
    return await locCache.get(key);
  };
  const processRecord=async item=>{
    const record=await store.get(item.key,{type:'json'});if(!record?.subscription?.endpoint)return;let seen=trimSeen(record.seen),changed=false;
    for(const l of (record.locations||[]).slice(0,12)){
      const [official,forecast]=await loadLoc(l);let alerts=[];
      if(official.status==='fulfilled')alerts.push(...officialCandidates(official.value.features,record.prefs,l.name));else failures++;
      if(forecast.status==='fulfilled'){
        alerts.push(...forecastCandidates(forecast.value,record.prefs,l.name));
        // Daily local summary, once per local day during approximately 07:00–07:59.
        const local=new Date().toLocaleString('sv-SE',{timeZone:l.timezone||'UTC',hour12:false});
        if(record.prefs?.daily&&local.slice(11,13)==='07'){
          alerts.push({key:`daily:${l.name}:${local.slice(0,10)}`,title:`Morning weather · ${l.name}`,body:`Current forecast temperature ${Math.round(forecast.value.current?.temperature_2m||0)}°F. Open Stormline for a detailed forecast.`,tag:`daily-${l.name}`,url:'/',urgent:false});
        }
      }else failures++;
      // Prioritize urgent official alerts, capped to avoid flooding user devices.
      for(const alert of alerts.slice(0,6)){
        if(seen[alert.key])continue;
        try{await webpush.sendNotification(record.subscription,JSON.stringify(alert),{TTL:alert.urgent?900:3600,urgency:alert.urgent?'high':'normal'});seen[alert.key]=Date.now();changed=true;sent++;}
        catch(e){failures++;if([404,410].includes(e.statusCode)){await store.delete(item.key);return;}console.error('Push delivery failure:',e.statusCode||e.message);}
      }
    }
    if(changed)await store.setJSON(item.key,{...record,seen});
  };
  // Use first 80 subscriptions per run; intended for a personal/small-community deployment.
  for await (const page of store.list({paginate:true})){
    for(let i=0;i<page.blobs.length&&scanned<80;i+=4){const chunk=page.blobs.slice(i,i+Math.min(4,80-scanned));await Promise.allSettled(chunk.map(processRecord));scanned+=chunk.length;}
    if(scanned>=80)break;
  }
  console.log(`Stormline scheduled scan: ${scanned} subscriptions checked; ${sent} delivered; ${failures} source/delivery failures`);
}
