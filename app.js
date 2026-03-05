import{initializeApp}from"https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import{getAuth,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut,onAuthStateChanged,updatePassword}from"https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import{getFirestore,collection,doc,addDoc,setDoc,getDoc,deleteDoc,updateDoc,query,orderBy,onSnapshot,serverTimestamp,limit}from"https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ADMIN_EMAILS=["direction@maison-hbm.com"];
const cfg={apiKey:"AIzaSyAvPM3unZiFv3wgLbi10Fx-llUpYxeuPq0",authDomain:"maisonhbm-by-joba.firebaseapp.com",projectId:"maisonhbm-by-joba",storageBucket:"maisonhbm-by-joba.firebasestorage.app",messagingSenderId:"719886808002",appId:"1:719886808002:web:048c40d577720a7d009c5b"};
const app=initializeApp(cfg);
const auth=getAuth(app);
const db=getFirestore(app);

const $=id=>document.getElementById(id);
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const ini=n=>String(n||'?').split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2)||'?';
const roleLabel=r=>r==='admin'?'Administrateur':'Utilisateur';

let me=null,myRole='user',myName='',editUserId=null;
let allNotes=[],allTodos=[],allAnns=[],allUsers=[];
let msgUnsub=null,noteFilter='all',todoFilter='all';
let pdfText='',pdfName='';
let tT,onMsgTab=false;

// ── PWA INSTALL ──────────────────────────────────────────────
let deferredPrompt=null;
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();deferredPrompt=e;
  if(!isStandalone())$('install-btn').classList.add('show');
});
window.addEventListener('appinstalled',()=>{
  deferredPrompt=null;$('install-btn').classList.remove('show');showToast('Application installée ✓');
});
window.doInstall=async()=>{
  if(!deferredPrompt)return;
  deferredPrompt.prompt();
  const{outcome}=await deferredPrompt.userChoice;
  if(outcome==='accepted'){$('install-btn').classList.remove('show');deferredPrompt=null;}
  closeProf();
};

// ── TOAST ────────────────────────────────────────────────────
window.showToast=(msg,ok=true)=>{
  $('t-ico').textContent=ok?'✓':'⚠';$('t-msg').textContent=msg;
  $('toast').classList.add('on');clearTimeout(tT);
  tT=setTimeout(()=>$('toast').classList.remove('on'),2800);
};
function fmtDate(d){
  const now=new Date(),dt=new Date(d),df=now-dt;
  if(df<60000)return"À l'instant";
  if(df<3600000)return`il y a ${Math.floor(df/60000)} min`;
  if(df<86400000)return`il y a ${Math.floor(df/3600000)}h`;
  return dt.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
}
function fmtTime(d){return new Date(d).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});}

// ── AUTH ─────────────────────────────────────────────────────
window.doLogin=async()=>{
  const email=$('a-email').value.trim(),pwd=$('a-pwd').value;
  const errEl=$('a-err'),btn=$('a-btn');
  errEl.style.display='none';
  if(!email||!pwd){errEl.textContent='Remplissez tous les champs.';errEl.style.display='block';return;}
  btn.textContent='Connexion…';btn.disabled=true;
  try{await signInWithEmailAndPassword(auth,email,pwd);}
  catch(e){
    const m={'auth/user-not-found':'Compte introuvable.','auth/wrong-password':'Mot de passe incorrect.','auth/invalid-email':'Email invalide.','auth/too-many-requests':'Trop de tentatives.','auth/invalid-credential':'Email ou mot de passe incorrect.'};
    errEl.textContent=m[e.code]||'Erreur de connexion.';errEl.style.display='block';
    btn.textContent='Se connecter';btn.disabled=false;
  }
};
window.doLogout=async()=>{await signOut(auth);closeProf();};

onAuthStateChanged(auth,async user=>{
  if(user){me=user;await upsertProfile(user);showApp();}
  else{
    me=null;myRole='user';myName='';document.body.className='';
    $('screen-app').classList.remove('active');$('screen-auth').classList.add('active');
    $('a-btn').textContent='Se connecter';$('a-btn').disabled=false;
  }
});

async function upsertProfile(user){
  const ref=doc(db,'users',user.uid);
  const snap=await getDoc(ref);
  if(!snap.exists()){
    const isAdm=ADMIN_EMAILS.includes(user.email.toLowerCase());
    const role=isAdm?'admin':'user';
    const name=isAdm?'Direction Maison HBM':(user.displayName||user.email.split('@')[0]);
    await setDoc(ref,{name,email:user.email,role,description:'',createdAt:serverTimestamp()});
    myRole=role;myName=name;
  }else{
    const d=snap.data();myRole=d.role||'user';myName=d.name||user.email.split('@')[0];
  }
}

// ── SHOW APP ─────────────────────────────────────────────────
function showApp(){
  $('screen-auth').classList.remove('active');$('screen-app').classList.add('active');
  document.body.classList.toggle('is-admin',myRole==='admin');
  const i=ini(myName);
  $('av-btn').textContent=i;$('prof-av').textContent=i;
  $('prof-name').textContent=myName;$('prof-tag').textContent=roleLabel(myRole);
  $('prof-email').textContent=me.email;
  if(isStandalone())$('install-btn').classList.remove('show');
  updateGreet();
  document.querySelectorAll('.tab-pane').forEach(p=>{if(p.id!=='tab-home')p.style.display='none';});
  $('tab-messages').style.display='none';
  startMsgs();loadNotes();loadTodos();loadAnns();loadInfos();loadUsers();
}
function updateGreet(){
  const h=new Date().getHours();
  const g=h<12?'Bonjour':h<18?'Bon après-midi':'Bonsoir';
  $('greet-name').textContent=`${g}, ${myName.split(' ')[0]} !`;
  $('greet-role').textContent=roleLabel(myRole);
  const d=new Date();
  const D=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const M=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  $('greet-date').textContent=`${D[d.getDay()]} ${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
}

// ── NAVIGATION ───────────────────────────────────────────────
window.goTab=(tab,btn)=>{
  document.querySelectorAll('.tab-pane').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  $('tab-messages').style.display='none';
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  onMsgTab=(tab==='messages');
  if(tab==='messages'){
    const el=$('tab-messages');
    el.style.display='flex';el.style.height='100%';
    clearMsgBadge();
    setTimeout(()=>{const s=$('msg-scroll');if(s)s.scrollTop=s.scrollHeight;},80);
  }else{
    const pane=$(`tab-${tab}`);
    if(pane){pane.style.display='block';pane.classList.add('active');}
  }
};

// ── MESSAGES ─────────────────────────────────────────────────
function clearMsgBadge(){
  $('msg-badge').style.display='none';
  $('ndot').classList.remove('on');
  $('s-msg').textContent='0';
}
function startMsgs(){
  if(msgUnsub)msgUnsub();
  const q=query(collection(db,'messages'),orderBy('createdAt','asc'),limit(200));
  msgUnsub=onSnapshot(q,snap=>{
    const msgs=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderMsgs(msgs);
    if(onMsgTab)clearMsgBadge();
    else updateMsgBadge(msgs);
  },()=>{
    $('msg-list').innerHTML='<div class="empty"><div class="empty-ico">⚠️</div><div class="empty-txt">Erreur Firestore.<br>Vérifiez les règles de sécurité.</div></div>';
  });
}
function renderMsgs(msgs){
  const list=$('msg-list');
  if(!msgs.length){list.innerHTML='<div class="empty"><div class="empty-ico">💬</div><div class="empty-txt">Aucun message.<br>Soyez la première à écrire !</div></div>';return;}
  list.innerHTML='';
  msgs.forEach(m=>{
    const mine=m.uid===me.uid;
    const row=document.createElement('div');row.className=`msg-row ${mine?'mine':'other'}`;
    const bub=document.createElement('div');bub.className=`msg-bubble ${mine?'mine':'other'}`;
    if(!mine){const s=document.createElement('div');s.className='msg-sender';s.textContent=m.authorName||'Équipe';bub.appendChild(s);}
    const t=document.createElement('div');t.textContent=m.text;bub.appendChild(t);
    const ts=document.createElement('div');ts.className='msg-time';ts.textContent=m.createdAt?fmtTime(m.createdAt.toDate()):'';bub.appendChild(ts);
    row.appendChild(bub);list.appendChild(row);
  });
  const s=$('msg-scroll');if(s)setTimeout(()=>{s.scrollTop=s.scrollHeight;},60);
}
function updateMsgBadge(msgs){
  const n=msgs.filter(m=>m.uid!==me.uid).length;
  $('s-msg').textContent=n;
  const b=$('msg-badge'),d=$('ndot');
  if(n>0){b.textContent=n>9?'9+':n;b.style.display='flex';d.classList.add('on');}
  else{b.style.display='none';d.classList.remove('on');}
}
window.sendMsg=async()=>{
  const inp=$('msg-txt'),text=inp.value.trim();if(!text)return;
  inp.value='';inp.style.height='';
  try{await addDoc(collection(db,'messages'),{text,uid:me.uid,authorName:myName,createdAt:serverTimestamp()});}
  catch(e){showToast('Erreur: '+e.message,false);}
};
window.msgKD=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}};
window.autoR=el=>{el.style.height='';el.style.height=Math.min(el.scrollHeight,96)+'px';};

// ── NOTES ────────────────────────────────────────────────────
function loadNotes(){
  onSnapshot(query(collection(db,'notes'),orderBy('createdAt','desc')),snap=>{
    allNotes=snap.docs.map(d=>({id:d.id,...d.data()}));renderNotes();renderHomeNotes();
  });
}
function renderNotes(){
  const list=$('notes-list');
  const f=noteFilter==='all'?allNotes:allNotes.filter(n=>n.category===noteFilter);
  if(!f.length){list.innerHTML='<div class="empty"><div class="empty-ico">📋</div><div class="empty-txt">Aucune note.</div></div>';return;}
  list.innerHTML='';
  const cc={urgent:'bar-red',info:'bar-sage',procedure:'bar-green'};
  const cl={urgent:'🔴 Urgent',info:'🔵 Info',procedure:'🟢 Procédure'};
  const cb={urgent:'bg-red',info:'bg-gray',procedure:'bg-green'};
  f.forEach(n=>{
    const el=document.createElement('div');el.className='card';
    const bar=cc[n.category]||'bar-sage';
    const lbl=cl[n.category]||'Info';
    const bdg=cb[n.category]||'bg-gray';
    el.innerHTML='<div class="card-bar '+bar+'"></div><div class="card-in"><div class="flex-bet" style="gap:8px"><div class="card-title">'+(n.pdfFilename?'📎 ':'')+esc(n.title)+'</div><span class="badge '+bdg+'">'+lbl+'</span></div><div class="card-meta"><span>'+esc(n.authorName||'')+'</span><span class="card-dot"></span><span>'+(n.createdAt?fmtDate(n.createdAt.toDate()):'')+'</span></div><div class="card-prev">'+esc(n.body||n.pdfText||'')+'</div></div>';
    el.onclick=()=>openDetail(n,'note');list.appendChild(el);
  });
}
function renderHomeNotes(){
  const el=$('home-notes');const r=allNotes.slice(0,2);
  if(!r.length){el.innerHTML='<div style="font-size:12px;color:var(--tl);padding:6px 0">Aucune note récente.</div>';return;}
  el.innerHTML='';
  r.forEach(n=>{
    const d=document.createElement('div');d.className='card';
    const bar=n.category==='urgent'?'bar-red':'bar-green';
    d.innerHTML='<div class="card-bar '+bar+'"></div><div class="card-in"><div class="card-title">'+esc(n.title)+'</div><div class="card-prev">'+esc(n.body||n.pdfText||'')+'</div></div>';
    d.onclick=()=>{goTab('notes',document.querySelector('[data-tab="notes"]'));openDetail(n,'note');};
    el.appendChild(d);
  });
}
window.fNote=(f,el)=>{noteFilter=f;document.querySelectorAll('#note-chips .chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');renderNotes();};
window.saveNote=async()=>{
  const ttl=$('nt-ttl').value.trim(),body=$('nt-body').value.trim(),cat=$('nt-cat').value;
  if(!ttl||!body){showToast('Remplissez tous les champs',false);return;}
  await addDoc(collection(db,'notes'),{title:ttl,body,category:cat,authorName:myName,uid:me.uid,createdAt:serverTimestamp()});
  closeMod('mod-note');$('nt-ttl').value='';$('nt-body').value='';showToast('Note publiée ✓');
};

// ── PDF ──────────────────────────────────────────────────────
window.onDrop=e=>{e.preventDefault();$('upzone').classList.remove('drag');if(e.dataTransfer.files[0])onPdfFile(e.dataTransfer.files[0]);};
window.clearPdf=()=>{pdfText='';pdfName='';$('pdf-prev').classList.remove('on');$('pdf-in').value='';$('pdf-status').style.display='none';};
window.onPdfFile=async file=>{
  if(!file||file.type!=='application/pdf'){showToast('Fichier PDF requis',false);return;}
  pdfName=file.name;$('pdf-fn').textContent=file.name;$('pdf-pg').textContent='Extraction…';$('pdf-prev').classList.add('on');
  const st=$('pdf-status');st.style.display='block';st.textContent='📖 Lecture…';st.style.color='var(--gm)';
  try{
    const ab=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:ab}).promise;
    let txt='';
    for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const c=await pg.getTextContent();txt+=c.items.map(x=>x.str).join(' ')+'\n';}
    pdfText=txt.trim();
    $('pdf-pg').textContent=`${pdf.numPages} page${pdf.numPages>1?'s':''} · ${txt.length} car.`;
    const fl=txt.split('\n')[0].trim().substring(0,80);
    if(fl&&!$('pdf-ttl').value)$('pdf-ttl').value=fl;
    st.textContent='✅ PDF lu. Vérifiez le titre et publiez.';
  }catch(e){st.textContent='⚠️ Erreur: '+e.message;st.style.color='var(--rd)';}
};
window.pubPdf=async()=>{
  const ttl=$('pdf-ttl').value.trim(),cat=$('pdf-cat').value;
  if(!ttl){showToast('Ajoutez un titre',false);return;}
  if(!pdfText&&!pdfName){showToast('Importez un PDF',false);return;}
  const btn=$('pdf-pub-btn');btn.textContent='Publication…';btn.disabled=true;
  await addDoc(collection(db,'notes'),{title:ttl,category:cat,body:pdfText.substring(0,5000),pdfText:pdfText.substring(0,5000),pdfFilename:pdfName,authorName:myName,uid:me.uid,createdAt:serverTimestamp()});
  closeMod('mod-pdf');btn.textContent='Publier';btn.disabled=false;clearPdf();$('pdf-ttl').value='';showToast('Note PDF publiée ✓');
};

// ── TODOS ────────────────────────────────────────────────────
function loadTodos(){
  onSnapshot(query(collection(db,'todos'),orderBy('createdAt','desc')),snap=>{
    allTodos=snap.docs.map(d=>({id:d.id,...d.data()}));renderTodos();$('s-todo').textContent=allTodos.filter(t=>!t.done).length;
  });
}
function renderTodos(){
  const list=$('todo-list');
  const f=todoFilter==='all'?allTodos:todoFilter==='done'?allTodos.filter(t=>t.done):allTodos.filter(t=>!t.done);
  if(!f.length){list.innerHTML='<div class="empty"><div class="empty-ico">✅</div><div class="empty-txt">Aucune tâche.</div></div>';return;}
  list.innerHTML='';
  f.forEach(t=>{
    const canDel=myRole==='admin'||t.uid===me.uid;
    const el=document.createElement('div');el.className='todo-item';
    const chk='<div class="todo-chk '+(t.done?'on':'')+'" onclick="togTodo(\''+t.id+'\','+(+!t.done)+',this)"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>';
    const txt='<div style="flex:1;min-width:0"><div class="todo-txt '+(t.done?'done':'')+'">'+esc(t.text)+'</div><div class="todo-who">→ '+esc(t.assignee||'Équipe')+' · '+(t.createdAt?fmtDate(t.createdAt.toDate()):'')+'</div></div>';
    const del=canDel?'<button onclick="delTodo(\''+t.id+'\')" style="background:none;border:none;color:var(--tl);font-size:20px;cursor:pointer;padding:2px 6px">×</button>':'';
    el.innerHTML=chk+txt+del;
    list.appendChild(el);
  });
}
window.togTodo=async(id,done,el)=>{el.classList.toggle('on',!!done);el.parentElement.querySelector('.todo-txt').classList.toggle('done',!!done);await updateDoc(doc(db,'todos',id),{done:!!done});};
window.delTodo=async id=>{await deleteDoc(doc(db,'todos',id));showToast('Tâche supprimée');};
window.fTodo=(f,el)=>{todoFilter=f;document.querySelectorAll('#todo-chips .chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');renderTodos();};
window.saveTodo=async()=>{
  const txt=$('td-txt').value.trim(),who=$('td-who').value.trim()||"Équipe";
  if(!txt){showToast('Décrivez la tâche',false);return;}
  await addDoc(collection(db,'todos'),{text:txt,assignee:who,done:false,authorName:myName,uid:me.uid,createdAt:serverTimestamp()});
  closeMod('mod-todo');$('td-txt').value='';$('td-who').value='';showToast('Tâche créée ✓');
};

// ── ANNONCES ─────────────────────────────────────────────────
function loadAnns(){
  onSnapshot(query(collection(db,'annonces'),orderBy('createdAt','desc'),limit(20)),snap=>{
    allAnns=snap.docs.map(d=>({id:d.id,...d.data()}));renderHomeAnns();renderAdminAnns();
  });
}
function renderHomeAnns(){
  const el=$('home-ann');
  if(!allAnns.length){el.innerHTML='<div style="font-size:12px;color:var(--tl);padding:6px 0">Aucune annonce.</div>';return;}
  el.innerHTML='';
  allAnns.slice(0,2).forEach(a=>{
    const d=document.createElement('div');d.className='card';
    d.innerHTML='<div class="card-bar bar-gold"></div><div class="card-in"><div class="card-title">'+esc(a.title)+'</div><div class="card-prev">'+esc(a.body||'')+'</div></div>';
    d.onclick=()=>openDetail(a,'annonce');el.appendChild(d);
  });
}
function renderAdminAnns(){
  const el=$('ann-list');if(!el)return;el.innerHTML='';
  allAnns.forEach(a=>{
    const d=document.createElement('div');d.className='card';
    d.innerHTML='<div class="card-bar bar-gold"></div><div class="card-in flex-bet"><div style="flex:1"><div class="card-title">'+esc(a.title)+'</div><div class="card-meta">'+(a.createdAt?fmtDate(a.createdAt.toDate()):'')+'</div></div><button onclick="event.stopPropagation();delAnn(\''+a.id+'\')" style="background:none;border:none;color:var(--tl);font-size:20px;cursor:pointer;padding:2px 8px">×</button></div>';
    d.onclick=()=>openDetail(a,'annonce');el.appendChild(d);
  });
}
window.saveAnn=async()=>{
  const ttl=$('an-ttl').value.trim(),body=$('an-body').value.trim();
  if(!ttl||!body){showToast('Remplissez tous les champs',false);return;}
  await addDoc(collection(db,'annonces'),{title:ttl,body,authorName:myName,uid:me.uid,createdAt:serverTimestamp()});
  closeMod('mod-ann');$('an-ttl').value='';$('an-body').value='';showToast('Annonce publiée ✓');
};
window.delAnn=async id=>{await deleteDoc(doc(db,'annonces',id));showToast('Annonce supprimée');};

// ── INFOS ────────────────────────────────────────────────────
function loadInfos(){
  onSnapshot(query(collection(db,'infos'),orderBy('createdAt','asc')),snap=>{
    renderInfos(snap.docs.map(d=>({id:d.id,...d.data()})));
  });
}
function renderInfos(infos){
  const list=$('infos-list');
  if(!infos.length){list.innerHTML='<div class="empty"><div class="empty-ico">📁</div><div class="empty-txt">Aucune information.</div></div>';return;}
  list.innerHTML='';
  infos.forEach(info=>{
    const el=document.createElement('div');el.className='info-sec';
    const delBtn=myRole==='admin'?'<button class="btn-danger" style="margin-top:10px;width:100%" onclick="delInfo(\''+info.id+'\')">Supprimer</button>':'';
    el.innerHTML='<div class="info-hdr" onclick="togInfo(this)"><div class="info-hdr-ttl"><div class="info-ico">'+(info.icon||'📋')+'</div>'+esc(info.title)+'</div><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tl)" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div><div class="info-body"><div style="font-size:13px;color:var(--tm);line-height:1.7;white-space:pre-wrap">'+esc(info.body||'')+'</div>'+delBtn+'</div>';
    list.appendChild(el);
  });
}
window.togInfo=h=>h.nextElementSibling.classList.toggle('open');
window.saveInfo=async()=>{
  const ttl=$('if-ttl').value.trim(),ico=$('if-ico').value.trim()||'📋',body=$('if-body').value.trim();
  if(!ttl||!body){showToast('Remplissez tous les champs',false);return;}
  await addDoc(collection(db,'infos'),{title:ttl,icon:ico,body,createdAt:serverTimestamp()});
  closeMod('mod-info');['if-ttl','if-body','if-ico'].forEach(id=>$(id).value='');showToast('Section ajoutée ✓');
};
window.delInfo=async id=>{await deleteDoc(doc(db,'infos',id));showToast('Section supprimée');};

// ── USERS ────────────────────────────────────────────────────
function loadUsers(){
  onSnapshot(collection(db,'users'),snap=>{
    allUsers=snap.docs.map(d=>({id:d.id,...d.data()}));
    $('mbr-count').textContent=allUsers.length+' membre'+(allUsers.length>1?'s':'');
    renderUsers();
  });
}
function renderUsers(){
  const list=$('users-list');if(!list)return;list.innerHTML='';
  allUsers.forEach(u=>{
    const isMe=u.id===me.uid;
    const el=document.createElement('div');el.className='user-card';
    const badge='<span class="badge '+(u.role==='admin'?'bg-gold':'bg-green')+'">'+roleLabel(u.role)+'</span>';
    const editBtn=!isMe?'<button class="edit-btn" onclick="openEditUser(\''+u.id+'\')">✏️ Modifier</button>':'';
    const meTag=isMe?' <span style="font-size:10px;color:var(--tl)">(moi)</span>':'';
    const desc=u.description?'<div class="user-desc">'+esc(u.description)+'</div>':'';
    el.innerHTML='<div class="user-av">'+ini(u.name||u.email||'?')+'</div><div class="user-info"><div class="user-name">'+esc(u.name||'')+meTag+'</div><div class="user-email">'+esc(u.email||'')+'</div>'+desc+'</div><div class="user-right">'+badge+editBtn+'</div>';
    list.appendChild(el);
  });
}
window.openAddUser=()=>{
  editUserId=null;$('usr-ttl').textContent='Ajouter un membre';
  ['u-name','u-email','u-pwd','u-desc'].forEach(id=>$(id).value='');
  $('u-role').value='user';$('u-email').disabled=false;
  $('u-pwd-lbl').textContent='Mot de passe';$('u-save-btn').textContent='Créer le compte';
  openMod('mod-user');
};
window.openEditUser=id=>{
  const u=allUsers.find(x=>x.id===id);if(!u)return;
  editUserId=id;$('usr-ttl').textContent='Modifier le membre';
  $('u-name').value=u.name||'';$('u-email').value=u.email||'';$('u-email').disabled=true;
  $('u-pwd').value='';$('u-pwd-lbl').textContent='Nouveau mot de passe (vide = inchangé)';
  $('u-role').value=u.role||'user';$('u-desc').value=u.description||'';
  $('u-save-btn').textContent='Enregistrer';openMod('mod-user');
};
window.saveUser=async()=>{
  const name=$('u-name').value.trim(),email=$('u-email').value.trim();
  const pwd=$('u-pwd').value,role=$('u-role').value,desc=$('u-desc').value.trim();
  const btn=$('u-save-btn');
  if(editUserId){
    if(!name){showToast('Entrez un nom',false);return;}
    btn.textContent='Enregistrement…';btn.disabled=true;
    try{
      await updateDoc(doc(db,'users',editUserId),{name,role,description:desc});
      if(pwd&&pwd.length>=6&&editUserId===me.uid){await updatePassword(me,pwd);showToast('Modifié + mdp mis à jour ✓');}
      else showToast('Membre modifié ✓');
      closeMod('mod-user');
    }catch(e){showToast('Erreur: '+e.message,false);}
    btn.textContent='Enregistrer';btn.disabled=false;
  }else{
    if(!name||!email||!pwd){showToast('Remplissez tous les champs',false);return;}
    btn.textContent='Création…';btn.disabled=true;
    try{
      const adminEmail=me.email;
      const adminPwd=prompt('Confirmez votre mot de passe administrateur :');
      if(!adminPwd){btn.textContent='Créer le compte';btn.disabled=false;return;}
      const cred=await createUserWithEmailAndPassword(auth,email,pwd);
      await setDoc(doc(db,'users',cred.user.uid),{name,email,role,description:desc,createdAt:serverTimestamp()});
      await signInWithEmailAndPassword(auth,adminEmail,adminPwd);
      closeMod('mod-user');showToast('Compte créé pour '+name+' ✓');
    }catch(e){
      const m={'auth/email-already-in-use':'Email déjà utilisé.','auth/weak-password':'Mot de passe trop faible.'};
      showToast(m[e.code]||'Erreur: '+e.message,false);
    }
    btn.textContent='Créer le compte';btn.disabled=false;
  }
};

// ── DETAIL ───────────────────────────────────────────────────
let detItem=null,detType=null;
window.openDetail=(item,type)=>{
  detItem=item;detType=type;
  $('det-ttl').textContent=item.title||'Détail';
  $('det-auth').innerHTML='<div class="detail-av">'+ini(item.authorName||'HBM')+'</div><div><div style="font-weight:600;font-size:13px">'+esc(item.authorName||'Maison HBM')+'</div><div style="font-size:11px;color:var(--tl)">'+(item.createdAt?fmtDate(item.createdAt.toDate()):'')+'</div></div>';
  const body=item.body||item.pdfText||'';
  $('det-body').textContent=item.pdfFilename?'📎 '+item.pdfFilename+'\n\n'+body:body;
  const delBtn=$('det-del');
  if(myRole==='admin'){delBtn.style.display='flex';delBtn.onclick=()=>delDetailItem();}
  else{delBtn.style.display='none';}
  $('detail-view').classList.add('open');
};
window.closeDetail=()=>$('detail-view').classList.remove('open');
async function delDetailItem(){
  if(!detItem)return;
  const cols={note:'notes',annonce:'annonces',info:'infos'};
  await deleteDoc(doc(db,cols[detType]||'notes',detItem.id));
  closeDetail();showToast('Supprimé ✓');
}

// ── PROFILE / MODALS ─────────────────────────────────────────
window.openProf=()=>$('prof-ov').classList.add('open');
window.closeProf=()=>$('prof-ov').classList.remove('open');
window.openMod=id=>$(id).classList.add('open');
window.closeMod=id=>$(id).classList.remove('open');
document.querySelectorAll('.modal-ov').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');}));

if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
