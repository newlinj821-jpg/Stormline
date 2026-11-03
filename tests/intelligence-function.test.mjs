import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/intelligence.mjs';
const parse=async(url)=>{const r=await handler(new Request(url));return {status:r.status,body:await r.json()};};
test('server blocks invalid latitude before querying NOAA',async()=>{const r=await parse('https://demo.netlify.app/.netlify/functions/intelligence?lat=190&lon=-89');assert.equal(r.status,400);});
test('worldwide location gracefully disables US-only intelligence',async()=>{const r=await parse('https://demo.netlify.app/.netlify/functions/intelligence?lat=48.85&lon=2.35');assert.equal(r.body.available,false);assert.equal(r.body.outsideUS,true);});
test('disallows POST',async()=>{const r=await handler(new Request('https://demo.netlify.app/.netlify/functions/intelligence',{method:'POST'}));assert.equal(r.status,405);});
test('partial NOAA outage does not erase other source availability',async()=>{
  const old=globalThis.fetch;
  globalThis.fetch=async(url)=>{
    const text=String(url);
    if(text.includes('MapServer/1/query'))return Response.json({features:[{attributes:{dn:4}}]});
    if(text.includes('MapServer/3/query'))return Response.json({features:[{attributes:{dn:5}}]});
    if(text.includes('MapServer/5/query'))return new Response('unavailable',{status:503});
    if(text.includes('MapServer/7/query'))return Response.json({features:[]});
    if(text.includes('nws_local_storm_reports'))return Response.json({features:[],type:'FeatureCollection'});
    if(text.includes('api.weather.gov/points/'))return Response.json({properties:{observationStations:'https://api.weather.gov/gridpoints/ILX/obs'}});
    if(text.includes('/gridpoints/ILX/obs'))return Response.json({features:[]});
    throw Error('Unexpected host');
  };
  try{const r=await parse('https://demo.netlify.app/.netlify/functions/intelligence?lat=40.7&lon=-89.6');assert.equal(r.status,200);assert.equal(r.body.outlook.category.label,'Slight');assert.equal(r.body.outlook.tornado.label,'5%');assert.equal(r.body.sources.hail.ok,false);assert.equal(r.body.sources.category.ok,true);assert.deepEqual(r.body.reports,[]);}finally{globalThis.fetch=old;}
});
