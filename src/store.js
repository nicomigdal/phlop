import { command, emptyState, demoState } from './domain';
const KEY='phlop:data:v1';
export function load(){const raw=localStorage.getItem(KEY);if(!raw)return {state:emptyState(),mode:'local',actorId:null};const data=JSON.parse(raw);if(data.state?.schema!==1||!Array.isArray(data.state.audit))throw Error('הנתונים השמורים אינם תקינים. יש לשחזר גיבוי; הנתונים לא נמחקו.');return data;}
export function save(data){localStorage.setItem(KEY,JSON.stringify(data));}
export async function mutate(actorId,action,operationId){
  const work=()=>{const data=load();const state=command(data.state,actorId,action,operationId);save({...data,state});return state;};
  if(navigator.locks)return navigator.locks.request(KEY,work);
  throw Error('הדפדפן אינו תומך בנעילת פעולות בטוחה. יש לפתוח בדפדפן מעודכן.');
}
export function startDemo(){const data={state:demoState(),mode:'demo',actorId:'p0'};save(data);return data;}
export function download(text,name,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function csv(rows,name){const escape=v=>'"'+String(v??'').replace(/^[=+@\-]/,"'$&").replaceAll('"','""')+'"';download('\uFEFF'+rows.map(r=>r.map(escape).join(',')).join('\r\n'),name,'text/csv;charset=utf-8');}
