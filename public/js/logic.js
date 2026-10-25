// Pure calculations from the Tallriken artifact, shared by the app and the tests (test/logic.test.js).
// Dates are "YYYY-MM-DD" strings in the browser's local time.

// Own points model: energy, sugar and saturated fat push up, protein pulls down.
export const calcPoints = (kcal, prot, sug, fat) =>
  Math.max(0, Math.round((kcal + 4*sug + 9*fat - 3.2*prot) / 33));

// Extra points for activity: minutes per point by intensity (1 easy, 2 moderate, 3 hard).
export function actPoints(min,int){ const per={1:20,2:12,3:7}[int]; return Math.max(0, Math.floor(min/per)); }

export function iso(d){ const z=new Date(d.getTime()-d.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); }
export const today = () => iso(new Date());
export function addDays(s,n){ const d=new Date(s+"T12:00:00"); d.setDate(d.getDate()+n); return iso(d); }
export function mondayOf(s){ const d=new Date(s+"T12:00:00"); const wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd); return iso(d); }
export function isoWeek(s){ const d=new Date(s+"T12:00:00"); d.setDate(d.getDate()+3-((d.getDay()+6)%7)); const w1=new Date(d.getFullYear(),0,4,12); return 1+Math.round(((d-w1)/864e5-3+((w1.getDay()+6)%7))/7); }

// Daily points from energy need (Mifflin–St Jeor × activity level) minus a calm 500 kcal deficit,
// never below 1 200 kcal for women and 1 500 for men; 66 kcal per point, clamped to 18–45.
export function energyBudget({ sex, age, height, kg, pal }){
  const bmr=10*kg+6.25*height-5*age+(sex==="kvinna"?-161:5);
  const keep=bmr*pal, floor=sex==="kvinna"?1200:1500;
  const target=Math.max(floor, keep-500);
  const pts=Math.min(45,Math.max(18,Math.round(target/66)));
  return { keep, target, pts };
}

// Sunrise and sunset (minutes after local midnight) from NOAA's approximation.
export function sunTimes(ds,lat,lon){
  const d=new Date(ds+"T12:00:00"); const N=Math.floor((d-new Date(d.getFullYear(),0,0))/864e5);
  const g=2*Math.PI/365*(N-0.5), r=Math.PI/180;
  const eqt=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
  const decl=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
  const off=-d.getTimezoneOffset(), noon=720-4*lon-eqt+off;
  const cosH=(Math.cos(90.833*r)-Math.sin(lat*r)*Math.sin(decl))/(Math.cos(lat*r)*Math.cos(decl));
  if(cosH>1) return {noon,polar:true}; if(cosH<-1) return {noon,midnight:true};
  const ha=Math.acos(cosH)/r; return {noon,rise:noon-4*ha,set:noon+4*ha,len:8*ha};
}

// "2 dl", "150 g", "1 st" → {amt, unit}; portions like "valfri mängd" → null.
const UNIT_RE=/(\d+(?:[.,]\d+)?)\s*(g|dl|cl|msk|tsk|st)\b/;
export function parseUnit(por){ const m=String(por||"").match(UNIT_RE); return m? {amt:parseFloat(m[1].replace(",",".")),unit:m[2]} : null; }

// An empty diary, the same shape the artifact stored.
export function blank(){ return { settings:{name:"",height:null,goal:null,daily:23,weekly:30,sex:"kvinna",age:null,pal:"1.4"}, days:{}, weights:[], measures:[], rewards:[], focus:{}, favs:[], meals:[], recipes:[], bites:[{id:"b1",name:"Pralin",portion:"1 st",points:2},{id:"b2",name:"Tryffel",portion:"1 st",points:3},{id:"b3",name:"Chokladbit",portion:"10 g",points:2},{id:"b4",name:"Kakbit",portion:"liten bit",points:2},{id:"b5",name:"Kaffe med mjölk",portion:"1 kopp",points:1}], updatedAt:0 }; }

// Fills in missing parts so older or partial documents (e.g. an imported copy) work.
export function normalize(data){
  const S=Object.assign(blank(), data||{});
  S.settings=Object.assign(blank().settings, S.settings||{});
  for(const k of ["weights","measures","rewards","favs","meals","recipes","bites"]) if(!Array.isArray(S[k])) S[k]=[];
  if(!S.days||typeof S.days!=="object"||Array.isArray(S.days)) S.days={};
  if(!S.focus||typeof S.focus!=="object") S.focus={};
  for(const d of Object.values(S.days)){ if(!Array.isArray(d.foods)) d.foods=[]; if(!Array.isArray(d.acts)) d.acts=[]; }
  return S;
}

// Does an imported file look like a Tallriken diary?
export const looksLikeDiary = x => !!x && typeof x==="object" && !Array.isArray(x) &&
  typeof x.days==="object" && x.days!==null && typeof x.settings==="object" && x.settings!==null;

// ---------- Weight chart ----------
// Mean of the weighings in the last `days` days (inclusive) at each weighing: a calm trend line
// that daily water-weight swings do not jerk around. points: [{date, kg}] sorted by date.
export function trendLine(points, days=7){
  const out=[]; let j=0, sum=0;
  for(let i=0;i<points.length;i++){
    sum+=points[i].kg;
    const from=addDays(points[i].date,-(days-1));
    while(points[j].date<from){ sum-=points[j].kg; j++; }
    out.push({date:points[i].date, kg:sum/(i-j+1)});
  }
  return out;
}

// Round axis values between lo and hi, about n of them (steps of 1, 2, 2.5 or 5 × 10^k).
export function niceTicks(lo,hi,n=4){
  const raw=(hi-lo||1)/n, mag=10**Math.floor(Math.log10(raw));
  const step=[1,2,2.5,5,10].map(m=>m*mag).find(s=>s>=raw-1e-12);
  const ticks=[]; for(let v=Math.ceil(lo/step-1e-9)*step; v<=hi+1e-9; v+=step) ticks.push(Math.round(v*1e6)/1e6);
  return ticks;
}

// Dates to label on a time axis from..to: Mondays for short spans, new years for spans over two
// years, else month starts; thinned to at most `max` labels.
export function timeTicks(from,to,max=6){
  const days=(new Date(to+"T12:00:00")-new Date(from+"T12:00:00"))/864e5;
  let all=[];
  if(days<=45){ for(let d=mondayOf(from); d<=to; d=addDays(d,7)) if(d>=from) all.push(d); }
  else if(days>730){ for(let y=+from.slice(0,4)+1; y<=+to.slice(0,4); y++) all.push(y+"-01-01"); }
  else{
    let [y,m]=from.split("-").map(Number);
    for(;;){ const d=y+"-"+String(m).padStart(2,"0")+"-01"; if(d>to) break; if(d>=from) all.push(d); m++; if(m>12){ m=1; y++; } }
  }
  const step=Math.max(1,Math.ceil(all.length/max));
  return all.filter((_,i)=>i%step===0);
}

// Weighings grouped per ISO week: the mean (or the last value) of each week, placed on its
// Thursday so the point sits mid-week. For long periods, where daily values are just noise.
export function byWeek(points, how="mean"){
  const out=[]; let cur=null;
  for(const p of points){
    const mon=mondayOf(p.date);
    if(!cur || cur.from!==mon){ cur={from:mon, date:addDays(mon,3), sum:0, n:0, last:0}; out.push(cur); }
    cur.sum+=p.kg; cur.n++; cur.last=p.kg;
  }
  return out.map(w=>({date:w.date, from:w.from, n:w.n, kg: how==="last"? w.last : w.sum/w.n}));
}

// The weighing a weight journey starts from: the first one on or after startDate, else the first.
export function startWeight(sorted, startDate){
  if(!sorted.length) return null;
  return (startDate && sorted.find(w=>w.date>=startDate)) || sorted[0];
}
