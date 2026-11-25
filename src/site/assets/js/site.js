/* GMBF Ventures: minimal progressive enhancement. The site works without JavaScript. */
(function(){
  var d=document; d.documentElement.classList.remove('no-js'); d.documentElement.classList.add('js');
  // Mobile menu
  var btn=d.querySelector('.menu-btn'), nav=d.getElementById('site-nav');
  if(btn&&nav){
    btn.addEventListener('click',function(){var o=btn.getAttribute('aria-expanded')==='true';btn.setAttribute('aria-expanded',String(!o));nav.classList.toggle('open',!o);btn.querySelector('.sr-only').textContent=o?'Open menu':'Close menu';});
    d.addEventListener('keydown',function(e){if(e.key==='Escape'&&nav.classList.contains('open')){btn.click();btn.focus();}});
  }
  // Fade-in on scroll (skipped when reduced motion is preferred)
  var els=d.querySelectorAll('.reveal');
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in');});}
  else{var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target);}});},{rootMargin:'0px 0px -8% 0px'});els.forEach(function(e){io.observe(e);});}
  // Filter chips (case studies, insights)
  d.querySelectorAll('[data-filter-group]').forEach(function(g){
    var list=d.getElementById(g.getAttribute('data-filter-group')), empty=list&&list.parentNode.querySelector('.empty');
    g.querySelectorAll('.chip').forEach(function(c){c.addEventListener('click',function(){
      g.querySelectorAll('.chip').forEach(function(o){o.setAttribute('aria-pressed','false');}); c.setAttribute('aria-pressed','true');
      var f=c.getAttribute('data-filter'), shown=0;
      list.querySelectorAll('[data-cat]').forEach(function(it){var ok=f==='all'||it.getAttribute('data-cat').split(' ').indexOf(f)>-1; it.hidden=!ok; if(ok)shown++;});
      if(empty) empty.classList.toggle('show',shown===0);
      var live=g.querySelector('.sr-only[aria-live]'); if(live) live.textContent=shown+' item'+(shown===1?'':'s')+' shown';
    });});
  });
  // Table of contents: highlight the current section
  var toc=d.querySelector('.toc');
  if(toc&&'IntersectionObserver' in window){
    var links={}; toc.querySelectorAll('a').forEach(function(a){links[a.getAttribute('href').slice(1)]=a;});
    var o2=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){Object.keys(links).forEach(function(k){links[k].classList.remove('active');}); var a=links[x.target.id]; if(a)a.classList.add('active');}});},{rootMargin:'-20% 0px -70% 0px'});
    Object.keys(links).forEach(function(id){var h=d.getElementById(id); if(h)o2.observe(h);});
  }
  // Enquiry forms.
  // Primary route: POST JSON to the serverless endpoint in data-endpoint (/api/enquiry).
  // Without JavaScript the form posts normally to /api/enquiry, which redirects to enquiry-sent.html or enquiry-error.html.
  // A pre-filled mailto link is revealed only if sending fails.
  var EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function check(inp){
    var v=(inp.value||'').trim(), bad=false;
    if(inp.type==='checkbox') bad=inp.required&&!inp.checked;
    else if(inp.required&&!v) bad=true;
    else if(inp.type==='email'&&v&&!EMAIL.test(v)) bad=true;
    else if(inp.minLength>0&&v&&v.length<inp.minLength) bad=true;
    var wrap=inp.closest('.field'); if(wrap) wrap.classList.toggle('invalid',bad);
    inp.setAttribute('aria-invalid',bad?'true':'false'); return !bad;
  }
  d.querySelectorAll('form.enquiry').forEach(function(f){
    f.noValidate=true;
    var requestId;
    f.addEventListener('input',function(){ requestId=undefined; });
    f.addEventListener('change',function(){ requestId=undefined; });
    var btn=f.querySelector('button[type=submit]'), label=btn.querySelector('.btn-label'), st=f.querySelector('.form-status'), sum=f.querySelector('.err-summary'), fb=f.querySelector('.fallback');
    f.querySelectorAll('input,select,textarea').forEach(function(inp){ if(inp.name==='website'||inp.type==='hidden')return;
      inp.addEventListener('blur',function(){ if(inp.getAttribute('aria-invalid')!==null||inp.value) check(inp); });
      inp.addEventListener('input',function(){ if(inp.getAttribute('aria-invalid')==='true') check(inp); });
      inp.addEventListener('change',function(){ if(inp.getAttribute('aria-invalid')==='true') check(inp); });
    });
    function setState(state,msg){ f.setAttribute('data-state',state); st.className='form-status show '+state; st.textContent=msg; }
    function mailtoHref(){ var v=function(n){return f.elements[n]?f.elements[n].value.trim():'';};
      return 'mailto:hello@gmbfventures.co.uk?subject='+encodeURIComponent(f.getAttribute('data-subject')+': '+(v('organisation')||v('name')))+'&body='+encodeURIComponent('Name: '+v('name')+'\nOrganisation: '+v('organisation')+'\nEmail: '+v('email')+'\nEnquiry type: '+v('type')+'\n\n'+v('message')); }
    f.addEventListener('submit',function(e){
      e.preventDefault(); if(f.getAttribute('data-state')==='submitting') return;
      var bad=[]; f.querySelectorAll('[required]').forEach(function(inp){ if(!check(inp)) bad.push(inp); });
      if(bad.length){ showErrors(bad); return; }
      sum.hidden=true; sum.replaceChildren();
      var data={}; new FormData(f).forEach(function(val,key){ data[key]=val; });
      f.setAttribute('data-state','submitting'); f.setAttribute('aria-busy','true'); btn.disabled=true; label.textContent='Sending…'; setState('submitting','Sending your enquiry…');
      var headers={'Content-Type':'application/json','Accept':'application/json'};
      if(window.crypto && window.crypto.randomUUID){
        requestId=requestId || window.crypto.randomUUID();
        headers['Idempotency-Key']=requestId;
      }
      fetch(f.getAttribute('data-endpoint'),{method:'POST',headers:headers,body:JSON.stringify(data)})
      .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){ return {ok:r.ok&&j.ok,status:r.status,body:j}; }); })
      .then(function(res){
        finish();
        if(res.ok){ f.reset(); requestId=undefined; fb.hidden=true; setState('success','Thank you. Your enquiry has been submitted. Gavin will reply to the email address you gave.'); st.focus(); return; }
        var fields=Object.keys(res.body.errors || {}).map(function(key){ return f.elements.namedItem(key); }).filter(function(input){ return input && input.id; });
        fields.forEach(function(input){ input.closest('.field').classList.add('invalid'); input.setAttribute('aria-invalid','true'); });
        var msg=res.status===429?'Too many attempts from your connection. Please wait a few minutes before retrying.':res.status===413?'Your enquiry is too large. Please shorten the message.':fields.length?'Check the highlighted fields and try again.':'Your enquiry could not be confirmed just now.';
        fail(msg);
        if(fields.length) showErrors(fields,res.body.errors);
      }).catch(function(){ finish(); fail('Your enquiry could not be confirmed just now.'); });
    });
    function finish(){ f.removeAttribute('aria-busy'); btn.disabled=false; label.textContent='Send enquiry '; }
    function showErrors(fields, messages){
      var heading=d.createElement('b'), list=d.createElement('ul');
      heading.textContent='Check the following fields';
      fields.forEach(function(input){
        var item=d.createElement('li'), link=d.createElement('a'), error=d.getElementById(input.id+'-err');
        link.href='#'+input.id;
        link.textContent=messages && messages[input.name] || (error ? error.textContent : 'Check this field');
        link.addEventListener('click',function(event){ event.preventDefault(); input.focus(); });
        item.appendChild(link); list.appendChild(item);
      });
      sum.replaceChildren(heading,list); sum.hidden=false; sum.focus();
    }
    function fail(msg){ f.setAttribute('data-state','error'); fb.hidden=false; fb.querySelector('[data-mailto]').href=mailtoHref(); setState('error',msg+' You can try again, or use the email link below.'); st.focus(); }
  });
})();
