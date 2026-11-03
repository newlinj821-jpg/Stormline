import { getStore } from '@netlify/blobs';
import * as webpush from 'web-push';
import { json, digest, token, equalSecret, validSubscription, safeLocations, safePrefs, keysConfigured } from '../lib/shared.mjs';

const store = () => getStore('stormline-subscribers');
export default async function handler(req){
  if(req.method==='GET')return json({configured:keysConfigured(),publicKey:keysConfigured()?process.env.VAPID_PUBLIC_KEY:null});
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(!keysConfigured())return json({error:'Push keys are not configured. Add VAPID environment variables in Netlify.'},503);
  // Browser requests must come from this Netlify origin. Scripts without Origin can still be rate limited by provider quotas.
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Cross-origin request rejected'},403);
  const bodyText=await req.text();if(bodyText.length>12000)return json({error:'Request too large'},413);
  let body;try{body=JSON.parse(bodyText);}catch{return json({error:'Invalid JSON'},400);}
  if(!validSubscription(body.subscription))return json({error:'Invalid browser push subscription'},400);
  const key='subscription-'+digest(body.subscription.endpoint),data=store();
  try{
    const previous=await data.get(key,{type:'json'});
    if(body.action==='subscribe'){
      if(previous&&!equalSecret(body.manageToken,previous.manageHash))return json({error:'This subscription is already managed by another browser session. Disable and re-enable notifications to reset it.'},403);
      const manageToken=previous?body.manageToken:token(),locations=safeLocations(body.locations),prefs=safePrefs(body.prefs);
      if(!locations.length)return json({error:'Choose a location before subscribing'},400);
      await data.setJSON(key,{subscription:body.subscription,manageHash:digest(manageToken),locations,prefs,seen:previous?.seen||{},lastTestAt:previous?.lastTestAt||0,updatedAt:Date.now()});
      return json({ok:true,manageToken});
    }
    if(!previous||!equalSecret(body.manageToken,previous.manageHash))return json({error:'Subscription authorization failed'},403);
    if(body.action==='unsubscribe'){await data.delete(key);return json({ok:true});}
    if(body.action==='test'){
      if(Date.now()-(previous.lastTestAt||0)<60000)return json({error:'Please wait one minute between test notifications.'},429);
      webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
      await webpush.sendNotification(previous.subscription,JSON.stringify({title:'Stormline test alert',body:'Push delivery is working on this device.',tag:'stormline-test',url:'/'}),{TTL:120,urgency:'normal'});
      await data.setJSON(key,{...previous,lastTestAt:Date.now()});return json({ok:true});
    }
    return json({error:'Unsupported action'},400);
  }catch(e){console.error('Push function failed:',e.message);return json({error:'Push subscription could not be processed. Check Netlify function logs and push configuration.'},502);}
}
