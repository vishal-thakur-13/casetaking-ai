// ---- Real backend data ----
let CASES = [];
let DOCUMENTS = [];
let REPORTS = [];
let PROFILE = {
  fullName: "Dr. Anand Sharma",
  specialization: "Senior Physician / Cardiologist",
  department: "Cardiology",
  email: "dr.anand@casetaking.ai",
  phone: "+91 98765 00000",
  memberSince: "2024",
  license: "MCI-482910",
  years: "12+ Years",
  hospital: "AIIMS New Delhi",
  board: "Internal Medicine"
};

// ============================================================
// LOAD REAL CASES FROM FLASK BACKEND
// ============================================================

async function loadCasesFromBackend() {
  try {
    const response = await fetch("/api/physician/cases");

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== "success") {
      throw new Error(data.message || "Failed to load cases");
    }

    CASES = data.cases.map((item) => ({
      id: item.caseId || item.case_id,
      name: item.patient?.fullName || item.patient?.full_name || "—",
      age: item.patient?.age || "—",
      condition: "Pre-consultation intake",
      status: item.status || "submitted",
      updated: formatDate(item.submittedAt || item.createdAt)
    }));

    renderDashboard();
    renderCases();

  } catch (error) {
    console.error("Failed to load physician cases:", error);
    showToast("Unable to load cases from backend.");
  }
}

// ============================================================
// FORMAT BACKEND DATE
// ============================================================

function formatDate(dateString) {
  if (!dateString) return "—";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ---- Navigation ----
const menuItems = document.querySelectorAll(".menu-item");
const views = document.querySelectorAll(".view");
const crumbCurrent = document.getElementById("crumbCurrent");

const viewLabels = {
  dashboard: "Dashboard",
  cases: "Patient Cases",
  documents: "Documents",
  reports: "Reports",
  settings: "Settings",
  profile: "Profile",
};

menuItems.forEach((item) => {
  item.addEventListener("click", () => {
    const target = item.dataset.view;
    menuItems.forEach((m) => m.classList.remove("active"));
    item.classList.add("active");
    views.forEach((v) => v.classList.add("hidden"));
    const activeView = document.getElementById(`view-${target}`);
    if (activeView) activeView.classList.remove("hidden");
    if (crumbCurrent) crumbCurrent.textContent = viewLabels[target];

    // Refresh data on tab click
    if (target === "documents") renderDocuments();
    if (target === "cases" || target === "dashboard") loadCasesFromBackend();
  });
});

// ---- Badge helper ----
function statusBadge(status) {
  const normalized = String(status || "").toLowerCase();

  const map = {
    submitted: { className: "pending", label: "Submitted" },
    confirmed: { className: "completed", label: "Confirmed" },
    pending: { className: "pending", label: "Pending" },
    completed: { className: "completed", label: "Completed" }
  };

  const item = map[normalized] || {
    className: "review",
    label: status || "Unknown"
  };

  return `<span class="badge ${item.className}">${item.label}</span>`;
}

// ---- Dashboard ----
function renderDashboard() {
  const statNewEl = document.getElementById("statNew");
  const statPendingEl = document.getElementById("statPending");
  const statDoneEl = document.getElementById("statDone");

  if (statNewEl) statNewEl.textContent = CASES.length;
  if (statPendingEl) statPendingEl.textContent = CASES.filter((c) => c.status.toLowerCase() === "submitted").length;
  if (statDoneEl) statDoneEl.textContent = CASES.filter((c) => c.status.toLowerCase() === "confirmed").length;

  const rows = CASES.slice(0, 5).map((c) => `
    <tr class="case-row" data-case-id="${c.id}" style="cursor:pointer;">
      <td>${c.id}</td>
      <td>${c.name}</td>
      <td>${c.condition}</td>
      <td>${statusBadge(c.status)}</td>
      <td>${c.updated}</td>
    </tr>
  `).join("");

  const table = document.getElementById("dashboardTable");
  if (table) {
    table.innerHTML = `
      <thead>
        <tr><th>Case ID</th><th>Patient</th><th>Type</th><th>Status</th><th>Updated</th></tr>
      </thead>
      <tbody>${rows.length ? rows : '<tr><td colspan="5" style="text-align:center;padding:20px;color:#98a2b3;">No cases recorded yet.</td></tr>'}</tbody>
    `;
  }
}

// ---- Patient Cases ----
function renderCases() {
  const searchInput = document.getElementById("caseSearch");
  const filterInput = document.getElementById("statusFilter");

  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const status = filterInput ? filterInput.value.toLowerCase() : "all";

  const filtered = CASES.filter((c) => {
    const matchesQuery = !query || c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query);
    const matchesStatus = status === "all" || c.status.toLowerCase() === status;
    return matchesQuery && matchesStatus;
  });

  const table = document.getElementById("casesTable");
  if (!table) return;

  if (filtered.length === 0) {
    table.innerHTML = `<tbody><tr><td colspan="6" style="padding:40px 0;text-align:center;color:#98a2b3;">No cases match your search.</td></tr></tbody>`;
    return;
  }

  const rows = filtered.map((c) => `
    <tr class="case-row" data-case-id="${c.id}" style="cursor:pointer;">
      <td>${c.id}</td>
      <td>${c.name}</td>
      <td>${c.age}</td>
      <td>${c.condition}</td>
      <td>${statusBadge(c.status)}</td>
      <td>${c.updated}</td>
    </tr>
  `).join("");

  table.innerHTML = `
    <thead>
      <tr><th>Case ID</th><th>Patient</th><th>Age</th><th>Condition</th><th>Status</th><th>Updated</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

document.getElementById("caseSearch")?.addEventListener("input", renderCases);
document.getElementById("statusFilter")?.addEventListener("change", renderCases);

// ============================================================
// SHOW CASE DETAILS MODAL (WITH FILE LINKS)
// ============================================================

function showCaseDetails(data) {
  const patient = data.patient || {};
  const summary = data.summary || {};
  const documents = data.documents || [];
  const finalSummaryText = data.final_summary || summary.ai_clinical_summary || "No clinical summary available.";
  const caseId = data.caseId || data.case_id;

  let existing = document.getElementById("caseDetailsModal");
  if (!existing) {
    existing = document.createElement("div");
    existing.id = "caseDetailsModal";
    document.body.appendChild(existing);
  }

  existing.innerHTML = `
    <div style="
      position:fixed;
      inset:0;
      background:rgba(0,0,0,0.55);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:9999;
      padding:24px;
    ">
      <div style="
        background:white;
        width:min(900px, 95vw);
        max-height:88vh;
        overflow-y:auto;
        border-radius:12px;
        padding:28px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid #f2f4f7;padding-bottom:14px;">
          <div>
            <h2 style="margin:0;color:#101828;">Patient Clinical Record</h2>
            <p style="margin:4px 0 0;color:#667085;font-size:14px;">
              Case ID: <b>${caseId || "—"}</b>
            </p>
          </div>
          <button id="closeCaseDetails" style="border:0;background:#f2f4f7;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:16px;">✕</button>
        </div>

        <!-- AI CLINICAL SUMMARY -->
        <h3 style="color:#1e40af;margin-top:0;">🤖 Consolidated AI Case Summary</h3>
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:18px;line-height:1.65;margin-bottom:24px;white-space:pre-wrap;font-size:14px;color:#1e293b;">${finalSummaryText}</div>

        <!-- PATIENT INFORMATION -->
        <h3 style="color:#334155;margin-bottom:12px;">Patient Information</h3>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:24px;background:#f8fafc;padding:16px;border-radius:8px;">
          <div><strong>Name:</strong> <div>${patient.fullName || patient.full_name || "—"}</div></div>
          <div><strong>Age:</strong> <div>${patient.age || "—"}</div></div>
          <div><strong>Gender:</strong> <div>${patient.gender || "—"}</div></div>
          <div><strong>Phone:</strong> <div>${patient.phone || "—"}</div></div>
          <div><strong>Date of Birth:</strong> <div>${patient.dob || "—"}</div></div>
          <div><strong>Emergency Contact:</strong> <div>${patient.emergencyName || patient.emergency_name || "—"} (${patient.emergencyRelation || patient.emergency_relation || "—"})</div></div>
        </div>

        <!-- RAW INTERVIEW ATTRIBUTES -->
        <h3 style="color:#334155;margin-bottom:12px;">Interview Details</h3>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:24px;font-size:14px;">
          <div><strong>Chief Complaint:</strong> <p style="margin:4px 0;color:#475569;">${summary.chief_complaint || "—"}</p></div>
          <div><strong>Duration:</strong> <p style="margin:4px 0;color:#475569;">${summary.duration || "—"}</p></div>
          <div><strong>Severity:</strong> <p style="margin:4px 0;color:#475569;">${summary.severity || "—"}</p></div>
          <div><strong>Associated Symptoms:</strong> <p style="margin:4px 0;color:#475569;">${summary.associated_symptoms || "—"}</p></div>
          <div><strong>Current Medications:</strong> <p style="margin:4px 0;color:#475569;">${summary.current_medications || "—"}</p></div>
          <div><strong>Known Allergies:</strong> <p style="margin:4px 0;color:#475569;">${summary.allergies || "—"}</p></div>
          <div><strong>Previous Treatment:</strong> <p style="margin:4px 0;color:#475569;">${summary.previous_treatment || "—"}</p></div>
          <div><strong>Medical History:</strong> <p style="margin:4px 0;color:#475569;">${summary.medical_history || "—"}</p></div>
        </div>

        <!-- DOCUMENTS & OCR (CLICKABLE) -->
        <h3 style="color:#334155;margin-bottom:12px;">Attached Reports & OCR</h3>
        ${
          documents.length
            ? `<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
                ${documents.map(doc => {
                  const docName = doc.filename || doc.name || "Document";
                  const fileUrl = `/uploads/${caseId}/${docName}`;
                  return `
                  <div style="background:#f1f5f9;border-radius:6px;padding:12px 14px;font-size:13px;border:1px solid #e2e8f0;">
                    <a href="${fileUrl}" target="_blank" style="color:#2563eb; font-weight:600; text-decoration:underline;">
                      📎 View File: ${docName} ↗
                    </a> <span style="color:#64748b;">(${doc.file_type || "file"})</span>
                    ${doc.ocr_text ? `<div style="color:#475569;margin-top:6px;font-size:12px;background:#ffffff;padding:6px 10px;border-radius:4px;border:1px dashed #cbd5e1;"><b>Extracted Text:</b> ${doc.ocr_text.slice(0, 160)}...</div>` : ''}
                  </div>
                `;}).join("")}
              </div>`
            : `<p style="color:#64748b;margin-bottom:24px;font-size:14px;">No documents uploaded for this case.</p>`
        }

        <!-- ACTIONS -->
        <div style="display:flex;justify-content:flex-end;gap:12px;padding-top:18px;border-top:1px solid #eaecf0;">
          <button id="closeCaseBtn" style="padding:10px 18px;border:1px solid #d0d5dd;background:white;border-radius:8px;cursor:pointer;">Close</button>
          <button id="confirmCaseBtn" style="padding:10px 18px;border:0;background:#16a34a;color:white;border-radius:8px;cursor:pointer;font-weight:600;">✓ Confirm Record</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("closeCaseDetails")?.addEventListener("click", closeCaseDetails);
  document.getElementById("closeCaseBtn")?.addEventListener("click", closeCaseDetails);
  document.getElementById("confirmCaseBtn")?.addEventListener("click", () => {
    confirmCase(caseId);
  });
}

function closeCaseDetails() {
  const modal = document.getElementById("caseDetailsModal");
  if (modal) modal.remove();
}

async function confirmCase(caseId) {
  try {
    const response = await fetch(`/api/case/${encodeURIComponent(caseId)}/confirm`, {
      method: "POST"
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();

    if (data.status !== "success") {
      throw new Error(data.message || "Unable to confirm case");
    }

    closeCaseDetails();
    showToast("Record confirmed successfully.");
    await loadCasesFromBackend();

  } catch (error) {
    console.error("Confirm case failed:", error);
    showToast("Unable to confirm record.");
  }
}

// ============================================================
// OPEN CASE CLICK HANDLER
// ============================================================

document.addEventListener("click", async (event) => {
  const row = event.target.closest(".case-row");
  if (!row) return;

  const caseId = row.dataset.caseId;
  if (!caseId) return;

  try {
    showToast("Loading case review...");
    const response = await fetch(`/api/case/${encodeURIComponent(caseId)}/review`);

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();

    if (data.status !== "success") {
      throw new Error(data.message || "Unable to load case");
    }

    showCaseDetails(data);
  } catch (error) {
    console.error("Failed to open case:", error);
    showToast("Unable to open this patient case.");
  }
});

// ============================================================
// DOCUMENTS VIEW (CLICKABLE LINKS TO OPEN FILES)
// ============================================================

async function renderDocuments() {
  const empty = document.getElementById("documentsEmpty");
  const table = document.getElementById("documentsTable");
  if (!empty || !table) return;

  try {
    const res = await fetch("/api/physician/documents");
    const data = await res.json();
    if (data.status === "success") {
      DOCUMENTS = data.documents.map(d => ({
        name: d.name,
        case: d.case,
        type: d.type,
        url: d.url,
        uploaded: formatDate(d.uploaded)
      }));
    }
  } catch (err) {
    console.error("Failed to fetch documents from backend:", err);
  }

  if (DOCUMENTS.length === 0) {
    empty.classList.remove("hidden");
    table.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  table.classList.remove("hidden");

  const rows = DOCUMENTS.map((d) => `
    <tr>
      <td>
        <a href="${d.url}" target="_blank" style="color:#2563eb; text-decoration:underline; font-weight:500;">
          📎 ${d.name} ↗
        </a>
      </td>
      <td>${d.case}</td>
      <td><span class="badge review">${d.type}</span></td>
      <td>${d.uploaded}</td>
    </tr>
  `).join("");

  table.innerHTML = `
    <thead>
      <tr><th>File name (Click to Open)</th><th>Case</th><th>Type</th><th>Uploaded</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

document.getElementById("uploadBtn")?.addEventListener("click", () => {
  document.getElementById("fileInput")?.click();
});

document.getElementById("fileInput")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  DOCUMENTS.unshift({
    name: file.name,
    case: "Unassigned",
    type: "Uploaded file",
    uploaded: "Just now",
  });
  renderDocuments();
  showToast(`${file.name} uploaded`);
  e.target.value = "";
});

// ---- Reports view ----
function renderReports() {
  const empty = document.getElementById("reportsEmpty");
  const table = document.getElementById("reportsTable");
  if (!empty || !table) return;

  if (REPORTS.length === 0) {
    empty.classList.remove("hidden");
    table.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  table.classList.remove("hidden");

  const rows = REPORTS.map((r) => `
    <tr>
      <td>${r.name}</td>
      <td>${r.type}</td>
      <td>${r.generated}</td>
    </tr>
  `).join("");

  table.innerHTML = `
    <thead>
      <tr><th>Report</th><th>Type</th><th>Generated</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

document.getElementById("generateReportBtn")?.addEventListener("click", () => {
  REPORTS.unshift({
    name: `Clinical Report — ${new Date().toLocaleDateString()}`,
    type: "Ad-hoc",
    generated: new Date().toLocaleDateString(),
  });
  renderReports();
  showToast("Report generated");
});

// ---- Profile view ----
function renderProfile() {
  const fields = [
    ["profRole", PROFILE.specialization],
    ["pFullName", PROFILE.fullName],
    ["pDept", PROFILE.department],
    ["pEmail", PROFILE.email],
    ["pSpec", PROFILE.specialization],
    ["pPhone", PROFILE.phone],
    ["pSince", PROFILE.memberSince],
    ["pLicense", PROFILE.license],
    ["pYears", PROFILE.years],
    ["pHospital", PROFILE.hospital],
    ["pBoard", PROFILE.board],
  ];

  fields.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}

// ---- Toast helper ----
let toastTimer;
function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  renderProfile();
  renderDocuments();
  renderReports();
  loadCasesFromBackend();
});