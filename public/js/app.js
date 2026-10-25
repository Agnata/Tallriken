import { calcPoints, actPoints, iso, today, addDays, mondayOf, isoWeek, energyBudget, sunTimes, parseUnit, blank, normalize, looksLikeDiary, trendLine, niceTicks, timeTicks, byWeek, startWeight } from "./logic.js";

(async function(){
"use strict";
const $ = s => document.querySelector(s);
const MEALS = ["Frukost","Lunch","Middag","Mellanmål"];
const KEY = "tallriken-v1";

const CATS = ["Mejeri","Ost","Kött & fisk","Vegetariskt","Bröd & flingor","Pasta, ris & potatis","Frukt & grönt","Fett & såser","Fika & godis","Dryck","Rätter"];
const FOODS = [
  // Mejeri
  ["Yoghurt naturell 0,5 %","2 dl",3,0],["Yoghurt naturell 3 %","2 dl",5,0],["Grekisk yoghurt 2 %","2 dl",4,0],["Turkisk yoghurt 10 %","2 dl",11,0],
  ["Yoghurt smaksatt, lätt","2 dl",4,0],["Yoghurt smaksatt 2 %","2 dl",8,0],["Filmjölk 0,5 %","2 dl",3,0],["Filmjölk 3 %","2 dl",5,0],
  ["Kvarg naturell","2 dl",2,0],["Kvarg smaksatt","2 dl",4,0],["Skyr naturell","2 dl",3,0],["Keso 1,5 %","1 dl",1,0],["Keso 4 %","1 dl",3,0],
  ["Minimjölk 0,1 %","2 dl",3,0],["Lättmjölk 0,5 %","2 dl",3,0],["Mellanmjölk 1,5 %","2 dl",4,0],["Standardmjölk 3 %","2 dl",5,0],["Havredryck","2 dl",4,0],
  ["Matlagningsgrädde 15 %","1 dl",8,0],["Vispgrädde 40 %","1 dl",18,0],["Crème fraiche 34 %","1 msk",2,0],["Crème fraiche lätt 15 %","1 msk",1,0],["Gräddfil 12 %","1 msk",1,0],
  // Ost
  ["Ost 10 %","2 skivor (20 g)",1,1],["Ost 17 %","2 skivor (20 g)",2,1],["Hushållsost 26 %","2 skivor (20 g)",3,1],["Ost 28–31 % (t.ex. präst, grevé)","2 skivor (20 g)",3,1],
  ["Fetaost","30 g",3,1],["Halloumi","50 g",6,1],["Mozzarella","50 g",5,1],["Brie / camembert","30 g",4,1],["Parmesan, riven","1 msk",1,1],
  ["Färskost","1 msk",2,1],["Färskost lätt","1 msk",1,1],
  // Kött & fisk
  ["Kycklingfilé","150 g",3,2],["Kycklingfärs","125 g",3,2],["Fläskfilé","150 g",3,2],["Köttfärs 10 %","125 g",6,2],["Nötfärs 20 %","125 g",10,2],["Köttbullar","10 st",11,2],
  ["Falukorv","100 g",8,2],["Prinskorv","5 st",7,2],["Bacon","2 skivor",3,2],["Skinka / kalkonpålägg","2 skivor",0,2],["Leverpastej","1 msk",2,2],
  ["Torsk","150 g",2,2],["Lax","125 g",6,2],["Räkor","100 g",1,2],["Tonfisk i vatten","1 burk",1,2],["Inlagd sill","50 g",4,2],["Fiskpinnar","4 st",5,2],["Kaviar (tub)","1 msk",2,2],
  // Vegetariskt
  ["Ägg","1 st",2,3],["Bönor / linser","1 dl kokta",2,3],["Kikärtor","1 dl",2,3],["Tofu","100 g",3,3],["Hummus","2 msk",3,3],["Sojafärs, tillagad","125 g",3,3],
  // Bröd & flingor
  ["Knäckebröd","1 skiva",1,4],["Fullkornsbröd","1 skiva",2,4],["Vitt bröd","1 skiva",2,4],["Grov limpa (sötad)","1 skiva",4,4],["Tortillabröd","1 st",5,4],
  ["Havregrynsgröt","1 portion",4,4],["Müsli osötad","1 dl",4,4],["Müsli sötad","1 dl",7,4],["Granola","1 dl",8,4],["Cornflakes","2 dl",3,4],
  // Pasta, ris & potatis
  ["Pasta kokt","2 dl",5,5],["Fullkornspasta kokt","2 dl",4,5],["Ris kokt","2 dl",5,5],["Nudlar kokta","2 dl",5,5],["Bulgur kokt","2 dl",4,5],["Couscous kokt","2 dl",4,5],["Quinoa kokt","2 dl",5,5],
  ["Potatis","2 medelstora",3,5],["Sötpotatis","150 g",4,5],["Potatismos","2 dl",5,5],["Pommes frites","1 portion",11,5],
  // Frukt & grönt
  ["Äpple","1 st",0,6],["Banan","1 st",0,6],["Apelsin","1 st",0,6],["Päron","1 st",0,6],["Bär","1 dl",0,6],["Grönsaker","valfri mängd",0,6],["Sallad","valfri mängd",0,6],["Tomat / gurka","valfri mängd",0,6],
  ["Avokado","½ st",4,6],["Russin / torkad frukt","1 msk",1,6],["Mandlar","20 g",3,6],["Jordnötter","20 g",4,6],
  // Fett & såser
  ["Smör","1 tsk",2,7],["Bregott","1 tsk",2,7],["Lätt margarin 40 %","1 tsk",1,7],["Olivolja / rapsolja","1 msk",4,7],
  ["Majonnäs","1 msk",3,7],["Majonnäs lätt","1 msk",1,7],["Bearnaisesås","2 msk",7,7],["Ketchup","1 msk",1,7],["Sylt","1 msk",2,7],["Honung","1 tsk",1,7],["Socker","1 tsk",1,7],
  // Fika & godis
  ["Kanelbulle","1 st",8,8],["Chokladboll","1 st",8,8],["Kladdkaka","1 bit",14,8],["Semla","1 st",18,8],["Småkaka","1 st",3,8],["Pannkakor","2 st",10,8],
  ["Mörk choklad","25 g",4,8],["Mjölkchoklad","25 g",5,8],["Praliner","2 st",4,8],["Lösgodis","100 g",19,8],["Glass","1 kula",4,8],["Chips","25 g",4,8],["Proteinbar","1 st",6,8],
  // Dryck
  ["Kaffe / te utan mjölk","1 kopp",0,9],["Kaffe med mjölk","1 kopp",1,9],["Lightläsk","33 cl",0,9],["Läsk","33 cl",5,9],["Juice","2 dl",5,9],["Saft, spädd","2 dl",3,9],
  ["Vin","1 glas",4,9],["Öl","33 cl",5,9],["Sprit","4 cl",3,9],
  // Rätter
  ["Ärtsoppa","3 dl",6,10],["Sushi","10 bitar",14,10],["Pizza","1 st",28,10],["Hamburgare","1 st",15,10],["Pyttipanna","1 portion",12,10]
];
let foodCat = -1;

const uid = () => Math.random().toString(36).slice(2,10);
const fmtKg = n => n.toFixed(1).replace(".",",");

let S = blank();
let cur = today();
let mealTarget = "Frukost";
let intensity = 2;

// ---------- Lagring ----------
// Servern är källan. localStorage är en cache per användare, så att en ändring som inte hann
// sparas (till exempel utan nät) finns kvar och skickas nästa gång.
let me=null, version=0, dirty=false, saving=false, saveTimer=null;
const cacheKey = () => KEY+":"+me.id;
function writeCache(){ try{ localStorage.setItem(cacheKey(), JSON.stringify({data:S,version,dirty})); }catch(e){} }
function readCache(){ try{ const r=localStorage.getItem(cacheKey()); return r? JSON.parse(r) : null; }catch(e){ return null; } }
const syncText = t => { $("#sync").textContent=t; };
function save(){
  S.updatedAt = Date.now(); dirty=true; writeCache(); syncText("Sparar…");
  clearTimeout(saveTimer); saveTimer=setTimeout(push, 700);
}
function adopt(remote){
  S=normalize(remote.data); version=remote.version; dirty=false; writeCache(); renderAll(); syncText("Sparat");
}
async function push(){
  saveTimer=null;
  if(saving){ saveTimer=setTimeout(push, 700); return; }
  if(!dirty) return;
  saving=true; dirty=false;
  try{
    const res=await fetch("/api/data",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:S,version})});
    if(res.status===401){ location.href="/login?next=%2Fapp"; return; }
    const body=await res.json().catch(()=>({}));
    if(res.status===409){ adopt(body); toast("Dagboken hade ändrats på en annan enhet. Nu visas den senaste versionen."); return; }
    if(res.status===400||res.status===413){ dirty=true; writeCache(); syncText("Kunde inte spara: "+(body.error||res.status)); return; }
    if(!res.ok) throw new Error(body.error||String(res.status));
    version=body.version; writeCache(); if(!dirty) syncText("Sparat");
  }catch(e){
    dirty=true; writeCache(); syncText("Inte sparat än, försöker igen strax");
    clearTimeout(saveTimer); saveTimer=setTimeout(push, 15000);
  }finally{ saving=false; }
}
// Hämtar dagboken. Osparade ändringar på den här enheten skickas om de bygger på serverns senaste version.
async function load(){
  const r=await fetch("/api/me").then(x=>x.json()).catch(()=>null);
  if(r && !r.user){ location.href="/login?next=%2Fapp"; return false; }
  me=r? r.user : {id:"offline"};
  const cache=readCache();
  if(cache){ S=normalize(cache.data); version=cache.version||0; dirty=!!cache.dirty; }
  let remote;
  try{ const res=await fetch("/api/data"); if(!res.ok) throw new Error(res.status); remote=await res.json(); }
  catch(e){ syncText("Kunde inte nå servern. Det du loggar sparas när anslutningen är tillbaka."); if(dirty) saveTimer=setTimeout(push,15000); return true; }
  if(dirty && version===remote.version){ push(); }
  else if(remote.data){
    const lost=dirty; S=normalize(remote.data); version=remote.version; dirty=false; writeCache(); syncText("Sparat");
    if(lost) setTimeout(()=>toast("En ändring som inte hann sparas ersattes av en nyare version från en annan enhet."),800);
  } else {
    S=blank(); version=0; S.settings.name=(me.name||"").split(" ")[0]; save();
  }
  return true;
}
// Hämta ändringar från andra enheter när appen kommer fram igen.
document.addEventListener("visibilitychange", async ()=>{
  if(document.visibilityState!=="visible" || dirty || saving || !me) return;
  try{ const remote=await fetch("/api/data").then(x=>x.ok? x.json() : null); if(remote && remote.data && remote.version!==version && !dirty) adopt(remote); }catch(e){}
});

// ---------- Beräkningar ----------
const day = d => S.days[d] || {foods:[],acts:[]};
const ensureDay = d => (S.days[d] = S.days[d] || {foods:[],acts:[]});
const eatenOn = d => day(d).foods.reduce((a,f)=>a+f.points,0);
const actOn = d => day(d).acts.reduce((a,x)=>a+x.points,0);
const allowedOn = d => S.settings.daily + actOn(d);
const overOn = d => Math.max(0, eatenOn(d) - allowedOn(d));
function weekLeft(d){
  const m=mondayOf(d); let used=0;
  for(let i=0;i<7;i++){ const x=addDays(m,i); if(x>d) break; used+=overOn(x); }
  return S.settings.weekly - used;
}
const logged = d => day(d).foods.length>0;
function streak(){
  let n=0, d=today();
  if(!logged(d)) d=addDays(d,-1);
  while(logged(d)){ n++; d=addDays(d,-1); }
  return n;
}
const sortedW = () => S.weights.slice().sort((a,b)=>a.date.localeCompare(b.date));
function weekMinutes(){ const m=mondayOf(today()); let t=0; for(let i=0;i<7;i++) day(addDays(m,i)).acts.forEach(a=>t+=a.min); return t; }

// ---------- Kostråd ----------
const CAT_OF = Object.fromEntries(FOODS.map(f=>[f[0],f[3]]));
const FISH = new Set(["Torsk","Lax","Räkor","Tonfisk i vatten","Inlagd sill","Fiskpinnar","Kaviar (tub)"]);
const NOT_DAIRY = /grädde|crème|gräddfil|havredryck/i;
const NOT_FRUIT = new Set(["Mandlar","Jordnötter","Russin / torkad frukt"]);
const isDairy = n => (CAT_OF[n]===0 && !NOT_DAIRY.test(n)) || CAT_OF[n]===1;
const isProtein = n => isDairy(n) || CAT_OF[n]===2 || CAT_OF[n]===3;
function renderGoals(){
  const foods=day(cur).foods;
  const fv=foods.filter(f=>CAT_OF[f.name]===6 && !NOT_FRUIT.has(f.name)).length;
  const dairy=foods.filter(f=>isDairy(f.name)).length;
  const pm=["Frukost","Lunch","Middag"].filter(m=>foods.some(f=>f.meal===m && isProtein(f.name))).length;
  const mon=mondayOf(cur); let fish=0;
  for(let i=0;i<7;i++){ if(day(addDays(mon,i)).foods.some(f=>FISH.has(f.name))) fish++; }
  const rows=[
    ["Frukt, bär och grönt",fv,5,"Portioner idag, gärna mest grönsaker"],
    ["Mejeri och ost",dairy,3,"Portioner idag, för kalcium och starkt skelett"],
    ["Protein vid måltiderna",pm,3,"Frukost, lunch och middag, för att behålla musklerna"],
    ["Fisk",fish,2,"Gånger den här veckan, gärna fet fisk som lax och sill"]
  ];
  const g=$("#goals"); g.innerHTML="";
  rows.forEach(([t,n,goal,sub])=>{
    const d=document.createElement("div"); d.className="goal"+(n>=goal?" done":"");
    d.innerHTML='<div class="gl"><span></span><b></b></div><div class="gs"></div><div class="bar"><i></i></div>';
    d.querySelector(".gl span").textContent=t;
    d.querySelector(".gl b").textContent=(n>=goal?"✓ ":"")+Math.min(n,goal)+" av "+goal;
    d.querySelector(".gs").textContent=sub;
    d.querySelector(".bar i").style.width=Math.min(100,n/goal*100)+"%";
    g.append(d);
  });
}
function calcBudget(){
  const sex=$("#setSex").value, age=parseInt($("#setAge").value), h=parseFloat($("#setHeight").value);
  const kg=parseFloat(String($("#setKg").value).replace(",",".")), pal=parseFloat($("#setPal").value);
  if(!age||!h||!kg){ toast("Fyll i ålder, längd och vikt först"); return; }
  const {keep,target,pts}=energyBudget({sex,age,height:h,kg,pal});
  $("#setDaily").value=pts; lastCalcKg=kg;
  $("#calcOut").textContent="För att hålla vikten behöver du ungefär "+Math.round(keep/10)*10+" kcal. Med ett lugnt underskott blir det cirka "+Math.round(target/10)*10+" kcal om dagen, vilket motsvarar "+pts+" poäng plus 0-poängsmaten. Tryck Spara inställningar för att använda det.";
}

// ---------- Rendering: Idag ----------
function dayName(d){
  if(d===today()) return "Idag";
  if(d===addDays(today(),-1)) return "Igår";
  return new Date(d+"T12:00:00").toLocaleDateString("sv-SE",{weekday:"short",day:"numeric",month:"short"});
}
function renderToday(){
  $("#dayLabel").textContent = dayName(cur);
  $("#nextDay").disabled = cur>=today();
  const eaten=eatenOn(cur), act=actOn(cur), allowed=allowedOn(cur), left=allowed-eaten, wk=weekLeft(cur);
  const C=2*Math.PI*78;
  const foodFrac=Math.min(1, eaten/allowed);
  const extraFrac=Math.min(1-foodFrac, Math.max(0, eaten-allowed)/Math.max(1,S.settings.weekly));
  $("#ringFood").setAttribute("stroke-dasharray", (foodFrac*C)+" "+C);
  const ex=$("#ringExtra");
  if(eaten>allowed){
    // Den del som går ur veckobufferten ritas i hjortron, ovanpå ringen
    const f=Math.min(1,(eaten-allowed)/Math.max(1,allowed));
    ex.setAttribute("stroke-dasharray", (f*C)+" "+C);
  } else ex.setAttribute("stroke-dasharray","0 "+C);
  const big=$("#leftBig");
  if(left>=0){ big.textContent=left; big.classList.remove("over"); $("#leftLabel").textContent = cur===today()?"poäng kvar idag":"poäng kvar"; }
  else { big.textContent=-left; big.classList.add("over"); $("#leftLabel").textContent="från veckobufferten"; }
  $("#sEaten").textContent=eaten; $("#sAct").textContent="+"+act; $("#sWeek").textContent=wk;
  $("#cheer").textContent = cheer(eaten,allowed,left,wk);
  renderGoals();

  const mealsEl=$("#meals"); mealsEl.innerHTML="";
  MEALS.forEach(meal=>{
    const items=day(cur).foods.filter(f=>f.meal===meal);
    const sec=document.createElement("section"); sec.className="block";
    const head=document.createElement("div"); head.className="block-head";
    const h=document.createElement("h3"); h.textContent=meal;
    const p=document.createElement("span"); p.className="pts"; p.textContent=items.length? items.reduce((a,f)=>a+f.points,0)+" p":"";
    head.append(h,p); sec.append(head);
    const ul=document.createElement("ul"); ul.className="items";
    items.forEach(f=>ul.append(itemRow(f.name,amountText(f),f.points,()=>removeFood(f.id),"",()=>openQty({name:f.name,portion:f.portion,base:(f.base!=null?f.base:f.points),qty:f.qty||1},f.id,"day"))));
    sec.append(ul);
    const b=document.createElement("button"); b.className="add"; b.textContent="Lägg till i "+meal.toLowerCase();
    b.onclick=()=>openFood(meal); sec.append(b);
    if(items.length){ const sv=document.createElement("button"); sv.className="linkbtn"; sv.textContent="Spara som vanlig måltid"; sv.onclick=()=>saveMealTemplate(meal); sec.append(sv); }
    mealsEl.append(sec);
  });
  renderBites();
  renderDiary(); renderFocusLine(); renderWater();

  const al=$("#actList"); al.innerHTML="";
  const acts=day(cur).acts;
  if(!acts.length){ const li=document.createElement("li"); li.className="empty"; li.textContent="Varje promenad räknas, även en kort."; al.append(li); }
  acts.forEach(a=>al.append(itemRow(a.name, a.min+" min, "+["","lätt","lagom","svettigt"][a.int], a.points, ()=>removeAct(a.id), "+")));
  $("#actPts").textContent = acts.length? "+"+actOn(cur)+" p":"";
}
function itemRow(name,sub,points,onDel,prefix,onEdit){
  const li=document.createElement("li");
  const n=document.createElement(onEdit?"button":"span"); n.className="name"; n.textContent=name;
  if(onEdit){ n.type="button"; n.onclick=onEdit; }
  if(sub){ const s=document.createElement("span"); s.className="sub"; s.textContent=sub; n.append(s); }
  const p=document.createElement("span"); p.className="p"+(points===0?" zero":""); p.textContent=(prefix||"")+points;
  const d=document.createElement("button"); d.className="del"; d.setAttribute("aria-label","Ta bort "+name); d.textContent="×"; d.onclick=onDel;
  li.append(n,p,d); return li;
}
function cheer(eaten,allowed,left,wk){
  const nm=S.settings.name? S.settings.name+", ":"";
  const st=streak();
  if(cur!==today()) return "Du tittar på "+dayName(cur).toLowerCase()+". Det går bra att fylla i i efterhand.";
  if(eaten===0) return st>0? nm+"du har loggat "+st+" dag"+(st>1?"ar":"")+" i rad. Fortsätt i dag med frukosten." : nm+"börja med det du ätit hittills. Det är loggandet som gör skillnaden, inte perfektionen.";
  if(left<0 && wk>=0) return "Du gick över lite, men veckobufferten tar det. Det är precis vad den finns till för.";
  if(wk<0) return "Veckan blev tyngre än planerat. Inget är förstört: en ny vecka börjar på måndag och varje måltid är ett nytt val.";
  if(left<=3) return "Nästan precis rätt. Snyggt balanserat!";
  if(actOn(cur)>0) return "Rörelsen i dag gav dig "+actOn(cur)+" extrapoäng. Bra jobbat!";
  if(st>=7) return st+" dagar i rad! Det är så vanor byggs.";
  if(plateau()) return "Vågen står still just nu, och det är helt normalt. Under Vikt finns tips, och glöm inte att mäta midjan.";
  const tips=["Fyll halva tallriken med grönsaker, de är 0 poäng och mättar.","Kvarg, skyr och keso ger mycket protein och kalcium för få poäng.","Protein till frukosten håller dig mätt längre och hjälper musklerna.","Styrketräning ett par gånger i veckan skyddar muskler och skelett när du går ner i vikt.","Lax eller sill till middag ger både omega-3 och D-vitamin.","En promenad efter middagen ger både poäng och bättre sömn.","Välj magra, osötade mejeriprodukter, de ger mest näring per poäng."];
  return tips[new Date().getDate()%tips.length];
}

// ---------- Matdialog ----------
function openFood(meal){
  foodMode="day"; mealTarget=meal; $("#foodTitle").textContent="Lägg till i "+meal.toLowerCase();
  $("#toRecipe").style.display="";
  $("#foodSearch").value=""; foodCat=-1; renderChips(); renderFoodList(); $("#foodDlg").showModal();
}
function openFoodForRecipe(){
  foodMode="recipe"; $("#foodTitle").textContent="Lägg till ingrediens"; $("#toRecipe").style.display="none";
  $("#foodSearch").value=""; foodCat=-1; renderChips(); renderFoodList(); $("#foodDlg").showModal();
}
function renderChips(){
  const c=$("#chips"); c.innerHTML="";
  const opts=[[-1,"Alla"]];
  if(foodMode==="day" && (S.meals||[]).length) opts.push([-3,"🍽 Måltider"]);
  if(foodMode==="day" && (S.recipes||[]).length) opts.push([-4,"📖 Recept"]);
  if(S.favs.length) opts.push([-2,"★ Mina"]);
  CATS.forEach((n,i)=>opts.push([i,n]));
  opts.forEach(([i,n])=>{ const b=document.createElement("button"); b.textContent=n; b.setAttribute("aria-pressed", i===foodCat);
    b.onclick=()=>{ foodCat=i; $("#foodSearch").value=""; renderChips(); renderFoodList(); $("#foodList").scrollTop=0; }; c.append(b); });
}
function renderFoodList(){
  const q=$("#foodSearch").value.trim().toLowerCase();
  const list=$("#foodList"); list.innerHTML="";
  const favs=S.favs.map(f=>[f.name,f.portion,f.points,-2]);
  const mealsH=foodMode==="day"? (S.meals||[]).map(m=>[m.name, m.items.map(i=>i.name).join(", "), m.items.reduce((a,i)=>a+i.points,0), -3, m]) : [];
  const recH=foodMode==="day"? (S.recipes||[]).map(r=>[r.name,"1 portion",r.points,-4,r]) : [];
  const mine=[...mealsH,...recH,...favs];
  let hits;
  if(q) hits=[...mine,...FOODS].filter(f=>f[0].toLowerCase().includes(q));
  else if(foodCat<-1) hits=mine.filter(f=>f[3]===foodCat);
  else if(foodCat>=0) hits=FOODS.filter(f=>f[3]===foodCat);
  else hits=[...mine,...FOODS];
  if(q) remoteSearch(q);
  if(!hits.length && !q){ const p=document.createElement("p"); p.className="empty"; p.textContent="Ingen träff. Lägg till den som egen matvara nedan."; list.append(p); return; }
  let lastCat=null; const showHeads=!q && foodCat===-1;
  const HEAD={"-2":"Mina matvaror","-3":"Mina måltider","-4":"Mina recept"}, ICON={"-2":"★ ","-3":"🍽 ","-4":"📖 "};
  hits.forEach(([name,por,pts,cat,obj])=>{
    if(showHeads && cat!==lastCat){ const h=document.createElement("div"); h.className="foodgroup"; h.textContent=cat<0?HEAD[cat]:CATS[cat]; list.append(h); lastCat=cat; }
    const b=document.createElement("button");
    const l=document.createElement("span"); l.textContent=(ICON[cat]||"")+name;
    const s=document.createElement("span"); s.className="por"; s.textContent=por; l.append(s);
    const r=document.createElement("span"); r.className="fp"+(pts===0?" zero":""); r.textContent=pts+" p";
    b.append(l,r);
    b.onclick=()=> cat===-3? addMeal(obj) : openQty({name,portion:por,base:pts,qty:1},null);
    list.append(b);
  });
  if(q) renderRemote(list, hits.length);
}
// Sökning i Livsmedelsverkets livsmedelsdatabas och bland märkesvaror i Open Food Facts, via servern.
// Det man väljer därifrån sparas under ★ Mina så att det finns direkt nästa gång.
let remoteQ="", remoteT=null, remote={q:"",lv:[],off:[],state:""}, pendingFav=null;
function remoteSearch(q){
  if(q.length<2 || q===remoteQ) return;
  remoteQ=q; clearTimeout(remoteT);
  remote={q,lv:[],off:[],state:"loading"};
  remoteT=setTimeout(async()=>{
    const e=encodeURIComponent(q);
    const [lv,off]=await Promise.allSettled([api("/api/foods/search?q="+e), api("/api/foods/brands?q="+e)]);
    if(remoteQ!==q) return;
    remote={q, lv: lv.status==="fulfilled"? lv.value.items : [], off: off.status==="fulfilled"? off.value.items : [],
      state: off.status==="rejected"? "offerr" : "done", offErr: off.status==="rejected"? off.reason.message : "", version: lv.status==="fulfilled"? lv.value.version : null};
    if($("#foodDlg").open && $("#foodSearch").value.trim().toLowerCase()===q) renderFoodList();
  },450);
}
function renderRemote(list, localHits){
  const q=$("#foodSearch").value.trim().toLowerCase();
  const head=t=>{ const h=document.createElement("div"); h.className="foodgroup"; h.textContent=t; list.append(h); };
  const note=t=>{ const p=document.createElement("p"); p.className="empty"; p.textContent=t; list.append(p); };
  if(q.length<2) return;
  if(remote.q!==q || remote.state==="loading"){ if(!localHits) note("Söker i Livsmedelsverket och bland märkesvaror …"); else { head("Fler träffar"); note("Söker …"); } return; }
  const row=(f,src)=>{
    const b=document.createElement("button");
    const l=document.createElement("span"); l.textContent=f.name;
    const s=document.createElement("span"); s.className="por"; s.textContent=f.portion; l.append(s);
    const r=document.createElement("span"); r.className="fp"+(f.points===0?" zero":""); r.textContent=f.points+" p";
    b.append(l,r);
    b.onclick=()=>{ pendingFav={name:f.name,portion:f.portion,points:f.points,src}; openQty({name:f.name,portion:f.portion,base:f.points,qty:1},null); };
    list.append(b);
  };
  if(remote.lv.length){ head("Livsmedelsverket, per 100 g"); remote.lv.forEach(f=>row(f,"lv")); }
  if(remote.off.length){ head("Märkesvaror (Open Food Facts)"); remote.off.forEach(f=>row(f,"off")); }
  else if(remote.state==="offerr"){ head("Märkesvaror"); note("Kunde inte nå Open Food Facts just nu. "+(remote.offErr||"")); }
  if(!localHits && !remote.lv.length && !remote.off.length && remote.state!=="offerr") note("Ingen träff. Lägg till den som egen matvara nedan.");
  if(remote.lv.length||remote.off.length){ const p=document.createElement("p"); p.className="src";
    p.textContent="Källor: Livsmedelsverkets livsmedelsdatabas"+(remote.version? " (version "+remote.version+")" : "")+" och Open Food Facts (ODbL). Kontrollera gärna mot förpackningen."; list.append(p); }
}
// Lägger det valda från Livsmedelsverket eller Open Food Facts under ★ Mina.
function rememberFav(name){
  if(!pendingFav || pendingFav.name!==name) return;
  if(!S.favs.some(f=>f.name===name)) S.favs.unshift({name,portion:pendingFav.portion,points:pendingFav.points,src:pendingFav.src});
  pendingFav=null;
}
// ---------- Mängd ----------
const fmtN=n=>String(Math.round(n*10)/10).replace(".",",");
function amountText(f){
  const q=f.qty||1; if(q===1) return f.portion;
  const u=parseUnit(f.portion); return u? fmtN(u.amt*q)+" "+u.unit : fmtN(q)+" × "+f.portion;
}
let qS=null;
function qStep(){
  const u=qS.u; if(!u) return 0.5;
  if(u.unit==="g") return u.amt>=100?25:10;
  if(u.unit==="cl") return u.amt/2;
  if(u.unit==="st") return u.amt>=4?1:0.5;
  return 0.5;
}
function openQty(item,editId,ctx){
  qS=Object.assign({},item,{editId,ctx:ctx||foodMode,u:parseUnit(item.portion)});
  $("#qName").textContent=item.name;
  $("#qPor").textContent="1 portion = "+item.portion+", "+item.base+" p";
  $("#qUnit").textContent=qS.u? qS.u.unit : (qS.qty===1?"portion":"portioner");
  const qq=$("#qQuick"); qq.innerHTML="";
  [[0.5,"½"],[1,"1"],[1.5,"1½"],[2,"2"],[3,"3"]].forEach(([v,l])=>{ const b=document.createElement("button"); b.type="button"; b.textContent=l; b.dataset.q=v; b.onclick=()=>{ qS.qty=v; renderQty(true); }; qq.append(b); });
  $("#qSave").textContent=editId? "Spara ändring" : "Lägg till";
  $("#qDel").style.display=editId? "" : "none";
  renderQty(true);
  $("#qtyDlg").showModal();
}
function renderQty(setInput){
  if(setInput) $("#qVal").value=fmtN(qS.u? qS.u.amt*qS.qty : qS.qty);
  if(!qS.u) $("#qUnit").textContent=qS.qty===1?"portion":"portioner";
  const p=Math.round(qS.base*qS.qty);
  $("#qPts").textContent="= "+p+" poäng";
  $("#qQuick").querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed", Math.abs(+b.dataset.q-qS.qty)<1e-6));
}
function qNudge(dir){
  const step=qStep(); const curV=qS.u? qS.u.amt*qS.qty : qS.qty;
  const nv=Math.max(step, Math.round((curV+dir*step)/step)*step);
  qS.qty=qS.u? nv/qS.u.amt : nv; renderQty(true);
}
function addFood(name,portion,base,qty){
  rememberFav(name);
  qty=qty||1; const points=Math.round(base*qty);
  const d=ensureDay(cur); const wasEmpty=!logged(cur);
  d.foods.push({id:uid(),name,portion,base,qty,points,meal:mealTarget});
  save(); if($("#qtyDlg").open) $("#qtyDlg").close(); if($("#foodDlg").open) $("#foodDlg").close(); renderAll();
  toast(points===0? name+" är 0 poäng. Härligt!" : name+" tillagt, "+points+" p");
  if(wasEmpty) checkBadges();
}
function removeFood(id){ const d=ensureDay(cur); d.foods=d.foods.filter(f=>f.id!==id); save(); renderAll(); }
function customCalc(){
  const v=id=>parseFloat($(id).value.replace(",","."))||0;
  return calcPoints(v("#cKcal"),v("#cProt"),v("#cSug"),v("#cFat"));
}

// ---------- Aktivitet ----------
function updateActCalc(){
  const m=parseInt($("#aMin").value)||0;
  $("#aCalc").textContent="= +"+actPoints(m,intensity)+" poäng";
}
function removeAct(id){ const d=ensureDay(cur); d.acts=d.acts.filter(a=>a.id!==id); save(); renderAll(); }

// ---------- Vikt ----------
// Viktkurvan. Upp till drygt ett år: varje vägning som en tunn linje och ett 7-dagars snitt som
// tydlig linje. Längre perioder: veckosnitt och ett 30-dagars snitt, så att flera års vägningar
// blir läsbara. Uppehåll i vägningarna visas som en prickad linje i stället för ett hopp.
// Startdatumet markeras, målet är streckat. Håll fingret eller musen över kurvan för värden.
// Samma kurva kan öppnas stor i en egen ruta.
let wRange=null, bigRange=null, wShown=7;
function wRanges(){
  const r=[["30","1 mån"],["91","3 mån"],["365","1 år"]];
  if(S.settings.startDate) r.push(["start","Start"]);
  return [...r,["alla","Allt"]];
}
const monthShort=d=>new Date(d+"T12:00:00").toLocaleDateString("sv-SE",{month:"short"}).replace(/\.$/,"");
const longDate=d=>new Date(d+"T12:00:00").toLocaleDateString("sv-SE",{day:"numeric",month:"short",year:"numeric"});
function renderWeightChart(all, big=false){
  const box=$(big?"#bigChart":"#wChart"), chips=$(big?"#bigChips":"#wChips"), legend=$(big?"#bigLegend":"#wLegend");
  box.innerHTML=""; chips.innerHTML=""; legend.textContent="";
  $("#wBig").classList.toggle("hidden", all.length<2);
  if(all.length<2){ box.innerHTML='<p class="empty">Kurvan visas efter två vägningar.</p>'; return; }
  const st=S.settings, first=all[0].date, last=all[all.length-1].date;
  const span=(new Date(last)-new Date(first))/864e5;
  let range= big? bigRange : wRange;
  if(!range || (range==="start" && !st.startDate)) range= st.startDate? "start" : span>120? "91" : "alla";
  if(big) bigRange=range; else wRange=range;
  if(span>35) wRanges().forEach(([k,l])=>{ const b=document.createElement("button"); b.type="button"; b.textContent=l; b.setAttribute("aria-pressed",k===range);
    b.onclick=()=>{ if(big) bigRange=k; else wRange=k; renderWeightChart(sortedW(),big); }; chips.append(b); });

  const from= span<=35||range==="alla"? first : range==="start"? st.startDate : addDays(today(),-(+range-1));
  const inRange=all.map((p,i)=>i).filter(i=>all[i].date>=from);
  if(!inRange.length){ box.innerHTML='<p class="empty">Inga vägningar under den perioden.</p>'; return; }
  const raw=inRange.map(i=>all[i]);
  const long=(new Date(last)-new Date(raw[0].date))/864e5>400;
  // Snittet räknas på hela historiken så att det stämmer också i början av perioden.
  const trendAll=trendLine(all, long?30:7), trRaw=inRange.map(i=>trendAll[i]);
  const pts= long? byWeek(raw) : raw, tr= long? byWeek(trRaw,"last") : trRaw;
  const showTrend=pts.length>=5, gapDays= long? 45 : 21;
  if(showTrend) legend.innerHTML='<span><i class="lg-raw"></i>'+(long?"veckosnitt":"vägning")+'</span><span><i class="lg-trend"></i>snitt '+(long?30:7)+' dagar</span>';

  // Ritas i verklig bredd så att texten blir lika stor som resten av sidan. Är fliken dold
  // används sidans bredd minus kortets marginaler.
  const W=Math.max(280, Math.round(box.clientWidth || ($(".wrap").clientWidth-34)));
  // Stor: så hög som får plats under rubrik och knappar i rutan, även i liggande läge.
  const room= big? window.innerHeight*0.94 - (box.getBoundingClientRect().top - $("#chartDlg").getBoundingClientRect().top) - 24 : 0;
  const portrait=window.innerHeight>window.innerWidth;
  if(big) $("#bigHint").classList.toggle("hidden", !portrait);
  const H= big? Math.round(Math.max(150, Math.min(room, W*(portrait?1.15:0.62)))) : Math.round(Math.min(260,Math.max(190,W*0.5)));
  const PL=40,PR=10,PT=14,PB=28, FS=big?13:12;
  const tm=d=>new Date(d+"T12:00:00").getTime();
  const x0=tm(pts[0].date), x1=Math.max(tm(pts[pts.length-1].date), x0+864e5);
  let lo=Math.min(...pts.map(p=>p.kg)), hi=Math.max(...pts.map(p=>p.kg));
  // Målet tas med i skalan bara om det inte trycker ihop kurvan.
  const goalIn= st.goal && st.goal>=lo-Math.max(2,hi-lo) && st.goal<=hi+Math.max(2,hi-lo);
  if(goalIn){ lo=Math.min(lo,st.goal); hi=Math.max(hi,st.goal); }
  const pad=Math.max(0.5,(hi-lo)*0.08); lo-=pad; hi+=pad;
  const X=d=>PL+(W-PL-PR)*((tm(d)-x0)/(x1-x0)), Y=v=>PT+(H-PT-PB)*(1-(v-lo)/(hi-lo));
  const xy=p=>X(p.date).toFixed(1)+","+Y(p.kg).toFixed(1);
  // Hela linjen, och prickade bryggor över uppehållen.
  const paths=list=>{ let line="", gaps="", prev=null;
    list.forEach(p=>{ const gap= prev && (tm(p.date)-tm(prev.date))/864e5>gapDays;
      line+=(prev&&!gap? "L":"M")+xy(p); if(gap) gaps+="M"+xy(prev)+"L"+xy(p); prev=p; });
    return {line,gaps}; };

  let s='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" role="img" aria-label="Viktkurva från '+longDate(raw[0].date)+' till '+longDate(raw[raw.length-1].date)+', senast '+fmtKg(raw[raw.length-1].kg)+' kg">';
  niceTicks(lo,hi,big?6:5).forEach(v=>{ const y=Y(v).toFixed(1);
    s+='<line x1="'+PL+'" x2="'+(W-PR)+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)" stroke-width="1"/>';
    s+='<text x="'+(PL-8)+'" y="'+(+y+4)+'" text-anchor="end" font-size="'+FS+'" fill="var(--muted)">'+fmtN(v)+'</text>'; });
  const tt=timeTicks(pts[0].date,pts[pts.length-1].date,Math.max(3,Math.floor(W/85))), yrs=new Set(pts.map(p=>p.date.slice(0,4))).size>1, short=(x1-x0)/864e5<=45, years=(x1-x0)/864e5>730;
  let firstLab=true;
  tt.forEach(d=>{ const x=X(d); if(x<PL+14||x>W-PR-14) return;
    // Årtal på första etiketten och vid varje årsskifte när kurvan spänner över flera år.
    const lab= short? shortDate(d) : years? d.slice(0,4) : monthShort(d)+(yrs&&(firstLab||d.slice(5,7)==="01")? " ’"+d.slice(2,4) : "");
    firstLab=false;
    s+='<line x1="'+x.toFixed(1)+'" x2="'+x.toFixed(1)+'" y1="'+(H-PB)+'" y2="'+(H-PB+4)+'" stroke="var(--line)"/>';
    s+='<text x="'+x.toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" font-size="'+FS+'" fill="var(--muted)">'+lab+'</text>'; });
  if(st.startDate && tm(st.startDate)>=x0 && tm(st.startDate)<=x1){
    const x=X(st.startDate).toFixed(1);
    s+='<line x1="'+x+'" x2="'+x+'" y1="'+PT+'" y2="'+(H-PB)+'" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 4"/><text x="'+(+x+5)+'" y="'+(PT+10)+'" font-size="'+FS+'" fill="var(--muted)">start</text>';
  }
  if(st.goal){
    if(goalIn) s+='<line x1="'+PL+'" x2="'+(W-PR)+'" y1="'+Y(st.goal).toFixed(1)+'" y2="'+Y(st.goal).toFixed(1)+'" stroke="var(--cloud)" stroke-width="2" stroke-dasharray="6 5"/><text x="'+(W-PR)+'" y="'+(Y(st.goal)-6).toFixed(1)+'" text-anchor="end" font-size="'+FS+'" fill="var(--muted)">mål '+fmtKg(st.goal)+'</text>';
    else s+='<text x="'+(W-PR)+'" y="'+(H-PB-6)+'" text-anchor="end" font-size="'+FS+'" fill="var(--muted)">mål '+fmtKg(st.goal)+' kg ↓</text>';
  }
  const pl=paths(pts), pt=paths(tr);
  const rawOp= showTrend? 0.35 : 1;
  s+='<path d="'+pl.line+'" fill="none" stroke="var(--pine)" stroke-opacity="'+rawOp+'" stroke-width="'+(showTrend?1.5:2)+'" stroke-linejoin="round" stroke-linecap="round" class="ln"/>';
  if(pts.length<=40) pts.forEach(p=>s+='<circle cx="'+X(p.date).toFixed(1)+'" cy="'+Y(p.kg).toFixed(1)+'" r="3.5" fill="var(--surface)" stroke="var(--pine)" stroke-opacity="'+(showTrend?0.6:1)+'" stroke-width="1.5"/>');
  if(showTrend){
    // Linjen dras inte över uppehållen; där syns bara den prickade bryggan.
    s+='<path d="'+pt.line+'" fill="none" stroke="var(--pine)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
  }
  const gapD= showTrend? pt.gaps : pl.gaps;
  if(gapD) s+='<path d="'+gapD+'" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="1 5" stroke-linecap="round"/>';
  s+='<g class="hov" style="display:none"><line y1="'+PT+'" y2="'+(H-PB)+'" stroke="var(--muted)" stroke-width="1"/><circle r="5" fill="var(--pine)" stroke="var(--surface)" stroke-width="2"/></g>';
  s+='<rect x="'+PL+'" y="0" width="'+(W-PL-PR)+'" height="'+H+'" fill="transparent" class="hit"/></svg><div class="ctip" role="status"></div>';
  box.innerHTML=s;

  const svg=box.querySelector("svg"), hov=box.querySelector(".hov"), tip=box.querySelector(".ctip");
  const show=e=>{
    const r=svg.getBoundingClientRect(), vx=(e.clientX-r.left)*W/r.width;
    let bi=0, bd=Infinity; pts.forEach((p,i)=>{ const d=Math.abs(X(p.date)-vx); if(d<bd){ bd=d; bi=i; } });
    const p=pts[bi], cx=X(p.date), cy=Y(p.kg);
    hov.style.display=""; hov.querySelector("line").setAttribute("x1",cx); hov.querySelector("line").setAttribute("x2",cx);
    hov.querySelector("circle").setAttribute("cx",cx); hov.querySelector("circle").setAttribute("cy",cy);
    const when= long? "vecka "+isoWeek(p.from)+" "+p.from.slice(0,4)+" · "+p.n+(p.n>1?" vägningar":" vägning") : longDate(p.date);
    tip.innerHTML='<b>'+fmtKg(p.kg)+' kg</b><span>'+when+(showTrend? ' · snitt '+fmtKg(tr[bi].kg) : '')+'</span>';
    tip.style.display="block";
    const px=cx*r.width/W, w=tip.offsetWidth;
    tip.style.left=Math.max(0,Math.min(r.width-w,px-w/2))+"px"; tip.style.top=Math.max(0,cy*r.height/H-tip.offsetHeight-12)+"px";
  };
  const hide=()=>{ hov.style.display="none"; tip.style.display="none"; };
  const hit=box.querySelector(".hit");
  hit.addEventListener("pointermove",show); hit.addEventListener("pointerdown",show); hit.addEventListener("pointerleave",hide);
}
function openBigChart(){
  bigRange=wRange; $("#chartDlg").showModal(); renderWeightChart(sortedW(),true);
}
function renderWeight(){
  const w=sortedW(); const st=S.settings;
  const sw=startWeight(w,st.startDate), start=sw? sw.kg : null, now=w.length? w[w.length-1].kg : null;
  $("#wNow").textContent = now? fmtKg(now)+" kg" : "–";
  if(now && start){
    const diff=start-now, since=" sedan start ("+longDate(sw.date)+")";
    $("#wDelta").textContent = w.length<2? "Första vägningen sparad." : (diff>=0? fmtKg(diff)+" kg ner"+since : fmtKg(-diff)+" kg upp"+since);
  } else $("#wDelta").textContent="Lägg in din första vikt nedan.";
  if(now && start && st.goal && start>st.goal){
    const pct=Math.max(0,Math.min(100,(start-now)/(start-st.goal)*100));
    $("#wBar").style.width=pct+"%";
    const left=now-st.goal;
    $("#wGoalTxt").textContent = left<=0? "Du har nått målvikten!" : fmtKg(left)+" kg kvar till "+fmtKg(st.goal)+" kg ("+Math.round(pct)+" % av vägen)";
  } else { $("#wBar").style.width="0%"; $("#wGoalTxt").textContent = st.goal? "" : "Sätt en målvikt under Inställningar för att se hur långt du kommit."; }

  renderWeightChart(w);
  const ul=$("#wList"); ul.innerHTML="";
  w.slice().reverse().slice(0,wShown).forEach(x=>ul.append(itemRow(new Date(x.date+"T12:00:00").toLocaleDateString("sv-SE",{day:"numeric",month:"short",year:"numeric"}),x.src==="withings"?"från Withings":"",fmtKg(x.kg)+" kg",()=>{S.weights=S.weights.filter(y=>y.date!==x.date);save();renderAll();})));
  ul.querySelectorAll(".p").forEach(p=>p.classList.remove("zero"));
  const more=$("#wMore"); more.classList.toggle("hidden", w.length<=wShown);
  more.textContent="Visa fler vägningar ("+(w.length-wShown)+" till)";
}

// ---------- Snabbloggning ----------
let foodMode="day", recDraft=null, nameCb=null;
function renderBites(){
  const el=$("#bites"); el.innerHTML="";
  const list=S.bites||[];
  if(!list.length){ el.innerHTML='<p class="empty">Lägg till smakbitar under Inställningar.</p>'; }
  list.forEach(bt=>{ const b=document.createElement("button"); b.type="button"; b.title=bt.portion;
    const n=document.createElement("span"); n.textContent=bt.name; const p=document.createElement("b"); p.textContent=bt.points+" p";
    b.append(n,p); b.onclick=()=>logBite(bt); el.append(b); });
  $("#copyYday").textContent = cur===today()? "Kopiera gårdagen" : "Kopiera dagen innan";
}
function logBite(bt){
  const d=ensureDay(cur); const wasEmpty=!logged(cur);
  d.foods.push({id:uid(),name:bt.name,portion:bt.portion,base:bt.points,qty:1,points:bt.points,meal:"Mellanmål"});
  save(); renderAll(); toast(bt.name+" loggad som mellanmål, "+bt.points+" p"); if(wasEmpty) checkBadges();
}
function copyYesterday(){
  const src=day(addDays(cur,-1)).foods;
  if(!src.length){ toast("Dagen innan är tom"); return; }
  if(day(cur).foods.length && !confirm("Det finns redan mat loggad. Lägga till gårdagens ovanpå?")) return;
  const d=ensureDay(cur); const wasEmpty=!logged(cur);
  src.forEach(f=>d.foods.push(Object.assign({},f,{id:uid()})));
  save(); renderAll(); toast(src.length+" saker kopierade"); if(wasEmpty) checkBadges();
}
function askName(title,def,cb){ $("#nTitle").textContent=title; $("#nVal").value=def||""; nameCb=cb; $("#nameDlg").showModal(); setTimeout(()=>$("#nVal").select(),50); }
function saveMealTemplate(meal){
  const items=day(cur).foods.filter(f=>f.meal===meal).map(f=>({name:f.name,portion:f.portion,base:f.base!=null?f.base:f.points,qty:f.qty||1,points:f.points}));
  const def=meal==="Mellanmål"?"Mitt mellanmål":"Min "+meal.toLowerCase();
  askName("Spara som vanlig måltid",def,name=>{
    S.meals=(S.meals||[]).filter(m=>m.name!==name); S.meals.unshift({id:uid(),name,items});
    save(); renderLibrary(); toast("”"+name+"” sparad under Måltider");
  });
}
function addMeal(m){
  const d=ensureDay(cur); const wasEmpty=!logged(cur);
  m.items.forEach(it=>d.foods.push(Object.assign({},it,{id:uid(),meal:mealTarget})));
  save(); $("#foodDlg").close(); renderAll();
  toast(m.name+" tillagd, "+m.items.reduce((a,x)=>a+x.points,0)+" p"); if(wasEmpty) checkBadges();
}
// Recept
const recTotal=()=>recDraft.ings.reduce((a,i)=>a+i.base*i.qty,0);
const recPortions=()=>Math.max(1,parseInt($("#rPor").value)||1);
function openRecipe(r){
  recDraft = r? JSON.parse(JSON.stringify(r)) : {id:null,name:"",portions:4,ings:[]};
  $("#rTitle").textContent = r? "Ändra recept" : "Nytt recept";
  $("#rName").value=recDraft.name; $("#rPor").value=recDraft.portions;
  $("#rDel").style.display = r? "" : "none";
  renderRec(); $("#recDlg").showModal();
}
function renderRec(){
  const ul=$("#rIngs"); ul.innerHTML="";
  if(!recDraft.ings.length){ const li=document.createElement("li"); li.className="empty"; li.textContent="Inga ingredienser än."; ul.append(li); }
  recDraft.ings.forEach(i=>ul.append(itemRow(i.name, amountText(i), Math.round(i.base*i.qty),
    ()=>{ recDraft.ings=recDraft.ings.filter(x=>x.id!==i.id); renderRec(); }, "",
    ()=>openQty({name:i.name,portion:i.portion,base:i.base,qty:i.qty},i.id,"recipe"))));
  $("#rCalc").textContent="Totalt "+Math.round(recTotal())+" p, "+Math.round(recTotal()/recPortions())+" p per portion";
}
function addIng(name,portion,base,qty){
  rememberFav(name);
  recDraft.ings.push({id:uid(),name,portion,base,qty:qty||1});
  if($("#qtyDlg").open) $("#qtyDlg").close(); if($("#foodDlg").open) $("#foodDlg").close();
  renderRec();
}
function saveRecipe(){
  const name=$("#rName").value.trim(); if(!name){ toast("Ge receptet ett namn"); $("#rName").focus(); return; }
  if(!recDraft.ings.length){ toast("Lägg till minst en ingrediens"); return; }
  const portions=recPortions();
  const r={id:recDraft.id||uid(), name, portions, ings:recDraft.ings, points:Math.round(recTotal()/portions)};
  S.recipes=(S.recipes||[]).filter(x=>x.id!==r.id); S.recipes.unshift(r);
  save(); $("#recDlg").close(); renderLibrary(); toast("”"+name+"” sparat, "+r.points+" p per portion");
}
function renderLibrary(){
  const fill=(id,arr,empty,mk)=>{ const ul=$(id); ul.innerHTML="";
    if(!arr.length){ const li=document.createElement("li"); li.className="empty"; li.textContent=empty; ul.append(li); }
    arr.forEach(x=>ul.append(mk(x))); };
  fill("#libMeals",S.meals||[],"Inga sparade måltider än.",m=>itemRow(m.name,m.items.length+" delar",m.items.reduce((a,i)=>a+i.points,0),()=>{ S.meals=S.meals.filter(x=>x.id!==m.id); save(); renderLibrary(); }));
  fill("#libRecipes",S.recipes||[],"Inga recept än.",r=>itemRow(r.name,r.portions+" portioner, per portion",r.points,()=>{ if(confirm("Ta bort receptet?")){ S.recipes=S.recipes.filter(x=>x.id!==r.id); save(); renderLibrary(); } },"",()=>openRecipe(r)));
  fill("#libBites",S.bites||[],"Inga smakbitar.",b=>itemRow(b.name,b.portion,b.points,()=>{ S.bites=S.bites.filter(x=>x.id!==b.id); save(); renderLibrary(); }));
  renderBites();
}

// ---------- Motivation ----------
let sumWeek="prev", lastCalcKg=null;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function weekStats(mon){
  const ds=[...Array(7)].map((_,i)=>addDays(mon,i)).filter(d=>d<=today());
  const ld=ds.filter(logged);
  const fvOf=d=>day(d).foods.filter(f=>CAT_OF[f.name]===6&&!NOT_FRUIT.has(f.name)).length;
  const prOf=d=>["Frukost","Lunch","Middag"].filter(m=>day(d).foods.some(f=>f.meal===m&&isProtein(f.name))).length;
  const w=sortedW(); const before=w.filter(x=>x.date<mon).pop(); const inW=w.filter(x=>x.date>=mon&&x.date<=addDays(mon,6)).pop();
  const moods=ds.map(d=>day(d).mood).filter(Boolean);
  const avg=k=>{ const v=moods.map(m=>m[k]).filter(x=>x); return v.length? v.reduce((a,b)=>a+b,0)/v.length : null; };
  return {
    days:ds.length, logged:ld.length,
    within:ld.filter(d=>eatenOn(d)<=allowedOn(d)).length,
    used:ds.reduce((a,d)=>a+overOn(d),0),
    min:ds.reduce((a,d)=>a+day(d).acts.reduce((x,y)=>x+y.min,0),0),
    strength:ds.reduce((a,d)=>a+day(d).acts.filter(isStrength).length,0),
    gym:ds.reduce((a,d)=>a+day(d).acts.filter(isGym).length,0),
    cardio:ds.reduce((a,d)=>a+day(d).acts.filter(isCardio).reduce((x,y)=>x+y.min,0),0),
    fish:ds.filter(d=>day(d).foods.some(f=>FISH.has(f.name))).length,
    fv: ld.length? ld.reduce((a,d)=>a+fvOf(d),0)/ld.length : 0,
    prot: ld.length? ld.reduce((a,d)=>a+prOf(d),0)/ld.length : 0,
    wChange: before&&inW? inW.kg-before.kg : null,
    wins: ds.filter(d=>day(d).mood&&day(d).mood.win).length,
    looser: moods.filter(m=>m.clothes>=2).length,
    sleep:avg("sleep"), energy:avg("energy")
  };
}
function winsOf(s){
  const w=[];
  if(s.logged>=5) w.push("Du loggade "+s.logged+" av "+s.days+" dagar."); else if(s.logged>0) w.push("Du loggade "+s.logged+" dag"+(s.logged>1?"ar":"")+".");
  if(s.within>0) w.push(s.within+" dag"+(s.within>1?"ar":"")+" inom dina poäng.");
  if(s.logged>0 && s.used<=S.settings.weekly) w.push("Du höll dig inom veckobufferten.");
  if(s.min>=150) w.push(s.min+" aktiva minuter, över rekommenderade 150!"); else if(s.min>0) w.push(s.min+" aktiva minuter.");
  if(s.gym>=gymGoal()) w.push(s.gym+" gympass"+(s.gym>gymGoal()?", mer än målet!":", målet nått!")); else if(s.gym>0) w.push(s.gym+" gympass.");
  if(s.strength>s.gym) w.push((s.strength-s.gym)+" hemmapass.");
  if(s.cardio>=cardioGoal()) w.push(s.cardio+" minuter kondition, målet nått!");
  if(s.fish>=2) w.push("Fisk "+s.fish+" gånger.");
  if(s.fv>=5) w.push("I snitt "+fmtN(s.fv)+" portioner frukt och grönt om dagen.");
  if(s.wChange!=null && s.wChange<0) w.push(fmtN(-s.wChange)+" kg ner.");
  if(s.looser>0) w.push("Kläderna kändes lösare "+s.looser+" gång"+(s.looser>1?"er":"")+".");
  if(s.wins>0) w.push(s.wins+" egna segrar noterade.");
  return w;
}
function suggestionsOf(s){
  const o=[];
  if(s.logged<5) o.push("Logga varje dag, även dagarna som inte blir som planerat");
  if(s.prot<2.5) o.push("Protein till frukost, lunch och middag");
  if(s.strength<gymGoal()) o.push("Boka in gymtiderna i kalendern redan på måndagen");
  if(s.cardio<cardioGoal()) o.push("15–20 minuter kondition efter styrkan på gymmet");
  if(s.fish<2) o.push("Fisk till middag två gånger");
  if(s.fv<4) o.push("Fem portioner frukt och grönt om dagen");
  if(s.min<150) o.push("150 minuters rörelse, ungefär 20 minuter om dagen");
  if(s.used>S.settings.weekly) o.push("Planera veckans utemiddag och spara poäng innan");
  if(s.sleep!=null && s.sleep<3) o.push("Ladda för sömnen: samma läggtid varje kväll");
  if(!o.length) o.push("Fortsätt precis som förra veckan","Prova ett nytt grönsaksrecept","Lägg till en extra promenad");
  return o.slice(0,4);
}
function renderSummary(){
  const c=$("#sumChips"); c.innerHTML="";
  [["prev","Förra veckan"],["cur","Den här veckan"]].forEach(([k,l])=>{ const b=document.createElement("button"); b.type="button"; b.textContent=l; b.setAttribute("aria-pressed",k===sumWeek); b.onclick=()=>{ sumWeek=k; renderSummary(); }; c.append(b); });
  const thisMon=mondayOf(today()), mon= sumWeek==="prev"? addDays(thisMon,-7) : thisMon;
  const s=weekStats(mon), el=$("#summary");
  let h='<p class="sumhead">Vecka '+isoWeek(mon)+', '+shortDate(mon)+' – '+shortDate(addDays(mon,6))+'</p>';
  if(!s.logged && !s.min){ h+='<p class="empty">Ingen loggning den veckan än.</p>'; }
  else{
    h+='<div class="stats"><div><b>'+s.logged+'/'+s.days+'</b><span>loggade dagar</span></div><div><b>'+s.within+'</b><span>inom poängen</span></div><div><b>'+s.min+'</b><span>aktiva min</span></div></div>';
    const w=winsOf(s);
    h+='<h3 style="margin-top:14px">Det här gick bra</h3><ul class="wins">'+(w.length? w.map(x=>'<li>'+esc(x)+'</li>').join("") : '<li>Du är kvar och fortsätter. Det är det viktigaste.</li>')+'</ul>';
  }
  // Veckans fokus gäller alltid innevarande vecka
  const f=(S.focus||{})[thisMon];
  h+='<h3 style="margin-top:14px">Veckans fokus</h3>';
  if(f) h+='<p style="margin:6px 0">🎯 '+esc(f)+'</p><button class="linkbtn" id="focusChange">Byt fokus</button>';
  else{
    const base= weekStats(addDays(thisMon,-7)).logged? weekStats(addDays(thisMon,-7)) : weekStats(thisMon);
    h+='<p class="note" style="margin:4px 0">Välj en sak att lägga lite extra kraft på den här veckan:</p><div class="sugg" id="suggList"></div>';
    h+='<div class="row"><input type="text" id="focusOwn" maxlength="80" placeholder="Eller skriv ett eget"><button class="btn" id="focusSet" style="flex:.35">Välj</button></div>';
    el.innerHTML=h;
    const sl=$("#suggList");
    suggestionsOf(base).forEach(t=>{ const b=document.createElement("button"); b.type="button"; b.textContent=t; b.onclick=()=>setFocus(t); sl.append(b); });
    $("#focusSet").onclick=()=>{ const v=$("#focusOwn").value.trim(); if(v) setFocus(v); };
    return;
  }
  el.innerHTML=h;
  $("#focusChange").onclick=()=>{ delete S.focus[thisMon]; save(); renderSummary(); renderFocusLine(); };
}
function setFocus(t){ S.focus=S.focus||{}; S.focus[mondayOf(today())]=t; save(); renderSummary(); renderFocusLine(); toast("Veckans fokus valt. Lycka till!"); }
function renderFocusLine(){
  const el=$("#focusLine"); el.innerHTML="";
  const thisMon=mondayOf(today()); const f=(S.focus||{})[thisMon];
  if(f){ const d=document.createElement("div"); d.className="focus"; d.textContent="🎯 Veckans fokus: "+f; el.append(d); return; }
  if(cur===today() && weekStats(addDays(thisMon,-7)).logged){
    const b=document.createElement("button"); b.className="banner"; b.textContent="Ny vecka! Se hur förra veckan gick och välj ett fokus →";
    b.onclick=()=>{ sumWeek="prev"; showView("framsteg"); renderSummary(); }; el.append(b);
  }
}
// Delmål
const RW_UNIT={kg:"kg ner",streak:"dagar i rad",cm:"cm ner",min:"aktiva min på en vecka"};
function bestStreak(){
  const ds=Object.keys(S.days).filter(logged).sort(); let best=0,run=0,prev=null;
  ds.forEach(d=>{ run= prev && addDays(prev,1)===d ? run+1 : 1; best=Math.max(best,run); prev=d; }); return best;
}
function bestWeekMin(){
  const wk={}; Object.entries(S.days).forEach(([d,v])=>{ const m=mondayOf(d); wk[m]=(wk[m]||0)+v.acts.reduce((a,x)=>a+x.min,0); });
  return Math.max(0,...Object.values(wk));
}
const rwValue=k=> k==="kg"? lostKg() : k==="streak"? bestStreak() : k==="cm"? measLost() : bestWeekMin();
function renderRewards(){
  const el=$("#rwList"); el.innerHTML="";
  const list=(S.rewards||[]).slice().sort((a,b)=>(!!a.doneAt)-(!!b.doneAt));
  if(!list.length){ el.innerHTML='<p class="empty">Inga delmål än. Lägg till ditt första nedan.</p>'; return; }
  list.forEach(r=>{
    const v=rwValue(r.kind), pct=r.doneAt?100:Math.max(0,Math.min(100,v/r.target*100));
    const d=document.createElement("div"); d.className="rw"+(r.doneAt?" done":"");
    d.innerHTML='<div class="tp"><div><b></b><div class="note"></div></div><button aria-label="Ta bort delmål">×</button></div><div class="bar"><i></i></div>';
    d.querySelector("b").textContent=fmtN(r.target)+" "+RW_UNIT[r.kind]+" → "+r.reward;
    d.querySelector(".note").textContent= r.doneAt? "🎉 Nått "+shortDate(r.doneAt)+". Njut av din belöning!" : "Du är på "+fmtN(Math.max(0,v))+" av "+fmtN(r.target);
    d.querySelector(".bar i").style.width=pct+"%";
    d.querySelector(".tp button").onclick=()=>{ S.rewards=S.rewards.filter(x=>x.id!==r.id); save(); renderRewards(); };
    el.append(d);
  });
}
function checkRewards(){
  let hit=null;
  (S.rewards||[]).forEach(r=>{ if(!r.doneAt && rwValue(r.kind)>=r.target){ r.doneAt=today(); hit=hit||r; } });
  if(hit){ save(); renderRewards(); setTimeout(()=>toast("🎉 Delmål nått! Dags för: "+hit.reward),2600); }
}
// Dagbok
const FACES=["😣","😕","😐","🙂","😄"], CLOTHES=["Tajtare","Som vanligt","Lösare","Mycket lösare"];
function setMood(k,v){ const d=ensureDay(cur); d.mood=d.mood||{}; if(d.mood[k]===v) delete d.mood[k]; else d.mood[k]=v; save(); renderDiary(); }
function renderDiary(){
  const m=day(cur).mood||{};
  const seg=(id,labels,key,offset)=>{ const el=$(id); el.innerHTML="";
    labels.forEach((l,i)=>{ const v=i+offset; const b=document.createElement("button"); b.type="button"; b.textContent=l;
      if(offset) b.setAttribute("aria-label",v+" av 5");
      b.setAttribute("aria-pressed", m[key]===v); b.onclick=()=>setMood(key,v); el.append(b); }); };
  seg("#dSleep",FACES,"sleep",1); seg("#dEnergy",FACES,"energy",1); seg("#dClothes",CLOTHES,"clothes",0);
  if(document.activeElement!==$("#dWin")) $("#dWin").value=m.win||"";
}
function renderMood(){
  const ds=[...Array(21)].map((_,i)=>addDays(today(),i-20));
  const sl=[],en=[];
  ds.forEach(d=>{ const m=day(d).mood; if(!m) return; if(m.sleep) sl.push({d,v:m.sleep}); if(m.energy) en.push({d,v:m.energy}); });
  const series=[{c:"var(--m4)",pts:sl},{c:"var(--cloud)",pts:en}].filter(s=>s.pts.length);
  $("#moodChart").innerHTML = Math.max(0,...series.map(s=>s.pts.length))<2? '<p class="empty">Fyll i sömn och ork på Idag-sidan så syns kurvan här.</p>' : lineChart(series,false);
  const lo=[...Array(30)].map((_,i)=>day(addDays(today(),-i)).mood).filter(m=>m&&m.clothes>=2).length;
  $("#clothesNote").textContent= lo? "Kläderna har känts lösare "+lo+" gång"+(lo>1?"er":"")+" de senaste 30 dagarna." : "";
  const ul=$("#winList"); ul.innerHTML="";
  const wins=Object.entries(S.days).filter(([d,v])=>v.mood&&v.mood.win).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,15);
  if(!wins.length){ const li=document.createElement("li"); li.className="empty"; li.textContent="Skriv ner små segrar på Idag-sidan, till exempel att du orkade mer eller valde frukt i stället för godis."; ul.append(li); }
  wins.forEach(([d,v])=>{ const li=document.createElement("li"); const n=document.createElement("span"); n.className="name"; n.textContent="⭐ "+v.mood.win; const s=document.createElement("span"); s.className="sub"; s.textContent=shortDate(d); n.append(s); li.append(n); ul.append(li); });
}
// Platåhjälp
function plateau(){
  const w=sortedW(); if(w.length<3) return null;
  const last=w[w.length-1]; if(last.date<addDays(today(),-10)) return null;
  if(S.settings.goal && last.kg<=S.settings.goal) return null;
  const win=w.filter(x=>x.date>=addDays(last.date,-21)); if(win.length<3) return null;
  if((new Date(last.date)-new Date(win[0].date))/864e5<14) return null;
  return (win[0].kg-last.kg)<0.5? {last} : null;
}
function renderPlateau(){
  const el=$("#plateau"), p=plateau(); el.innerHTML=""; if(!p) return;
  const tips=[
    "Kolla mängderna en vecka: väg eller mät maten. Portionerna växer ofta i smyg.",
    "Logga allt, även smakbitar, dryck och fett i matlagningen.",
    "Protein till varje måltid och styrketräning två gånger i veckan, så tappar du fett och inte muskler.",
    "Titta på kroppsmåtten. Centimetrarna kan minska fast vågen står still.",
    "Sov ordentligt. Dålig sömn ökar suget efter sött.",
    "Skär inte ner hårdare. För lite mat brukar göra det svårare, hellre lite mer rörelse."
  ];
  if(S.settings.calcKg && S.settings.calcKg-p.last.kg>=3) tips.unshift("Du har gått ner "+fmtN(S.settings.calcKg-p.last.kg)+" kg sedan poängen räknades fram. Räkna om dem under Inställningar.");
  const d=document.createElement("div"); d.className="plat";
  d.innerHTML='<h3>Vågen står still</h3><p class="note" style="margin:6px 0 0">Vikten har knappt rört sig på tre veckor. Det händer nästan alla och betyder inte att det slutat fungera. Det här brukar hjälpa:</p><ul></ul>';
  const ul=d.querySelector("ul"); tips.forEach(t=>{ const li=document.createElement("li"); li.textContent=t; ul.append(li); });
  el.append(d);
}

// ---------- Hälsa ----------
const PLACES={"Kiruna":[67.86,20.23],"Luleå":[65.58,22.15],"Umeå":[63.83,20.26],"Östersund":[63.18,14.64],"Sundsvall":[62.39,17.31],"Stockholm":[59.33,18.07],"Göteborg":[57.71,11.97],"Malmö":[55.6,13.0]};
const PROGRAMS={
  bas:{name:"Bas",min:20,desc:"Två varv. Vila 30–60 sekunder mellan övningarna.",ex:[
    ["Uppresning från stol","10–12 gånger","Sitt på framkanten och res dig utan att ta hjälp av händerna. Sätt dig långsamt."],
    ["Armhävning mot vägg","8–12 gånger","Händerna i axelhöjd mot väggen, kroppen rak. Böj armarna och tryck ifrån."],
    ["Höftlyft","12 gånger","Ligg på rygg med böjda knän. Lyft höften tills kroppen är rak och sänk långsamt."],
    ["Rodd med vattenflaskor","12 gånger","Luta dig fram med rak rygg, dra flaskorna mot magen och kläm ihop skulderbladen."],
    ["Tåhävningar","15 gånger","Håll i en stol, gå upp på tå och sänk långsamt. Bra för vader och skelett."],
    ["Balans på ett ben","30 sek per ben","Håll lätt i en stol i början. Svårare: blunda."]
  ]},
  tuff:{name:"Lite tuffare",min:30,desc:"Tre varv. Ta tyngre flaskor eller en ryggsäck med böcker när det börjar kännas lätt.",ex:[
    ["Knäböj","12–15 gånger","Fötterna axelbrett. Sätt dig bakåt som mot en stol, knäna i linje med tårna."],
    ["Armhävning mot bänk eller soffa","8–12 gånger","Händerna på en stadig kant, kroppen rak från huvud till häl."],
    ["Utfall bakåt","8 per ben","Kliv bakåt och sänk bakre knät mot golvet. Håll i en stol vid behov."],
    ["Höftlyft på ett ben","8 per ben","Som höftlyft, men med ena benet sträckt i luften."],
    ["Rodd med ryggsäck","12 gånger","Som rodd med flaskor, men med lite tyngd i en ryggsäck."],
    ["Planka på knä","20–40 sek","Underarmarna i golvet, rak kropp från knä till huvud. Spänn magen."],
    ["Tåhävningar på ett ben","10 per ben","Håll i en stol och ta en fot i taget."]
  ]}
};
let session={prog:"bas",done:new Set()};
function maxWeekCount(fn){ const wk={}; Object.keys(S.days).forEach(d=>{ if(fn(d)){ const m=mondayOf(d); wk[m]=(wk[m]||0)+1; } }); return Math.max(0,...Object.values(wk)); }
const hm=min=>{ min=((Math.round(min)%1440)+1440)%1440; return String(Math.floor(min/60)).padStart(2,"0")+":"+String(min%60).padStart(2,"0"); };
function renderWater(){
  const n=day(cur).water||0, el=$("#cups"); el.innerHTML="";
  for(let i=0;i<8;i++){ const b=document.createElement("button"); b.type="button"; b.className=i<n?"full":""; b.setAttribute("aria-label","Glas "+(i+1));
    b.onclick=()=>{ const d=ensureDay(cur); const nv=(n===i+1)? i : i+1; d.water=nv; save(); renderWater(); if(nv===8){ toast("8 glas! Bra jobbat"); checkBadges(); } }; el.append(b); }
  $("#waterTxt").textContent=n+" av 8 glas, "+fmtN(n*0.2)+" l";
}
function renderHealth(){
  // Styrka
  const ps=$("#progSeg"); ps.innerHTML="";
  Object.entries(PROGRAMS).forEach(([k,p])=>{ const b=document.createElement("button"); b.type="button"; b.textContent=p.name+", "+p.min+" min"; b.setAttribute("aria-pressed",k===session.prog); b.onclick=()=>{ session={prog:k,done:new Set()}; renderHealth(); }; ps.append(b); });
  const P=PROGRAMS[session.prog]; $("#progDesc").textContent=P.desc;
  const el=$("#exList"); el.innerHTML="";
  P.ex.forEach(([n,rep,txt],i)=>{
    const row=document.createElement("label"); row.className="ex"+(session.done.has(i)?" done":"");
    const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=session.done.has(i);
    cb.onchange=()=>{ if(cb.checked) session.done.add(i); else session.done.delete(i); row.classList.toggle("done",cb.checked); };
    const t=document.createElement("div"); t.innerHTML='<b></b><span class="rep"></span><p></p>';
    t.querySelector("b").textContent=n; t.querySelector(".rep").textContent=rep; t.querySelector("p").textContent=txt;
    row.append(cb,t); el.append(row);
  });
  $("#exDone").textContent="Klart, logga passet ("+P.min+" min)";
  const ws=weekStats(mondayOf(today())), home=ws.strength-ws.gym, gg=gymGoal(), cg=cardioGoal();
  $("#stWeek").textContent=home? home+" hemmapass i veckan" : "";
  $("#trainWeek").textContent="vecka "+isoWeek(today());
  const tg=$("#trainGoals"); tg.innerHTML="";
  const row=(t,n,goal,txt,sub)=>{ const d=document.createElement("div"); d.className="goal"+(n>=goal?" done":"");
    d.innerHTML='<div class="gl"><span></span><b></b></div><div class="gs"></div><div class="bar"><i></i></div>';
    d.querySelector(".gl span").textContent=t; d.querySelector(".gl b").textContent=(n>=goal?"✓ ":"")+txt;
    d.querySelector(".gs").textContent=sub; d.querySelector(".bar i").style.width=Math.min(100,n/goal*100)+"%"; tg.append(d); };
  row("Gympass",ws.gym,gg,ws.gym+" av "+gg,ws.gym>gg? "Extrapass, starkt jobbat!" : "Gärna "+(gg+1)+" när veckan tillåter");
  row("Kondition",ws.cardio,cg,ws.cardio+" av "+cg+" min","Pass i lagom eller svettigt tempo");
  const left=7-((new Date().getDay()+6)%7)-1;
  let tip="";
  if(ws.gym>=gg+1) tip="Fler gympass än målet den här veckan. Glöm inte vilodagarna, det är då musklerna växer.";
  else if(ws.strength>=gg) tip= home? "Styrkemålet är nått med hjälp av hemmapass. Bra löst!" : "Styrkemålet är nått. Hinner du ett pass till blir det ännu bättre.";
  else { const need=gg-ws.strength; tip= left+1>=need? need+" styrkepass kvar till målet och "+(left+1)+" dagar kvar av veckan. Hinner du inte till gymmet fungerar ett hemmapass." : "Veckan börjar ta slut. Ett hemmapass på 20 minuter räknas också!"; }
  if(ws.cardio<cg && ws.gym>0) tip+=" Lägg gärna 15–20 minuter kondition efter styrkan.";
  $("#trainTip").textContent=tip;
  // Dagsljus
  const pl=$("#place"); const place=S.settings.place||"Luleå";
  if(!pl.options.length) Object.keys(PLACES).forEach(n=>{ const o=document.createElement("option"); o.textContent=n; pl.append(o); });
  pl.value=place;
  const [lat,lon]=PLACES[place]; const st=sunTimes(today(),lat,lon);
  const now=new Date(); const nowM=now.getHours()*60+now.getMinutes();
  const box=$("#sun");
  if(st.polar){ box.innerHTML='<div><b>–</b><span>solen går inte upp</span></div><div><b>'+hm(st.noon)+'</b><span>ljusast</span></div>'; $("#sunTip").textContent="Solen går inte upp i dag, men det är ljusast runt "+hm(st.noon)+". Gå ut då, en stund räcker långt."; }
  else if(st.midnight){ box.innerHTML='<div><b>24 h</b><span>midnattssol</span></div>'; $("#sunTip").textContent="Solen går inte ner alls just nu. Njut av ljuset!"; }
  else{
    box.innerHTML='<div><b>'+hm(st.rise)+'</b><span>soluppgång</span></div><div><b>'+hm(st.set)+'</b><span>solnedgång</span></div><div><b>'+Math.floor(st.len/60)+' h '+Math.round(st.len%60)+' m</b><span>dagsljus</span></div>';
    $("#sunTip").textContent = nowM>st.set? "Solen har gått ner för i dag. Planera en promenad runt "+hm(st.noon)+" i morgon." : nowM<st.rise? "Solen går upp "+hm(st.rise)+". Bästa tiden att gå ut i dag är runt "+hm(st.noon)+"." : "Bästa tiden att gå ut i dag är runt "+hm(st.noon)+", då står solen som högst.";
  }
  const out=!!day(today()).daylight;
  const t=$("#dlToggle"); t.textContent= out? "✓ Ute i dagsljus i dag" : "Jag har varit ute i dagsljus i dag"; t.className= out? "btn" : "btn ghost";
  let n7=0; for(let i=0;i<7;i++) if(day(addDays(today(),-i)).daylight) n7++;
  $("#dlWeek").textContent=n7+" av 7 dagar";
}

// ---------- Träningsmål ----------
const isGym=a=>/^Gym, styrka/.test(a.name);
const isStrength=a=>isGym(a)||/^Styrketräning/.test(a.name);
const CARDIO=/Promenad|Stavgång|Cykling|Löpning|Simning|Skidor|Dans|Gym, kondition|Gruppträning/;
const isCardio=a=>CARDIO.test(a.name) && a.int>=2;
const gymGoal=()=>S.settings.gymGoal||2, cardioGoal=()=>S.settings.cardioGoal||150;
function bestCardioWeek(){ const wk={}; Object.entries(S.days).forEach(([d,v])=>{ const m=mondayOf(d); wk[m]=(wk[m]||0)+v.acts.filter(isCardio).reduce((a,x)=>a+x.min,0); }); return Math.max(0,...Object.values(wk)); }
function openActPreset(type,min,int){
  $("#aType").value=type; $("#aMin").value=min; intensity=int;
  document.querySelectorAll("#aInt button").forEach(x=>x.setAttribute("aria-pressed", +x.dataset.i===int));
  updateActCalc(); $("#actDlg").showModal();
}

// ---------- Kroppsmått ----------
const MEAS=[["byst","Byst","var(--lingon)"],["midja","Midja","var(--pine)"],["hoft","Höfter","var(--cloud)"],["arm","Överarm","var(--m4)"],["lar","Lår","var(--m5)"]];
let mSel="alla";
const sortedM=()=>(S.measures||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
const shortDate=d=>new Date(d+"T12:00:00").toLocaleDateString("sv-SE",{day:"numeric",month:"short"}).replace(/\.$/,"");
function firstLast(key){
  const v=sortedM().filter(x=>x[key]!=null);
  return v.length? {first:v[0][key], last:v[v.length-1][key], n:v.length} : null;
}
function measLost(){ let t=0; MEAS.forEach(([k])=>{ const f=firstLast(k); if(f&&f.n>1) t+=f.first-f.last; }); return t; }
function lineChart(series,delta){
  const W=520,H=210,PL=42,PR=14,PT=14,PB=26;
  const all=series.flatMap(s=>s.pts);
  const tm=d=>new Date(d+"T12:00:00").getTime();
  const t0=Math.min(...all.map(p=>tm(p.d))), t1=Math.max(...all.map(p=>tm(p.d)));
  let lo=Math.min(...all.map(p=>p.v)), hi=Math.max(...all.map(p=>p.v));
  if(delta){ lo=Math.min(lo,0); hi=Math.max(hi,0); }
  const pad=Math.max(1,(hi-lo)*0.12); lo-=pad; hi+=pad;
  const X=d=>PL+(W-PL-PR)*((tm(d)-t0)/Math.max(1,t1-t0));
  const Y=v=>PT+(H-PT-PB)*(1-(v-lo)/(hi-lo));
  let s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Måttkurva">';
  for(let i=0;i<=3;i++){ const v=lo+(hi-lo)*i/3, y=Y(v);
    s+='<line x1="'+PL+'" x2="'+(W-PR)+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)"/>';
    s+='<text x="'+(PL-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="var(--muted)">'+(delta&&v>0?"+":"")+fmtN(v)+'</text>'; }
  if(delta) s+='<line x1="'+PL+'" x2="'+(W-PR)+'" y1="'+Y(0)+'" y2="'+Y(0)+'" stroke="var(--muted)" stroke-dasharray="4 4"/>';
  series.forEach(se=>{
    if(se.pts.length>1) s+='<polyline fill="none" stroke="'+se.c+'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="'+se.pts.map(p=>X(p.d)+","+Y(p.v)).join(" ")+'"/>';
    se.pts.forEach(p=>s+='<circle cx="'+X(p.d)+'" cy="'+Y(p.v)+'" r="4" fill="var(--surface)" stroke="'+se.c+'" stroke-width="2"/>');
  });
  const ds=[...new Set(all.map(p=>p.d))].sort();
  s+='<text x="'+PL+'" y="'+(H-6)+'" font-size="12" fill="var(--muted)">'+shortDate(ds[0])+'</text>';
  if(ds.length>1) s+='<text x="'+(W-PR)+'" y="'+(H-6)+'" text-anchor="end" font-size="12" fill="var(--muted)">'+shortDate(ds[ds.length-1])+'</text>';
  return s+'</svg>';
}
function renderMeasures(){
  const m=sortedM();
  // Förifyll med senaste värden som ledtråd
  MEAS.forEach(([k])=>{ const f=firstLast(k); $("#m_"+k).placeholder=f? "senast "+fmtN(f.last) : ""; });
  const c=$("#mChips"); c.innerHTML="";
  [["alla","Alla, förändring",null],...MEAS].forEach(([k,l,col])=>{
    const b=document.createElement("button"); b.type="button"; b.setAttribute("aria-pressed",k===mSel);
    if(col){ const d=document.createElement("span"); d.className="dot"; d.style.background=col; b.append(d); }
    b.append(document.createTextNode(l)); b.onclick=()=>{ mSel=k; renderMeasures(); }; c.append(b);
  });
  const lost=measLost();
  $("#mTotal").textContent = m.length>1 && lost!==0 ? (lost>0? fmtN(lost)+" cm ner totalt" : fmtN(-lost)+" cm upp totalt") : "";
  const box=$("#mChart");
  let series;
  if(mSel==="alla") series=MEAS.map(([k,l,col])=>{ const f=firstLast(k); return {c:col, pts: f? m.filter(x=>x[k]!=null).map(x=>({d:x.date,v:x[k]-f.first})) : []}; }).filter(s=>s.pts.length);
  else { const [k,l,col]=MEAS.find(x=>x[0]===mSel); series=[{c:col, pts:m.filter(x=>x[k]!=null).map(x=>({d:x.date,v:x[k]}))}]; }
  const maxPts=Math.max(0,...series.map(s=>s.pts.length));
  box.innerHTML = maxPts<2? '<p class="empty">Kurvan visas efter två mätningar.</p>' : lineChart(series, mSel==="alla");
  // Tabell
  const t=$("#mTable"); t.innerHTML="";
  if(m.length){
    const g=document.createElement("div"); g.className="mtab";
    const cell=(txt,cls)=>{ const d=document.createElement("div"); if(cls) d.className=cls; d.textContent=txt; g.append(d); return d; };
    ["Mått","Start","Nu","Förändring"].forEach(h=>cell(h,"h"));
    MEAS.forEach(([k,l,col])=>{ const f=firstLast(k); if(!f) return;
      const n=cell(l); const d=document.createElement("span"); d.className="dot"; d.style.background=col; n.prepend(d);
      cell(fmtN(f.first)); cell(fmtN(f.last));
      const diff=f.last-f.first;
      cell(f.n<2? "–" : (diff>0?"+":"")+fmtN(diff)+" cm", f.n<2? "" : diff<0?"neg":diff>0?"pos":"");
    });
    t.append(g);
  }
  const ul=$("#mList"); ul.innerHTML="";
  m.slice().reverse().slice(0,8).forEach(x=>{
    const sub=MEAS.filter(([k])=>x[k]!=null).map(([k,l])=>l.toLowerCase()+" "+fmtN(x[k])).join(", ");
    ul.append(itemRow(new Date(x.date+"T12:00:00").toLocaleDateString("sv-SE",{day:"numeric",month:"short",year:"numeric"}),sub,"",()=>{ S.measures=S.measures.filter(y=>y.date!==x.date); save(); renderAll(); }));
  });
}
function saveMeasures(){
  const d=$("#mDate").value; if(!d){ toast("Välj ett datum"); return; }
  const e={date:d}; let any=false;
  for(const [k,l] of MEAS){
    const raw=$("#m_"+k).value.trim(); if(!raw) continue;
    const v=parseFloat(raw.replace(",","."));
    if(!(v>=10 && v<=250)){ toast(l+": skriv ett mått i cm"); $("#m_"+k).focus(); return; }
    e[k]=v; any=true;
  }
  if(!any){ toast("Fyll i minst ett mått"); return; }
  const before=measLost();
  S.measures=S.measures||[];
  const ex=S.measures.find(x=>x.date===d);
  if(ex) Object.assign(ex,e); else S.measures.push(e);
  save(); MEAS.forEach(([k])=>$("#m_"+k).value=""); renderAll();
  const gain=measLost()-before;
  toast(gain>0.05? fmtN(gain)+" cm mindre sedan sist. Snyggt!" : "Måtten sparade");
  checkBadges();
}

// ---------- Framsteg ----------
const BADGES = [
  ["🍽️","Första loggen","Logga en måltid", ()=>Object.values(S.days).some(d=>d.foods.length)],
  ["🔥","Tre i rad","Logga 3 dagar i rad", ()=>streak()>=3],
  ["🌲","En hel vecka","Logga 7 dagar i rad", ()=>streak()>=7],
  ["🏔️","Fyra veckor","Logga 28 dagar i rad", ()=>streak()>=28],
  ["👟","Första passet","Logga en aktivitet", ()=>Object.values(S.days).some(d=>d.acts.length)],
  ["⚡","Aktiv vecka","150 aktiva minuter på en vecka", ()=>weekMinutes()>=150],
  ["⚖️","Första kilot","1 kg ner", ()=>lostKg()>=1],
  ["🎯","Fem procent","5 % av startvikten", ()=>lostPct()>=5],
  ["🏅","Tio procent","10 % av startvikten", ()=>lostPct()>=10],
  ["📏","Tio centimeter","10 cm ner i kroppsmått totalt", ()=>measLost()>=10],
  ["💪","Styrkevecka","2 styrkepass på en vecka", ()=>maxWeekCount(d=>day(d).acts.some(isStrength))>=2],
  ["🏋️","Trepassaren","3 gympass på en vecka", ()=>maxWeekCount(d=>day(d).acts.some(isGym))>=3],
  ["❤️","Konditionsvecka","150 konditionsminuter på en vecka", ()=>bestCardioWeek()>=150],
  ["☀️","Ljusjägare","Ute i dagsljus 5 dagar på en vecka", ()=>maxWeekCount(d=>!!day(d).daylight)>=5],
  ["💧","Vätskebalans","8 glas vatten en dag", ()=>Object.values(S.days).some(d=>(d.water||0)>=8)],
  ["🌟","Målvikten","Nå din målvikt", ()=>{const w=sortedW();return S.settings.goal && w.length>1 && w[w.length-1].kg<=S.settings.goal;}]
];
// Räknas från startvikten: första vägningen på eller efter startdatumet under Inställningar.
function lostKg(){ const w=sortedW(), s=startWeight(w,S.settings.startDate); return w.length>1&&s? s.kg-w[w.length-1].kg : 0; }
function lostPct(){ const w=sortedW(), s=startWeight(w,S.settings.startDate); return w.length>1&&s? lostKg()/s.kg*100 : 0; }
function renderProgress(){
  $("#stStreak").textContent=streak();
  $("#stDays").textContent=Object.values(S.days).filter(d=>d.foods.length).length;
  $("#stMin").textContent=weekMinutes();
  const b=$("#badges"); b.innerHTML="";
  BADGES.forEach(([ic,name,desc,test])=>{
    const got=!!test(); const d=document.createElement("div"); d.className="badge"+(got?" got":"");
    d.innerHTML='<div class="ic" aria-hidden="true"></div><b></b><small></small>';
    d.querySelector(".ic").textContent=ic; d.querySelector("b").textContent=name; d.querySelector("small").textContent=got?"Klart!":desc;
    b.append(d);
  });
  // Veckodiagram
  const m=mondayOf(today()); const W=520,H=170,bw=44;
  const days=[...Array(7)].map((_,i)=>addDays(m,i));
  const max=Math.max(S.settings.daily+10,...days.map(d=>Math.max(eatenOn(d),allowedOn(d))));
  let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Poäng per dag denna vecka">';
  const lab=["mån","tis","ons","tors","fre","lör","sön"];
  days.forEach((d,i)=>{
    const x=24+i*((W-48)/7)+((W-48)/7-bw)/2, base=H-24;
    const a=allowedOn(d)/max*(H-40), e=eatenOn(d)/max*(H-40);
    svg+='<rect x="'+x+'" y="'+(base-a)+'" width="'+bw+'" height="'+a+'" rx="8" fill="var(--track)"/>';
    if(e>0) svg+='<rect x="'+x+'" y="'+(base-e)+'" width="'+bw+'" height="'+e+'" rx="8" fill="'+(eatenOn(d)>allowedOn(d)?"var(--cloud)":"var(--pine)")+'"/>';
    svg+='<text x="'+(x+bw/2)+'" y="'+(H-6)+'" text-anchor="middle" font-size="13" fill="'+(d===today()?"var(--ink)":"var(--muted)")+'" font-weight="'+(d===today()?"600":"400")+'">'+lab[i]+'</text>';
  });
  svg+='</svg>';
  $("#weekChart").innerHTML=svg;
}
let known=null;
function checkBadges(){
  const now=BADGES.filter(b=>b[3]()).map(b=>b[1]);
  if(known){ const fresh=now.filter(n=>!known.includes(n)); if(fresh.length) setTimeout(()=>toast("Nytt märke: "+fresh[0]+"!"),900); }
  known=now;
  checkRewards();
}

// ---------- Inställningar ----------
function renderSettings(){
  const s=S.settings;
  $("#setName").value=s.name||""; $("#setHeight").value=s.height||""; $("#setGoal").value=s.goal||""; $("#setStart").value=s.startDate||"";
  $("#setSex").value=s.sex||"kvinna"; $("#setAge").value=s.age||""; $("#setPal").value=s.pal||"1.4";
  const lw=sortedW(); $("#setKg").value=lw.length? lw[lw.length-1].kg : ""; $("#calcOut").textContent="";
  $("#setDaily").value=s.daily; $("#setWeekly").value=s.weekly; $("#setGym").value=s.gymGoal||2; $("#setCardio").value=s.cardioGoal||150; goalWarn(); renderLibrary();
}
function goalWarn(){
  const h=parseFloat($("#setHeight").value), g=parseFloat(String($("#setGoal").value).replace(",","."));
  const el=$("#setWarn"); el.innerHTML="";
  if(h && g){ const bmi=g/((h/100)**2); if(bmi<18.5){ const d=document.createElement("div"); d.className="warn"; d.textContent="Den målvikten ger ett BMI under 18,5, vilket räknas som undervikt. Prata gärna med vårdcentralen om vad som är en rimlig vikt för dig."; el.append(d);} }
}

// ---------- Allmänt ----------
let tT; function toast(m){ const t=$("#toast"); t.textContent=m; t.classList.add("show"); clearTimeout(tT); tT=setTimeout(()=>t.classList.remove("show"),2400); }
function renderAll(){ renderToday(); renderWeight(); renderPlateau(); renderMeasures(); renderProgress(); renderSummary(); renderRewards(); renderMood(); renderHealth(); }
function showView(v){
  document.querySelectorAll(".view").forEach(x=>x.classList.toggle("on", x.id==="v-"+v));
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected", b.dataset.v===v));
  if(v==="installningar") renderSettings();
  if(v==="vikt") renderWeightChart(sortedW());
  window.scrollTo(0,0);
}

// ---------- Händelser ----------
document.querySelectorAll("nav.tabs button").forEach(b=>b.onclick=()=>{ showView(b.dataset.v); try{history.replaceState(null,"","#"+b.dataset.v);}catch(e){} });
$("#prevDay").onclick=()=>{ cur=addDays(cur,-1); renderToday(); };
$("#nextDay").onclick=()=>{ if(cur<today()){ cur=addDays(cur,1); renderToday(); } };
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());
document.querySelectorAll("dialog").forEach(d=>d.addEventListener("click",e=>{ if(e.target===d) d.close(); }));
$("#foodSearch").oninput=renderFoodList;
["#cKcal","#cProt","#cSug","#cFat"].forEach(id=>$(id).oninput=()=>$("#cCalc").textContent="= "+customCalc()+" poäng");
$("#cAdd").onclick=()=>{
  const name=$("#cName").value.trim(); if(!name){ $("#cName").focus(); return; }
  const pts=customCalc(); const por="egen";
  if(!S.favs.some(f=>f.name===name)) S.favs.unshift({name,portion:por,points:pts});
  ["#cName","#cKcal","#cProt","#cSug","#cFat"].forEach(id=>$(id).value=""); $("#cCalc").textContent="= 0 poäng";
  if(foodMode==="recipe") addIng(name,por,pts,1); else addFood(name,por,pts);
};
$("#qMinus").onclick=()=>qNudge(-1);
$("#qPlus").onclick=()=>qNudge(1);
$("#qVal").oninput=()=>{
  const v=parseFloat($("#qVal").value.replace(",","."));
  if(v>0){ qS.qty=qS.u? v/qS.u.amt : v; renderQty(false); }
};
$("#qSave").onclick=()=>{
  if(!(qS.qty>0)) return;
  if(qS.ctx==="recipe"){
    if(qS.editId){ const e=recDraft.ings.find(x=>x.id===qS.editId); if(e) e.qty=qS.qty; $("#qtyDlg").close(); renderRec(); }
    else addIng(qS.name,qS.portion,qS.base,qS.qty);
    return;
  }
  if(qS.editId){
    const e=ensureDay(cur).foods.find(x=>x.id===qS.editId);
    if(e){ e.base=qS.base; e.qty=qS.qty; e.points=Math.round(qS.base*qS.qty); }
    save(); $("#qtyDlg").close(); renderAll(); toast("Mängden ändrad");
  } else addFood(qS.name,qS.portion,qS.base,qS.qty);
};
$("#qDel").onclick=()=>{
  if(!qS.editId) return;
  if(qS.ctx==="recipe"){ recDraft.ings=recDraft.ings.filter(x=>x.id!==qS.editId); $("#qtyDlg").close(); renderRec(); return; }
  removeFood(qS.editId); $("#qtyDlg").close();
};
$("#addAct").onclick=()=>{ updateActCalc(); $("#actDlg").showModal(); };
$("#aMin").oninput=updateActCalc;
document.querySelectorAll("#aInt button").forEach(b=>b.onclick=()=>{ intensity=+b.dataset.i; document.querySelectorAll("#aInt button").forEach(x=>x.setAttribute("aria-pressed", x===b)); updateActCalc(); });
$("#aAdd").onclick=()=>{
  const min=parseInt($("#aMin").value)||0; if(min<1) return;
  const pts=actPoints(min,intensity);
  ensureDay(cur).acts.push({id:uid(),name:$("#aType").value,min,int:intensity,points:pts});
  save(); $("#actDlg").close(); renderAll(); toast("Snyggt! +"+pts+" poäng"); checkBadges();
};
$("#wDate").value=today();
$("#mDate").value=today();
$("#mSave").onclick=saveMeasures;
$("#wMore").onclick=()=>{ wShown+=20; renderWeight(); };
$("#wBig").onclick=openBigChart;
let resizeT; window.addEventListener("resize",()=>{ clearTimeout(resizeT); resizeT=setTimeout(()=>{ renderWeightChart(sortedW()); if($("#chartDlg").open) renderWeightChart(sortedW(),true); },150); });
$("#logGym").onclick=()=>{ cur=today(); openActPreset("Gym, styrka",60,2); };
$("#logCardio").onclick=()=>{ cur=today(); openActPreset("Gym, kondition",30,2); };
$("#place").onchange=()=>{ S.settings.place=$("#place").value; save(); renderHealth(); };
$("#dlToggle").onclick=()=>{ const d=ensureDay(today()); d.daylight=!d.daylight; save(); renderHealth(); if(d.daylight){ toast("Bra! Ljuset gör gott både för humör och sömn"); checkBadges(); } };
$("#dlWalk").onclick=()=>{ const d=ensureDay(today()); const p=actPoints(20,1); d.acts.push({id:uid(),name:"Promenad",min:20,int:1,points:p}); d.daylight=true; save(); renderAll(); toast("Promenad loggad, +"+p+" poäng"); checkBadges(); };
$("#exDone").onclick=()=>{
  const P=PROGRAMS[session.prog];
  if(!session.done.size && !confirm("Inga övningar är avbockade. Logga passet ändå?")) return;
  const p=actPoints(P.min,2); ensureDay(today()).acts.push({id:uid(),name:"Styrketräning hemma",min:P.min,int:2,points:p});
  session.done=new Set(); save(); renderAll(); toast("Starkt jobbat! +"+p+" poäng"); checkBadges();
};
$("#dWin").addEventListener("change",()=>{ const d=ensureDay(cur); d.mood=d.mood||{}; const v=$("#dWin").value.trim(); if(v) d.mood.win=v; else delete d.mood.win; save(); renderMood(); if(v) toast("Snyggt! Segern sparad"); });
$("#rwAdd").onclick=()=>{
  const t=parseFloat(String($("#rwTarget").value).replace(",",".")), r=$("#rwReward").value.trim();
  if(!(t>0)){ toast("Ange ett antal"); $("#rwTarget").focus(); return; }
  if(!r){ $("#rwReward").focus(); return; }
  S.rewards=S.rewards||[]; S.rewards.push({id:uid(),kind:$("#rwKind").value,target:t,reward:r});
  $("#rwTarget").value=""; $("#rwReward").value=""; save(); renderRewards(); checkRewards(); toast("Delmål tillagt");
};
$("#copyYday").onclick=copyYesterday;
$("#toRecipe").onclick=()=>{ $("#foodDlg").close(); openRecipe(null); };
$("#newRecipe2").onclick=()=>openRecipe(null);
$("#rAddIng").onclick=openFoodForRecipe;
$("#rPor").oninput=()=>renderRec();
$("#rSave").onclick=saveRecipe;
$("#rDel").onclick=()=>{ if(recDraft.id && confirm("Ta bort receptet?")){ S.recipes=S.recipes.filter(r=>r.id!==recDraft.id); save(); $("#recDlg").close(); renderLibrary(); toast("Receptet borttaget"); } };
$("#recDlg").addEventListener("close",()=>{ foodMode="day"; });
$("#nSave").onclick=()=>{ const v=$("#nVal").value.trim(); if(!v){ $("#nVal").focus(); return; } $("#nameDlg").close(); if(nameCb) nameCb(v); };
$("#nVal").addEventListener("keydown",e=>{ if(e.key==="Enter") $("#nSave").click(); });
$("#bAdd").onclick=()=>{
  const n=$("#bName").value.trim(), p=parseInt($("#bPts").value);
  if(!n){ $("#bName").focus(); return; }
  if(!(p>=0)){ toast("Ange poäng"); $("#bPts").focus(); return; }
  S.bites=S.bites||[]; S.bites.push({id:uid(),name:n,portion:$("#bPor").value.trim()||"1 st",points:p});
  save(); $("#bName").value=""; $("#bPts").value=""; renderLibrary(); toast("Smakbit tillagd");
};
$("#wSave").onclick=()=>{
  const kg=parseFloat(String($("#wKg").value).replace(",",".")); const d=$("#wDate").value;
  if(!kg||kg<30||kg>300||!d){ toast("Skriv in en vikt mellan 30 och 300 kg"); return; }
  const prev=sortedW(); const last=prev.length? prev[prev.length-1].kg : null;
  S.weights=S.weights.filter(x=>x.date!==d); S.weights.push({date:d,kg});
  save(); renderAll(); $("#wKg").value="";
  toast(last && kg<last? "Ner "+fmtKg(last-kg)+" kg sedan sist. Bra jobbat!" : "Vikt sparad. Det är trenden över veckor som räknas.");
  checkBadges();
};
$("#setHeight").oninput=goalWarn; $("#setGoal").oninput=goalWarn;
$("#setCalc").onclick=calcBudget;
$("#setSave").onclick=()=>{
  const s=S.settings;
  s.name=$("#setName").value.trim();
  s.sex=$("#setSex").value; s.age=parseInt($("#setAge").value)||null; s.pal=$("#setPal").value;
  if(lastCalcKg){ s.calcKg=lastCalcKg; lastCalcKg=null; }
  s.height=parseFloat($("#setHeight").value)||null;
  s.goal=parseFloat(String($("#setGoal").value).replace(",","."))||null;
  s.startDate=$("#setStart").value||null;
  s.daily=Math.min(45,Math.max(18,parseInt($("#setDaily").value)||23));
  s.weekly=Math.min(50,Math.max(0,parseInt($("#setWeekly").value)||0));
  s.gymGoal=Math.min(7,Math.max(1,parseInt($("#setGym").value)||2));
  s.cardioGoal=Math.min(600,Math.max(30,parseInt($("#setCardio").value)||150));
  save(); renderSettings(); renderAll(); toast("Inställningar sparade");
};
$("#resetAll").onclick=()=>{ if(confirm("Rensa all data? Det går inte att ångra.")){ S=blank(); save(); renderAll(); renderSettings(); toast("Allt rensat"); } };

// ---------- Konto och kopior ----------
$("#logout").onclick=async()=>{
  if(dirty) await push();
  try{ await fetch("/api/logout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}); }catch(e){}
  try{ localStorage.removeItem(cacheKey()); }catch(e){}
  location.href="/";
};
$("#exportData").onclick=()=>{
  const blob=new Blob([JSON.stringify(S,null,1)],{type:"application/json"});
  const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:"tallriken-"+today()+".json"});
  document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
$("#importData").onclick=()=>$("#importFile").click();
$("#importFile").onchange=async()=>{
  const f=$("#importFile").files[0]; $("#importFile").value=""; if(!f) return;
  let data; try{ data=JSON.parse(await f.text()); }catch(e){ toast("Filen går inte att läsa som JSON"); return; }
  if(data && data.data && looksLikeDiary(data.data)) data=data.data;
  if(!looksLikeDiary(data)){ toast("Filen ser inte ut som en kopia av Tallriken"); return; }
  const n=Object.keys(data.days).length;
  if(!confirm("Ersätta allt i Tallriken med kopian ("+n+" dagar)? Det du har nu skrivs över.")) return;
  S=normalize(data); save(); renderAll(); renderSettings(); known=null; checkBadges(); toast("Kopian är inläst");
};
// ---------- Withings ----------
const fmtWhen=s=>new Date(s).toLocaleString("sv-SE",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
async function api(path,opts={}){
  const res=await fetch(path,{method:opts.method||"GET",headers:opts.body?{"Content-Type":"application/json"}:{},body:opts.body?JSON.stringify(opts.body):undefined});
  const body=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(body.error||("Fel "+res.status));
  return body;
}
function showWithings(st){
  $("#wiBlock").classList.toggle("hidden", !st.enabled);
  if(!st.enabled) return;
  $("#wiConnect").classList.toggle("hidden", st.connected);
  $("#wiActions").classList.toggle("hidden", !st.connected);
  $("#wiText").textContent = !st.connected
    ? "Koppla din Withings-våg så hamnar vikten här automatiskt när du väger dig. Dagens första vägning räknas, och vikter du skrivit in själv ändras aldrig."
    : (st.error? "Senaste hämtningen misslyckades: "+st.error : st.syncedAt? "Kopplad. Senast hämtat "+fmtWhen(st.syncedAt)+"." : "Kopplad.");
}
async function loadWithings(){ try{ showWithings(await api("/api/withings")); }catch(e){} }
// Hämtar dagboken igen om servern har lagt in nya vikter.
async function refreshData(){
  if(dirty) await push();
  const remote=await api("/api/data");
  if(remote.data && remote.version!==version) adopt(remote);
}
$("#wiConnect").onclick=async()=>{
  try{ if(dirty) await push(); const r=await api("/api/withings/connect",{method:"POST",body:{}}); location.href=r.url; }
  catch(e){ toast(e.message); }
};
$("#wiSync").onclick=async()=>{
  $("#wiSync").disabled=true;
  try{ const r=await api("/api/withings/sync",{method:"POST",body:{}}); showWithings(r); await refreshData();
    toast(r.added? r.added+(r.added>1?" nya vikter":" ny vikt")+" från Withings" : "Inga nya vikter"); if(r.added) checkBadges(); }
  catch(e){ toast(e.message); loadWithings(); }
  finally{ $("#wiSync").disabled=false; }
};
$("#wiOff").onclick=async()=>{
  if(!confirm("Koppla från Withings? Vikterna som redan hämtats finns kvar.")) return;
  try{ showWithings(await api("/api/withings",{method:"DELETE"})); toast("Withings är frånkopplat"); }catch(e){ toast(e.message); }
};
// Tillbaka från Withings efter godkännandet.
function withingsReturn(){
  const p=new URLSearchParams(location.search), w=p.get("withings"); if(!w) return;
  history.replaceState(null,"","/app"+location.hash);
  if(w==="ok"){ const n=+p.get("nya")||0; setTimeout(()=>toast("Withings är kopplat"+(n? ", "+n+(n>1?" vikter":" vikt")+" hämtade" : "")),400); if(n) checkBadges(); }
  else setTimeout(()=>toast(p.get("meddelande")||"Kopplingen till Withings misslyckades"),400);
}

function renderAccount(){
  if(!me) return;
  $("#who").textContent="Inloggad som "+(me.name||"")+(me.email? " ("+me.email+")" : "")+".";
  $("#adminLink").classList.toggle("hidden", !me.is_admin);
}

// ---------- Start ----------
if(!(await load())) return;
renderAccount();
const h=(location.hash||"").slice(1);
if(["idag","vikt","halsa","framsteg","installningar"].includes(h)) showView(h);
renderAll(); checkBadges();
withingsReturn(); loadWithings();
})();
