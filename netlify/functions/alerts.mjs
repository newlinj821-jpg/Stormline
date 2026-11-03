import { json, validCoordinates, fetchOfficial } from '../lib/shared.mjs';
export default async function handler(req){
  if(req.method!=='GET')return json({error:'Method not allowed'},405);
  const url=new URL(req.url),lat=Number(url.searchParams.get('lat')||url.searchParams.get('point')?.split(',')[0]),lon=Number(url.searchParams.get('lon')||url.searchParams.get('point')?.split(',')[1]);
  if(!validCoordinates(lat,lon))return json({error:'Invalid coordinates'},400);
  try{return json(await fetchOfficial({latitude:lat,longitude:lon}));}catch(e){return json({error:'The official warning feed is temporarily unavailable. Do not assume that no warnings exist.'},503);}
}
