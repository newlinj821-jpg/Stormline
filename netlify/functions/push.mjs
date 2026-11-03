import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { json, digest, token, equalSecret, validSubscription, safeLocations, safePrefs } from '../lib/shared.mjs';
import { inspectVapid, classifyPushFailure } from '../lib/push-diagnostics.mjs';

const store = () => getStore('stormline-subscribers');
const samePushDevice = (a,b) => Boolean(
  a?.endpoint && a.endpoint === b?.endpoint &&
  a?.keys?.auth && a.keys.auth === b?.keys?.auth &&
  a?.keys?.p256dh && a.keys.p256dh === b?.keys?.p256dh
);

export default async function handler(req) {
  const vapid = inspectVapid();
  if (req.method === 'GET') {
    return json({configured:vapid.configured,publicKey:vapid.configured?vapid.publicKey:null,...(!vapid.configured?{code:vapid.code,error:vapid.message}:{})});
  }
  if (req.method !== 'POST') return json({code:'METHOD_NOT_ALLOWED',error:'Method not allowed'},405);
  if (!vapid.configured) return json({code:vapid.code,error:vapid.message},503);

  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return json({code:'INVALID_ORIGIN',error:'Cross-origin request rejected'},403);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 12000) return json({code:'PAYLOAD_TOO_LARGE',error:'Request too large'},413);
    body = JSON.parse(raw);
  } catch { return json({code:'BAD_JSON',error:'Invalid JSON request'},400); }
  if (!validSubscription(body?.subscription)) return json({code:'INVALID_SUBSCRIPTION',error:'The browser push subscription is invalid. Repair notifications on this device.'},400);
  if (!['subscribe','verify','status','unsubscribe','test'].includes(body.action)) return json({code:'UNKNOWN_ACTION',error:'Unsupported notification operation'},400);

  const key = 'subscription-' + digest(body.subscription.endpoint);
  try {
    const data = store();
    const previous = await data.get(key,{type:'json'});
    const authorized = Boolean(previous && equalSecret(body.manageToken,previous.manageHash));
    if (body.action === 'verify' || body.action === 'status') {
      return json({enrolled:authorized,authorized});
    }
    if (body.action === 'subscribe') {
      if (previous && !authorized && !samePushDevice(previous.subscription,body.subscription)) {
        return json({code:'SUBSCRIPTION_CONFLICT',error:'This push endpoint belongs to a different device. Repair the subscription.'},409);
      }
      const manageToken = authorized ? body.manageToken : token();
      const locations = safeLocations(body.locations);
      if (!locations.length) return json({code:'NO_LOCATIONS',error:'Save at least one location before enabling notifications.'},400);
      const prefs = safePrefs(body.prefs);
      await data.setJSON(key,{
        subscription:body.subscription,manageHash:digest(manageToken),locations,prefs,
        seen:previous?.seen||{},lastTestAt:previous?.lastTestAt||0,updatedAt:Date.now()
      });
      return json({ok:true,manageToken});
    }
    if (!authorized) return json({code:'SUBSCRIPTION_AUTHORIZATION_FAILED',error:'This device must repair its notification subscription.'},403);
    if (body.action === 'unsubscribe') {
      await data.delete(key);
      return json({ok:true});
    }
    if (Date.now() - (previous.lastTestAt||0) < 60000) {
      return json({code:'TEST_COOLDOWN',error:'Please wait at least one minute between notification tests.'},429);
    }
    try {
      webpush.setVapidDetails(vapid.subject,vapid.publicKey,vapid.privateKey);
      await webpush.sendNotification(previous.subscription,JSON.stringify({
        title:'Stormline test alert',body:'Stormline reached your push provider. If you can read this, notifications are working.',
        tag:'stormline-test',url:'/'
      }),{TTL:120,urgency:'normal'});
    } catch (e) {
      const failure = classifyPushFailure(e);
      console.error('Stormline push provider rejected delivery',JSON.stringify({code:failure.code,providerStatus:e?.statusCode||null,detail:String(e?.message||'').slice(0,300)}));
      if (failure.code === 'PUSH_ENDPOINT_EXPIRED') {
        try { await data.delete(key); } catch (error) { console.error('Stormline failed to remove expired endpoint',String(error?.message||'').slice(0,200)); }
      }
      return json({code:failure.code,error:failure.error},failure.status);
    }
    try {
      await data.setJSON(key,{...previous,lastTestAt:Date.now()});
    } catch (e) {
      console.error('Stormline push accepted but cooldown persistence failed',String(e?.message||'').slice(0,300));
    }
    return json({ok:true,acceptedByProvider:true});
  } catch (e) {
    console.error('Stormline subscription storage failure',String(e?.message||'').slice(0,300));
    return json({code:'SUBSCRIPTION_STORAGE_ERROR',error:'Stormline could not access its notification database. Check the Netlify Blobs configuration and push function logs.'},503);
  }
}
