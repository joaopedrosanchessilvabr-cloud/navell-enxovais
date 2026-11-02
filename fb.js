/* Pixel da Meta — Navell Enxovais */
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','2034810030536101');
fbq('track','PageView');
/* atalho seguro: nunca quebra a página se o pixel for bloqueado */
window.navellTrack=function(name,params,eventId){
  try{if(eventId)fbq('track',name,params||{},{eventID:eventId});else fbq('track',name,params||{})}catch(e){}
};

/* Acompanhamento do cliente (planilha): carrinho e dados do checkout */
window.navellVid=function(){
  try{var v=localStorage.getItem("navell_vid");if(!v){v="v"+Math.random().toString(36).slice(2,12)+Date.now().toString(36);localStorage.setItem("navell_vid",v)}return v}
  catch(e){return"v"+Math.random().toString(36).slice(2,14)}
};
(function(){
  var timer=null,pending=null;
  function cart(){try{return JSON.parse(localStorage.getItem("navell_cart")||"[]").map(function(i){return{k:i.k,color:i.color,s:i.s,qty:i.qty}})}catch(e){return[]}}
  function send(body){
    try{return fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),keepalive:true}).catch(function(){})}catch(e){return Promise.resolve()}
  }
  function flush(){if(pending){clearTimeout(timer);var b=pending;pending=null;return send(b).then(function(){try{localStorage.setItem("navell_vc",b.vid)}catch(e){}})}return Promise.resolve()}
  /* se o cliente sair da página antes do envio, manda na hora */
  window.addEventListener("pagehide",flush);
  document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")flush()});
  window.navellLead=function(etapa,extra){
    try{
      var body={etapa:etapa,vid:navellVid(),items:cart()};
      if(extra)for(var k in extra)body[k]=extra[k];
      if(etapa==="carrinho"){pending=body;clearTimeout(timer);timer=setTimeout(flush,300)}
      else if(body.items.length){
        var had=false;try{had=localStorage.getItem("navell_vc")===body.vid}catch(e){}
        /* garante que a linha do carrinho (com os itens) exista antes dos dados */
        if(!had)send({etapa:"carrinho",vid:body.vid,items:body.items}).then(function(){try{localStorage.setItem("navell_vc",body.vid)}catch(e){};return send(body)});
        else flush().then(function(){return send(body)});
      }
    }catch(e){}
  };
})();
