(()=>{
  'use strict';
  document.documentElement.classList.add('js');
  const menu=document.querySelector('.menu-toggle');
  const nav=document.getElementById('navigation');
  const closeMenu=()=>{menu.setAttribute('aria-expanded','false');nav.classList.remove('open');};
  menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);});
  nav.addEventListener('click',e=>{if(e.target.closest('a'))closeMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}});
  const preview=!['gwapgang.com','www.gwapgang.com'].includes(location.hostname);
  document.getElementById('preview-note').hidden=!preview;
  const form=document.getElementById('live-capture-form');
  const email=document.getElementById('live-capture-email');
  const status=document.getElementById('live-capture-status');
  const button=document.getElementById('live-capture-submit');
  const report=(message,type='')=>{status.textContent=message;status.className=type;};
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(button.disabled)return;
    if(!email.value.trim()||!email.checkValidity()){email.setAttribute('aria-invalid','true');report('Enter a valid email address to join.','error');email.focus();return;}
    email.removeAttribute('aria-invalid');
    if(preview){report('Preview verified. No signup was submitted and no email was sent.','success');return;}
    button.disabled=true;button.textContent='Connecting…';report('Submitting your signup…');
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const r=await fetch('https://gwap-backend.onrender.com/newsletter/subscribe',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({email:email.value.trim().toLowerCase()}),signal:controller.signal});
      const data=await r.json();if(!r.ok||!data.ok)throw new Error('Signup failed');
      report(data.created?'You’re in. Check your inbox.':'You’re already in. Welcome back.','success');email.disabled=true;button.textContent='You’re in';
      if(typeof window.gtag==='function')window.gtag('event','sign_up',{method:'homepage_newsletter'});
    }catch{report('We couldn’t confirm your signup. Please try again.','error');button.disabled=false;button.textContent='Join the Gang ↗';}
    finally{clearTimeout(timeout);}
  });
  document.querySelectorAll('#stories a').forEach(a=>a.addEventListener('click',()=>{if(!preview&&typeof window.gtag==='function')window.gtag('event','homepage_story_click',{link_url:a.getAttribute('href')});}));
  document.querySelector('video').addEventListener('play',()=>{if(!preview&&typeof window.gtag==='function')window.gtag('event','homepage_video_play',{video_title:'Gwap Gang brand film'});},{once:true});
})();
