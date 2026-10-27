import { Room, RoomEvent, Track, createLocalTracks } from "https://cdn.jsdelivr.net/npm/livekit-client@2.9.6/dist/livekit-client.esm.mjs";

const $ = (id) => document.getElementById(id);
let room = null, localMic = false, localCam = false, screenTrack = null, myName = "", myRole = "student";
const participants = new Map();

$("teacher").addEventListener("change", () => $("teacherCodeWrap").classList.toggle("hidden", !$("teacher").checked));

$("joinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("joinError").textContent = "";
  myName = $("name").value.trim();
  const roomName = $("room").value.trim();
  myRole = $("teacher").checked ? "teacher" : "student";
  $("joinError").textContent = "در حال آماده‌سازی اتصال…";
  try {
    const resp = await fetch("/api/token", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({name:myName, room:roomName, role:myRole, teacherCode:$("teacherCode").value})
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "اتصال ساخته نشد.");
    room = new Room({adaptiveStream:true, dynacast:true});
    bindRoomEvents(room);
    await room.connect(data.serverUrl, data.token);
    $("joinPanel").classList.add("hidden");
    $("classPanel").classList.remove("hidden");
    $("classTitle").textContent = `کلاس ${data.room}`;
    $("status").textContent = `وارد شدی، ${data.name} · نقش: ${data.role === "teacher" ? "معلم" : "دانش‌آموز"}`;
    $("notice").textContent = "برای روشن کردن دوربین یا میکروفون، دکمهٔ مربوط را بزن و اجازهٔ مرورگر را تأیید کن.";
    ["micBtn","camBtn","shareBtn","chatSend"].forEach(id => $(id).disabled = false);
    addParticipant(room.localParticipant);
    room.remoteParticipants.forEach(addParticipant);
    $("joinError").textContent = "";
  } catch (err) {
    $("joinError").textContent = err.message || "اتصال برقرار نشد.";
  }
});

function bindRoomEvents(r) {
  r.on(RoomEvent.ParticipantConnected, p => addParticipant(p));
  r.on(RoomEvent.ParticipantDisconnected, p => removeParticipant(p.identity));
  r.on(RoomEvent.TrackSubscribed, (track, pub, participant) => attachTrack(track, participant));
  r.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => detachTrack(track, participant));
  r.on(RoomEvent.LocalTrackPublished, (pub, participant) => attachTrack(pub.track, participant));
  r.on(RoomEvent.LocalTrackUnpublished, (pub, participant) => detachTrack(pub.track, participant));
  r.on(RoomEvent.DataReceived, (payload, participant) => {
    try { const msg = JSON.parse(new TextDecoder().decode(payload)); if (msg.type === "chat") addChat(msg.name, msg.text); } catch {}
  });
  r.on(RoomEvent.Disconnected, () => { $("status").textContent = "اتصال قطع شد."; });
}

function addParticipant(p) {
  if (participants.has(p.identity)) return;
  const tile = document.createElement("div"); tile.className = "tile"; tile.id = `p-${p.identity}`;
  const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = "👤";
  const label = document.createElement("div"); label.className = "person"; label.textContent = p.name || "شرکت‌کننده";
  tile.append(avatar, label); $("videoGrid").querySelector(".empty-state")?.remove(); $("videoGrid").append(tile);
  participants.set(p.identity, tile);
  p.trackPublications?.forEach(pub => { if (pub.track) attachTrack(pub.track, p); });
}
function removeParticipant(identity) {
  participants.get(identity)?.remove(); participants.delete(identity);
  if (!$("videoGrid").children.length) $("videoGrid").innerHTML = '<div class="empty-state">منتظر ورود شرکت‌کننده‌ها…</div>';
}
function attachTrack(track, participant) {
  if (!track) return;
  if (!participants.has(participant.identity)) addParticipant(participant);
  const tile = participants.get(participant.identity);
  if (track.kind === Track.Kind.Video || track.kind === Track.Kind.ScreenShare) {
    tile.querySelector("video")?.remove();
    tile.querySelector(".avatar")?.remove();
    const el = track.attach(); el.autoplay = true; el.playsInline = true;
    tile.prepend(el);
  }
  if (track.kind === Track.Kind.Audio) {
    const el = track.attach(); el.autoplay = true; el.style.display = "none"; tile.append(el);
  }
}
function detachTrack(track, participant) {
  if (!track || !participants.has(participant.identity)) return;
  track.detach().forEach(el => el.remove());
  const tile = participants.get(participant.identity);
  if (!tile.querySelector("video") && !tile.querySelector(".avatar")) {
    const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = "👤"; tile.prepend(avatar);
  }
}

$("micBtn").addEventListener("click", async () => {
  try {
    localMic = !localMic;
    await room.localParticipant.setMicrophoneEnabled(localMic);
    $("micBtn").textContent = localMic ? "🎤 میکروفون روشن" : "🎤 میکروفون خاموش";
    $("micBtn").classList.toggle("active", localMic);
  } catch (e) { localMic = !localMic; $("notice").textContent = "برای میکروفون، اجازهٔ مرورگر را بررسی کن."; }
});
$("camBtn").addEventListener("click", async () => {
  try {
    localCam = !localCam;
    await room.localParticipant.setCameraEnabled(localCam);
    $("camBtn").textContent = localCam ? "📷 دوربین روشن" : "📷 دوربین خاموش";
  } catch (e) { localCam = !localCam; $("notice").textContent = "برای دوربین، اجازهٔ مرورگر را بررسی کن."; }
});
$("shareBtn").addEventListener("click", async () => {
  try {
    if (!screenTrack) {
      await room.localParticipant.setScreenShareEnabled(true);
      screenTrack = true; $("shareBtn").textContent = "⏹️ توقف اشتراک صفحه";
    } else {
      await room.localParticipant.setScreenShareEnabled(false);
      screenTrack = null; $("shareBtn").textContent = "🖥️ اشتراک صفحه";
    }
  } catch { $("notice").textContent = "اشتراک صفحه در این مرورگر در دسترس نیست یا لغو شد."; }
});
$("chatForm").addEventListener("submit", async e => {
  e.preventDefault();
  const text = $("chatInput").value.trim(); if (!text || !room) return;
  try {
    const payload = new TextEncoder().encode(JSON.stringify({type:"chat", name:myName, text}));
    await room.localParticipant.publishData(payload, {reliable:true});
    addChat(myName, text); $("chatInput").value = "";
  } catch { $("notice").textContent = "ارسال پیام انجام نشد."; }
});
function addChat(name, text) {
  const p = document.createElement("p"); p.className = "chat-line";
  const b = document.createElement("b"); b.textContent = `${name}: `;
  p.append(b, document.createTextNode(text)); $("chatMessages").append(p); $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}
$("leaveBtn").addEventListener("click", async () => {
  if (room) await room.disconnect();
  room = null; participants.clear(); $("videoGrid").innerHTML = '<div class="empty-state">هنوز کسی به کلاس وصل نشده است.</div>';
  $("chatMessages").innerHTML = '<p class="muted">پیام‌های کلاس اینجا نمایش داده می‌شوند.</p>';
  $("classPanel").classList.add("hidden"); $("joinPanel").classList.remove("hidden");
  ["micBtn","camBtn","shareBtn","chatSend"].forEach(id => $(id).disabled = true);
  localMic = localCam = false; screenTrack = null;
});
