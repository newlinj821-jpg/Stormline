/* Stormline 2.0 · all data from freely available public weather services. */
(()=>{
  'use strict';
  const $=s=>document.querySelector(s), state={locKey:'',data:null,mode:'radar',zoom:7,center:null,lastImageAt:null,frameId:0,lightning:null,sourceError:null,busy:false,loadedAt:0};
  const RULE_KEY='stormline.rules.v2',STORE_KEY='stormline.settings.v1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=(k,fallback={})=>{try{return JSON.parse(localStorage.getItem(k))||fallback;}catch{return fallback;}};
  const safeSave=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
  const app=()=>read(STORE_KEY);
  const location=()=>{const s=app();return (s.locations||[]).find(l=>l.id===s.selected)||s.locations?.[0]||null;};
  const context=()=>{const l=location(),s=app();return {l,s,cache:l?read(`stormline.cache.${l.latitude},${l.longitude}.${s.units||'imperial'}`,null):null};};
  const us=l=>l&&(l.country_code==='US'||(!l.country_code&&l.latitude>=18&&l.latitude<=72&&l.longitude>=-171&&l.longitude<=-65));
  const fmt=(t,style='short')=>{if(!t)return 'Not reported';const d=new Date(t);return Number.isNaN(+d)?String(t).slice(0,30):d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',...(style==='time'?{month:undefined,day:undefined}:{})});};
  const relative=t=>{if(!t)return 'Not available';const n=Date.now()-new Date(t).getTime();if(!Number.isFinite(n))return 'Unknown';if(n<0)return 'Clock mismatch';const m=Math.round(n/60000);return m<2?'Just updated':m<60?`${m} min old`:`${Math.floor(m/60)}h ${m%60}m old`;};
  const toast=s=>{const e=document.createElement('div');e.className='lab-toast';e.textContent=s;document.body.append(e);setTimeout(()=>e.remove(),4500);};
  const merc=(lat,lon,z)=>{const size=256*2**z,phi=Math.max(-85.0511,Math.min(85.0511,lat))*Math.PI/180;return {x:(lon+180)/360*size,y:(1-Math.asinh(Math.tan(phi))/Math.PI)/2*size};};
  const unmerc=(x,y,z)=>{const size=256*2**z;return {latitude:Math.atan(Math.sinh(Math.PI*(1-2*y/size)))*180/Math.PI,longitude:x/size*360-180};};
  const metersX=(x,z)=>x/(256*2**z)*40075016.68557849-20037508.342789244;
  const metersY=(y,z)=>20037508.342789244-y/(256*2**z)*40075016.68557849;
  function createPanel(){
    const root=document.createElement('section');root.id='stormlab';root.className='panel stormlab';root.innerHTML=`
      <div class="lab-head"><div><div class="section-kicker">STORMLINE 2.0 · FREE NOAA INTELLIGENCE</div><h2>Storm intelligence center</h2><p class="lab-muted">Official severe-weather intelligence, current radar, storm reports and winter outlooks.</p></div><span class="lab-live">PUBLIC DATA · NO PAID API</span></div>
      <div class="lab-tabs" role="tablist" aria-label="Storm intelligence sections">
        <button data-lab-tab="map" class="selected" role="tab" aria-selected="true">Live map</button><button data-lab-tab="outlook" role="tab" aria-selected="false">SPC risk</button><button data-lab-tab="winter" role="tab" aria-selected="false">Winter</button><button data-lab-tab="observations" role="tab" aria-selected="false">Reports</button><button data-lab-tab="rules" role="tab" aria-selected="false">Alert rules</button><button data-lab-tab="health" role="tab" aria-selected="false">Reliability</button>
      </div>
      <div class="lab-section" data-lab-panel="map">
        <div class="lab-map-tools"><div class="lab-layers"><button data-lab-layer="radar" class="selected">NOAA reflectivity</button><button data-lab-layer="spc">SPC outlook</button><button data-lab-layer="lightning">Lightning density</button></div><button class="lab-small" data-lab-action="oldradar">Past radar <span aria-hidden="true">↗</span></button></div>
        <div class="lab-map" id="lab-map" role="application" aria-label="Interactive Stormline weather map"><div class="lab-tiles" id="lab-tiles"></div><img id="lab-overlay" class="lab-overlay" alt="" /><span class="lab-map-pin" aria-hidden="true"></span><div class="lab-map-zoom"><button data-lab-action="zoom-in" aria-label="Zoom in">+</button><button data-lab-action="zoom-out" aria-label="Zoom out">−</button><button data-lab-action="center" aria-label="Center on selected location">◎</button></div><span class="lab-map-attrib">© OpenStreetMap · NOAA</span><div class="lab-map-status" id="lab-map-status" role="status">Loading radar imagery…</div></div>
        <div class="lab-map-footer"><span id="lab-map-source">NOAA MRMS · observed reflectivity, not a storm forecast</span><button class="lab-small" data-lab-action="refreshmap">Refresh image</button></div>
        <p class="lab-disclaimer" id="lab-map-notes">Radar reflectivity shows precipitation intensity. It does not prove a tornado is present. For confirmed warnings, consult official NWS bulletins.</p>
      </div>
      <div class="lab-section" data-lab-panel="outlook" hidden><div id="lab-outlook" aria-live="polite">Retrieving NOAA Storm Prediction Center outlooks…</div></div>
      <div class="lab-section" data-lab-panel="winter" hidden><div id="lab-winter">Loading winter data…</div></div>
      <div class="lab-section" data-lab-panel="observations" hidden><div id="lab-observations">Retrieving official nearby weather observations…</div></div>
      <div class="lab-section" data-lab-panel="rules" hidden><div id="lab-rules"></div></div>
      <div class="lab-section" data-lab-panel="health" hidden><div id="lab-health"></div></div>
      <footer class="lab-footer">Sources: NOAA/NWS, NOAA/SPC, NOAA/MRMS, NOAA nowCOAST, Open-Meteo and RainViewer. Data can be delayed or unavailable. <strong>Not an emergency warning service.</strong></footer>`;
    const anchor=$('#forecast-card')||$('main');anchor.parentNode.insertBefore(root,anchor);
    return root;
  }
  function chooseTab(tab){document.querySelectorAll('[data-lab-tab]').forEach(b=>{b.classList.toggle('selected',b.dataset.labTab===tab);b.setAttribute('aria-selected',String(b.dataset.labTab===tab));});document.querySelectorAll('[data-lab-panel]').forEach(el=>{el.hidden=el.dataset.labPanel!==tab;});if(tab==='map')requestAnimationFrame(paintMap);if(tab==='rules')showRules();if(tab==='health')showHealth();if(tab==='winter')showWinter();}
  function chooseLayer(mode){state.mode=mode;document.querySelectorAll('[data-lab-layer]').forEach(b=>b.classList.toggle('selected',b.dataset.labLayer===mode));paintMap();}
  const risk=(key)=>{const r=state.data?.outlook?.[key];if(!r||!r.available)return `<div class="lab-risk-value">Unavailable</div><small>Source could not be checked</small>`;return `<div class="lab-risk-value">${esc(r.label)}</div><small>${r.issued?'Issued '+esc(String(r.issued).slice(0,19)):'NOAA/SPC · Day 1'}</small>`;};
  function showOutlook(){const el=$('#lab-outlook');if(!el)return;const l=location();if(!us(l)){el.innerHTML='<div class="lab-empty">SPC outlook maps are intended for the United States. Worldwide weather forecasts remain available above.</div>';return;}
    el.innerHTML=`<p class="lab-muted">Official Day 1 outlook for <strong>${esc(l.name)}</strong>. A probability area is regional risk, not an individual tornado forecast.</p><div class="lab-risk-grid"><article class="lab-risk-card category"><span>SEVERE RISK LEVEL</span>${risk('category')}</article><article class="lab-risk-card"><span>TORNADO PROBABILITY</span>${risk('tornado')}</article><article class="lab-risk-card"><span>DAMAGING WIND</span>${risk('wind')}</article><article class="lab-risk-card"><span>HAIL</span>${risk('hail')}</article></div><p class="lab-disclaimer">These official probabilities refer to severe weather within 25 miles of a point (as defined by SPC) in the outlook period. Areas outside risk contours may still experience weather. Open the Live map's SPC layer to see the regional outlook.</p><a class="lab-source-link" target="_blank" rel="noopener noreferrer" href="https://www.spc.noaa.gov/products/outlook/">Read official SPC outlook</a>`;
  }
  function showWinter(){const el=$('#lab-winter');if(!el)return;const {cache,s}=context(),hour=cache?.weather?.hourly;
    if(!hour?.time?.length){el.innerHTML='<div class="lab-empty">The hourly forecast is unavailable. Refresh Today to load the winter outlook.</div>';return;}
    const now=cache.weather.current?.time?.slice(0,13)||'',idx=Math.max(0,hour.time.findIndex(t=>t.slice(0,13)>=now));const convert=v=>s.units==='metric'?v:v/2.54,unit=s.units==='metric'?'cm':'in';
    const six=Array.from({length:8},(_,n)=>{const from=idx+n*6,arr=hour.snowfall?.slice(from,from+6)||[],sum=arr.reduce((a,v)=>a+Number(v||0),0),temp=hour.temperature_2m?.slice(from,from+6)||[],codes=hour.weather_code?.slice(from,from+6)||[];return {label:n===0?'Next 6h':`+${n*6}h`,snow:convert(sum),temp:temp.filter(Number.isFinite),freeze:codes.some(c=>c===66||c===67)};});
    const total=six.reduce((v,x)=>v+x.snow,0),max=Math.max(.1,...six.map(x=>x.snow));
    el.innerHTML=`<div class="lab-winter-summary"><div><small>MODELED 48-HOUR SNOW</small><strong>${total.toFixed(1)} ${unit}</strong></div><div><small>FREEZING RAIN SIGNAL</small><strong>${six.some(x=>x.freeze)?'Possible':'Not indicated'}</strong></div></div><div class="lab-snow-chart">${six.map(x=>`<div class="lab-snow-column"><span>${x.snow.toFixed(1)}</span><div class="lab-snow-bar" style="height:${Math.max(3,Math.round(100*x.snow/max))}%"></div><small>${x.label}</small></div>`).join('')}</div><p class="lab-disclaimer">Snow is modeled, not measured. Forecast snowfall can change dramatically. Freezing-rain codes indicate possible ice but <strong>do not quantify ice accumulation</strong>. Check official winter-weather warnings in Alerts.</p>`;
  }
  function showReports(){const el=$('#lab-observations');if(!el)return;const l=location();if(!us(l)){el.innerHTML='<div class="lab-empty">U.S. station measurements and NWS local storm reports are not available for this location.</div>';return;}
    const d=state.data,st=d?.station,rows=d?.reports||[];
    const source=d?.sources||{};
    const measures=st?`<div class="lab-measure-grid"><div><small>MEASURED TEMP</small><strong>${st.tempF??'—'}°F</strong></div><div><small>MEASURED WIND</small><strong>${st.windMph??'—'} mph</strong></div><div><small>MEASURED GUST</small><strong>${st.gustMph??'—'} mph</strong></div><div><small>HUMIDITY</small><strong>${st.humidity??'—'}%</strong></div></div><p class="lab-muted">${esc(st.name)} · ${st.distanceMiles??'—'} miles away · ${esc(fmt(st.observedAt))} · ${esc(relative(st.observedAt))}</p>`:`<div class="lab-empty">${source.station?.ok===false?'Station source unavailable.':'No nearby station reading returned.'}</div>`;
    el.innerHTML=`<h3>Nearest measured conditions</h3>${measures}<h3 style="margin-top:24px">Reported severe weather · last 24 hours</h3><p class="lab-muted">Ground-based reports are submitted by trained observers and the public; they are preliminary and not always verified.</p>${rows.length?`<div class="lab-report-list">${rows.slice(0,12).map(x=>`<article class="lab-report"><div><strong>${esc(x.type)}</strong><span>${x.distance} miles away</span></div><small>${esc(x.where)}${x.magnitude?' · '+esc(x.magnitude):''}${x.units?' '+esc(x.units):''} · ${esc(fmt(x.time))}</small>${x.remarks?`<p>${esc(x.remarks)}</p>`:''}</article>`).join('')}</div>`:`<div class="lab-empty">${source.reports?.ok===false?'Storm report service unavailable.':'No recent storm reports found within 110 miles.'}</div>`}`;
  }
  const ruleDefaults={windMph:45,snowIn:3,rainIn:1,hotF:100,coldF:10,quiet:false,quietStart:'22:00',quietEnd:'07:00'};
  const getRules=()=>({...ruleDefaults,...read(RULE_KEY,ruleDefaults)});
  function showRules(){const el=$('#lab-rules'),r=getRules();if(!el)return;
    const field=(name,label,units,min,max,step)=>`<label class="lab-rule"><span>${label}<small>${units}</small></span><input data-lab-rule="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${r[name]}"></label>`;
    el.innerHTML=`<p class="lab-muted">Customize forecast thresholds on your saved locations. Changes are stored on this device and synchronized to your existing Stormline push subscription.</p><div class="lab-rule-grid">${field('windMph','Wind gusts','mph',15,100,1)}${field('snowIn','Snowfall in next hours','inches',.5,24,.5)}${field('rainIn','Precipitation','inches',.1,10,.1)}${field('hotF','Extreme heat','°F',80,125,1)}${field('coldF','Extreme cold','°F',-40,40,1)}</div><div class="lab-quiet"><label><input type="checkbox" data-lab-rule="quiet" ${r.quiet?'checked':''}> Suppress nonemergency notifications during quiet hours</label><div><label>From <input data-lab-rule="quietStart" type="time" value="${r.quietStart}"></label><label>Until <input data-lab-rule="quietEnd" type="time" value="${r.quietEnd}"></label></div></div><p class="lab-disclaimer">Official tornado warnings and other urgent government alerts bypass quiet hours. Routine forecasts may arrive late because checks are scheduled. Lightning density alone does not trigger strike-radius alerts.</p><button class="lab-save" data-lab-action="save-rules">Save notification rules</button><div class="lab-rule-message" id="lab-rule-message" aria-live="polite"></div>`;
  }
  async function saveRules(){const root=$('#lab-rules'),r={};for(const el of root.querySelectorAll('[data-lab-rule]'))r[el.dataset.labRule]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;
    const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:min));
    r.windMph=clamp(r.windMph,15,100);r.snowIn=clamp(r.snowIn,.5,24);r.rainIn=clamp(r.rainIn,.1,10);r.hotF=clamp(r.hotF,80,125);r.coldF=clamp(r.coldF,-40,40);
    safeSave(RULE_KEY,r);const status=$('#lab-rule-message');status.textContent='Saved on this device; synchronizing with notification service…';
    const a=app();if(!a.pushToken){status.textContent='Saved locally. Enable Stormline notifications before these rules can trigger push alerts.';return;}
    try{const reg=await navigator.serviceWorker.ready,subscription=await reg.pushManager.getSubscription();if(!subscription)throw Error('No active browser push subscription');const response=await fetch('/.netlify/functions/push',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'subscribe',subscription:subscription.toJSON(),locations:a.locations,prefs:a.prefs,manageToken:a.pushToken,rules:r})});const body=await response.json();if(!response.ok)throw Error(body.error||`Server HTTP ${response.status}`);if(body.manageToken&&body.manageToken!==a.pushToken){a.pushToken=body.manageToken;safeSave(STORE_KEY,a);}status.textContent='Rules saved and synchronized to your push subscription.';}catch(err){status.textContent=`Saved locally, but server sync failed: ${err.message}. Retry Save rules.`;}
  }
  function showHealth(){const el=$('#lab-health');if(!el)return;const {cache,l}=context();const list=[['Forecast',cache?.at?'Updated '+relative(cache.at):'Not loaded',cache?.at?Date.now()-cache.at<45*60000:false],['NOAA intelligence',state.loadedAt?'Fetched '+relative(state.loadedAt):'Not checked',state.loadedAt?Date.now()-state.loadedAt<30*60000:false],['Official warnings', $('#alert-count')?.textContent?.trim()==='—'?'Unverified':'See active warnings panel', $('#alert-count')?.textContent?.trim()!=='—' ],['Radar image',state.lastImageAt?'Loaded '+relative(state.lastImageAt):'Not loaded',Boolean(state.lastImageAt)],['Push configuration','Test actual delivery from Weather notifications',null]];
    el.innerHTML=`<div class="lab-health-list">${list.map(([name,label,ok])=>`<div class="lab-health-item"><span class="lab-health-dot ${ok===true?'good':ok===false?'bad':''}"></span><strong>${esc(name)}</strong><small>${esc(label)}</small></div>`).join('')}</div><div class="lab-health-sources">${Object.entries(state.data?.sources||{}).map(([name,v])=>`<span class="${v.ok?'ok':'down'}">${esc(name)}: ${v.ok?'reachable':'unavailable'}</span>`).join('')||'<span>No checks completed yet.</span>'}</div><button class="lab-save" data-lab-action="refresh">Check all free sources</button><p class="lab-disclaimer">A reachable API is not proof of a fresh observation. Radar refresh timestamps indicate when an image loaded, not its observation scan time. All monitoring remains best effort.</p>`;
  }
  function updateSections(){showOutlook();showWinter();showReports();showHealth();}
  function mapSize(){const el=$('#lab-map');return {width:Math.max(300,el?.clientWidth||600),height:Math.max(280,el?.clientHeight||420)};}
  const imageFrom=(mode,box,w,h)=>{
    const query={bbox:box.map(n=>n.toFixed(1)).join(','),bboxSR:'3857',imageSR:'3857',size:`${w},${h}`,format:'png32',transparent:'true',f:'image'};
    if(mode==='spc')return 'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/export?'+new URLSearchParams({...query,layers:'show:1'});
    if(mode==='radar')return 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity/MapServer/export?'+new URLSearchParams({...query,layers:'show:3'});
    if(mode==='lightning'&&state.lightning?.available){return state.lightning.service+'?'+new URLSearchParams({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetMap',LAYERS:state.lightning.layer,STYLES:'',FORMAT:'image/png',TRANSPARENT:'TRUE',SRS:'EPSG:3857',BBOX:box.map(n=>n.toFixed(1)).join(','),WIDTH:String(w),HEIGHT:String(h)});}
    return '';
  };
  async function ensureLightning(){if(state.lightning||state.busy)return;state.busy=true;try{const response=await fetch('/.netlify/functions/intelligence?resource=lightning',{signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('NOAA service metadata unavailable');state.lightning=await response.json();}catch{state.lightning={available:false,error:'Could not connect to NOAA lightning imagery.'};}finally{state.busy=false;}paintMap();}
  function paintMap(fast=false){const l=location(),el=$('#lab-map');if(!el||!l||$('#lab-map').closest('[hidden]'))return;if(!state.center)state.center={latitude:Number(l.latitude),longitude:Number(l.longitude)};
    const {width:w,height:h}=mapSize(),z=state.zoom,center=merc(state.center.latitude,state.center.longitude,z),elTiles=$('#lab-tiles');
    if(!elTiles)return;const existing=new Map([...elTiles.querySelectorAll('img')].map(im=>[im.dataset.key,im])),keep=new Set();const minX=Math.floor((center.x-w/2)/256)-1,maxX=Math.floor((center.x+w/2)/256)+1,minY=Math.floor((center.y-h/2)/256)-1,maxY=Math.floor((center.y+h/2)/256)+1;
    for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){if(y<0||y>=2**z)continue;const xx=((x%2**z)+2**z)%2**z,key=`${z}/${xx}/${y}`;keep.add(key);let im=existing.get(key);if(!im){im=new Image();im.className='lab-tile';im.alt='';im.draggable=false;im.dataset.key=key;im.src=`https://tile.openstreetmap.org/${key}.png`;im.onerror=()=>{im.classList.add('failed');};elTiles.append(im);}im.style.left=(x*256-center.x+w/2)+'px';im.style.top=(y*256-center.y+h/2)+'px';}
    for(const [key,im]of existing)if(!keep.has(key))im.remove();
    const box=[metersX(center.x-w/2,z),metersY(center.y+h/2,z),metersX(center.x+w/2,z),metersY(center.y-h/2,z)];
    const overlay=$('#lab-overlay'),status=$('#lab-map-status'),source=$('#lab-map-source'),notes=$('#lab-map-notes');
    const inAmerica=us(l),notUs=state.mode!=='lightning'&&!inAmerica;
    let url=notUs?'':imageFrom(state.mode,box,Math.round(w),Math.round(h));
    if(state.mode==='lightning'&&!state.lightning){status.textContent='Finding NOAA lightning-density layer…';status.hidden=false;ensureLightning();return;}
    if(state.mode==='lightning'&&!state.lightning?.available)url='';
    const captions={radar:'NOAA MRMS · latest observed base reflectivity, about 5-minute service updates',spc:'NOAA SPC · official Day 1 categorical outlook · forecast, not current radar',lightning:'NOAA nowCOAST · 15-minute accumulated lightning-strike density, not individual strike positions'};
    source.textContent=captions[state.mode];notes.textContent=state.mode==='lightning'?'Lightning density is a broad regional observation. It does not provide an individual strike distance or guarantee ground strikes.':state.mode==='spc'?'SPC categorical areas are forecast risks, not tornado tracks. For active warning polygons, open Tornado warnings & motion in Radar.':'Reflectivity depicts precipitation intensity, not tornado detection or velocity. Historical playback is available through Past radar.';
    if(fast){overlay.style.display='none';status.hidden=false;status.textContent='Move map to explore · updating on release';return;}
    if(!url){overlay.style.display='none';status.hidden=false;status.textContent=notUs?'This NOAA radar layer covers the United States. Use Past radar for global observations.':state.lightning?.error||'NOAA overlay not available.';return;}
    overlay.style.display='block';overlay.alt=captions[state.mode];status.hidden=false;status.textContent='Loading '+state.mode+' data…';const frame=++state.frameId;
    const next=new Image();next.onload=()=>{if(frame!==state.frameId)return;overlay.src=next.src;overlay.style.display='block';state.lastImageAt=Date.now();status.hidden=true;};next.onerror=()=>{if(frame!==state.frameId)return;overlay.style.display='none';status.hidden=false;status.textContent='NOAA imagery unavailable at the moment. Base map remains active.';};next.src=url+(url.includes('?')?'&':'?')+'ts='+Math.floor(Date.now()/(state.mode==='radar'?300000:900000));
  }
  function adjustZoom(delta){state.zoom=Math.max(3,Math.min(10,state.zoom+delta));paintMap();}
  function resetMap(){const l=location();if(!l)return;state.center={latitude:Number(l.latitude),longitude:Number(l.longitude)};state.zoom=7;paintMap();}
  function bindMap(){const map=$('#lab-map');let drag=null;
    map.addEventListener('pointerdown',ev=>{if(ev.target.closest('button'))return;drag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,center:merc(state.center.latitude,state.center.longitude,state.zoom)};map.setPointerCapture(ev.pointerId);});
    map.addEventListener('pointermove',ev=>{if(!drag||ev.pointerId!==drag.id)return;const coords=unmerc(drag.center.x-(ev.clientX-drag.x),drag.center.y-(ev.clientY-drag.y),state.zoom);state.center={latitude:Math.max(-85,Math.min(85,coords.latitude)),longitude:((coords.longitude+540)%360)-180};if(!state.dragFrame)state.dragFrame=requestAnimationFrame(()=>{state.dragFrame=0;paintMap(true);});});
    map.addEventListener('pointerup',()=>{if(drag){drag=null;paintMap();}});map.addEventListener('pointercancel',()=>{drag=null;paintMap();});
    map.addEventListener('wheel',ev=>{ev.preventDefault();adjustZoom(ev.deltaY<0?1:-1);},{passive:false});
  }
  async function loadIntelligence(force=false){const l=location();if(!l)return;const key=`${l.latitude},${l.longitude}`;
    if(!force&&key===state.locKey&&Date.now()-state.loadedAt<10*60000)return;
    state.locKey=key;state.data=null;updateSections();if(!us(l)){state.loadedAt=Date.now();updateSections();return;}
    const serial=++state.fetchSerial;
    try{const r=await fetch(`/.netlify/functions/intelligence?lat=${encodeURIComponent(l.latitude)}&lon=${encodeURIComponent(l.longitude)}`,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`HTTP ${r.status}`);const value=await r.json();if(serial!==state.fetchSerial)return;state.data=value;state.sourceError=null;state.loadedAt=Date.now();}catch(e){if(serial!==state.fetchSerial)return;state.data={available:false};state.sourceError=e.message;state.loadedAt=0;}
    updateSections();
  }
  function refreshLocation(){const l=location();if(!l)return;const key=`${l.latitude},${l.longitude}`;if(state.locKey!==key){state.center={latitude:Number(l.latitude),longitude:Number(l.longitude)};state.lightning=null;state.lastImageAt=null;paintMap();loadIntelligence(true);return;}updateSections();}
  function events(){document.addEventListener('click',async e=>{
    const tab=e.target.closest('[data-lab-tab]');if(tab){chooseTab(tab.dataset.labTab);return;}
    const layer=e.target.closest('[data-lab-layer]');if(layer){chooseLayer(layer.dataset.labLayer);return;}
    const button=e.target.closest('[data-lab-action]');if(!button)return;
    const act=button.dataset.labAction;
    if(act==='zoom-in')adjustZoom(1);else if(act==='zoom-out')adjustZoom(-1);else if(act==='center')resetMap();else if(act==='refreshmap')paintMap();else if(act==='oldradar')document.querySelector('[data-action="radar-expand"]')?.click();else if(act==='save-rules')await saveRules();else if(act==='refresh'){await loadIntelligence(true);showHealth();toast('Source checks completed.');}
  });
    document.addEventListener('click',ev=>{if(ev.target.closest('[data-location],[data-search-index],[data-action="locate"],[data-action="refresh"]'))setTimeout(refreshLocation,200);});
    let timeout;window.addEventListener('resize',()=>{clearTimeout(timeout);timeout=setTimeout(paintMap,180);});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshLocation();if(Date.now()-state.loadedAt>15*60000)loadIntelligence(true);if(Date.now()-state.lastImageAt>5*60000)paintMap();}});
    setInterval(()=>{if(!document.hidden){refreshLocation();if(Date.now()-state.loadedAt>15*60000)loadIntelligence(true);}},60000);
  }
  function init(){if(!$('#forecast-card')||$('#stormlab'))return;createPanel();const l=location();if(l){state.center={latitude:Number(l.latitude),longitude:Number(l.longitude)};}bindMap();events();updateSections();loadIntelligence(true);paintMap();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
