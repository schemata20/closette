'use strict';
const products = [
  {code:'A01',category:'wide',name:'Gantungan dua tingkat',price:1500,size:'900 × 2400 mm',description:'Dua tingkat gantungan untuk menyusun kemeja, baju dan pakaian harian anda.'},
  {code:'A02',category:'wide',name:'Gantungan & rak',price:1500,size:'900 × 2400 mm',description:'Ruang menggantung pakaian harian bersama empat rak untuk pakaian berlipat dan barangan peribadi.'},
  {code:'A03',category:'wide',name:'Gantungan panjang & laci',price:1700,size:'900 × 2400 mm',description:'Ruang gantungan penuh untuk pakaian panjang, dengan empat laci untuk aksesori dan barangan kecil.'},
  {code:'A04',category:'wide',name:'Rak berpetak',price:1700,size:'900 × 2400 mm',description:'Tujuh belas petak untuk menyusun pakaian berlipat, beg, kasut dan barangan peribadi.'},
  {code:'A05',category:'wide',name:'Gantungan & laci',price:1700,size:'900 × 2400 mm',description:'Ruang gantungan untuk pakaian harian, dilengkapi laci untuk pakaian berlipat dan aksesori.'},
  {code:'A06',category:'wide',name:'Gantungan panjang & enam rak',price:1500,size:'900 × 2400 mm',description:'Ruang untuk gaun serta pakaian panjang, dengan enam rak untuk simpanan tambahan.'},
  {code:'A07',category:'wide',name:'Gantungan panjang & rak bawah',price:1500,size:'900 × 2400 mm',description:'Ruang menggantung pakaian panjang dengan rak bawah untuk kasut, beg atau simpanan tambahan.'},
  {code:'C01',category:'slim',name:'Gantungan dua tingkat',price:1100,size:'450 × 2400 mm',description:'Dua tingkat gantungan dalam modul yang lebih sempit untuk memanfaatkan ruang menegak.'},
  {code:'C02',category:'slim',name:'Gantungan & laci',price:1300,size:'450 × 2400 mm',description:'Ruang gantungan dan laci untuk menyusun pakaian, aksesori serta keperluan harian.'},
  {code:'C03',category:'slim',name:'Rak berpetak',price:1300,size:'450 × 2400 mm',description:'Petak simpanan terbuka untuk pakaian berlipat, beg, kasut dan barangan peribadi.'},
  {code:'C04',category:'slim',name:'Gantungan panjang & rak',price:1100,size:'450 × 2400 mm',description:'Gantungan untuk pakaian panjang dengan ruang rak tambahan untuk barangan berlipat.'},
  {code:'C05',category:'slim',name:'Gantungan & petak simpanan',price:1300,size:'450 × 2400 mm',description:'Ruang gantungan pakaian harian dengan petak simpanan untuk pakaian berlipat dan barangan peribadi.'},
  {code:'C06',category:'slim',name:'Gantungan & rak tambahan',price:1100,size:'450 × 2400 mm',description:'Ruang gantungan untuk pakaian harian bersama rak tambahan untuk pakaian berlipat dan aksesori.'},
  {code:'DT1',category:'extra',name:'Meja solek',price:2300,size:'900 × 2400 mm',description:'Sudut bersiap dengan cermin dan ruang simpanan praktikal untuk keperluan peribadi setiap hari.'},
  {code:'DR2',category:'extra',name:'Almari penjuru',price:2300,size:'Hubungi kami untuk ukuran',description:'Modul almari penjuru yang membantu memanfaatkan sudut ruang sebagai tempat simpanan.'}
];
const money = amount => 'RM' + amount.toLocaleString('ms-MY');
const waURL = message => 'https://wa.me/601162997250?text=' + encodeURIComponent(message);
document.querySelectorAll('.wa-link').forEach(link => { link.href=waURL(link.dataset.message || 'Salam Closette, saya berminat dengan almari modular. Boleh berikan maklumat lanjut?'); });
const toggle=document.querySelector('.menu-toggle');
const nav=document.querySelector('#main-nav');
function closeMenu(){toggle.setAttribute('aria-expanded','false');nav.classList.remove('open');}
toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);});
nav.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
document.addEventListener('click',event=>{if(!event.target.closest('.nav-wrap'))closeMenu();});
const grid=document.querySelector('#product-grid');
const count=document.querySelector('#product-count');
const more=document.querySelector('#show-more');
let activeFilter='all';
let expanded=false;
function renderProducts(){
  const matches=products.filter(product=>activeFilter==='all'||product.category===activeFilter);
  const visible=expanded?matches:matches.slice(0,6);
  grid.innerHTML=visible.map(product=>`<article class="product-card"><button type="button" class="product-photo" data-product="${product.code}" aria-label="Lihat butiran ${product.code}, ${product.name}"><span class="product-code">${product.code}</span><img src="./${product.code.toLowerCase()}.webp" width="516" height="1024" alt="Modul Closette ${product.code}, ${product.name.toLowerCase()}" loading="lazy"><span class="product-detail-label">Lihat butiran <svg width="15" height="15" aria-hidden="true"><use href="#icon-arrow"/></svg></span></button><div class="product-heading"><h3>${product.name}</h3><span class="product-price">${money(product.price)}</span></div><p class="product-size">${product.size}${product.category!=='extra'?' · Lebar × tinggi':''}</p></article>`).join('');
  count.textContent=`${visible.length} daripada ${matches.length} modul`;
  more.parentElement.hidden=visible.length>=matches.length;
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
  activeFilter=button.dataset.filter;expanded=false;
  document.querySelectorAll('[data-filter]').forEach(item=>{const selected=item===button;item.classList.toggle('active',selected);item.setAttribute('aria-pressed',String(selected));});
  renderProducts();
}));
more.addEventListener('click',()=>{expanded=true;renderProducts();const newlyVisible=grid.querySelectorAll('.product-photo')[6];if(newlyVisible)newlyVisible.focus({preventScroll:true});});
const dialog=document.querySelector('#product-dialog');
let lastProductButton;
grid.addEventListener('click',event=>{
  const button=event.target.closest('[data-product]');if(!button)return;
  const product=products.find(item=>item.code===button.dataset.product);if(!product)return;
  lastProductButton=button;
  const image=document.querySelector('#dialog-image');image.src=`./${product.code.toLowerCase()}.webp`;image.alt=`Modul Closette ${product.code}, ${product.name.toLowerCase()}`;
  document.querySelector('#dialog-code').textContent='Closette '+product.code;
  document.querySelector('#dialog-title').textContent=product.name;
  document.querySelector('#dialog-description').textContent=product.description;
  document.querySelector('#dialog-size').textContent=product.category==='extra'?product.size:'Lebar × tinggi: '+product.size;
  document.querySelector('#dialog-price').textContent=money(product.price);
  document.querySelector('#dialog-whatsapp').href=waURL(`Salam Closette, saya berminat dengan modul ${product.code} (${product.name}) pada harga ${money(product.price)}. Boleh bantu saya dengan tempahan?`);
  dialog.showModal();document.body.classList.add('dialog-open');dialog.scrollTop=0;
});
document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{document.body.classList.remove('dialog-open');lastProductButton?.focus({preventScroll:true});});
document.querySelector('#year').textContent=new Date().getFullYear();
renderProducts();
