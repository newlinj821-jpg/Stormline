import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forecastCandidates,officialCandidates} from '../netlify/lib/shared.mjs';
const data={current:{time:'2026-11-03T10:00'},hourly:{time:['2026-11-03T10:00','2026-11-03T11:00'],weather_code:[0,0],snowfall:[2,3],precipitation_probability:[80,80],precipitation:[.4,.4],wind_gusts_10m:[42,46],temperature_2m:[95,96]}};
test('custom higher wind threshold suppresses lower gusts',()=>{const a=forecastCandidates(data,{wind:true},'Peoria',new Date('2026-11-03T10:00:00Z'),{windMph:50});assert.equal(a.length,0);});
test('custom lower wind threshold triggers gusts',()=>{const a=forecastCandidates(data,{wind:true},'Peoria',new Date('2026-11-03T10:00:00Z'),{windMph:40});assert.equal(a.length,1);});
test('snow model cm values are compared to inch threshold',()=>{const a=forecastCandidates(data,{snow:true},'Peoria',new Date('2026-11-03T10:00:00Z'),{snowIn:1.5});assert.equal(a.length,1);const b=forecastCandidates(data,{snow:true},'Peoria',new Date('2026-11-03T10:00:00Z'),{snowIn:3});assert.equal(b.length,0);});
test('severe government warning bypasses quiet hours',()=>{const v=officialCandidates([{properties:{event:'Severe Thunderstorm Warning',severity:'Severe',status:'Actual'}}],{thunderstorm:true},'Peoria');assert.equal(v[0].urgent,true);});
