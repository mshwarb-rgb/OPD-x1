// OPD Logger – v18 (compact summary; counts ALL diagnoses per visit; robust export fallbacks)
const APP_VERSION = "v18";
const KEY = "opdVisitsV6";

const Genders = ["Male", "Female"];
const AgeLabels = { Under5: "<5", FiveToFourteen: "5-14", FifteenToSeventeen: "15-17", EighteenPlus: "≥18" };
const AgeKeys = Object.keys(AgeLabels);
const WWOpts = ["WW", "NonWW"];
const Dispositions = ["Discharged", "Admitted", "Referred to ED", "Referred out"];

const Diagnoses = [
  [1, "Respiratory Tract Infection", "Medical"],
  [2, "Acute Watery Diarrhea", "Medical"],
  [3, "Acute Bloody Diarrhea", "Medical"],
  [4, "Acute Viral Hepatitis", "Medical"],
  [5, "Other GI Diseases", "Medical"],
  [6, "Scabies", "Medical"],
  [7, "Skin Infection", "Medical"],
  [8, "Other Skin Diseases", "Medical"],
  [9, "Genitourinary Diseases", "Medical"],
  [10, "Musculoskeletal Diseases", "Medical"],
  [11, "Hypertension", "Medical"],
  [12, "Diabetes", "Medical"],
  [13, "Epilepsy", "Medical"],
  [14, "Eye Diseases", "Medical"],
  [15, "ENT Diseases", "Medical"],
  [16, "Other Medical Diseases", "Medical"],
  [17, "Fracture", "Surgical"],
  [18, "Burn", "Surgical"],
  [19, "Gunshot Wound (GSW)", "Surgical"],
  [20, "Other Wound", "Surgical"],
  [21, "Other Surgical", "Surgical"]
];
const DiagByNo = Object.fromEntries(Diagnoses.map(([n, name, cat]) => [n, { name, cat }]));

function loadAll(){ try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch(e){ return []; } }
function saveAll(list){ localStorage.setItem(KEY, JSON.stringify(list)); }
function sortedAll(){ return loadAll().slice().sort((a,b)=>b.timestamp-a.timestamp); }

// selections
let selPID=""; let selGender=null; let selAge=null;
let selDiags=[]; let selWW=null; let selDisp=null;
let editUid=null;

// DOM refs
let pidDisplay, pidStatus, err; let scrNew, scrSum, scrData;

window.initOPD = function initOPD(){
  const vEl = document.getElementById("version");
  if (vEl) vEl.textContent = " " + APP_VERSION;

  pidDisplay = document.getElementById("pid-display");
  pidStatus  = document.getElementById("pid-status");
  err        = document.getElementById("error");
  scrNew     = document.getElementById("screen-new");
  scrSum     = document.getElementById("screen-summary");
  scrData    = document.getElementById("screen-data");

  const _nn=document.getElementById('nav-new'); if(_nn) _nn.onclick=()=>showScreen('new');
  const _ns=document.getElementById('nav-summary'); if(_ns) _ns.onclick=()=>{ showScreen('summary'); renderSummary(); };
  const _nd=document.getElementById('nav-data'); if(_nd) _nd.onclick=()=>{ showScreen('data'); renderTable(); };

  document.querySelectorAll(".k").forEach(btn => btn.onclick = onKeypad);

  const saveNewBtn = document.getElementById("save-new"); if (saveNewBtn) saveNewBtn.onclick = () => onSave(true);
  const updateBtn  = document.getElementById("update");  if (updateBtn)  updateBtn.onclick  = onUpdate;
  const cancelBtn  = document.getElementById("cancel-edit"); if (cancelBtn) cancelBtn.onclick = cancelEdit;
  const resetBtn   = document.getElementById("reset");   if (resetBtn)   resetBtn.onclick   = resetForm;

  // Export buttons
  const ecsv = document.getElementById("export-csv");
  const exls = document.getElementById("export-xls");
  if (ecsv) ecsv.onclick = () => downloadCSV(sortedAll());
  if (exls) exls.onclick = () => downloadXLS(sortedAll());

  const bjson = document.getElementById("backup-json"); if (bjson) bjson.onclick = () => downloadJSON(sortedAll());
  const rbtn  = document.getElementById("restore-btn");
  const rfile = document.getElementById("restore-json");
  if (rbtn && rfile){ rbtn.onclick = () => rfile.click(); rfile.onchange = restoreJSON; }
  const clear = document.getElementById("clear-all"); if (clear) clear.onclick = clearAll;

  buildSelectors();
  updatePID();
  showScreen("new");
};

function showScreen(name){
  scrNew.style.display = (name==="new")?"":"none";
  scrSum.style.display = (name==="summary")?"":"none";
  scrData.style.display = (name==="data")?"":"none";
}

function buildSelectors(){
  makeChips(document.getElementById("gender-chips"), Genders, i => { selGender=i; buildSelectors(); }, selGender);

  // Age chips
  const ageWrap = document.getElementById("age-chips");
  ageWrap.innerHTML = "";
  Object.values(AgeLabels).forEach((label, idx) => {
    const div = document.createElement("div");
    div.className = "chip";
    div.textContent = label;
    if (selAge===idx) div.classList.add("selected");
    div.onclick = () => { selAge=idx; buildSelectors(); };
    ageWrap.appendChild(div);
  });

  // Diagnoses grid (multi-select up to 2)
  makeDiagTiles(document.getElementById("diagnosis-grid"), Diagnoses, selDiags);
  const diagCount = document.getElementById("diag-count");
  if (diagCount) diagCount.textContent = selDiags.length ? `${selDiags.length}/2 selected` : "";

  // WW visible if any Surgical
  const anySurg = selDiags.some(no => DiagByNo[no]?.cat === "Surgical");
  const wwSec = document.getElementById("ww-section");
  if (anySurg) {
    wwSec.style.display = "";
    makeChips(document.getElementById("ww-chips"), WWOpts, i => { selWW=i; buildSelectors(); }, selWW);
  } else {
    wwSec.style.display = "none"; selWW=null;
    const ww = document.getElementById("ww-chips"); if (ww) ww.innerHTML="";
  }

  // Disposition chips
  const dispWrap = document.getElementById("disp-chips");
  dispWrap.innerHTML = "";
  Dispositions.forEach((label, idx) => {
    const div = document.createElement("div");
    div.className = "chip";
    div.textContent = label;
    if (selDisp===idx) div.classList.add("selected");
    div.onclick = () => { selDisp=idx; buildSelectors(); };
    dispWrap.appendChild(div);
  });
}

function makeChips(container, options, onSelect, current){
  container.innerHTML = "";
  options.forEach((label, idx) => {
    const div = document.createElement("div");
    div.className = "chip" + (current===idx ? " selected": "");
    div.textContent = label;
    div.onclick = () => onSelect(idx);
    container.appendChild(div);
  });
}

function makeDiagTiles(container, items, selectedNos){
  container.innerHTML = "";
  items.forEach(([no, name, cat]) => {
    const div = document.createElement("div");
    const isSel = selectedNos.includes(no);
    div.className = "tile" + (isSel ? " selected":"");
    div.innerHTML = `<div>${no}. ${name}</div><div class="small">${cat}</div>`;
    div.onclick = () => toggleDiag(no);
    container.appendChild(div);
  });
}
function toggleDiag(no){
  const idx = selDiags.indexOf(no);
  if (idx >= 0) selDiags.splice(idx,1);
  else {
    if (selDiags.length < 2) selDiags.push(no);
    else { selDiags.shift(); selDiags.push(no); }
  }
  buildSelectors();
}

// Keypad & PID
function onKeypad(e){
  const k = e.currentTarget.dataset.k;
  if (k === "C") selPID = "";
  else if (k === "B") selPID = selPID.slice(0, -1);
  else if (/^\d$/.test(k)) { if (selPID.length < 3) selPID += k; }
  updatePID();
}
function updatePID(){
  pidDisplay.textContent = selPID ? selPID : "---";
  pidStatus.textContent = "";
}

// Validation + visit build
function validateSelection(requirePID=true){
  err.style.color = "#d93025"; err.textContent = "";
  if (requirePID && (!selPID || selPID.length === 0)) { err.textContent = "Enter Patient ID (max 3 digits)."; return false; }
  if (selGender===null || selAge===null || !selDiags.length || selDisp===null) { err.textContent="Select Gender, Age, ≥1 Diagnosis (max 2), and Disposition."; return false; }
  const anySurg = selDiags.some(no => DiagByNo[no]?.cat === "Surgical");
  if (anySurg && selWW===null) { err.textContent="Select WW or Non-WW for surgical diagnosis."; return false; }
  return true;
}
function newUid(){ return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,7); }
function buildVisit(uidOverride=null, tsOverride=null){
  const diags = selDiags.slice(0,2);
  const names = diags.map(no => DiagByNo[no]?.name || "");
  const cats  = diags.map(no => DiagByNo[no]?.cat || "");
  const anySurg = cats.includes("Surgical");
  return {
    uid: uidOverride || newUid(),
    timestamp: tsOverride || Date.now(),
    patientId: selPID,
    gender: Genders[selGender],
    ageGroup: AgeKeys[selAge],
    ageLabel: AgeLabels[AgeKeys[selAge]],
    diagnosisNos: diags,
    diagnosisNames: names,
    diagnosisNoStr: diags.join("+"),
    diagnosisNameStr: names.join(" + "),
    clinicalCategory: anySurg ? "Surgical" : "Medical",
    wwFlag: anySurg ? (WWOpts[selWW] || "NA") : "NA",
    disposition: Dispositions[selDisp]
  };
}

// Save / Update / Edit
function onSave(){
  if (!validateSelection(true)) return;
  const all = loadAll();
  all.push(buildVisit());
  saveAll(all);
  tinyToast("Saved. New entry ready.", true);
  cancelEdit();
  try { window.scrollTo({top: 0, behavior: "smooth"}); } catch(e){ window.scrollTo(0,0); }
}
function onUpdate(){
  if (!validateSelection(false)) return;
  if (!editUid) return tinyToast("Not in edit mode.", false);
  const all = loadAll();
  const idx = all.findIndex(v => v.uid === editUid);
  if (idx === -1) return tinyToast("Record not found.", false);
  all[idx] = buildVisit(editUid, all[idx].timestamp);
  saveAll(all);
  tinyToast("Updated.", true);
  cancelEdit();
}
function enterEdit(record){
  editUid = record.uid;
  selPID = record.patientId || "";
  selGender = Genders.indexOf(record.gender);
  selAge = AgeKeys.indexOf(record.ageGroup);
  if (record.diagnosisNos && Array.isArray(record.diagnosisNos)) selDiags = record.diagnosisNos.slice(0,2);
  else if (record.diagnosisNo) selDiags = [record.diagnosisNo];
  else if (record.diagnosisNoStr) selDiags = record.diagnosisNoStr.split("+").map(n=>parseInt(n,10)).filter(Boolean).slice(0,2);
  else selDiags = [];
  const anySurg = selDiags.some(no => DiagByNo[no]?.cat === "Surgical");
  selWW = anySurg ? (record.wwFlag==="WW" ? 0 : record.wwFlag==="NonWW" ? 1 : null) : null;
  selDisp = Dispositions.indexOf(record.disposition);
  updatePID(); buildSelectors();
  const saveNew = document.getElementById("save-new"); if (saveNew) saveNew.style.display = "none";
  const updateBtn = document.getElementById("update"); if (updateBtn) updateBtn.style.display = "";
  const cancelBtn = document.getElementById("cancel-edit"); if (cancelBtn) cancelBtn.style.display = "";
  showScreen("new");
}
function cancelEdit(){
  editUid = null;
  selPID=""; selGender=null; selAge=null; selDiags=[]; selWW=null; selDisp=null;
  updatePID(); buildSelectors();
  const saveNew = document.getElementById("save-new"); if (saveNew) saveNew.style.display = "";
  const updateBtn = document.getElementById("update"); if (updateBtn) updateBtn.style.display = "none";
  const cancelBtn = document.getElementById("cancel-edit"); if (cancelBtn) cancelBtn.style.display = "none";
}
function resetForm(){ cancelEdit(); }

/* ---------- helper ---------- */
function normDiagNames(record){
  if (Array.isArray(record.diagnosisNames) && record.diagnosisNames.length){
    return record.diagnosisNames.filter(Boolean);
  }
  if (typeof record.diagnosisNameStr === "string" && record.diagnosisNameStr.trim()){
    return record.diagnosisNameStr.split("+").map(s => s.trim()).filter(Boolean);
  }
  if (record.diagnosisName) return [record.diagnosisName];
  return [];
}

/* =========================
   Helpers (enhanced export)
   ========================= */
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function isNative(){
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  catch(e){ return false; }
}

function canWebShareFiles() {
  try {
    return !!(navigator && navigator.canShare && typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [new File(["test"], "t.txt", {type:"text/plain"})] }));
  } catch (_) { return false; }
}

function safeFileName(base, ext){
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0,19);
  return `${base}_${ts}.${ext}`;
}

function textToBlob(text, mime){
  try { return new Blob([text], {type: mime}); }
  catch(e){ return new Blob([new TextEncoder().encode(text)], {type: mime}); }
}

function toBase64Chunked(str){
  const utf8 = unescape(encodeURIComponent(str));
  const chunkSize = 0x8000;
  let result = "";
  for (let i = 0; i < utf8.length; i += chunkSize) {
    result += btoa(utf8.slice(i, i + chunkSize));
  }
  return result;
}

function base64ToBlob(b64, mime){
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i=0;i<len;i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || "application/octet-stream" });
}

async function shareWithCapacitor(filename, mime, base64Data){
  const Cap = window.Capacitor;
  const FS = Cap && (Cap.Filesystem || Cap.Plugins?.Filesystem);
  const Share = Cap && (Cap.Share || Cap.Plugins?.Share);
  if (!FS) throw new Error("Capacitor Filesystem not available");

  const safe = filename;
  await FS.writeFile({ path: safe, data: base64Data, directory: FS.Directory.Cache, recursive: true });
  let uri;
  try {
    const res = await FS.getUri({ path: safe, directory: FS.Directory.Cache });
    uri = res && res.uri;
  } catch(e) {
    await sleep(200);
    const res2 = await FS.getUri({ path: safe, directory: FS.Directory.Cache });
    uri = res2 && res2.uri;
  }

  if (!uri) throw new Error("Unable to get file URI");
  if (Share) {
    await (Share.share || Share.share).call(Share, { title: `Export ${filename}`, text: `Exported ${filename}`, url: uri, dialogTitle: "Share/export file" });
  }
  return true;
}

function triggerAnchorDownload(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function openInNewTabFallback(blobOrText, mime){
  try {
    const blob = blobOrText instanceof Blob ? blobOrText : textToBlob(String(blobOrText), mime || "text/plain;charset=utf-8");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  } catch(e) {
    const dataUrl = "data:" + (mime || "text/plain;charset=utf-8") + "," + encodeURIComponent(String(blobOrText));
    window.open(dataUrl, "_blank");
  }
}

function tinyToast(msg, ok){
  const el = document.getElementById("error");
  if (!el) return;
  el.style.color = ok ? "#107c41" : "#d93025";
  el.textContent = msg;
  setTimeout(()=>{ el.textContent=""; el.style.color="#d93025"; }, 1600);
}

/* ---------- Summary (today) – COMPACT ---------- */
function renderSummary(){
  const all = loadAll();
  const today = new Date(); today.setHours(0,0,0,0);
  const start = +today, end = start + 86400000 - 1;
  const list = all.filter(v => v.timestamp >= start && v.timestamp <= end);

  // Key totals
  const total = list.length;
  const male = list.filter(v => v.gender==="Male").length;
  const female = list.filter(v => v.gender==="Female").length;
  const surg = list.filter(v => v.clinicalCategory==="Surgical").length;
  const med  = list.filter(v => v.clinicalCategory==="Medical").length;
  const ww   = list.filter(v => v.clinicalCategory==="Surgical" && v.wwFlag==="WW").length;
  const non  = list.filter(v => v.clinicalCategory==="Surgical" && v.wwFlag==="NonWW").length;

  const setTxt = (id, val) => { const el=document.getElementById(id); if (el) el.textContent = val; };
  setTxt("k-total", total);
  setTxt("k-male", male);
  setTxt("k-female", female);
  setTxt("k-surg", surg);
  setTxt("k-med",  med);
  setTxt("k-ww", `${ww}/${non}`);

  // All diagnoses counted (≥1 shown)
  const diagCounts = {};
  list.forEach(v => {
    const names = normDiagNames(v);
    names.forEach(n => {
      if (!n) return;
      diagCounts[n] = (diagCounts[n] || 0) + 1;
    });
  });
  const diagArr = Object.entries(diagCounts).sort((a,b)=>b[1]-a[1]);

  const topBox = document.getElementById("top-diags");
  if (topBox){
    topBox.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.style.display = "grid";
    wrapper.style.gridTemplateColumns = "repeat(auto-fit, minmax(220px, 1fr))";
    wrapper.style.gap = "6px 12px";
    wrapper.style.fontSize = "13px";
    diagArr.forEach(([name,c]) => {
      const row = document.createElement("div");
      row.textContent = `${name}: ${c}`;
      wrapper.appendChild(row);
    });
    topBox.appendChild(wrapper);

    // Dispositions inline
    const dispCounts = { "Discharged":0, "Admitted":0, "Referred to ED":0, "Referred out":0 };
    list.forEach(v => { if (dispCounts.hasOwnProperty(v.disposition)) dispCounts[v.disposition] += 1; });
    const line = document.createElement("div");
    line.style.marginTop = "8px";
    line.style.fontSize = "12px";
    line.style.color = "#333";
    line.textContent = `Dispositions — Discharged: ${dispCounts["Discharged"]||0} | Admitted: ${dispCounts["Admitted"]||0} | Referred to ED: ${dispCounts["Referred to ED"]||0} | Referred out: ${dispCounts["Referred out"]||0}`;
    topBox.appendChild(line);
  }
}

/* ---------- Data table & export ---------- */
function renderTable(){
  const all = sortedAll();
  const tbody = document.querySelector("#data-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const fmt = (t)=> new Date(t).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  all.forEach(v => {
    const tr = document.createElement("tr");
    const nos = v.diagnosisNoStr || (Array.isArray(v.diagnosisNos)? v.diagnosisNos.join("+") : (v.diagnosisNo ?? ""));
    const names = v.diagnosisNameStr || (Array.isArray(v.diagnosisNames)? v.diagnosisNames.join(" + ") : (v.diagnosisName ?? ""));
    tr.innerHTML = `<td>${fmt(v.timestamp)}</td>
      <td>${v.patientId || ""}</td>
      <td>${v.gender}</td>
      <td>${v.ageLabel || ""}</td>
      <td>${nos}</td>
      <td>${names}</td>
      <td>${(v.clinicalCategory||"")[0] || ""}</td>
      <td>${v.wwFlag || "NA"}</td>
      <td>${v.disposition || ""}</td>
      <td><button class="btn secondary" data-uid="${v.uid}" style="padding:6px 8px;">Edit</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("button[data-uid]").forEach(btn => {
    btn.onclick = () => {
      const uid = btn.getAttribute("data-uid");
      const all2 = sortedAll();
      const rec = all2.find(r => r.uid === uid);
      if (rec) { enterEdit(rec); }
    };
  });
}

/* ---------- Export CSV / Excel (robust) ---------- */
async function downloadCSV(list){
  const header = ["timestamp","patient_id","gender","age_group","diagnosis_nos","diagnosis_names","clinical_category","ww_flag","disposition"];
  const rows = [header].concat(list.map(v => [
    v.timestamp,
    v.patientId || "",
    v.gender,
    v.ageLabel || "",
    v.diagnosisNoStr || (Array.isArray(v.diagnosisNos)? v.diagnosisNos.join("+") : (v.diagnosisNo ?? "")),
    v.diagnosisNameStr || (Array.isArray(v.diagnosisNames)? v.diagnosisNames.join(" + ") : (v.diagnosisName ?? "")),
    v.clinicalCategory || "",
    v.wwFlag || "NA",
    v.disposition || ""
  ]));

  const csv = rows.map(r => r.map(x => {
    const s = String(x).replace(/"/g,'""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }).join(",")).join("\n");

  const filename = safeFileName("OPD", "csv");
  const mime = "text/csv;charset=utf-8";

  try {
    if (isNative()) {
      const b64 = toBase64Chunked(csv);
      await shareWithCapacitor(filename, mime, b64);
      tinyToast("CSV ready to share.", true);
      return;
    }
    if (canWebShareFiles()) {
      const file = new File([csv], filename, { type: mime });
      await navigator.share({ files: [file], title: "OPD export", text: filename });
      tinyToast("CSV shared.", true);
      return;
    }
    const blob = textToBlob(csv, mime);
    triggerAnchorDownload(blob, filename);
    tinyToast("CSV downloaded.", true);
  } catch (e) {
    openInNewTabFallback(csv, mime);
    tinyToast("CSV opened in new tab (fallback).", true);
  }
}

async function downloadXLS(list){
  const header = ["timestamp","patient_id","gender","age_group","diagnosis_nos","diagnosis_names","clinical_category","ww_flag","disposition"];
  const rows = list.map(v => [
    v.timestamp,
    v.patientId || "",
    v.gender,
    v.ageLabel || "",
    v.diagnosisNoStr || (Array.isArray(v.diagnosisNos)? v.diagnosisNos.join("+") : (v.diagnosisNo ?? "")),
    v.diagnosisNameStr || (Array.isArray(v.diagnosisNames)? v.diagnosisNames.join(" + ") : (v.diagnosisName ?? "")),
    v.clinicalCategory || "",
    v.wwFlag || "NA",
    v.disposition || ""
  ]);

  const esc = s => String(s).replace(/[<&>]/g, c => ({"<":"&lt;","&":"&amp;",">":"&gt;"}[c]));
  let table = '<table border="1"><tr>' + header.map(h=>`<th>${esc(h)}</th>`).join('') + '</tr>';
  rows.forEach(r => { table += '<tr>' + r.map(x=>`<td>${esc(x)}</td>`).join('') + '</tr>'; });
  table += '</table>';

  const workbookHTML = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<!--[if gte mso 9]><xml>
 <x:ExcelWorkbook>
  <x:ExcelWorksheets>
   <x:ExcelWorksheet>
    <x:Name>OPD</x:Name>
    <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
   </x:ExcelWorksheet>
  </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml><![endif]-->
</head>
<body>
${table}
</body>
</html>`.trim();

  const filename = safeFileName("OPD", "xls");
  const mime = "application/vnd.ms-excel;charset=utf-8";

  try {
    if (isNative()) {
      const b64 = toBase64Chunked(workbookHTML);
      await shareWithCapacitor(filename, mime, b64);
      tinyToast("Excel ready to share.", true);
      return;
    }
    if (canWebShareFiles()) {
      const file = new File([workbookHTML], filename, { type: mime });
      await navigator.share({ files: [file], title: "OPD export", text: filename });
      tinyToast("Excel shared.", true);
      return;
    }
    const blob = textToBlob(workbookHTML, mime);
    triggerAnchorDownload(blob, filename);
    tinyToast("Excel downloaded.", true);
  } catch (e) {
    openInNewTabFallback(workbookHTML, mime);
    tinyToast("Excel opened in new tab (fallback).", true);
  }
}

/* ---------- JSON backup/restore & clear ---------- */
function downloadJSON(list){
  const blob = new Blob([JSON.stringify(list)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "OPD_backup.json"; a.click(); URL.revokeObjectURL(a.href);
}
function restoreJSON(e){
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error("Invalid file");
      const byUid = {}; sortedAll().forEach(x => byUid[x.uid] = x);
      data.forEach(x => { byUid[x.uid || (Date.now()+"-"+Math.random())] = x; });
      const merged = Object.values(byUid).sort((a,b)=>a.timestamp-b.timestamp);
      saveAll(merged); renderTable();
      tinyToast("Data restored/merged.", true);
    } catch(err) { tinyToast("Restore failed: " + err.message, false); }
  };
  reader.readAsText(file);
}
function clearAll(){
  if (!confirm("Clear ALL saved visits from this device?")) return;
  saveAll([]); renderTable(); tinyToast("Cleared.", true);
}

/* ===== Global error hooks ===== */
window.addEventListener("error", (ev) => { try { tinyToast("Error: " + (ev.error?.message || ev.message), false); } catch(_){} });
window.addEventListener("unhandledrejection", (ev) => { try { tinyToast("Error: " + (ev.reason?.message || ev.reason), false); } catch(_){} });
