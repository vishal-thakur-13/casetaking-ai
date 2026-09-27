/* ============================================
   CaseTaking AI — Frontend Logic (Backend-Connected)
   Talks to the Flask backend (app.py) via fetch().
   All patient data, interview messages, documents,
   and summaries now live in the SQLite database —
   not just in browser memory.
   ============================================ */

// ---------- Screen / step configuration ----------

const SCREENS = [
  { id: "landing",    key: "landing",   label: "Home",         step: null },
  { id: "consent",    key: "consent",   label: "Consent",      step: 1 },
  { id: "patient",    key: "patient",   label: "Patient Info", step: 2 },
  { id: "interview",  key: "interview", label: "Interview",    step: 3 },
  { id: "documents",  key: "documents", label: "Documents",    step: 4 },
  { id: "summary",    key: "summary",   label: "Summary",      step: 5 },
  { id: "review",     key: "review",    label: "Review",       step: 6 },
];

const NAV_STEPS = SCREENS.filter(s => s.step !== null);

const API_BASE = "";

// ---------- Session state ----------
let caseId = null;
let currentScreenIndex = 0;

// ============================================
// INITIALISATION
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("===== DOM LOADED =====");

  buildStepNav();
  goToScreen("landing");

  wireLandingScreen();
  wireConsentScreen();
  wirePatientScreen();
  wireInterviewScreen();
  wireDocumentsScreen();
  wireSummaryScreen();
  wireReviewScreen();

  console.log("===== ALL SCREENS WIRED =====");
});

// ============================================
// SMALL FETCH HELPER
// ============================================

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`API error ${res.status} on ${path}: ${errText}`);
  }
  return res.json();
}

function showError(context, err) {
  console.error(context, err);
  alert(`Something went wrong (${context}). Check the browser console and make sure the Flask backend is running.`);
}

// ============================================
// NAVIGATION
// ============================================

function buildStepNav() {
  const nav = document.getElementById("stepNav");
  if (!nav) return;
  nav.innerHTML = "";
  NAV_STEPS.forEach((s, i) => {
    const pill = document.createElement("span");
    pill.className = "nav-step upcoming";
    pill.dataset.key = s.key;
    pill.innerHTML = `<span class="num">${s.step}</span><span class="label">${s.label}</span>`;
    pill.addEventListener("click", () => {
      if (pill.classList.contains("done") || pill.classList.contains("active")) {
        goToScreen(s.id);
      }
    });
    nav.appendChild(pill);
    if (i < NAV_STEPS.length - 1) {
      const chev = document.createElement("span");
      chev.className = "nav-chevron";
      chev.textContent = "›";
      nav.appendChild(chev);
    }
  });
}

function updateStepNav(activeKey) {
  const activeIndex = NAV_STEPS.findIndex(s => s.key === activeKey);
  const pills = document.querySelectorAll(".nav-step");
  pills.forEach(pill => {
    const idx = NAV_STEPS.findIndex(s => s.key === pill.dataset.key);
    pill.classList.remove("done", "active", "upcoming");
    if (idx < activeIndex) pill.classList.add("done");
    else if (idx === activeIndex) pill.classList.add("active");
    else pill.classList.add("upcoming");
  });
}

function goToScreen(id) {
  const screen = SCREENS.find(s => s.id === id);
  if (!screen) return;

  const targetElement = document.getElementById(`screen-${id}`);
  if (!targetElement) return;

  document.querySelectorAll(".screen").forEach(el => {
    el.classList.remove("active");
  });

  targetElement.classList.add("active");

  const stepNav = document.getElementById("stepNav");
  const physicianBadge = document.getElementById("physicianBadge");

  if (id === "landing") {
    if (stepNav) stepNav.style.visibility = "hidden";
    if (physicianBadge) physicianBadge.hidden = true;
  } else {
    if (stepNav) stepNav.style.visibility = "visible";
    updateStepNav(screen.key);
    if (physicianBadge) physicianBadge.hidden = id !== "review";
  }

  currentScreenIndex = SCREENS.findIndex(s => s.id === id);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================
// SCREEN 1: LANDING
// ============================================

function wireLandingScreen() {
  const startBtn = document.getElementById("startBtn");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      goToScreen("consent");
    });
  }
}

// ============================================
// SCREEN 2: LANGUAGE & CONSENT
// ============================================

function wireConsentScreen() {
  const selectedLang = "en";
  const consentCheck = document.getElementById("consentCheck");
  const continueBtn = document.getElementById("consentContinueBtn");
  const helper = document.getElementById("consentHelper");

  if (!consentCheck || !continueBtn) return;

  consentCheck.addEventListener("change", () => {
    continueBtn.disabled = !consentCheck.checked;
    if (helper) {
      helper.textContent = consentCheck.checked
        ? "Thank you — your privacy choices are saved."
        : "Please accept the consent to proceed";
    }
  });

  continueBtn.addEventListener("click", async () => {
    if (!consentCheck.checked) return;

    continueBtn.disabled = true;
    continueBtn.textContent = "Please wait...";

    try {
      const data = await api("/api/session/start", {
        method: "POST",
        body: JSON.stringify({
          language: selectedLang,
          consent: true,
        }),
      });

      caseId = data.case_id;
      goToScreen("patient");
    } catch (err) {
      showError("starting session", err);
    } finally {
      continueBtn.disabled = false;
      continueBtn.textContent = "Continue →";
    }
  });
}

// ============================================
// SCREEN 3: PATIENT INFORMATION
// ============================================

function wirePatientScreen() {
  const continueBtn = document.getElementById("patientContinueBtn");
  const genderButtons = document.querySelectorAll("#genderSeg .seg-btn");
  const genderInput = document.getElementById("patientGender");

  // Allow clicking gender segmented buttons
  genderButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      genderButtons.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      if (genderInput) genderInput.value = btn.dataset.gender || btn.textContent.trim();
    });
  });

  if (!continueBtn) return;

  continueBtn.addEventListener("click", async () => {
    const fullNameEl = document.getElementById("patientFullName");
    const ageEl = document.getElementById("patientAge");
    const genderEl = document.getElementById("patientGender");
    const phoneEl = document.getElementById("patientPhone");
    const dobEl = document.getElementById("patientDob");
    const emNameEl = document.getElementById("patientEmergencyName");
    const emRelEl = document.getElementById("patientEmergencyRelation");
    const emPhoneEl = document.getElementById("patientEmergencyPhone");

    const data = {
      full_name: fullNameEl ? fullNameEl.value.trim() : "",
      age: ageEl ? ageEl.value : "",
      gender: genderEl ? genderEl.value : "Male",
      phone: phoneEl ? phoneEl.value.trim() : "",
      dob: dobEl ? dobEl.value : "",
      emergency_name: emNameEl ? emNameEl.value.trim() : "",
      emergency_relation: emRelEl ? emRelEl.value.trim() : "",
      emergency_phone: emPhoneEl ? emPhoneEl.value.trim() : "",
    };

    if (!data.full_name || !data.age || !data.gender) {
      alert("Please fill in Full Name, Age, and Gender.");
      return;
    }

    if (!caseId) {
      alert("No active case found. Please restart from Home screen.");
      return;
    }

    continueBtn.disabled = true;
    continueBtn.textContent = "Saving...";

    try {
      await api(`/api/case/${caseId}/patient`, {
        method: "POST",
        body: JSON.stringify(data),
      });

      goToScreen("interview");
      startInterview();
    } catch (err) {
      showError("saving patient details", err);
    } finally {
      continueBtn.disabled = false;
      continueBtn.textContent = "Continue →";
    }
  });
}

// ============================================
// SCREEN 4: AI HEALTH INTERVIEW
// ============================================

function wireInterviewScreen() {
  const sendBtn = document.getElementById("sendBtn");
  const chatInput = document.getElementById("chatInput");
  const micBtn = document.getElementById("micBtn");
  const finishBtn = document.getElementById("finishInterviewBtn");

  if (sendBtn) sendBtn.addEventListener("click", sendChatMessage);
  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChatMessage();
    });
  }
  if (micBtn) {
    micBtn.addEventListener("click", () => {
      chatInput.placeholder = "Listening... (voice input is demo)";
      setTimeout(() => { chatInput.placeholder = "Type your response here..."; }, 1500);
    });
  }
  if (finishBtn) {
    finishBtn.addEventListener("click", async () => {
      finishBtn.disabled = true;
      finishBtn.textContent = "Saving interview...";
      try {
        await api(`/api/case/${caseId}/interview/finish`, { method: "POST" });
        goToScreen("documents");
      } catch (err) {
        showError("finishing interview", err);
      } finally {
        finishBtn.disabled = false;
        finishBtn.textContent = "Finish Interview →";
      }
    });
  }
}

async function startInterview() {
  const body = document.getElementById("chatBody");
  if (!body) return;
  body.innerHTML = "";
  try {
    const data = await api(`/api/case/${caseId}/interview/start`, { method: "POST" });
    pushAiMessage(data.message || "Hello! Let us begin your case history.");
  } catch (err) {
    showError("starting interview", err);
  }
}

function currentTime() {
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function pushAiMessage(text) {
  const body = document.getElementById("chatBody");
  if (!body) return;
  const row = document.createElement("div");
  row.className = "msg-row ai";
  row.innerHTML = `
    <div class="msg-avatar">
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 21C12 21 4 15.87 4 10.5C4 7.46 6.24 5 9 5C10.54 5 11.94 5.79 12.8 7.03C13.66 5.79 15.06 5 16.6 5C19.36 5 21.6 7.46 21.6 10.5C21.6 12.6 20.3 14.66 18.5 16.4" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="msg-col">
      <div class="msg-bubble">${escapeHtml(text)}</div>
      <div class="msg-time">${currentTime()}</div>
    </div>
  `;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
}

function pushUserMessage(text) {
  const body = document.getElementById("chatBody");
  if (!body) return;
  const row = document.createElement("div");
  row.className = "msg-row user";
  row.innerHTML = `
    <div class="msg-avatar">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2" stroke="white" stroke-width="1.6"/><path d="M4.5 20c1.5-3.6 4.6-5.5 7.5-5.5s6 1.9 7.5 5.5" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>
    </div>
    <div class="msg-col">
      <div class="msg-bubble">${escapeHtml(text)}</div>
      <div class="msg-time">${currentTime()}</div>
    </div>
  `;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
}

function pushTypingIndicator() {
  const body = document.getElementById("chatBody");
  if (!body) return;
  const row = document.createElement("div");
  row.className = "msg-row ai";
  row.id = "typingIndicatorRow";
  row.innerHTML = `
    <div class="msg-avatar">
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 21C12 21 4 15.87 4 10.5C4 7.46 6.24 5 9 5C10.54 5 11.94 5.79 12.8 7.03C13.66 5.79 15.06 5 16.6 5C19.36 5 21.6 7.46 21.6 10.5C21.6 12.6 20.3 14.66 18.5 16.4" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="msg-col"><div class="msg-bubble">Typing…</div></div>
  `;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
}

function removeTypingIndicator() {
  const row = document.getElementById("typingIndicatorRow");
  if (row) row.remove();
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  if (!caseId) {
    alert("No active session — please restart from the consent screen.");
    return;
  }

  pushUserMessage(text);
  input.value = "";
  pushTypingIndicator();

  try {
    const data = await api(`/api/case/${caseId}/interview/message`, {
      method: "POST",
      body: JSON.stringify({ message: text }),
    });
    removeTypingIndicator();
    pushAiMessage(data.message);
  } catch (err) {
    removeTypingIndicator();
    showError("sending message", err);
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ============================================
// SCREEN 5: MEDICAL DOCUMENT UPLOAD
// ============================================

function wireDocumentsScreen() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");

  if (document.getElementById("browseBtn")) {
    document.getElementById("browseBtn").addEventListener("click", () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      handleFiles(e.target.files);
      fileInput.value = "";
    });
  }

  if (dropzone) {
    ["dragenter", "dragover"].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add("drag-over");
      });
    });
    ["dragleave", "drop"].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove("drag-over");
      });
    });
    dropzone.addEventListener("drop", (e) => {
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
  }

  document.getElementById("skipDocsBtn")?.addEventListener("click", () => {
    goToScreen("summary");
    renderSummaryScreen();
  });
  document.getElementById("docsContinueBtn")?.addEventListener("click", () => {
    goToScreen("summary");
    renderSummaryScreen();
  });
}

async function handleFiles(fileList) {
  for (const file of Array.from(fileList)) {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api(`/api/case/${caseId}/documents`, { method: "POST", body: formData });
    } catch (err) {
      showError("uploading " + file.name, err);
    }
  }
  await refreshUploadedList();
}

async function refreshUploadedList() {
  const list = document.getElementById("uploadedList");
  const count = document.getElementById("fileCount");
  if (!list) return;
  list.innerHTML = "";

  let docs = [];
  try {
    docs = await api(`/api/case/${caseId}/documents`, { method: "GET" });
  } catch (err) {
    showError("loading documents", err);
  }

  docs.forEach(doc => {
    const item = document.createElement("div");
    item.className = "uploaded-item";
    const icon = doc.type === "pdf" ? "📄" : "🖼️";
    const ext = doc.type === "pdf" ? "PDF" : "IMG";
    item.innerHTML = `
      <div class="file-icon ${doc.type}">${icon}</div>
      <div class="file-meta">
        <div class="file-name">${escapeHtml(doc.name || doc.filename)}</div>
        <div class="file-sub">${ext}</div>
      </div>
      <div class="file-status">
        <span class="status-uploaded">✓ Uploaded</span>
      </div>
    `;
    list.appendChild(item);
  });

  if (count) count.textContent = `${docs.length} file${docs.length !== 1 ? "s" : ""}`;
}

// ============================================
// SCREEN 6: SUMMARY REVIEW
// ============================================

function wireSummaryScreen() {
  document.getElementById("editSummaryBtn")?.addEventListener("click", () => {
    goToScreen("interview");
  });

  document.getElementById("submitPhysicianBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("submitPhysicianBtn");
    btn.disabled = true;
    btn.textContent = "Submitting to Doctor...";
    try {
      await api(`/api/case/${caseId}/submit`, { method: "POST" });
      goToScreen("review");
      await renderReviewScreen();
    } catch (err) {
      showError("submitting to physician", err);
    } finally {
      btn.disabled = false;
      btn.textContent = "Submit to Physician →";
    }
  });
}

async function renderSummaryScreen() {
  if (!caseId) return;
  let data;
  try {
    data = await api(`/api/case/${caseId}/summary`, { method: "GET" });
  } catch (err) {
    showError("loading summary", err);
    return;
  }

  const patient = data.patient || {};
  const summary = data.summary || {};

  const name = patient.full_name || patient.fullName || "—";
  const age = patient.age || "—";
  const gender = patient.gender || "—";
  const cid = data.case_id || data.caseId || caseId;

  document.getElementById("sumName").textContent = name;
  document.getElementById("sumMeta").textContent = `${age} years · ${gender} · Case ID: ${cid}`;

  const fields = [
    { label: "Chief Complaint", icon: "📋", value: summary.chief_complaint, cls: "full" },
    { label: "Duration", icon: "🕓", value: summary.duration },
    { label: "Severity", icon: "⏱", value: summary.severity, cls: "amber" },
    { label: "Associated Symptoms", icon: "❤", value: summary.associated_symptoms, cls: "red" },
    { label: "Current Medications", icon: "💊", value: summary.current_medications, cls: "green" },
    { label: "Known Allergies", icon: "⚠", value: summary.allergies, cls: "red" },
    { label: "Previous Treatment", icon: "📝", value: summary.previous_treatment, cls: "purple" },
    { label: "Medical History", icon: "📁", value: summary.medical_history },
    { label: "Uploaded Documents", icon: "📎", value: (data.documents || []).join(" · ") || "No documents uploaded", cls: "full" },
  ];

  const grid = document.getElementById("summaryGrid");
  if (!grid) return;
  grid.innerHTML = "";
  fields.forEach(field => {
    const card = document.createElement("div");
    card.className = `summary-card ${field.cls || ""}`;
    card.innerHTML = `
      <div class="card-label">${field.icon} ${field.label}</div>
      <div class="card-value">${escapeHtml(field.value || "Not reported")}</div>
    `;
    grid.appendChild(card);
  });
}

// ============================================
// SCREEN 7: PHYSICIAN REVIEW
// ============================================

function wireReviewScreen() {
  document.getElementById("editReviewBtn")?.addEventListener("click", () => {
    goToScreen("summary");
    renderSummaryScreen();
  });

  document.getElementById("confirmSubmitBtn")?.addEventListener("click", async () => {
    try {
      await api(`/api/case/${caseId}/confirm`, { method: "POST" });
      alert("Record confirmed and submitted successfully.");
    } catch (err) {
      showError("confirming record", err);
    }
  });

  document.getElementById("exportPdfBtn")?.addEventListener("click", () => {
    window.print();
  });
}

async function renderReviewScreen() {
  if (!caseId) return;

  let data;
  try {
    data = await api(`/api/case/${caseId}/review`, { method: "GET" });
  } catch (err) {
    showError("loading physician review", err);
    return;
  }

  const patient = data.patient || {};
  const summary = data.summary || data.answers || {};

  // Patient Card
  document.getElementById("reviewName").textContent =
    patient.full_name || patient.fullName || "—";

  document.getElementById("reviewMeta").textContent =
    `${patient.age || "—"} years · ${patient.gender || "—"}`;

  document.getElementById("reviewCaseId").textContent =
    data.case_id || data.caseId || caseId;

  document.getElementById("reviewPhone").textContent =
    patient.phone || "—";

  const emName = patient.emergency_name || "—";
  const emRel = patient.emergency_relation ? `(${patient.emergency_relation})` : "";
  document.getElementById("reviewEmergency").textContent = `${emName} ${emRel}`.trim() || "—";

  document.getElementById("reviewDate").textContent =
    patient.created_at ? new Date(patient.created_at).toLocaleDateString() : new Date().toLocaleDateString();

  // Chief Complaint & Tags
  document.getElementById("reviewComplaint").textContent =
    summary.chief_complaint || "Not reported";

  document.getElementById("reviewDuration").textContent =
    summary.duration || "Not reported";

  document.getElementById("reviewSeverity").textContent =
    summary.severity || "Not reported";

  document.getElementById("reviewOnset").textContent =
    summary.onset || "Not reported";

  document.getElementById("reviewTrigger").textContent =
    summary.trigger || "Not reported";

  // Presenting Symptoms
  const symptomsEl = document.getElementById("reviewSymptoms");
  symptomsEl.innerHTML = "";
  const rawSymptoms = summary.associated_symptoms || summary.symptoms;
  if (rawSymptoms && rawSymptoms !== "Not reported") {
    rawSymptoms.split(/\n|,|;/).map(x => x.trim()).filter(Boolean).forEach(s => {
      const li = document.createElement("li");
      li.textContent = s;
      symptomsEl.appendChild(li);
    });
  } else {
    symptomsEl.innerHTML = "<li>Not reported</li>";
  }

  // Medications
  document.getElementById("reviewMedications").textContent =
    summary.current_medications || summary.medications || "Not reported";

  // Allergies
  const allergiesEl = document.getElementById("reviewAllergies");
  allergiesEl.innerHTML = "";
  const rawAllergies = summary.allergies;
  if (rawAllergies && rawAllergies !== "Not reported") {
    rawAllergies.split(/\n|,|;/).map(x => x.trim()).filter(Boolean).forEach(a => {
      const li = document.createElement("li");
      li.textContent = a;
      allergiesEl.appendChild(li);
    });
  } else {
    allergiesEl.innerHTML = "<li>No known allergies reported</li>";
  }

  // Medical History
  const historyEl = document.getElementById("reviewHistory");
  historyEl.innerHTML = "";
  const rawHistory = summary.medical_history;
  if (rawHistory && rawHistory !== "Not reported") {
    rawHistory.split(/\n|;/).map(x => x.trim()).filter(Boolean).forEach(h => {
      const li = document.createElement("li");
      li.textContent = h;
      historyEl.appendChild(li);
    });
  } else {
    historyEl.innerHTML = "<li>No medical history reported</li>";
  }

  // Previous Treatment
  document.getElementById("reviewPreviousTreatment").textContent =
    summary.previous_treatment || "Not reported";

  // AI Clinical Summary (reads final_summary from Gemini)
  document.getElementById("reviewAISummary").textContent =
    data.final_summary || summary.ai_clinical_summary || "No clinical summary available.";
}