import { command, replay } from './domain';

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
    async subscribe(){unsubscribe?.();try{await ensureOwner();unsubscribe=dbSDK.onSnapshot(eventsQuery,snapshot=>{const {state,rejected}=replay(decode(snapshot),ownerId);onState(state);if(rejected.length)onError(Error(`${rejected.length} פעולות לא תקינות נדחו בחישוב היומן. יש לבדוק עם מנהל הקבוצה.`));},e=>onError(Error('אין גישה לקבוצה. יש לוודא שהאימייל שלך נוסף לרשימת החברים ושכללי Firebase פורסמו. '+e.code)));}catch(e){onError(e)}},
    async login(email,password,name){
      let result;
      if(name){result=await authSDK.createUserWithEmailAndPassword(auth,email,password);await authSDK.updateProfile(result.user,{displayName:name});await authSDK.sendEmailVerification(result.user);}
      else result=await authSDK.signInWithEmailAndPassword(auth,email,password);
      if(!result.user.emailVerified){const group=await dbSDK.getDoc(metaRef).catch(()=>null);if(!group||group.data().ownerUid!==result.user.uid){await authSDK.signOut(auth);throw Error('נשלח קישור אימות לאימייל. יש לאמת את האימייל ולהיכנס שוב. אין צורך ב־SMS.');}}
      const events=decode(await dbSDK.getDocsFromServer(eventsQuery));
      await ensureOwner();
      if(!replay(events,ownerId).state.users.some(u=>u.id===result.user.uid))await send({type:'register',name:name||result.user.displayName||email.split('@')[0]});
    },
    logout:()=>authSDK.signOut(auth),
    resetPassword:email=>authSDK.sendPasswordResetEmail(auth,email),
    async invite(email){const meta=await dbSDK.getDoc(metaRef);await dbSDK.updateDoc(metaRef,{allowedEmails:[...new Set([...meta.data().allowedEmails,email.trim().toLowerCase()])]});}
  };
}
