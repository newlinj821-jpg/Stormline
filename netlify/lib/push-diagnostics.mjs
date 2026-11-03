import { createECDH } from 'node:crypto';

const decode = input => Buffer.from(String(input || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Only returns nonsecret configuration details. Never return private-key material. */
export function inspectVapid(env = process.env) {
  const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(env.VAPID_SUBJECT || '').trim();
  if (!publicKey || !privateKey || !subject) {
    return {configured:false, code:'VAPID_MISSING', message:'Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT to Netlify environment variables.'};
  }
  if (!(subject.startsWith('mailto:') || subject.startsWith('https://'))) {
    return {configured:false, code:'VAPID_SUBJECT_INVALID', message:'VAPID_SUBJECT must be a mailto: contact or an https:// URL.'};
  }
  try {
    const privateBytes = decode(privateKey);
    const publicBytes = decode(publicKey);
    if (privateBytes.length !== 32 || publicBytes.length !== 65 || publicBytes[0] !== 4) throw Error('invalid key length');
    const key = createECDH('prime256v1');
    key.setPrivateKey(privateBytes);
    if (!key.getPublicKey().equals(publicBytes)) throw Error('keys do not match');
  } catch {
    return {configured:false, code:'VAPID_KEYS_INVALID', message:'The Netlify VAPID public and private keys are not a matching valid pair. Recheck the values and redeploy.'};
  }
  return {configured:true, publicKey, privateKey, subject};
}

/** Stable, actionable, sanitized response for known failures from push providers. */
export function classifyPushFailure(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  const message = String(error?.message || '');
  if (status === 404 || status === 410) {
    return {status:410, code:'PUSH_ENDPOINT_EXPIRED', error:'The phone’s push endpoint has expired. Open Weather notifications and tap Repair subscription, then retry the test.'};
  }
  if (status === 401 || status === 403) {
    return {status:502, code:'PUSH_PROVIDER_AUTH_REJECTED', error:'The push provider rejected server authorization. Confirm that Netlify has the original VAPID key pair, redeploy, then repair this device’s subscription.'};
  }
  if (status === 429) {
    return {status:503, code:'PUSH_PROVIDER_RATE_LIMITED', error:'The push provider is temporarily rate-limiting delivery. Try again later.'};
  }
  if (status >= 500) {
    return {status:502, code:'PUSH_PROVIDER_UNAVAILABLE', error:'The push provider is temporarily unavailable. Try again later.'};
  }
  if (status === 400 || status === 413) {
    return {status:502, code:'PUSH_PROVIDER_BAD_REQUEST', error:'The push provider rejected the subscription or encrypted payload. Repair your subscription and retry.'};
  }
  if (/vapid|private key|public key|elliptic|invalid subject/i.test(message)) {
    return {status:503, code:'VAPID_CONFIGURATION_ERROR', error:'Stormline cannot sign push messages using the configured VAPID credentials. Check the Netlify environment variables and redeploy.'};
  }
  return {status:502, code:'PUSH_DELIVERY_FAILED', error:'The server could not hand off the notification. Check Netlify’s push function logs for the recorded error code.'};
}
