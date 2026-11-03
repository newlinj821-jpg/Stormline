import { json, validCoordinates, fetchOfficial } from '../lib/shared.mjs';

const NWS_HEADERS={Accept:'application/geo+json','User-Agent':process.env.NWS_USER_AGENT||'StormlineWeather/1.1 (https://github.com/newlinj821-jpg/Stormline)'};
async function nws(url){const res=await fetch(url,{headers:NWS_HEADERS,signal:AbortSignal.timeout(10500)});if(!res.ok)throw Error(`NWS response: ${res.status}`);return res.json();}
const states=new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR VI GU AS MP'.split(' '));
const tombstone='The tornado alert feed is temporarily unavailable; check the National Weather Service directly.';
export default async function handler(req){
  if(req.method!=='GET')return json({error:'Method not allowed'},405);
  const url=new URL(req.url),lat=Number(url.searchParams.get('lat')||url.searchParams.get('point')?.split(',')[0]),lon=Number(url.searchParams.get('lon')||url.searchParams.get('point')?.split(',')[1]);
  if(!validCoordinates(lat,lon))return json({error:'Invalid coordinates'},400);
  if(url.searchParams.get('mode')!=='tornado'){
    try{return json(await fetchOfficial({latitude:lat,longitude:lon}));}catch{return json({error:'The official warning feed is temporarily unavailable. Do not assume that no warnings exist.'},503);}
  }
  try{
    // A point alert query omits tornadoes nearby but not affecting the point. Resolve the state and fetch its active notices.
    const point=await nws(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
    const state=String(point.properties?.relativeLocation?.properties?.state||'').toUpperCase();
    if(!states.has(state))throw Error('No NWS state/territory found for this location');
    const data=await nws(`https://api.weather.gov/alerts/active?area=${encodeURIComponent(state)}`);
    if(!Array.isArray(data.features))throw Error('Invalid NWS alert response');
    const features=data.features.filter(f=>/tornado/i.test(String(f.properties?.event||''))&&f.properties?.status!=='Test').slice(0,60).map(f=>({id:f.id,geometry:f.geometry,properties:{event:f.properties?.event,headline:f.properties?.headline,description:f.properties?.description,areaDesc:f.properties?.areaDesc,expires:f.properties?.expires,urgency:f.properties?.urgency,severity:f.properties?.severity,'@id':f.properties?.['@id']||f.id}}));
    return json({state,features,retrievedAt:new Date().toISOString()});
  }catch(e){console.error('Tornado overlay feed:',e.message);return json({error:tombstone},503);}
}