import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{hmac,signatureSource,validateOrder,drainEmails} from '../server/worker.mjs';
import {testDatabase} from './d1.mjs';
const purchase=()=>({items:[{code:'A01',quantity:1,price:1}],customer:{name:'Ujian Pelanggan',email:'customer@example.com',phone:'01112345678',address:'No 10 Jalan Ujian',postcode:'77200',city:'Bemban',state:'Melaka',access:'Ada lif'},confirmMeasurements:true,consent:true});
function fixture(){
  const db=testDatabase(),calls=[],jobs=[];
  const env={DB:db,CHECKOUT_ENABLED:'true',SITE_URL:'https://shop.test',BILLPLZ_MODE:'sandbox',BILLPLZ_API_KEY:'test-only',BILLPLZ_COLLECTION_ID:'test-collection',BILLPLZ_X_SIGNATURE_KEY:'signature-test-key',ORDER_TOKEN_KEY:'order-test-key-32-characters-long',ADMIN_TOKEN:'admin-test-token-32-characters-long',RESEND_API_KEY:'email-test-key',EMAIL_FROM:'orders@example.com',ADMIN_EMAIL:'merchant@example.com',FETCH:async(url,options)=>{calls.push({url,options});if(url.includes('/api/v3/bills'))return Response.json({id:'bill-test-1',url:'https://www.billplz-sandbox.com/bills/bill-test-1'});return Response.json({id:'email-test'});}};
  const ctx={waitUntil(job){jobs.push(job);}};
  const request=(path,body,extra={})=>new Request('https://shop.test'+path,{method:body===undefined?'GET':'POST',headers:{origin:'https://shop.test','content-type':'application/json','idempotency-key':'checkout-request-unique-12345',...extra},body:body===undefined?undefined:JSON.stringify(body)});
  const call=req=>worker.fetch(req,env,ctx);
  const flush=async()=>{await Promise.all(jobs);};
  async function paid(id,overrides={},signed=true){const params=new URLSearchParams({id:'bill-test-1',collection_id:'test-collection',paid:'true',state:'paid',amount:'150000',paid_amount:'150000',paid_at:'2026-11-10 16:00:00 +0800',...overrides});params.set('x_signature',signed?await hmac(env.BILLPLZ_X_SIGNATURE_KEY,signatureSource(params)):'forged');return call(new Request(`https://shop.test/api/payments/callback?order=${id}&token=${await hmac(env.ORDER_TOKEN_KEY,'callback:'+id)}`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params}));}
  return {db,env,calls,call,request,paid,flush};
}
test('server calculates RM1500, ignores browser price; quotation-only and non-Melaka addresses rejected',()=>{
  assert.equal(validateOrder(purchase()).total,150000);
  for(const change of [b=>b.items[0].code='DR2',b=>b.items[0].quantity=-1,b=>b.items[0].quantity=1.5,b=>b.customer.state='Johor',b=>b.customer.postcode='50000',b=>b.consent=false,b=>b.customer.email='bad']){const body=purchase();change(body);assert.throws(()=>validateOrder(body));}
});
test('Billplz signature uses every field with case-insensitive ordering',async()=>{
  const params=new URLSearchParams({z:'last',Amount:'100',paid:'true',x_signature:'excluded'});assert.equal(signatureSource(params),'Amount100|paidtrue|zlast');
  const result=await hmac('key','The quick brown fox jumps over the lazy dog');assert.equal(result,'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
});
test('checkout is disabled with missing keys or flag; rejects foreign-origin requests',async()=>{
  const f=fixture();f.env.CHECKOUT_ENABLED='false';assert.equal((await f.call(f.request('/api/checkout',purchase()))).status,503);assert.equal(f.calls.length,0);
  f.env.CHECKOUT_ENABLED='true';assert.equal((await f.call(f.request('/api/checkout',purchase(),{origin:'https://attacker.test'}))).status,403);
  delete f.env.RESEND_API_KEY;assert.equal((await f.call(f.request('/api/checkout',purchase()))).status,503);f.db.close();
});
test('repeated checkout creates one bill; changed data cannot reuse its key',async()=>{
  const f=fixture();const first=await f.call(f.request('/api/checkout',purchase()));assert.equal(first.status,201);const row=await first.json();assert.match(row.id,/^CL-[A-F0-9]{20}$/);
  const repeat=await f.call(f.request('/api/checkout',purchase()));assert.equal((await repeat.json()).paymentUrl,row.paymentUrl);assert.equal(f.calls.length,1);
  const changed=purchase();changed.items[0].quantity=2;assert.equal((await f.call(f.request('/api/checkout',changed))).status,409);
  const form=new URLSearchParams(f.calls[0].options.body);assert.equal(form.get('amount'),'150000');assert.equal(form.get('collection_id'),'test-collection');f.db.close();
});
test('only verified matching payment marks paid; duplicate/reversed callbacks do not duplicate order/email',async()=>{
  const f=fixture();const row=await (await f.call(f.request('/api/checkout',purchase()))).json();
  assert.equal((await f.paid(row.id,{},false)).status,401);
  assert.equal((await f.paid(row.id,{paid_amount:'1'})).status,409);
  assert.equal((await f.paid(row.id,{collection_id:'other'})).status,409);
  assert.equal((await f.paid(row.id,{id:'wrong-bill'})).status,409);
  assert.equal((await f.paid(row.id,{paid:'false',state:'due',paid_amount:'0'})).status,200);
  assert.equal((await f.db.prepare('SELECT payment_status FROM orders WHERE id=?').bind(row.id).first()).payment_status,'pending');
  assert.equal((await f.paid(row.id)).status,200);await f.flush();assert.equal((await f.paid(row.id)).status,200);await f.flush();
  assert.equal((await f.db.prepare('SELECT payment_status FROM orders WHERE id=?').bind(row.id).first()).payment_status,'paid');
  assert.equal(f.calls.filter(c=>c.url==='https://api.resend.com/emails').length,2);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n,1);
  await f.paid(row.id,{paid:'false',state:'due',paid_amount:'0'});assert.equal((await f.db.prepare('SELECT payment_status FROM orders WHERE id=?').bind(row.id).first()).payment_status,'paid');f.db.close();
});
test('public order status requires capability token and exposes no customer data; URL paid flag is ignored',async()=>{
  const f=fixture(),row=await (await f.call(f.request('/api/checkout',purchase()))).json();
  assert.equal((await f.call(f.request('/api/orders/'+row.id))).status,404);
  const response=await f.call(f.request('/api/orders/'+row.id+'?paid=true',undefined,{'x-order-token':row.token}));const data=await response.json();assert.equal(data.paymentStatus,'pending');assert.equal(data.customer,undefined);assert.equal(data.customer_json,undefined);f.db.close();
});
test('admin requires authentication, cannot fulfil unpaid orders, and records paid status changes',async()=>{
  const f=fixture(),row=await (await f.call(f.request('/api/checkout',purchase()))).json();
  assert.equal((await f.call(f.request('/api/admin/orders'))).status,401);
  const change=()=>new Request('https://shop.test/api/admin/orders/'+row.id,{method:'PATCH',headers:{origin:'https://shop.test',authorization:'Bearer '+f.env.ADMIN_TOKEN},body:JSON.stringify({status:'production'})});
  assert.equal((await f.call(change())).status,409);await f.paid(row.id);await f.flush();assert.equal((await f.call(change())).status,200);
  assert.equal((await f.db.prepare('SELECT fulfilment_status FROM orders WHERE id=?').bind(row.id).first()).fulfilment_status,'production');assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM order_events').first()).n,1);f.db.close();
});
test('email outage preserves paid order and retries from durable outbox',async()=>{
  const f=fixture(),row=await (await f.call(f.request('/api/checkout',purchase()))).json(),original=f.env.FETCH;
  f.env.FETCH=async()=>new Response('unavailable',{status:503});await f.paid(row.id);await f.flush();
  assert.equal((await f.db.prepare('SELECT payment_status FROM orders WHERE id=?').bind(row.id).first()).payment_status,'paid');
  assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE state='failed'").first()).n,2);
  await f.db.prepare('UPDATE email_outbox SET lease_until=0').run();f.env.FETCH=original;await drainEmails(f.env);assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE state='sent'").first()).n,2);f.db.close();
});
