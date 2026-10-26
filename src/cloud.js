import { command, replay, ROSTER, DEFAULT_PASSWORD, normalizePhone } from './domain';

export const accountEmail=phone=>`${phone}@phlop.app`;
const secret=password=>`phlop-${password}`;

// Ordered immutable commands are the source of truth. Never trust a client-written balance.
// Firestore verifies identity, membership, immutable history and atomic sequencing.
// Every client derives the same accepted ledger with the versioned domain reducer.
export async function connectCloud({onAuth,onState,onError}) {
  const response=await fetch(import.meta.env.BASE_URL+'firebase-config.json',{cache:'no-store'});
  if(!response.ok)return null;
  const config=await response.json();
  if(!config.apiKey||!config.projectId||!config.groupId)return null;
  const [appSDK,authSDK,dbSDK]=await Promise.all([
    import('firebase/app'),import('firebase/auth'),import('firebase/firestore')
  ]);
  const app=appSDK.initializeApp(config);
  const auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app);
  const metaRef=dbSDK.doc(db,'groups',config.groupId);
  const eventsRef=dbSDK.collection(metaRef,'events');
  const eventsQuery=dbSDK.query(eventsRef,dbSDK.orderBy('sequence'));
  let unsubscribe=null,ownerId=null;
  async function ensureOwner(){const meta=await dbSDK.getDocFromServer(metaRef);if(!meta.exists())throw Error('הקבוצה עדיין לא הוגדרה');ownerId=meta.data().ownerUid;return ownerId;}
  const decode=snapshot=>snapshot.docs.filter(d=>!d.metadata.hasPendingWrites&&d.data().date).map(d=>({...d.data(),id:d.id,date:d.data().date.toDate().toISOString()}));
  async function send(action,id=crypto.randomUUID()) {
    if(!auth.currentUser)throw Error('יש להתחבר מחדש');
    for(let attempt=0;attempt<5;attempt++){
      await ensureOwner();
      const snapshot=await dbSDK.getDocsFromServer(eventsQuery),events=decode(snapshot),{state}=replay(events,ownerId);
      try{
        await dbSDK.runTransaction(db,async tx=>{
          const eventRef=dbSDK.doc(eventsRef,id);
          const [meta,existing]=await Promise.all([tx.get(metaRef),tx.get(eventRef)]);
          if(existing.exists())return;
          if(!meta.exists())throw Error('הקבוצה עדיין לא הוגדרה ב־Firebase');
          if(meta.data().sequence!==events.length)throw Error('RETRY_SNAPSHOT');
          command(state,auth.currentUser.uid,action,id);
          const sequence=meta.data().sequence+1;
          tx.set(eventRef,{actorId:auth.currentUser.uid,action,sequence,date:dbSDK.serverTimestamp()});
          tx.update(metaRef,{sequence,lastEvent:id,updatedAt:dbSDK.serverTimestamp()});
        });return;
      }catch(e){if(e.message==='RETRY_SNAPSHOT'&&attempt<4)continue;throw e;}
    }
  }
  authSDK.onAuthStateChanged(auth,u=>{if(!u){unsubscribe?.();unsubscribe=null;}onAuth(u)});
  return {
    send,
    async subscribe(){unsubscribe?.();try{await ensureOwner();unsubscribe=dbSDK.onSnapshot(eventsQuery,snapshot=>{const {state,rejected}=replay(decode(snapshot),ownerId);onState(state);if(rejected.length)onError(Error(`${rejected.length} פעולות לא תקינות נדחו בחישוב היומן. יש לבדוק עם מנהל הקבוצה.`));},e=>onError(Error('אין גישה לקבוצה. יש לוודא שמספר הטלפון שלך נוסף לרשימת החברים ושכללי Firebase פורסמו. '+e.code)));}catch(e){onError(e)}},
    // Accounts are keyed by phone. Firebase needs an email and a 6+ character password, so both are derived.
    async login(phone,password){
      const member=ROSTER.find(r=>r.phone===normalizePhone(phone));if(!member)throw Error('מספר הטלפון אינו ברשימת המשתתפים');
      const email=accountEmail(member.phone);let result;
      try{result=await authSDK.signInWithEmailAndPassword(auth,email,secret(password));}
      catch(e){
        if(password!==DEFAULT_PASSWORD||!['auth/invalid-credential','auth/user-not-found','auth/invalid-login-credentials'].includes(e.code))throw Error('מספר הטלפון או הסיסמה שגויים');
        try{result=await authSDK.createUserWithEmailAndPassword(auth,email,secret(password));}catch{throw Error('מספר הטלפון או הסיסמה שגויים');}
      }
      const events=decode(await dbSDK.getDocsFromServer(eventsQuery));
      await ensureOwner();
      if(!replay(events,ownerId).state.users.some(u=>u.id===result.user.uid))await send({type:'register',phone:member.phone});
    },
    async changePassword(password){if(!auth.currentUser)throw Error('יש להתחבר מחדש');await authSDK.updatePassword(auth.currentUser,secret(password));await send({type:'password'});},
    logout:()=>authSDK.signOut(auth),
    async invite(email){const meta=await dbSDK.getDoc(metaRef);await dbSDK.updateDoc(metaRef,{allowedEmails:[...new Set([...meta.data().allowedEmails,email.trim().toLowerCase()])]});}
  };
}
