import React,{useState} from 'react';
import {CalendarDays,Download} from 'lucide-react';
import {month,money,balance,statistics} from './domain';
import {csv} from './store';

export default function MonthlySummary({state,actorId,report=false}){
  const [selected,setSelected]=useState(month(new Date()));
  const before={...state,entries:state.entries.filter(e=>month(e.date)<selected)};
  const through={...state,entries:state.entries.filter(e=>month(e.date)<=selected)};
  const summarize=data=>state.users.filter(u=>u.id!==actorId).map(u=>balance(data,actorId,u.id)).reduce((a,b)=>({owed:a.owed+Math.max(0,b),receive:a.receive+Math.max(0,-b)}),{owed:0,receive:0});
  const opening=summarize(before),closing=summarize(through);
  const payments=state.entries.filter(e=>e.kind==='payment'&&month(e.date)===selected);
  const paid=payments.filter(e=>e.to===actorId).reduce((n,e)=>n+e.amount,0),received=payments.filter(e=>e.from===actorId).reduce((n,e)=>n+e.amount,0);
  const games=state.sessions.filter(s=>s.status==='closed'&&month(s.date)===selected);
  const players=state.users.map(u=>({user:u,net:games.reduce((n,s)=>n+(s.results.find(r=>r.userId===u.id)?.net||0),0),buyin:games.reduce((n,s)=>n+(s.results.find(r=>r.userId===u.id)?.buyin||0),0)})).sort((a,b)=>b.net-a.net);
  return <section className="panel"><div className="section-title"><div><h2>{report?'דוח החודש של החבר׳ה':'החובות לאורך החודשים'}</h2><p>היתרות נגררות מחודש לחודש, בלי איפוס ובלי מחיקת היסטוריה.</p></div><CalendarDays size={19}/></div><div className="toolbar"><label className="field">בחירת חודש<input type="month" value={selected} onChange={e=>e.target.value&&setSelected(e.target.value)}/></label>{report&&<button className="secondary" onClick={()=>csv([['חודש','שחקן','סך כניסות','רווח/הפסד'],...players.map(p=>[selected,p.user.name,p.buyin/100,p.net/100])],`phlop-month-${selected}.csv`)}><Download size={16}/>ייצוא דוח חודשי</button>}</div>{report?<><div className="detail-metrics"><div><small>מספר ערבים בקבוצה</small><strong>{games.length}</strong></div><div><small>סך הכניסות</small><strong>{money(players.reduce((n,p)=>n+p.buyin,0))}</strong></div><div><small>מוביל החודש</small><strong>{games.length?players[0]?.user.name:'—'}</strong></div></div>{players.map(p=><div className="activity" key={p.user.id}><strong>{p.user.name}</strong><b dir="ltr" className={p.net>=0?'positive':'negative'}>{money(p.net,true)}</b></div>)}</>:<div className="detail-metrics"><div><small>חייבים לי מתחילת החודש</small><strong>{money(opening.receive)}</strong></div><div><small>אני חייב מתחילת החודש</small><strong>{money(opening.owed)}</strong></div><div><small>תשלומים שקיבלתי בחודש</small><strong>{money(received)}</strong></div><div><small>תשלומים ששילמתי בחודש</small><strong>{money(paid)}</strong></div><div><small>חייבים לי בסוף החודש</small><strong className="positive">{money(closing.receive)}</strong></div><div><small>אני חייב בסוף החודש</small><strong>{money(closing.owed)}</strong></div></div>}</section>
}
