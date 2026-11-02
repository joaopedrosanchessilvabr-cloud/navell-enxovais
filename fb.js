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
  var timer=null;
  function cart(){try{return JSON.parse(localStorage.getItem("navell_cart")||"[]").map(function(i){return{k:i.k,color:i.color,s:i.s,qty:i.qty}})}catch(e){return[]}}
  function send(body){
    try{fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),keepalive:true}).catch(function(){})}catch(e){}
  }
  window.navellLead=function(etapa,extra){
    try{
      var body={etapa:etapa,vid:navellVid(),items:cart()};
      if(extra)for(var k in extra)body[k]=extra[k];
      if(etapa==="carrinho"){clearTimeout(timer);timer=setTimeout(function(){send(body)},1200)}
      else if(body.items.length)send(body);
    }catch(e){}
  };
})();
