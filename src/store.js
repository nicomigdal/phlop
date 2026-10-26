import { command, demoState, rosterState, DEFAULT_PASSWORD } from './domain';
// `npm run demo` runs Vite in "demo" mode: separate storage so synthetic data never touches real local data.
export const DEMO=import.meta.env.MODE==='demo';
const KEY=DEMO?'phlop:demo:v1':'phlop:data:v1',AUTH=DEMO?'phlop:demo-auth:v1':'phlop:auth:v1';
export function load(){
  const raw=localStorage.getItem(KEY);
  if(!raw)return DEMO?startDemo():{state:rosterState(),mode:'local',actorId:null};
  const data=JSON.parse(raw);if(data.state?.schema!==1||!Array.isArray(data.state.audit))throw Error('הנתונים השמורים אינם תקינים. יש לשחזר גיבוי; הנתונים לא נמחקו.');
  // Data from before the fixed roster has no phone logins; keep a copy aside and start from the roster.
  if(!data.state.users.some(u=>u.phone)){localStorage.setItem('phlop:legacy:v1',raw);return {state:rosterState(),mode:'local',actorId:null};}
  return data;
}
export function save(data){localStorage.setItem(KEY,JSON.stringify(data));}
export async function mutate(actorId,action,operationId){
  const work=()=>{const data=load();const state=command(data.state,actorId,action,operationId);save({...data,state});return state;};
  if(navigator.locks)return navigator.locks.request(KEY,work);
  throw Error('הדפדפן אינו תומך בנעילת פעולות בטוחה. יש לפתוח בדפדפן מעודכן.');
}
export function startDemo(){const data={state:demoState(),mode:'demo',actorId:'u0506451339'};save(data);localStorage.removeItem(AUTH);return data;}
export function download(text,name,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

// Local-mode passwords: salted SHA-256 per user, kept outside the shared action log.
const hashes=()=>{try{return JSON.parse(localStorage.getItem(AUTH))||{}}catch{return {}}};
async function digest(id,password){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`phlop:${id}:${password}`));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export const hasPassword=id=>!!hashes()[id];
export async function checkPassword(id,password){const stored=hashes()[id];return stored?stored===await digest(id,password):password===DEFAULT_PASSWORD;}
export async function setPassword(id,password){localStorage.setItem(AUTH,JSON.stringify({...hashes(),[id]:await digest(id,password)}));}
export function resetPassword(id){const all=hashes();delete all[id];localStorage.setItem(AUTH,JSON.stringify(all));}
