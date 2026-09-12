from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

import os
import sys
import sqlite3
import uuid
from datetime import datetime
import pytesseract
from PIL import Image
import pymupdf
from google import genai

# ============================================================
# PATH CONFIGURATION
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CHATBOT_DIR = os.path.join(BASE_DIR, "chatbot")

if CHATBOT_DIR not in sys.path:
    sys.path.insert(0, CHATBOT_DIR)

from chatbot import (
    get_first_question,
    get_next_question
)

# ============================================================
# GEMINI CLIENT INITIALIZATION
# ============================================================

GEMINI_MODEL = "gemini-2.5-flash"
gemini_client = genai.Client()

# ============================================================
# FLASK SETUP
# ============================================================

app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, "frontend"),
    static_url_path=""
)

CORS(app)       

# ============================================================
# DATABASE SETUP
# ============================================================

DB_PATH = os.path.join(BASE_DIR, "casetaking.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cases (
            case_id TEXT PRIMARY KEY,
            language TEXT,
            consent INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            created_at TEXT,
            submitted_at TEXT
        )
    """)

    try:
        cursor.execute("ALTER TABLE cases ADD COLUMN final_summary TEXT")
    except sqlite3.OperationalError:
        pass

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS patients (
            case_id TEXT PRIMARY KEY,
            full_name TEXT,
            age TEXT,
            gender TEXT,
            phone TEXT,
            dob TEXT,
            emergency_name TEXT,
            emergency_relation TEXT,
            emergency_phone TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS interview (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id TEXT,
            step INTEGER,
            answer_key TEXT,
            answer TEXT,
            created_at TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id TEXT,
            filename TEXT,
            file_type TEXT,
            filepath TEXT,
            created_at TEXT
        )
    """)

    try:
        cursor.execute("ALTER TABLE documents ADD COLUMN ocr_text TEXT")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()


init_db()

# ============================================================
# QUESTION KEYS
# ============================================================

QUESTION_KEYS = [
    "problem",
    "duration",
    "symptoms",
    "severity",
    "onset",
    "trigger",
    "treatment",
    "medicines",
    "allergies",
    "medicalHistory",
    "notes"
]

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def normalize_language(language):
    language = str(language or "en").lower().strip()
    if language in ["hi", "hindi"]:
        return "hindi"
    return "english"


def get_answer_key(step):
    if 0 <= step < len(QUESTION_KEYS):
        return QUESTION_KEYS[step]
    return None


def is_no_answer(answer):
    value = str(answer or "").lower().strip()
    return value in ["no", "n", "na", "nahi", "nahin", "नहीं", "न"]


def get_case(case_id):
    conn = get_db()
    case = conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
    conn.close()
    return case


def get_patient(case_id):
    conn = get_db()
    patient = conn.execute("SELECT * FROM patients WHERE case_id = ?", (case_id,)).fetchone()
    conn.close()
    return patient


def get_interview_answers(case_id):
    conn = get_db()
    rows = conn.execute("""
        SELECT answer_key, answer
        FROM interview
        WHERE case_id = ?
        ORDER BY id ASC
    """, (case_id,)).fetchall()
    conn.close()

    answers = {}
    for row in rows:
        answers[row["answer_key"]] = row["answer"]
    return answers


def get_documents(case_id):
    conn = get_db()
    rows = conn.execute("""
        SELECT *
        FROM documents
        WHERE case_id = ?
        ORDER BY id ASC
    """, (case_id,)).fetchall()
    conn.close()
    return rows


def extract_pdf_text(filepath):
    extracted_text = ""
    try:
        pdf = pymupdf.open(filepath)
        for page in pdf:
            text = page.get_text()
            if text.strip():
                extracted_text += text + "\n"
            else:
                pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
                image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                page_ocr = pytesseract.image_to_string(image)
                extracted_text += page_ocr + "\n"
        pdf.close()
    except Exception as e:
        print("PDF extraction failed:", e)
        extracted_text = ""
    return extracted_text.strip()

# ============================================================
# SUMMARY GENERATION
# ============================================================

def generate_clinical_summary(answers, patient):
    if patient:
        name = patient["full_name"] or "The patient"
        age = patient["age"] or ""
        gender = patient["gender"] or ""
    else:
        name = "The patient"
        age = ""
        gender = ""

    patient_info = name
    if age:
        patient_info += f", {age} years"
    if gender:
        patient_info += f", {gender}"

    problem = answers.get("problem", "not reported")
    duration = answers.get("duration", "not reported")
    symptoms = answers.get("symptoms", "not reported")
    severity = answers.get("severity", "not reported")
    onset = answers.get("onset", "not reported")
    trigger = answers.get("trigger", "not reported")
    treatment = answers.get("treatment", "not reported")
    medicines = answers.get("medicines", "not reported")
    allergies = answers.get("allergies", "not reported")
    history = answers.get("medicalHistory", "not reported")
    notes = answers.get("notes", "not reported")

    return (
        f"{patient_info} presents with {problem}. "
        f"The problem has been present for {duration}. "
        f"Reported symptoms include {symptoms}. "
        f"Severity is reported as {severity}. "
        f"Onset: {onset}. "
        f"Trigger or aggravating factors: {trigger}. "
        f"Previous treatment: {treatment}. "
        f"Current medications: {medicines}. "
        f"Drug allergies: {allergies}. "
        f"Relevant medical history: {history}. "
        f"Additional information: {notes}."
    )


def generate_final_summary(case_id):
    patient = get_patient(case_id)
    answers = get_interview_answers(case_id)
    documents = get_documents(case_id)

    patient_text = (
        f"Name: {patient['full_name'] or 'Not reported'}\n"
        f"Age: {patient['age'] or 'Not reported'}\n"
        f"Gender: {patient['gender'] or 'Not reported'}\n"
        f"Phone: {patient['phone'] or 'Not reported'}\n"
        f"Date of Birth: {patient['dob'] or 'Not reported'}\n"
        f"Emergency Contact: {patient['emergency_name'] or 'Not reported'} ({patient['emergency_relation'] or 'Not reported'}) - {patient['emergency_phone'] or 'Not reported'}\n"
    ) if patient else "Patient information not available."

    interview_text = f"""
Chief Complaint: {answers.get("problem", "Not reported")}
Duration: {answers.get("duration", "Not reported")}
Symptoms: {answers.get("symptoms", "Not reported")}
Severity: {answers.get("severity", "Not reported")}
Onset: {answers.get("onset", "Not reported")}
Trigger/Aggravating Factors: {answers.get("trigger", "Not reported")}
Previous Treatment: {answers.get("treatment", "Not reported")}
Current Medicines: {answers.get("medicines", "Not reported")}
Allergies: {answers.get("allergies", "Not reported")}
Medical History: {answers.get("medicalHistory", "Not reported")}
Additional Information: {answers.get("notes", "Not reported")}
"""

    document_text = ""
    if documents:
        for idx, doc in enumerate(documents, 1):
            document_text += f"\nDOCUMENT {idx}: {doc['filename']} ({doc['file_type']})\n{doc['ocr_text'] or 'No text extracted'}\n"
    else:
        document_text = "No documents were uploaded."

    prompt = f"""
You are a clinical documentation assistant.
Create a concise, doctor-ready clinical case summary using ONLY the information provided below.

IMPORTANT RULES:
- Do NOT diagnose the patient.
- Do NOT invent or assume information.
- Do NOT add treatment recommendations.
- Preserve important clinical facts.
- If information is missing, write "Not reported".
- Keep the summary professional and easy for a physician to review.

PATIENT INFORMATION:
{patient_text}

PATIENT INTERVIEW:
{interview_text}

UPLOADED DOCUMENTS:
{document_text}

Create the final summary using exactly these sections:
1. Patient Overview
2. Chief Complaint
3. History and Timeline
4. Symptoms and Severity
5. Treatment and Medications
6. Allergies
7. Medical History
8. Document Findings
9. Important Clinical Information
10. Overall Clinical Summary

Return ONLY the final clinical summary.
"""
    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt
        )
        return response.text.strip()
    except Exception as e:
        print("GEMINI SUMMARY ERROR:", e)
        return ""


def build_summary(case_id):
    answers = get_interview_answers(case_id)
    patient = get_patient(case_id)
    documents = get_documents(case_id)

    ai_clinical_summary = generate_clinical_summary(answers, patient)

    summary = {
        "chief_complaint": answers.get("problem", ""),
        "duration": answers.get("duration", ""),
        "severity": answers.get("severity", ""),
        "associated_symptoms": answers.get("symptoms", ""),
        "current_medications": answers.get("medicines", ""),
        "allergies": answers.get("allergies", ""),
        "previous_treatment": answers.get("treatment", ""),
        "medical_history": answers.get("medicalHistory", ""),
        "onset": answers.get("onset", ""),
        "trigger": answers.get("trigger", ""),
        "additional_information": answers.get("notes", ""),
        "ai_clinical_summary": ai_clinical_summary
    }

    patient_data = {
        "fullName": patient["full_name"] if patient else "",
        "full_name": patient["full_name"] if patient else "",
        "age": patient["age"] if patient else "",
        "gender": patient["gender"] if patient else "",
        "phone": patient["phone"] if patient else "",
        "dob": patient["dob"] if patient else "",
        "emergencyName": patient["emergency_name"] if patient else "",
        "emergency_name": patient["emergency_name"] if patient else "",
        "emergencyRelation": patient["emergency_relation"] if patient else "",
        "emergency_relation": patient["emergency_relation"] if patient else "",
        "emergencyPhone": patient["emergency_phone"] if patient else "",
        "emergency_phone": patient["emergency_phone"] if patient else ""
    }

    return {
        "patient": patient_data,
        "summary": summary,
        "documents": [
            {
                "id": doc["id"],
                "filename": doc["filename"],
                "file_type": doc["file_type"],
                "ocr_text": doc["ocr_text"] or ""
            }
            for doc in documents
        ]
    }

# ============================================================
# API ROUTES
# ============================================================

@app.route("/", methods=["GET"])
def home():
    return send_from_directory(os.path.join(BASE_DIR, "frontend"), "index.html")


@app.route("/physician/")
def physician_dashboard():
    return send_from_directory(os.path.join(BASE_DIR, "doctor_dashboard"), "dashboard.html")


@app.route("/physician/<path:filename>")
def physician_static(filename):
    return send_from_directory(os.path.join(BASE_DIR, "doctor_dashboard"), filename)


# ROUTE TO SERVE UPLOADED FILES (Opens files in new tab)
@app.route("/uploads/<case_id>/<path:filename>", methods=["GET"])
def serve_uploaded_file(case_id, filename):
    folder = os.path.join(BASE_DIR, "uploads", case_id)
    return send_from_directory(folder, filename)


@app.route("/api/session/start", methods=["POST"])
def start_session():
    data = request.get_json(silent=True) or {}
    language = normalize_language(data.get("language", "en"))
    consent = data.get("consent", False)

    if not consent:
        return jsonify({"status": "error", "message": "Consent is required."}), 400

    case_id = "PCT-" + uuid.uuid4().hex[:8].upper()
    created_at = datetime.now().isoformat()

    conn = get_db()
    conn.execute("""
        INSERT INTO cases (case_id, language, consent, status, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (case_id, language, 1, "active", created_at))
    conn.commit()
    conn.close()

    return jsonify({"status": "success", "case_id": case_id, "language": language})


@app.route("/api/case/<case_id>/patient", methods=["POST"])
def save_patient(case_id):
    if not get_case(case_id):
        return jsonify({"status": "error", "message": "Case not found."}), 404

    data = request.get_json(silent=True) or {}
    full_name = data.get("full_name") or data.get("fullName", "")
    age = data.get("age", "")
    gender = data.get("gender", "")
    phone = data.get("phone", "")
    dob = data.get("dob", "")
    em_name = data.get("emergency_name") or data.get("emergencyName", "")
    em_rel = data.get("emergency_relation") or data.get("emergencyRelation", "")
    em_phone = data.get("emergency_phone") or data.get("emergencyPhone", "")

    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO patients
        (case_id, full_name, age, gender, phone, dob, emergency_name, emergency_relation, emergency_phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (case_id, full_name, age, gender, phone, dob, em_name, em_rel, em_phone))
    conn.commit()
    conn.close()

    return jsonify({"status": "success", "message": "Patient information saved."})


@app.route("/api/case/<case_id>/interview/start", methods=["POST"])
def interview_start(case_id):
    case = get_case(case_id)
    if not case:
        return jsonify({"status": "error", "message": "Case not found."}), 404

    language = normalize_language(case["language"])
    try:
        question = get_first_question(language)
    except Exception as error:
        print("INTERVIEW START ERROR:", error)
        return jsonify({"status": "error", "message": "Unable to start interview."}), 500

    return jsonify({"status": "success", "message": question, "step": 0, "answer_key": "problem", "finished": False})


@app.route("/api/case/<case_id>/interview/message", methods=["POST"])
def interview_message(case_id):
    case = get_case(case_id)
    if not case:
        return jsonify({"status": "error", "message": "Case not found."}), 404

    data = request.get_json(silent=True) or {}
    message = str(data.get("message", "")).strip()

    if not message:
        return jsonify({"status": "error", "message": "Message cannot be empty."}), 400

    conn = get_db()
    last = conn.execute("""
        SELECT step, answer_key, answer FROM interview WHERE case_id = ? ORDER BY id DESC LIMIT 1
    """, (case_id,)).fetchone()
    conn.close()

    # --- SPECIAL CASE: Agar last step 'notes' me patient ne 'yes' kaha tha ---
    if last and last["answer_key"] == "notes" and last["answer"].lower().strip() in ["yes", "y", "haan", "ha"]:
        # Jo ab message aaya hai, wahi asli additional note hai
        conn = get_db()
        conn.execute("""
            UPDATE interview SET answer = ? WHERE case_id = ? AND answer_key = 'notes'
        """, (message, case_id))
        conn.commit()
        conn.close()

        return jsonify({
            "status": "success",
            "message": "Thank you. I have collected enough information for your case summary.",
            "step": int(last["step"]),
            "answer_key": "notes",
            "finished": True
        })

    # Normal step tracking
    step = 0 if last is None else int(last["step"]) + 1
    current_key = get_answer_key(step)

    if current_key is None:
        return jsonify({"status": "success", "message": "Interview already completed.", "finished": True})

    # Save current answer
    conn = get_db()
    conn.execute("""
        INSERT INTO interview (case_id, step, answer_key, answer, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (case_id, step, current_key, message, datetime.now().isoformat()))
    conn.commit()
    conn.close()

    # --- SPECIAL CASE: Notes par 'yes' bolne par details mango ---
    if current_key == "notes":
        if is_no_answer(message):
            conn = get_db()
            conn.execute("UPDATE interview SET answer = 'None' WHERE case_id = ? AND answer_key = 'notes'", (case_id,))
            conn.commit()
            conn.close()
            return jsonify({
                "status": "success",
                "message": "Thank you. I have collected enough information for your case summary.",
                "step": step,
                "answer_key": current_key,
                "finished": True
            })
        elif message.lower().strip() in ["yes", "y", "haan", "ha"]:
            return jsonify({
                "status": "success",
                "message": "Please go ahead and share the details or any other concerns you would like the doctor to know.",
                "step": step,
                "answer_key": current_key,
                "finished": False
            })

    language = normalize_language(case["language"])

    # Treatment = NO -> seedha medicines skip karke allergies (step 8) par jao
    if current_key == "treatment" and is_no_answer(message):
        # Auto-fill medicines as 'None' in db
        conn = get_db()
        conn.execute("""
            INSERT INTO interview (case_id, step, answer_key, answer, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (case_id, step + 1, "medicines", "None", datetime.now().isoformat()))
        conn.commit()
        conn.close()

        next_step = 8
        allergies_q = "Do you have any known allergies to medicines or anything else?"
        if language == "hindi":
            allergies_q = "क्या आपको किसी दवा या किसी अन्य चीज से एलर्जी है?"

        return jsonify({
            "status": "success",
            "message": allergies_q,
            "step": next_step,
            "answer_key": current_key,
            "next_answer_key": "allergies",
            "finished": False
        })

    # Normal Question Fetch
    try:
        next_question = get_next_question(language, step, message)
    except Exception as error:
        print("INTERVIEW ERROR:", error)
        return jsonify({"status": "error", "message": "Chatbot processing failed."}), 500

    if next_question is None:
        return jsonify({
            "status": "success",
            "message": "Thank you. I have collected enough information for your case summary.",
            "step": step,
            "answer_key": current_key,
            "finished": True
        })

    next_step = step + 1
    return jsonify({
        "status": "success",
        "message": next_question,
        "step": next_step,
        "answer_key": current_key,
        "next_answer_key": get_answer_key(next_step),
        "finished": False
    })

# --------------------------------------------------------
    # FINISHED OR CONDITIONAL FOLLOW-UP
    # --------------------------------------------------------

    # Agar aakhri sawaal (notes) par patient 'yes' bole, toh details pucho
    if current_key == "notes" and not is_no_answer(message) and message.lower().strip() in ["yes", "y", "haan", "ha"]:
        return jsonify({
            "status": "success",
            "message": "Please go ahead and share the details or any other concerns you would like the doctor to know.",
            "step": step,
            "answer_key": "notes_followup",
            "finished": False
        })

    if next_question is None:
        return jsonify({
            "status": "success",
            "message": "Thank you. I have collected enough information for your case summary.",
            "step": step,
            "answer_key": current_key,
            "finished": True
        })

    next_step = step + 1
    if current_key == "treatment" and is_no_answer(message):
        next_step = 8

    return jsonify({
        "status": "success",
        "message": next_question,
        "step": next_step,
        "answer_key": current_key,
        "next_answer_key": get_answer_key(next_step),
        "finished": False
    })


@app.route("/api/case/<case_id>/interview/finish", methods=["POST"])
def finish_interview(case_id):
    if not get_case(case_id):
        return jsonify({"status": "error", "message": "Case not found."}), 404

    conn = get_db()
    conn.execute("UPDATE cases SET status = ? WHERE case_id = ?", ("interview_completed", case_id))
    conn.commit()
    conn.close()

    return jsonify({"status": "success", "message": "Interview completed."})


@app.route("/api/case/<case_id>/documents", methods=["POST"])
def upload_document(case_id):
    if not get_case(case_id):
        return jsonify({"status": "error", "message": "Case not found."}), 404

    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No file uploaded."}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"status": "error", "message": "Invalid file."}), 400

    upload_dir = os.path.join(BASE_DIR, "uploads", case_id)
    os.makedirs(upload_dir, exist_ok=True)
    filename = os.path.basename(file.filename)
    filepath = os.path.join(upload_dir, filename)
    file.save(filepath)

    extension = os.path.splitext(filename)[1].lower()
    file_type = "pdf" if extension == ".pdf" else "image"
    ocr_text = ""

    if file_type == "image":
        try:
            image = Image.open(filepath)
            ocr_text = pytesseract.image_to_string(image)
        except Exception as e:
            print("Image OCR failed:", e)
            ocr_text = ""
    elif file_type == "pdf":
        ocr_text = extract_pdf_text(filepath)

    conn = get_db()
    conn.execute("""
        INSERT INTO documents (case_id, filename, file_type, filepath, created_at, ocr_text)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (case_id, filename, file_type, filepath, datetime.now().isoformat(), ocr_text))
    conn.commit()
    conn.close()

    return jsonify({
        "status": "success",
        "message": "File uploaded and text extracted.",
        "name": filename,
        "type": file_type,
        "ocr_text": ocr_text
    })


@app.route("/api/case/<case_id>/documents", methods=["GET"])
def list_documents(case_id):
    if not get_case(case_id):
        return jsonify({"status": "error", "message": "Case not found."}), 404

    rows = get_documents(case_id)
    documents = [{"name": row["filename"], "type": row["file_type"]} for row in rows]
    return jsonify(documents)


@app.route("/api/case/<case_id>/summary", methods=["GET"])
def get_summary(case_id):
    if not get_case(case_id):
        return jsonify({"status": "error", "message": "Case not found."}), 404

    result = build_summary(case_id)
    return jsonify({
        "status": "success",
        "caseId": case_id,
        "case_id": case_id,
        "patient": result["patient"],
        "summary": result["summary"],
        "documents": result["documents"]
    })


@app.route("/api/case/<case_id>/submit", methods=["POST"])
def submit_case(case_id):
    case = get_case(case_id)
    if not case:
        return jsonify({"status": "error", "message": "Case not found."}), 404

    print(f"Generating final AI summary for {case_id}...")
    final_summary = generate_final_summary(case_id)
    submitted_at = datetime.now().isoformat()

    conn = get_db()
    conn.execute("""
        UPDATE cases
        SET status = ?, submitted_at = ?, final_summary = ?
        WHERE case_id = ?
    """, ("submitted", submitted_at, final_summary, case_id))
    conn.commit()
    conn.close()

    return jsonify({
        "status": "success",
        "message": "Case submitted to physician with AI summary.",
        "case_id": case_id,
        "final_summary": final_summary
    })


@app.route("/api/case/<case_id>/review", methods=["GET"])
def physician_review(case_id):
    case = get_case(case_id)
    if not case:
        return jsonify({"status": "error", "message": "Case not found."}), 404

    result = build_summary(case_id)
    patient = result["patient"]
    summary = result["summary"]

    final_summary = case["final_summary"] or summary.get("ai_clinical_summary", "No clinical summary available.")

    return jsonify({
        "status": "success",
        "caseId": case_id,
        "case_id": case_id,
        "final_summary": final_summary,
        "patient": {
            **patient,
            "submitted_at": case["submitted_at"]
        },
        "summary": summary,
        "documents": result["documents"]
    })


@app.route("/api/physician/cases", methods=["GET"])
def physician_cases():
    conn = get_db()
    rows = conn.execute("""
        SELECT
            c.case_id,
            c.language,
            c.status,
            c.created_at,
            c.submitted_at,
            p.full_name,
            p.age,
            p.gender
        FROM cases c
        LEFT JOIN patients p ON c.case_id = p.case_id
        WHERE c.status IN ('submitted', 'confirmed')
        ORDER BY c.submitted_at DESC
    """).fetchall()
    conn.close()

    cases = []
    for row in rows:
        cases.append({
            "caseId": row["case_id"],
            "case_id": row["case_id"],
            "status": row["status"],
            "language": row["language"],
            "createdAt": row["created_at"],
            "submittedAt": row["submitted_at"],
            "patient": {
                "fullName": row["full_name"] or "—",
                "full_name": row["full_name"] or "—",
                "age": row["age"] or "—",
                "gender": row["gender"] or "—"
            }
        })

    return jsonify({"status": "success", "cases": cases})


# ALL DOCUMENTS ROUTE WITH FILE URLs
@app.route("/api/physician/documents", methods=["GET"])
def physician_all_documents():
    conn = get_db()
    rows = conn.execute("""
        SELECT 
            d.filename,
            d.file_type,
            d.created_at,
            d.case_id,
            p.full_name
        FROM documents d
        LEFT JOIN patients p ON d.case_id = p.case_id
        ORDER BY d.id DESC
    """).fetchall()
    conn.close()

    docs = []
    for r in rows:
        docs.append({
            "name": r["filename"],
            "case_id": r["case_id"],
            "case": f"{r['case_id']} ({r['full_name'] or 'Patient'})",
            "type": r["file_type"].upper(),
            "uploaded": r["created_at"],
            "url": f"/uploads/{r['case_id']}/{r['filename']}"
        })

    return jsonify({"status": "success", "documents": docs})


@app.route("/api/case/<case_id>/confirm", methods=["POST"])
def confirm_case(case_id):
    if not get_case(case_id):
        return jsonify({"status": "error", "message": "Case not found."}), 404

    conn = get_db()
    conn.execute("UPDATE cases SET status = ? WHERE case_id = ?", ("confirmed", case_id))
    conn.commit()
    conn.close()

    return jsonify({"status": "success", "message": "Record confirmed and submitted."})

# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)