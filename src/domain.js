export const uid = () => crypto.randomUUID();
export const money = (v, signed = false) => `${signed && v > 0 ? '+' : v < 0 ? '−' : ''}${(Math.abs(v) / 100).toLocaleString('he-IL', {maximumFractionDigits: 2})} ₪`;
export const date = (v, time = false) => new Intl.DateTimeFormat('he-IL', {timeZone:'Asia/Jerusalem', day:'2-digit', month:'2-digit', year:'numeric', ...(time ? {hour:'2-digit',minute:'2-digit'} : {})}).format(new Date(v));
export const month = v => israelDay(v).slice(0,7);
export const israelDay=v=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(v));const get=t=>p.find(x=>x.type===t).value;return `${get('year')}-${get('month')}-${get('day')}`;};
export function israelLocalToISO(value){
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value),'תאריך לא תקין');
  // Resolve Israel's DST rather than assuming a constant UTC+02 offset.
  const target=Date.parse(value+'Z');
  for(const offset of [3,2]){const candidate=new Date(target-offset*3600000);const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(candidate).replace(' ','T');if(parts===value)return candidate.toISOString();}
  throw Error('השעה הזו אינה קיימת עקב המעבר לשעון קיץ. יש לבחור שעה אחרת');
}
export function cents(value, allowZero = false) {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw Error('יש להזין סכום תקין עם עד שתי ספרות אחרי הנקודה');
  const [a,b=''] = text.split('.'); const n = Number(a)*100 + Number(b.padEnd(2,'0'));
  if (!Number.isSafeInteger(n) || n > 100000000 || n < (allowZero ? 0 : 1)) throw Error('הסכום חייב להיות חיובי ועד מיליון ₪');
  return n;
}
const check = (condition, message) => { if (!condition) throw Error(message); };
const amount = (n, zero = false) => check(Number.isSafeInteger(n) && n >= (zero ? 0 : 1) && n <= 100000000, 'סכום לא תקין');
export const emptyState = () => ({schema:1,revision:0,users:[],sessions:[],entries:[],requests:[],audit:[],notifications:[],operations:[]});
export const buyTotal = (s,id) => s.buyins.filter(b=>b.userId===id).reduce((n,b)=>n+b.amount,0);
export function calculate(s, finals, distribute = false) {
  check(s.players.length > 0,'אין משתתפים בישיבה');
  const ids=[...s.players].sort();
  for(const id of ids) amount(finals[id],true);
  const delta = ids.reduce((n,id)=>n + buyTotal(s,id)-finals[id],0);
  check(distribute || delta===0,`הסכומים אינם מאוזנים. הפרש: ${money(delta,true)}`);
  const base=Math.trunc(delta/ids.length), remainder=delta-base*ids.length;
  return ids.map((id,i)=>({userId:id,buyin:buyTotal(s,id),final:finals[id],adjustment:base+(i<Math.abs(remainder)?Math.sign(remainder):0),net:finals[id]-buyTotal(s,id)+base+(i<Math.abs(remainder)?Math.sign(remainder):0)}));
}
export function settle(results) {
  check(results.reduce((n,r)=>n+r.net,0)===0,'התוצאות חייבות להתאזן');
  const positive=results.filter(r=>r.net>0).map(r=>({id:r.userId,v:r.net}));
  const negative=results.filter(r=>r.net<0).map(r=>({id:r.userId,v:-r.net}));
  const transfers=[];
  // Exact matches first; greedy largest balance thereafter. At most n-1 transfers.
  for(const d of negative) {const c=positive.find(c=>c.v===d.v && c.v>0); if(c){transfers.push({from:d.id,to:c.id,amount:d.v});d.v=0;c.v=0;}}
  while(true){positive.sort((a,b)=>b.v-a.v||a.id.localeCompare(b.id));negative.sort((a,b)=>b.v-a.v||a.id.localeCompare(b.id)); const c=positive[0],d=negative[0];if(!c?.v||!d?.v)break;const n=Math.min(c.v,d.v);transfers.push({from:d.id,to:c.id,amount:n});c.v-=n;d.v-=n;}
  return transfers;
}
export function validateTransfers(results, transfers) {
  const balances=Object.fromEntries(results.map(r=>[r.userId,0]));
  for(const t of transfers){amount(t.amount);check(t.from!==t.to && t.from in balances && t.to in balances,'צדדי העברה לא תקינים');balances[t.from]-=t.amount;balances[t.to]+=t.amount;}
  check(results.every(r=>balances[r.userId]===r.net),'תוכנית ההעברות אינה תואמת את התוצאות');
}
export function balance(state,a,b) {return state.entries.reduce((n,e)=>n+(e.from===a&&e.to===b?e.amount:e.from===b&&e.to===a?-e.amount:0),0);}
export function debts(state,id) {return state.users.filter(u=>u.id!==id).map(u=>({user:u,amount:balance(state,id,u.id)})).filter(d=>d.amount!==0);}
export function statistics(state,id,from='',to='') {
  const ss=state.sessions.filter(s=>s.status==='closed'&&s.results.some(r=>r.userId===id)&&(!from||israelDay(s.date)>=from)&&(!to||israelDay(s.date)<=to)).sort((a,b)=>a.date.localeCompare(b.date));
  const rr=ss.map(s=>s.results.find(r=>r.userId===id));const sum=key=>rr.reduce((n,r)=>n+r[key],0);const wins=rr.filter(r=>r.net>0),losses=rr.filter(r=>r.net<0);
  let ws=0,ls=0,maxW=0,maxL=0;rr.forEach(r=>{ws=r.net>0?ws+1:0;ls=r.net<0?ls+1:0;maxW=Math.max(maxW,ws);maxL=Math.max(maxL,ls);});
  return {sessions:ss,results:rr,total:sum('net'),buyins:sum('buyin'),count:rr.length,wins:wins.length,losses:losses.length,winRate:rr.length?Math.round(wins.length/rr.length*100):0,average:rr.length?Math.round(sum('net')/rr.length):0,averageLoss:losses.length?Math.round(losses.reduce((n,r)=>n+r.net,0)/losses.length):0,best:rr.length?Math.max(...rr.map(r=>r.net)):0,worst:rr.length?Math.min(...rr.map(r=>r.net)):0,rebuys:ss.reduce((n,s)=>n+Math.max(0,s.buyins.filter(b=>b.userId===id).length-1),0),maxW,maxL};
}
export function command(state, actorId, action, operationId=uid(), now=new Date().toISOString()) {
  check(operationId && typeof operationId==='string','חסר מזהה פעולה');
  if(state.operations.includes(operationId)) return state;
  const d=structuredClone(state); const actor=d.users.find(u=>u.id===actorId);
  const admin=actor?.role==='admin'; const user=id=>{const u=d.users.find(u=>u.id===id);check(u&&!u.disabled,'משתמש לא נמצא או אינו פעיל');return u;};
  let s=action.sessionId?d.sessions.find(s=>s.id===action.sessionId):null;
  const host=()=>check(admin||s?.host===actorId,'הפעולה מותרת למארח או לאדמין בלבד');
  const active=()=>check(s&&s.status==='active','הישיבה אינה פעילה');
  const notify=(id,text)=>d.notifications.push({id:`${operationId}-n-${d.notifications.length}`,userId:id,text,date:now});
  const entry=(t,kind,sessionId=null)=>d.entries.push({...t,id:`${operationId}-e-${d.entries.length}`,kind,sessionId,date:now,actorId});
  if(action.type!=='register') check(actor&&!actor.disabled,'יש לבחור משתמש פעיל');
  const before=s?structuredClone(s):null;
  switch(action.type){
    case 'register': {
      check(!d.users.some(u=>u.id===actorId),'המשתמש כבר קיים');check(typeof action.name==='string'&&action.name.trim().length>=2&&action.name.length<=40,'יש להזין שם באורך 2–40 תווים');
      d.users.push({id:actorId,name:action.name.trim(),role:d.users.length?'user':'admin',joined:now,color:d.users.length%6,avatar:''});break;
    }
    case 'profile': check(action.name?.trim().length>=2&&action.name.length<=40,'השם קצר מדי או ארוך מדי');actor.name=action.name.trim();if(action.avatar!==undefined){check(/^$|^https:\/\//.test(action.avatar)&&action.avatar.length<1000,'יש להזין כתובת תמונה מאובטחת');actor.avatar=action.avatar;}break;
    case 'create': {
      check(action.name?.trim()&&action.name.length<=80,'יש להזין שם ישיבה');check(!d.sessions.some(x=>x.id===action.id),'ישיבה כבר קיימת');amount(action.amount);
      check(Number.isFinite(Date.parse(action.date)),'תאריך לא תקין');
      s={id:action.id,name:action.name.trim(),host:actorId,date:action.date,notes:(action.notes||'').slice(0,500),code:action.code,status:action.waiting?'waiting':'active',players:[actorId],buyins:[{id:operationId,userId:actorId,amount:action.amount,date:now}],results:[],transfers:[],version:1};d.sessions.push(s);break;
    }
    case 'start': host();check(s?.status==='waiting','הישיבה כבר התחילה');s.status='active';break;
    case 'join': check(s&&['waiting','active'].includes(s.status),'הישיבה אינה פתוחה להצטרפות');check(!s.players.includes(actorId),'כבר הצטרפת לישיבה');amount(action.amount);s.players.push(actorId);s.buyins.push({id:operationId,userId:actorId,amount:action.amount,date:now});break;
    case 'buyin': active();check(s.players.includes(action.userId),'המשתמש אינו משתתף');check(action.userId===actorId||admin||s.host===actorId,'אין הרשאה להוסיף כניסה עבור שחקן אחר');amount(action.amount);s.buyins.push({id:operationId,userId:action.userId,amount:action.amount,date:now});break;
    case 'close': case 'correct': {
      check(s,'הישיבה לא נמצאה');if(action.type==='correct'){check(admin,'רק אדמין יכול לתקן תוצאה סגורה');check(s.status==='closed','הישיבה אינה סגורה');check(action.reason?.trim(),'חובה לציין סיבה לתיקון');}else{host();active();}
      check(action.version===s.version,'הישיבה השתנתה. יש לרענן את התוצאות לפני אישור');
      const results=calculate(s,action.finals,!!action.distribute);const transfers=action.transfers||settle(results);validateTransfers(results,transfers);
      if(action.type==='correct')for(const t of s.transfers)entry({from:t.to,to:t.from,amount:t.amount,reason:action.reason},'correction',s.id);
      for(const t of transfers)entry(t,action.type==='correct'?'correction':'game',s.id);
      s.results=results;s.transfers=transfers;s.status='closed';s.closedAt=now;
      for(const id of s.players)notify(id,`${action.type==='correct'?'תוקנו':'פורסמו'} תוצאות ${s.name}`);break;
    }
    case 'request': {
      check(['manual','payment'].includes(action.kind),'סוג בקשה לא תקין');user(action.from);user(action.to);check(action.from!==action.to,'לא ניתן ליצור חוב לעצמך');check([action.from,action.to].includes(actorId),'אין הרשאה לבקש פעולה עבור אחרים');amount(action.amount);check(action.reason?.trim()||action.kind==='payment','יש לציין סיבה לחוב');
      if(action.kind==='payment'){check(balance(d,action.from,action.to)>=action.amount,'התשלום גבוה מהחוב הפתוח');check(!d.requests.some(r=>r.status==='pending'&&r.kind==='payment'&&r.from===action.from&&r.to===action.to),'כבר קיימת בקשת תשלום ממתינה מול שחקן זה');}
      const target=actorId===action.from?action.to:action.from;
      d.requests.push({id:operationId,kind:action.kind,from:action.from,to:action.to,amount:action.amount,reason:(action.reason||'').slice(0,300),date:now,status:'pending',initiator:actorId,target});notify(target,action.kind==='manual'?'בקשת חוב חדשה ממתינה לאישור שלך':'בקשת אישור תשלום חדשה');break;
    }
    case 'resolve': {
      const r=d.requests.find(r=>r.id===action.id);check(r?.status==='pending','הבקשה כבר טופלה');check(['approved','rejected','cancelled'].includes(action.status),'סטטוס לא תקין');check(action.status==='cancelled'?r.initiator===actorId:r.target===actorId,'רק הצד השני יכול לאשר או לדחות בקשה');
      if(action.status==='approved'){if(r.kind==='payment'){check(balance(d,r.from,r.to)>=r.amount,'החוב השתנה. סכום התשלום גבוה מהיתרה הנוכחית');entry({from:r.to,to:r.from,amount:r.amount,reason:r.reason,requestId:r.id},'payment');}else entry({from:r.from,to:r.to,amount:r.amount,reason:r.reason,requestId:r.id},'manual');}
      r.status=action.status;r.resolvedBy=actorId;r.resolvedAt=now;notify(r.initiator,`הבקשה ${action.status==='approved'?'אושרה':action.status==='rejected'?'נדחתה':'בוטלה'}`);break;
    }
    case 'remind': {
      user(action.userId);check(balance(d,action.userId,actorId)>0,'אין חוב פתוח של שחקן זה כלפיך');const last=d.audit.findLast(a=>a.actorId===actorId&&a.action.type==='remind'&&a.action.userId===action.userId);check(!last||Date.parse(now)-Date.parse(last.date)>=86400000,'ניתן לשלוח תזכורת אחת ביום לכל חבר');notify(action.userId,`${actor.name} שלח לך תזכורת ידידותית להסדרת החוב`);break;
    }
    case 'role': check(admin,'הפעולה מותרת לאדמין בלבד');check(['host','user','admin'].includes(action.role),'הרשאה לא תקינה');check(action.userId!==actorId,'לא ניתן לשנות את ההרשאה של עצמך');user(action.userId).role=action.role;break;
    case 'host': host();check(s?.status!=='closed','הישיבה סגורה');check(s.players.includes(action.userId),'המארח חייב להשתתף בישיבה');s.host=action.userId;break;
    default: throw Error('פעולה לא מוכרת');
  }
  if(s && action.type!=='create')s.version++;
  d.audit.push({id:operationId,actorId,date:now,action:structuredClone(action),before,after:s?structuredClone(s):null});d.operations.push(operationId);d.revision++;
  return d;
}
export function replay(events,ownerId) {let state=emptyState(); const rejected=[]; for(const event of events){try{if(ownerId&&!state.users.some(u=>u.id===ownerId))check(event.actorId===ownerId&&event.action.type==='register','בעל הקבוצה חייב להיות המשתמש הראשון');state=command(state,event.actorId,event.action,event.id,event.date);}catch(e){rejected.push({id:event.id,error:e.message});}}return {state,rejected};}
export function demoState() {
  let d=emptyState();let k=0;const run=(a,action,date)=>{d=command(d,a,action,`demo-${++k}`,date||'2026-10-26T16:00:00.000Z');};
  ['ניקו','נתי','דניאל','יובל','עומר','איתי'].forEach((name,i)=>run(`p${i}`,{type:'register',name},'2026-07-01T12:00:00.000Z'));
  const history=[['2026-08-20',150,-100,-50,0],['2026-08-27',-80,150,-50,-20],['2026-09-03',220,-120,-50,-50],['2026-09-10',-100,-100,150,50],['2026-09-17',180,-50,-80,-50],['2026-09-24',130,-100,50,-80],['2026-10-01',250,-150,-50,-50],['2026-10-08',-100,200,-50,-50],['2026-10-15',320,-150,-100,-70],['2026-10-22',180,-80,-50,-50]];
  history.forEach(([day,...nets],i)=>{const id=`h${i}`,dt=day+'T18:00:00.000Z';run('p0',{type:'create',id,name:i%2?'חמישי אצל ניקו':'פוקר עם החבר׳ה',date:dt,code:`HIS${i}`,amount:30000},dt);for(let p=1;p<4;p++)run(`p${p}`,{type:'join',sessionId:id,amount:30000},dt);const s=d.sessions.find(s=>s.id===id);run('p0',{type:'close',sessionId:id,version:s.version,finals:Object.fromEntries(nets.map((v,p)=>[`p${p}`,30000+v*100]))},dt);});
  for(const debt of debts(d,'p0').filter(x=>x.amount<0)){const value=-debt.amount-20000;if(value>0){run(debt.user.id,{type:'request',kind:'payment',from:debt.user.id,to:'p0',amount:value,reason:'העברה בביט'});const r=d.requests.at(-1);run('p0',{type:'resolve',id:r.id,status:'approved'});}}
  run('p0',{type:'create',id:'live',name:'החמישייה הפותחת',date:'2026-10-26T16:00:00.000Z',amount:20000,code:'FLOP26',notes:'הקלפים על השולחן. הערב אצל ניקו ♠'});
  for(let p=1;p<6;p++)run(`p${p}`,{type:'join',sessionId:'live',amount:20000});run('p1',{type:'buyin',sessionId:'live',userId:'p1',amount:10000});run('p2',{type:'buyin',sessionId:'live',userId:'p2',amount:5000});
  run('p1',{type:'request',kind:'payment',from:'p1',to:'p0',amount:10000,reason:'שלחתי בביט, תבדוק שקיבלת 🙌'});run('p3',{type:'request',kind:'manual',from:'p0',to:'p3',amount:6000,reason:'הפיצה של הערב'});return d;
}
