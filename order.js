'use strict';
// Ignore every payment status supplied in the browser URL. Only the server is authoritative.
const match=location.hash.match(/^#(CL-[A-F0-9]{20}):([a-f0-9]{64})/);
let id=match?.[1]||new URLSearchParams(location.search).get('order'),token=match?.[2];
if(id&&!token){try{token=sessionStorage.getItem('closette-order-'+id);}catch{}}
if(match){try{sessionStorage.setItem('closette-order-'+id,token);}catch{}history.replaceState(null,'',location.pathname+'?order='+id);}
const message=document.querySelector('#order-message'),title=document.querySelector('#order-title'),refresh=document.querySelector('#order-refresh');
const states={new:'Menunggu pengesahan pasukan',confirmed:'Tempahan disahkan',production:'Dalam pengeluaran',delivery:'Penghantaran / pemasangan',completed:'Selesai'};
let attempts=0,timer;
async function update(){clearTimeout(timer);refresh.disabled=true;
  try{
    if(!id||!token)throw new Error('Gunakan pautan status yang diberikan selepas checkout atau hubungi pasukan kami untuk bantuan.');
    const response=await fetch('/api/orders/'+encodeURIComponent(id),{headers:{'x-order-token':token}}),row=await response.json();if(!response.ok)throw new Error(row.error);
    document.querySelector('#order-ref').textContent=row.id;
    document.querySelector('#order-help').href='https://wa.me/601162997250?text='+encodeURIComponent('Salam Closette, saya ingin bertanya tentang order '+row.id+'.');
    const paid=row.paymentStatus==='paid';title.textContent=paid?'Terima kasih.':'Bayaran belum disahkan.';
    message.textContent=paid?'Bayaran diterima. E-mel pengesahan akan dihantar kepada anda.':'Jika anda baru selesai membayar, pengesahan mungkin mengambil sedikit masa. Jangan buat bayaran kedua sementara status disemak.';
    const pill=document.querySelector('#order-status');pill.hidden=false;pill.classList.toggle('paid',paid);pill.textContent=paid?'Dibayar · '+(states[row.fulfilmentStatus]||row.fulfilmentStatus):row.paymentStatus==='setup_error'?'Pembayaran tidak dapat dimulakan':'Menunggu bayaran';
    const list=document.querySelector('#order-items');list.replaceChildren();for(const item of row.items){const p=document.createElement('p');p.textContent=`${item.code} · ${item.name} × ${item.quantity}`;list.append(p);}
    const total=document.querySelector('#order-total');total.hidden=false;total.textContent='Jumlah: '+new Intl.NumberFormat('ms-MY',{style:'currency',currency:'MYR'}).format(row.total/100);
    document.querySelector('#order-note').textContent=paid?'Pasukan kami akan menghubungi anda untuk pilihan kemasan dan jadual pemasangan. Pautan status ini bersifat peribadi.':'Simpan nombor order untuk rujukan. Pautan status ini bersifat peribadi.';
    const pay=document.querySelector('#order-pay');pay.hidden=paid||!row.paymentUrl;if(row.paymentUrl){const url=new URL(row.paymentUrl);if(url.protocol==='https:'&&['www.billplz.com','www.billplz-sandbox.com'].includes(url.hostname))pay.href=url.href;else pay.hidden=true;}
    if(paid){try{const bought=new Map(row.items.map(i=>[i.code,i.quantity]));if(!sessionStorage.getItem('closette-cleared-'+id)){const cart=JSON.parse(localStorage.getItem('closette-cart-v1')||'[]').map(i=>({...i,quantity:i.quantity-(bought.get(i.code)||0)})).filter(i=>i.quantity>0);localStorage.setItem('closette-cart-v1',JSON.stringify(cart));sessionStorage.setItem('closette-cleared-'+id,'1');}}catch{}}
    else if(attempts++<12)timer=setTimeout(update,5000);
  }catch(error){title.textContent='Semak tempahan anda.';message.textContent=error.message||'Sambungan terganggu. Cuba semak semula.';}finally{refresh.disabled=false;}
}
refresh.addEventListener('click',()=>{attempts=0;update();});update();
