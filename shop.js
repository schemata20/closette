'use strict';
const cartKey='closette-cart-v1';
function readCart(){try{const data=JSON.parse(localStorage.getItem(cartKey)||'[]');return Array.isArray(data)?data.filter(i=>products.some(p=>p.code===i.code&&p.code!=='DR2')&&Number.isInteger(i.quantity)&&i.quantity>0&&i.quantity<=10):[];}catch{return [];}}
function updateCartCount(){const el=document.querySelector('#cart-count');if(el)el.textContent=readCart().reduce((n,i)=>n+i.quantity,0);}
function buyLink(code){return code==='DR2'?`<a class="button secondary product-buy" href="${waURL('Salam Closette, saya ingin sebut harga almari penjuru DR2.')}" target="_blank" rel="noopener noreferrer">Minta sebut harga</a>`:`<a class="button primary product-buy" href="./checkout.html?product=${code}">Beli sekarang <span aria-hidden="true">↗</span></a>`;}
function enhanceProducts(){grid.querySelectorAll('.product-card').forEach(card=>{if(card.querySelector('.product-buy'))return;card.insertAdjacentHTML('beforeend',buyLink(card.querySelector('[data-product]').dataset.product));});}
new MutationObserver(enhanceProducts).observe(grid,{childList:true});enhanceProducts();
const buyNow=document.querySelector('#dialog-buy');
grid.addEventListener('click',event=>{const button=event.target.closest('[data-product]');if(!button)return;const code=button.dataset.product;buyNow.href=code==='DR2'?waURL('Salam Closette, saya ingin sebut harga almari penjuru DR2.'):`./checkout.html?product=${code}`;buyNow.textContent=code==='DR2'?'Minta sebut harga':'Beli sekarang';});
updateCartCount();window.addEventListener('storage',updateCartCount);
