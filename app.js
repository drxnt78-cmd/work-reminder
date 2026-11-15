const $=id=>document.getElementById(id);
const STORAGE_KEY="work-reminder-tasks-v1";
const EMAIL_KEY="work-reminder-email-v1";
let tasks=[], shownMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);
let selectedDate=iso(new Date()), filter="day";
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function loadTasks(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}catch{return []}}
let db=null, currentUser=null, saving=false;
function status(s){$("syncStatus").textContent=s||""}
function pack(t){const d=t.date||iso(new Date());const time=t.time||"12:00";return {id:t.id,user_id:currentUser.id,title:t.name,due_at:new Date(`${d}T${time}:00`).toISOString(),completed:!!t.done,priority:t.priority||"medium",category:t.category||null,client_name:t.client||null,memo:t.memo||null,repeat_type:t.repeat?(t.repeatType||"daily"):"none",email_enabled:!!t.notifyEnabled,email_times:[{_app:{date:d,time:t.time||"",repeat:!!t.repeat,repeatType:t.repeatType||"daily"}},...(t.notifications||[])]}}
function unpack(r){const a=Array.isArray(r.email_times)?r.email_times:[];const m=a.find(x=>x&&x._app)?._app||{};const dt=r.due_at?new Date(r.due_at):null;return {id:r.id,name:r.title,date:m.date||(dt?iso(dt):iso(new Date())),time:m.time??(dt?`${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`:""),category:r.category||"その他",priority:r.priority||"medium",client:r.client_name||"",memo:r.memo||"",notifyEnabled:!!r.email_enabled,notifications:a.filter(x=>x&&!x._app),repeat:m.repeat??(r.repeat_type!=="none"),repeatType:m.repeatType||r.repeat_type||"daily",done:!!r.completed}}
async function refresh(){if(!currentUser)return;const {data,error}=await db.from("tasks").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:true});if(error)throw error;tasks=data.map(unpack);render()}
async function save(){if(!currentUser)return;status("同期中…");try{await refresh();status("保存しました");setTimeout(()=>status(""),1400)}catch(e){status("同期エラー");alert("クラウドから読み込めません: "+e.message)}}
async function upsertTask(t){status("保存中…");const {error}=await db.from("tasks").upsert(pack(t));if(error)throw error;await save()}
async function removeTask(id){status("削除中…");const {error}=await db.from("tasks").delete().eq("id",id).eq("user_id",currentUser.id);if(error)throw error;await save()}
async function initCloud(){const c=window.WORK_REMINDER_CONFIG;if(!c||!c.url.startsWith("https://")||!c.publishableKey.startsWith("sb_publishable_")){ $("authMessage").textContent="config.jsにSupabaseの接続情報を設定してください。";return}if(!window.supabase){$("authMessage").textContent="接続ライブラリを読み込めません。インターネット接続を確認してください。";return}db=window.supabase.createClient(c.url,c.publishableKey);const {data:{session}}=await db.auth.getSession();if(session)await loggedIn(session.user);db.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"){currentUser=null;tasks=[];document.body.classList.add("locked");render()}})}
async function loggedIn(user){currentUser=user;$("accountLabel").textContent="ログイン中: "+user.email;document.body.classList.remove("locked");try{await refresh()}catch(e){alert("タスクを読み込めません: "+e.message)}}
$("loginForm").onsubmit=async e=>{e.preventDefault();$("authMessage").textContent="ログイン中…";if(!db){$("authMessage").textContent="接続設定を確認してください";return}const {data,error}=await db.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});if(error){$("authMessage").textContent="ログインできません: "+error.message;return}$("loginPassword").value="";$("authMessage").textContent="";await loggedIn(data.user)};
$("logoutBtn").onclick=async()=>{if(confirm("ログアウトしますか？")){const {error}=await db.auth.signOut();if(error)alert(error.message)}};

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function renderCalendar(){
  $("monthLabel").textContent=`${shownMonth.getFullYear()}年${shownMonth.getMonth()+1}月`;
  const first=new Date(shownMonth.getFullYear(),shownMonth.getMonth(),1);
  const start=(first.getDay()+6)%7;
  const startDate=new Date(first);startDate.setDate(first.getDate()-start);
  $("calendar").innerHTML=Array.from({length:42},(_,i)=>{const d=new Date(startDate);d.setDate(startDate.getDate()+i);const key=iso(d),other=d.getMonth()!==shownMonth.getMonth(),has=tasks.some(t=>t.date===key&&!t.done);return `<button data-date="${key}" class="${other?"muted ":""}${key===selectedDate?"selected ":""}${has?"has-task":""}">${d.getDate()}</button>`}).join("");
  $("calendar").querySelectorAll("button").forEach(b=>b.onclick=()=>{selectedDate=b.dataset.date;filter="day";setActiveFilter();render()});
}
function visibleTasks(){
 const today=iso(new Date()),tom=new Date();tom.setDate(tom.getDate()+1);const tomorrow=iso(tom);
 return tasks.filter(t=>{if(filter==="all")return true;if(filter==="today")return t.date===today;if(filter==="tomorrow")return t.date===tomorrow;if(filter==="week"){const now=new Date(),m=new Date(now);m.setDate(now.getDate()-((now.getDay()+6)%7));const end=new Date(m);end.setDate(m.getDate()+6);return t.date>=iso(m)&&t.date<=iso(end)}return t.date===selectedDate})
 .sort((a,b)=>(a.done-b.done)||a.date.localeCompare(b.date)||(a.time||"").localeCompare(b.time||"")||({high:0,medium:1,low:2}[a.priority]-{high:0,medium:1,low:2}[b.priority]));
}
function renderTasks(){
 const list=visibleTasks();$("taskCount").textContent=`${list.filter(t=>!t.done).length}件 未完了`;
 $("listTitle").textContent=({day:`${selectedDate}のタスク`,today:"今日のタスク",tomorrow:"明日のタスク",week:"今週のタスク",all:"すべてのタスク"})[filter];
 $("taskList").innerHTML=list.map(t=>`<article class="task-card ${t.done?"done":""}"><input type="checkbox" data-done="${t.id}" ${t.done?"checked":""} aria-label="完了"><div class="task-main"><div class="task-name">${esc(t.name)}<span class="priority ${t.priority}">${({high:"高",medium:"中",low:"低"})[t.priority]}</span></div><div class="task-meta">${esc(t.date)} ${esc(t.time||"時刻未設定")} ・ ${esc(t.category)}${t.client?" ・ "+esc(t.client):""}${t.notifyEnabled?" ・ ✉メール設定 "+(t.notifications?.length||1)+"件（送信未接続）":""}${t.memo?"<br>"+esc(t.memo):""}</div></div><div class="task-actions"><button data-edit="${t.id}">編集</button></div></article>`).join("");
 $("emptyState").hidden=list.length>0;
 $("taskList").querySelectorAll("[data-done]").forEach(el=>el.onchange=()=>toggleDone(el.dataset.done));
 $("taskList").querySelectorAll("[data-edit]").forEach(el=>el.onclick=()=>editTask(el.dataset.edit));
}
function render(){renderCalendar();renderTasks()}
function setActiveFilter(){document.querySelectorAll(".filter").forEach(b=>b.classList.toggle("active",b.dataset.filter===filter))}
function addNotificationRow(date=selectedDate,time="09:00"){
 const row=document.createElement("div");row.className="notification-row two-col";
 const dateLabel=document.createElement("label");dateLabel.textContent="通知日";
 const d=document.createElement("input");d.type="date";d.className="mail-date";d.value=date;dateLabel.append(d);
 const timeLabel=document.createElement("label");timeLabel.textContent="通知時刻";
 const t=document.createElement("input");t.type="time";t.className="mail-time";t.value=time;timeLabel.append(t);
 const remove=document.createElement("button");remove.type="button";remove.className="secondary";remove.textContent="削除";remove.onclick=()=>row.remove();
 row.append(dateLabel,timeLabel,remove);$("notificationRows").append(row);
}
function setNotificationRows(items){$("notificationRows").replaceChildren();(items||[]).forEach(x=>addNotificationRow(x.date,x.time));}
function getNotifications(){return [...document.querySelectorAll("#notificationRows .notification-row")].map(r=>({date:r.querySelector(".mail-date").value,time:r.querySelector(".mail-time").value}));}
$("addNotification").onclick=()=>addNotificationRow($("taskDate").value||selectedDate);
function openNew(){ $("taskForm").reset();$("taskId").value="";$("dialogTitle").textContent="タスクを追加";$("taskDate").value=selectedDate;setNotificationRows([{date:selectedDate,time:"09:00"}]);$("deleteBtn").hidden=true;$("taskDialog").showModal()}
function editTask(id){const t=tasks.find(x=>x.id===id);if(!t)return;$("taskForm").reset();$("taskId").value=t.id;$("dialogTitle").textContent="タスクを編集";$("taskName").value=t.name;$("taskDate").value=t.date;$("taskTime").value=t.time||"";$("taskCategory").value=t.category;$("taskPriority").value=t.priority;$("taskClient").value=t.client||"";$("taskMemo").value=t.memo||"";$("notifyEnabled").checked=!!t.notifyEnabled;setNotificationRows(t.notifications||(t.notifyEnabled?[{date:t.notifyDate||t.date,time:t.notifyTime||"09:00"}]:[]));$("repeatEnabled").checked=!!t.repeat;$("repeatType").value=t.repeatType||"daily";$("deleteBtn").hidden=false;$("taskDialog").showModal()}
async function toggleDone(id){const t=tasks.find(x=>x.id===id);if(!t)return;t.done=!t.done;if(t.done&&t.repeat){const d=new Date(t.date+"T00:00:00");if(t.repeatType==="daily")d.setDate(d.getDate()+1);if(t.repeatType==="weekly")d.setDate(d.getDate()+7);if(t.repeatType==="monthly")d.setMonth(d.getMonth()+1);const next={...t,id:crypto.randomUUID(),date:iso(d),done:false};try{await upsertTask(next)}catch(e){alert("繰り返しタスクの保存失敗: "+e.message)}}try{await upsertTask(t)}catch(e){alert("保存失敗: "+e.message)}}
$("taskForm").onsubmit=async e=>{e.preventDefault();const id=$("taskId").value;const t={id:id||crypto.randomUUID(),name:$("taskName").value.trim(),date:$("taskDate").value,time:$("taskTime").value,category:$("taskCategory").value,priority:$("taskPriority").value,client:$("taskClient").value.trim(),memo:$("taskMemo").value.trim(),notifyEnabled:$("notifyEnabled").checked,notifications:getNotifications(),repeat:$("repeatEnabled").checked,repeatType:$("repeatType").value,done:false};if(!t.name||!t.date)return;
 if(t.notifyEnabled&&(!t.notifications.length||t.notifications.some(n=>!n.date||!n.time))){alert("メール通知を有効にする場合、通知日時を1件以上正しく入力してください");return;}
 if(t.notifyEnabled&&!localStorage.getItem(EMAIL_KEY)){alert("メール通知の送信先が未設定です。設定画面で登録してください（メール送信自体は未接続です）。");return;}const i=tasks.findIndex(x=>x.id===id);if(i>=0)t.done=tasks[i].done;try{await upsertTask(t);$("taskDialog").close()}catch(e){alert("保存失敗: "+e.message)}};
$("deleteBtn").onclick=async()=>{const id=$("taskId").value;if(confirm("このタスクを削除しますか？")){try{await removeTask(id);$("taskDialog").close()}catch(e){alert("削除失敗: "+e.message)}}};
$("addBtn").onclick=openNew;$("closeDialog").onclick=()=>$("taskDialog").close();
$("prevMonth").onclick=()=>{shownMonth.setMonth(shownMonth.getMonth()-1);renderCalendar()};$("nextMonth").onclick=()=>{shownMonth.setMonth(shownMonth.getMonth()+1);renderCalendar()};
document.querySelectorAll(".filter").forEach(b=>b.onclick=()=>{filter=b.dataset.filter;setActiveFilter();renderTasks()});
$("settingsBtn").onclick=()=>$("settingsDialog").showModal();$("closeSettings").onclick=()=>$("settingsDialog").close();
$("permissionBtn").onclick=async()=>{if(!("Notification"in window)){alert("この環境はWeb通知に対応していません");return}const p=await Notification.requestPermission();alert("通知の許可状態："+p)};
$("exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify({version:1,tasks},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`work-reminder-backup-${iso(new Date())}.json`;a.click();URL.revokeObjectURL(a.href)};
$("importFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.tasks))throw Error("不正なバックアップです");if(confirm("クラウド上の現在のタスクをすべて削除し、バックアップの内容で置き換えますか？")){status("復元中…");const {error:delErr}=await db.from("tasks").delete().eq("user_id",currentUser.id);if(delErr)throw delErr;for(const item of data.tasks){await upsertTask({...item,id:crypto.randomUUID()})}await refresh();alert("クラウドに復元しました")}}catch(err){alert("復元できません: "+err.message)}finally{e.target.value="";status("")}};
document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>{document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");if(b.dataset.nav==="settings")$("settingsDialog").showModal();else if(b.dataset.nav==="tasks"){filter="all";setActiveFilter();renderTasks()}else if(b.dataset.nav==="calendar"){filter="day";setActiveFilter();renderTasks()}else if(b.dataset.nav==="clients")alert("取引先一覧は次の開発ステップで追加します。")});
if("serviceWorker"in navigator && location.protocol!=="file:"){navigator.serviceWorker.register("./sw.js?v=3").catch(()=>{})}
render();setActiveFilter();
$("emailRecipient").value=localStorage.getItem(EMAIL_KEY)||"";
$("saveEmailSettings").onclick=()=>{
 const input=$("emailRecipient");if(!input.checkValidity()){input.reportValidity();return;}
 const email=input.value.trim();if(email)localStorage.setItem(EMAIL_KEY,email);else localStorage.removeItem(EMAIL_KEY);
 alert("送信先設定を端末に保存しました。メール自動送信はまだ有効ではありません。");
};

initCloud().catch(e=>{$("authMessage").textContent="接続エラー: "+e.message});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&currentUser)refresh().catch(()=>status("同期エラー"))});
