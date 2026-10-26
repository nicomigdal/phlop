import React,{useState} from 'react';
import {CalendarDays} from 'lucide-react';
import {month,money} from './domain';

export default function MonthlySummary({state}){
  const [selected,setSelected]=useState(month(new Date()));
  const games=state.sessions.filter(s=>s.status==='closed'&&month(s.date)===selected);
  const players=state.users.map(u=>({user:u,net:games.reduce((n,s)=>n+(s.results.find(r=>r.userId===u.id)?.net||0),0)})).sort((a,b)=>b.net-a.net);
  return <section className="panel"><div className="section-title"><div><h2>דוח החודש של הסקוואד</h2><p>היתרות נגררות מחודש לחודש, בלי איפוס ובלי מחיקת היסטוריה.</p></div><CalendarDays size={19}/></div><div className="toolbar"><label className="field">בחירת חודש<input type="month" value={selected} onChange={e=>e.target.value&&setSelected(e.target.value)}/></label></div><div className="detail-metrics"><div><small>מספר משחקים בקבוצה</small><strong>{games.length}</strong></div><div><small>מוביל החודש</small><strong>{games.length?players[0]?.user.name:'—'}</strong></div></div>{players.map(p=><div className="activity" key={p.user.id}><strong>{p.user.name}</strong><b dir="ltr" className={p.net>=0?'positive':'negative'}>{money(p.net,true)}</b></div>)}</section>
}
