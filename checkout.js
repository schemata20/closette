'use strict';
const cartKey='closette-cart-v1',format=sen=>new Intl.NumberFormat('ms-MY',{style:'currency',currency:'MYR'}).format(sen/100);
const form=document.querySelector('#checkout-form'),errorBox=document.querySelector('#checkout-error'),payButton=document.querySelector('#pay-button');
let store,cart=[],busy=false,requestKey=null;
const element=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
function persist(){try{localStorage.setItem(cartKey,JSON.stringify(cart));}catch{}requestKey=null;}
function notice(text){const box=document.querySelector('#store-notice');box.replaceChildren(element('p',text));}
function updateButton(){const eligible=form.elements.state.value==='Melaka';const validQty=[...document.querySelectorAll('.cart-item input')].every(input=>input.validity.valid);payButton.disabled=busy||!store?.ready||!cart.length||!eligible||!validQty;payButton.textContent=busy?'Menyediakan pembayaran…':!eligible?'Hubungi kami untuk sebut harga':!store?.ready?'Pembayaran belum dibuka':'Teruskan ke pembayaran';}
function updateTotals(){
  const total=cart.reduce((sum,item)=>sum+(store.products.find(p=>p.code===item.code)?.price||0)*item.quantity,0);
  document.querySelector('#subtotal').textContent=format(total);document.querySelector('#total').textContent=format(total);
  document.querySelector('#checkout-whatsapp').href='https://wa.me/601162997250?text='+encodeURIComponent(`Salam Closette, saya berminat dengan ${cart.map(i=>`${i.code} × ${i.quantity}`).join(', ')}. Boleh bantu saya dengan tempahan?`);const noticeLink=document.querySelector('#store-notice a');if(noticeLink)noticeLink.href=document.querySelector('#checkout-whatsapp').href;updateButton();
}
function renderCart(){
  const empty=!cart.length;document.querySelector('#empty-cart').hidden=!empty;document.querySelector('#checkout-content').hidden=empty;
  const container=document.querySelector('#cart-items');container.replaceChildren();let total=0;
  for(const item of cart){const product=store.products.find(p=>p.code===item.code);if(!product)continue;total+=product.price*item.quantity;
    const row=element('article',undefined,'cart-item'),image=element('img');image.src=`./${product.code.toLowerCase()}.webp`;image.alt=product.name;image.width=65;image.height=110;
    const detail=element('div');detail.append(element('h3',product.name),element('p',`${product.code} · ${product.size}`),element('p',format(product.price)));
    const controls=element('div',undefined,'cart-item-controls'),label=element('label','Kuantiti '),qty=element('input');qty.type='number';qty.min='1';qty.max='10';qty.value=item.quantity;qty.setAttribute('aria-label',`Kuantiti ${product.code}`);
    qty.addEventListener('input',()=>{const value=Number(qty.value);if(!Number.isInteger(value)||value<1||value>10){qty.setCustomValidity('Kuantiti mesti antara 1 hingga 10.');updateButton();return;}qty.setCustomValidity('');item.quantity=value;persist();updateTotals();});label.append(qty);
    const remove=element('button','Buang');remove.type='button';remove.setAttribute('aria-label',`Buang ${product.code}`);remove.addEventListener('click',()=>{cart=cart.filter(i=>i.code!==item.code);persist();renderCart();});controls.append(label,remove);detail.append(controls);row.append(image,detail);container.append(row);
  }
  updateTotals();
}
function validateField(field){if(!field.name||['consent','confirmMeasurements'].includes(field.name))return;const box=document.getElementById(field.name+'-error');if(!box)return;let message='';if(field.name==='state'&&field.value!=='Melaka')message='Pembelian terus meliputi Melaka. Hubungi kami untuk lokasi lain.';else if(!field.validity.valid)message=field.name==='postcode'?'Sila masukkan poskod Melaka yang sah.':field.name==='email'?'Sila masukkan alamat e-mel yang sah.':'Sila lengkapkan maklumat ini dengan betul.';box.textContent=message;field.setAttribute('aria-invalid',String(!!message));field.setAttribute('aria-describedby',`${field.name==='postcode'?'postcode-help ':''}${field.name}-error`);}
form.addEventListener('focusout',event=>validateField(event.target));form.addEventListener('input',()=>{requestKey=null;});form.elements.state.addEventListener('change',()=>{validateField(form.elements.state);updateButton();});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!store?.ready)return;errorBox.textContent='';
  if(!form.reportValidity())return;if(form.elements.state.value!=='Melaka')return;
  const fields=new FormData(form),customer=Object.fromEntries(['name','email','phone','address','postcode','city','state','access'].map(k=>[k,String(fields.get(k)||'').trim()]));
  busy=true;updateButton();requestKey ||= crypto.randomUUID();
  try{
    const response=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json','idempotency-key':requestKey},body:JSON.stringify({items:cart.map(i=>({code:i.code,quantity:i.quantity})),customer,confirmMeasurements:fields.get('confirmMeasurements')==='on',consent:fields.get('consent')==='on'})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Checkout tidak dapat diproses.');
    const target=new URL(data.paymentUrl);if(target.protocol!=='https:'||!['www.billplz.com','www.billplz-sandbox.com'].includes(target.hostname))throw new Error('Pautan pembayaran tidak sah.');
    try{sessionStorage.setItem('closette-order-'+data.id,data.token);}catch{}
    location.assign(target.href);
  }catch(error){errorBox.textContent=error.message||'Sambungan terganggu. Sila cuba semula.';errorBox.focus();busy=false;updateButton();}
});
(async()=>{try{
  const response=await fetch('/api/store');if(!response.ok)throw new Error();store=await response.json();
  try{const saved=JSON.parse(localStorage.getItem(cartKey)||'[]');cart=Array.isArray(saved)?saved:[];}catch{cart=[];}
  const seen=new Set();cart=cart.filter(i=>i&&store.products.some(p=>p.code===i.code&&p.purchasable)&&Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=10&&!seen.has(i.code)&&(seen.add(i.code)||true));
  const requested=new URLSearchParams(location.search).get('product');if(store.products.some(p=>p.code===requested&&p.purchasable)&&!cart.some(i=>i.code===requested))cart.push({code:requested,quantity:1});
  // Keep only product identifiers locally, never customer contact/address details.
  persist();history.replaceState(null,'',location.pathname);renderCart();
  const message=store.ready?(store.sandbox?'Mod ujian pembayaran. Tiada pesanan sebenar akan diproses.':'Pembayaran penuh melalui Billplz. Penghantaran dan pemasangan seluruh Melaka termasuk dalam harga.'):store.message;
  notice(message);if(!store.ready){const a=element('a',' Tempah melalui WhatsApp ↗');a.href=document.querySelector('#checkout-whatsapp').href;a.target='_blank';a.rel='noopener noreferrer';document.querySelector('#store-notice').append(a);}
}catch{notice('Checkout sedang disediakan. Hubungi kami di WhatsApp 011-6299 7250 untuk membuat tempahan.');document.querySelector('#empty-cart').hidden=false;}})();
