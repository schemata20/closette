import {catalog} from './catalog.mjs';

const encoder = new TextEncoder();
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const required = (condition,message,status=400) => {if(!condition)throw new HttpError(status,message);};
export const paymentReady = env => env.CHECKOUT_ENABLED==='true' && ['DB','BILLPLZ_API_KEY','BILLPLZ_COLLECTION_ID','BILLPLZ_X_SIGNATURE_KEY','ORDER_TOKEN_KEY','ADMIN_TOKEN','RESEND_API_KEY','EMAIL_FROM','ADMIN_EMAIL'].every(k=>!!env[k]) && env.ORDER_TOKEN_KEY.length>=32 && env.ADMIN_TOKEN.length>=32 && ['sandbox','live'].includes(env.BILLPLZ_MODE);
const billHost = env => env.BILLPLZ_MODE==='live'?'www.billplz.com':'www.billplz-sandbox.com';

export async function hmac(secret,value){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function equalSecret(a,b){
  const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(String(s))));
  const [x,y]=await Promise.all([digest(a),digest(b)]);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
export function signatureSource(params){
  return [...params.entries()].filter(([key])=>key!=='x_signature').map(([key,value])=>key+value)
    .sort((a,b)=>a.toLowerCase()<b.toLowerCase()?-1:a.toLowerCase()>b.toLowerCase()?1:0).join('|');
}
function text(value,min,max,label){required(typeof value==='string'&&value.trim().length>=min&&value.trim().length<=max,`Sila semak ${label}.`);return value.trim();}
export function validateOrder(body){
  required(Array.isArray(body.items)&&body.items.length>0&&body.items.length<=14,'Pilih sekurang-kurangnya satu produk.');
  const seen=new Set();
  const items=body.items.map(item=>{
    const p=catalog.find(p=>p.code===item.code&&p.purchasable);
    required(p&&!seen.has(item.code),'Produk tidak sah atau memerlukan sebut harga.');seen.add(item.code);
    required(Number.isInteger(item.quantity)&&item.quantity>=1&&item.quantity<=10,'Kuantiti mesti antara 1 hingga 10.');
    return {code:p.code,name:p.name,size:p.size,quantity:item.quantity,unitPrice:p.price};
  });
  const c=body.customer||{};
  const customer={name:text(c.name,2,100,'nama'),email:text(c.email,5,180,'e-mel'),phone:text(c.phone,9,24,'telefon'),address:text(c.address,8,350,'alamat'),postcode:text(c.postcode,5,5,'poskod'),city:text(c.city,2,80,'bandar'),state:c.state,access:text(c.access||'Tiada catatan',1,500,'catatan akses')};
  required(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email),'Alamat e-mel tidak sah.');
  required(/^\+?[\d\s()-]{9,24}$/.test(customer.phone),'Nombor telefon tidak sah.');
  required(customer.state==='Melaka'&&/^7[5-8]\d{3}$/.test(customer.postcode),'Pembelian terus tersedia untuk alamat Melaka sahaja. Hubungi kami untuk lokasi lain.');
  required(body.confirmMeasurements===true&&body.consent===true,'Sila sahkan ukuran dan kebenaran memproses pesanan.');
  // Prices and free Melaka delivery are authoritative here, never taken from the browser.
  return {items,customer,total:items.reduce((sum,i)=>sum+i.unitPrice*i.quantity,0)};
}
async function readBody(request){
  required(Number(request.headers.get('content-length')||0)<=20000,'Permintaan terlalu besar.',413);
  const body=await request.text();required(body.length<=20000,'Permintaan terlalu besar.',413);return body;
}
function sameOrigin(request){
  required(request.headers.get('origin')===new URL(request.url).origin,'Permintaan tidak dibenarkan.',403);
}
async function rateLimit(request,env,kind,limit){
  const now=Math.floor(Date.now()/1000),window=Math.floor(now/600);
  const ip=request.headers.get('cf-connecting-ip')||'local';
  const bucket=await hmac(env.ORDER_TOKEN_KEY||env.ADMIN_TOKEN||'disabled',`${kind}:${ip}:${window}`);
  const row=await env.DB.prepare('INSERT INTO request_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,now+1200).first();
  required(row.count<=limit,'Terlalu banyak cubaan. Sila cuba lagi dalam 10 minit.',429);
}
async function orderToken(env,id){return hmac(env.ORDER_TOKEN_KEY,'order:'+id);}
async function billRequest(env,path,options={}){
  const response=await (env.FETCH||fetch)(`https://${billHost(env)}/api/v3/${path}`,{...options,headers:{Authorization:'Basic '+btoa(env.BILLPLZ_API_KEY+':'),...(options.headers||{})},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new HttpError(502,'Pembayaran belum dapat dimulakan. Sila hubungi pasukan Closette.');
  return response.json();
}
async function checkout(request,env){
  sameOrigin(request);required(paymentReady(env),'Pembayaran online belum dibuka. Hubungi kami melalui WhatsApp untuk tempahan.',503);
  await rateLimit(request,env,'checkout',10);
  let body;try{body=JSON.parse(await readBody(request));}catch(e){if(e.status)throw e;throw new HttpError(400,'Maklumat checkout tidak sah.');}
  const order=validateOrder(body);
  const key=text(request.headers.get('idempotency-key'),20,80,'rujukan checkout');
  required(/^[a-zA-Z0-9_-]+$/.test(key),'Rujukan checkout tidak sah.');
  const fingerprint=await hmac(env.ORDER_TOKEN_KEY,JSON.stringify(order));
  const id='CL-'+crypto.randomUUID().replaceAll('-','').toUpperCase().slice(0,20),now=new Date().toISOString();
  const inserted=await env.DB.prepare('INSERT OR IGNORE INTO orders(id,request_key,request_hash,customer_json,items_json,total,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,key,fingerprint,JSON.stringify(order.customer),JSON.stringify(order.items),order.total,now,now).run();
  if(!inserted.meta.changes){
    const existing=await env.DB.prepare('SELECT * FROM orders WHERE request_key=?').bind(key).first();
    required(existing.request_hash===fingerprint,'Maklumat checkout telah berubah. Muat semula ringkasan dan cuba lagi.',409);
    required(existing.payment_status!=='paid','Order ini sudah dibayar. Semak e-mel pengesahan.',409);
    required(existing.bill_url,'Checkout sedang diproses. Tunggu sebentar atau hubungi kami dengan rujukan '+existing.id+'.',409);
    return json({id:existing.id,paymentUrl:existing.bill_url,token:await orderToken(env,existing.id)});
  }
  try{
    const callbackToken=await hmac(env.ORDER_TOKEN_KEY,'callback:'+id);
    const form=new URLSearchParams({collection_id:env.BILLPLZ_COLLECTION_ID,email:order.customer.email,name:order.customer.name,amount:String(order.total),description:`Closette ${id}`,reference_1_label:'Order',reference_1:id,callback_url:`${env.SITE_URL}/api/payments/callback?order=${id}&token=${callbackToken}`,redirect_url:`${env.SITE_URL}/order.html#${id}:${await orderToken(env,id)}`});
    const bill=await billRequest(env,'bills',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form});
    const target=new URL(bill.url);
    required(target.protocol==='https:'&&target.hostname===billHost(env)&&typeof bill.id==='string','Pautan pembayaran tidak sah.',502);
    await env.DB.prepare('UPDATE orders SET bill_id=?,bill_url=?,updated_at=? WHERE id=?').bind(bill.id,bill.url,now,id).run();
    return json({id,paymentUrl:bill.url,token:await orderToken(env,id)},201);
  }catch(error){
    await env.DB.prepare("UPDATE orders SET payment_status='setup_error',updated_at=? WHERE id=? AND payment_status='pending'").bind(new Date().toISOString(),id).run();
    throw error;
  }
}
const money=sen=>new Intl.NumberFormat('ms-MY',{style:'currency',currency:'MYR'}).format(sen/100);
function emailPayloads(row){
  const c=JSON.parse(row.customer_json),items=JSON.parse(row.items_json);
  const summary=items.map(i=>`${i.code} · ${i.name} × ${i.quantity} — ${money(i.unitPrice*i.quantity)}`).join('\n');
  const detail=`Order ${row.id}\n\n${summary}\n\nJumlah dibayar: ${money(row.total)}\nPenghantaran & pemasangan Melaka: Termasuk\n\nAlamat: ${c.address}, ${c.postcode} ${c.city}, Melaka\nCatatan akses: ${c.access}\n\nPasukan Closette akan menghubungi anda untuk mengesahkan pilihan kemasan dan jadual pemasangan. Tempoh siap rujukan: 1–2 minggu; jadual sebenar disahkan bersama pasukan.\n\nClosette · Schemata Works\n011-6299 7250`;
  return {customer:{subject:`Bayaran diterima · ${row.id}`,text:`Salam ${c.name},\n\nTerima kasih. Bayaran anda telah disahkan.\n\n${detail}`},merchant:{subject:`Order dibayar · ${row.id}`,text:`Order baharu untuk diproses.\nPelanggan: ${c.name}\nTelefon: ${c.phone}\nE-mel: ${c.email}\n\n${detail}`}};
}
async function markPaid(env,row,billId,paidAt){
  const emails=emailPayloads(row),now=new Date().toISOString();
  const tracking=`\n\nSemak status pesanan (pautan peribadi): ${env.SITE_URL}/order.html#${row.id}:${await orderToken(env,row.id)}`;
  emails.customer.text+=tracking;
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET payment_status='paid',bill_id=?,paid_at=COALESCE(paid_at,?),updated_at=? WHERE id=? AND (bill_id IS NULL OR bill_id=?)").bind(billId,paidAt||now,now,row.id,billId),
    ...[['customer',JSON.parse(row.customer_json).email],['merchant',env.ADMIN_EMAIL]].map(([type,recipient])=>env.DB.prepare("INSERT OR IGNORE INTO email_outbox(id,order_id,recipient,payload) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND payment_status='paid')").bind(`${row.id}-${type}`,row.id,recipient,JSON.stringify(emails[type]),row.id))
  ]);
}
async function callback(request,env,ctx){
  required(env.DB&&env.BILLPLZ_X_SIGNATURE_KEY&&env.ORDER_TOKEN_KEY,'Integrasi belum tersedia.',503);
  const url=new URL(request.url),id=url.searchParams.get('order')||'';
  required(await equalSecret(url.searchParams.get('token')||'',await hmac(env.ORDER_TOKEN_KEY,'callback:'+id)),'Pengesahan tidak sah.',401);
  required(request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'),'Format tidak sah.',415);
  const params=new URLSearchParams(await readBody(request));
  required(new Set(params.keys()).size===[...params.keys()].length,'Parameter berulang tidak dibenarkan.');
  required(await equalSecret(params.get('x_signature')||'',await hmac(env.BILLPLZ_X_SIGNATURE_KEY,signatureSource(params))),'Tandatangan pembayaran tidak sah.',401);
  const row=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  required(row,'Order tidak dijumpai.',404);
  required(params.get('collection_id')===env.BILLPLZ_COLLECTION_ID&&Number(params.get('amount'))===row.total&&(!row.bill_id||row.bill_id===params.get('id')),'Butiran bayaran tidak sepadan.',409);
  if(params.get('paid')==='true'){
    required(params.get('state')==='paid'&&Number(params.get('paid_amount'))===row.total,'Jumlah bayaran tidak sepadan.',409);
    await markPaid(env,row,params.get('id'),params.get('paid_at'));
    ctx.waitUntil(drainEmails(env));
  }
  // A failed attempt does not invalidate an unpaid Bill; the customer can retry it.
  return json({received:true});
}
export async function drainEmails(env){
  if(!env.DB||!env.RESEND_API_KEY||!env.EMAIL_FROM)return;
  const now=Math.floor(Date.now()/1000);
  const {results}=await env.DB.prepare("SELECT id FROM email_outbox WHERE state!='sent' AND attempts<10 AND lease_until<? LIMIT 20").bind(now).all();
  for(const item of results){
    const row=await env.DB.prepare("UPDATE email_outbox SET lease_until=?,attempts=attempts+1 WHERE id=? AND state!='sent' AND attempts<10 AND lease_until<? RETURNING *").bind(now+120,item.id,now).first();
    if(!row)continue;
    try{
      const response=await (env.FETCH||fetch)('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json','Idempotency-Key':row.id},body:JSON.stringify({from:env.EMAIL_FROM,to:[row.recipient],...JSON.parse(row.payload)}),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('Email provider rejected delivery');
      await env.DB.prepare("UPDATE email_outbox SET state='sent',sent_at=?,last_error=NULL WHERE id=?").bind(new Date().toISOString(),row.id).run();
    }catch{
      await env.DB.prepare("UPDATE email_outbox SET state='failed',last_error='Penghantaran e-mel gagal; sistem akan cuba semula.' WHERE id=?").bind(row.id).run();
    }
  }
}
async function publicOrder(request,env,id){
  required(env.DB&&env.ORDER_TOKEN_KEY,'Sistem order belum tersedia.',503);
  required(await equalSecret(request.headers.get('x-order-token')||'',await orderToken(env,id)),'Pautan order tidak sah.',404);
  const row=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();required(row,'Order tidak dijumpai.',404);
  // Capability token is sent in a header, not query/logs. No address or email in public response.
  return json({id:row.id,items:JSON.parse(row.items_json),total:row.total,paymentStatus:row.payment_status,fulfilmentStatus:row.fulfilment_status,createdAt:row.created_at,paidAt:row.paid_at,paymentUrl:row.payment_status==='pending'?row.bill_url:null});
}
async function admin(request,env,path){
  required(env.DB&&env.ADMIN_TOKEN,'Dashboard belum dikonfigurasi.',503);
  await rateLimit(request,env,'admin',60);
  required(await equalSecret(request.headers.get('authorization')||'','Bearer '+env.ADMIN_TOKEN),'Kunci akses tidak sah.',401);
  if(request.method==='GET'&&path==='/api/admin/orders'){
    const cursor=new URL(request.url).searchParams.get('before')||'9999';
    const {results}=await env.DB.prepare('SELECT * FROM orders WHERE created_at<? ORDER BY created_at DESC LIMIT 50').bind(cursor).all();
    const {results:mail}=await env.DB.prepare("SELECT order_id,state,COUNT(*) AS count FROM email_outbox WHERE state!='sent' GROUP BY order_id,state").all();
    return json({orders:results.map(row=>({...row,customer:JSON.parse(row.customer_json),items:JSON.parse(row.items_json),customer_json:undefined,items_json:undefined,request_key:undefined,request_hash:undefined})),emailIssues:mail,nextCursor:results.length===50?results.at(-1).created_at:null});
  }
  if(request.method==='PATCH'&&path.startsWith('/api/admin/orders/')){
    sameOrigin(request);const id=path.split('/').at(-1);let data;try{data=JSON.parse(await readBody(request));}catch{throw new HttpError(400,'Data tidak sah.');}
    const states=['new','confirmed','production','delivery','completed'];required(states.includes(data.status),'Status tidak sah.');
    const row=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();required(row,'Order tidak dijumpai.',404);
    required(row.payment_status==='paid','Hanya order dibayar boleh diproses.',409);
    const now=new Date().toISOString();await env.DB.batch([env.DB.prepare('UPDATE orders SET fulfilment_status=?,updated_at=? WHERE id=?').bind(data.status,now,id),env.DB.prepare('INSERT INTO order_events(order_id,status,created_at) VALUES(?,?,?)').bind(id,data.status,now)]);
    return json({updated:true});
  }
  throw new HttpError(404,'Laluan tidak dijumpai.');
}
async function handle(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path==='/api/store'&&request.method==='GET')return json({ready:!!paymentReady(env),sandbox:env.BILLPLZ_MODE!=='live',products:catalog,delivery:{state:'Melaka',fee:0},message:paymentReady(env)?null:'Pembayaran online akan dibuka tidak lama lagi. Tempahan masih boleh dibuat melalui WhatsApp.'});
  if(path==='/api/checkout'&&request.method==='POST')return checkout(request,env);
  if(path==='/api/payments/callback'&&request.method==='POST')return callback(request,env,ctx);
  if(path.startsWith('/api/admin/'))return admin(request,env,path);
  if(/^\/api\/orders\/CL-[A-F0-9]{20}$/.test(path)&&request.method==='GET')return publicOrder(request,env,path.split('/').at(-1));
  if(path.startsWith('/api/'))throw new HttpError(404,'Laluan tidak dijumpai.');
  const response=await env.ASSETS.fetch(request);const secured=new Response(response.body,response);
  secured.headers.set('X-Content-Type-Options','nosniff');secured.headers.set('Referrer-Policy','no-referrer');
  secured.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if(/\/(admin|order|checkout)(\.html)?$/.test(path)){secured.headers.set('Cache-Control','no-store');secured.headers.set('X-Robots-Tag','noindex, nofollow');}
  return secured;
}
export default {
  async fetch(request,env,ctx){try{return await handle(request,env,ctx);}catch(error){return json({error:error.status?error.message:'Sistem mengalami gangguan. Sila cuba semula atau hubungi Closette.'},error.status||500);}},
  async scheduled(_event,env,ctx){ctx.waitUntil((async()=>{await drainEmails(env);if(env.DB)await env.DB.prepare('DELETE FROM request_limits WHERE expires_at<?').bind(Math.floor(Date.now()/1000)).run();})());}
};
