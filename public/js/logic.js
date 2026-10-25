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
