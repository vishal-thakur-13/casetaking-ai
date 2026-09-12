# ============================================================
# CaseTaking AI — Medical Information Collector
# Backend-compatible chatbot
# ============================================================


# ------------------------------------------------------------
# INTERVIEW QUESTIONS
# ------------------------------------------------------------

QUESTIONS = {

    "english": [

        # 0
        "What brings you here today?",

        # 1
        "Since when have you had this problem?",

        # 2
        "Can you describe the symptoms you are experiencing?",

        # 3
        "How would you rate the severity of your symptoms from 0 to 10?",

        # 4
        "Did the problem start suddenly or gradually?",

        # 5
        "Is there anything that triggers or makes the problem worse?",

        # 6
        "Have you taken any medical treatment for this? (yes/no):",

        # 7
        "Which medicines or treatments have you taken?",

        # 8
        "Do you have any known allergies to medicines or anything else?",

        # 9
        "Do you have any relevant medical history or existing health conditions?",

        # 10
        "Is there anything else you would like to mention?"
    ],


    "hindi": [

        # 0
        "Aapko aaj yahan kis problem ke liye aana pada?",

        # 1
        "Yeh problem aapko kab se hai?",

        # 2
        "Aap jo symptoms experience kar rahe hain, unke baare mein bata sakte hain?",

        # 3
        "Aap apne symptoms ki severity 0 se 10 ke scale par kitni batayenge?",

        # 4
        "Yeh problem achanak shuru hui thi ya dheere-dheere?",

        # 5
        "Kya koi aisi cheez hai jo is problem ko trigger karti hai ya badha deti hai?",

        # 6
        "Kya aapne iske liye koi medical treatment liya hai? (haan/na):",

        # 7
        "Aapne kaunsi dawa ya treatment li hai?",

        # 8
        "Kya aapko kisi medicine ya kisi aur cheez se allergy hai?",

        # 9
        "Kya aapko pehle se koi medical condition ya health problem hai?",

        # 10
        "Kya aap aur kuch batana chahenge?"
    ]
}


# ------------------------------------------------------------
# QUESTION KEYS
# ------------------------------------------------------------

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


# ------------------------------------------------------------
# FIRST QUESTION
# ------------------------------------------------------------

def get_first_question(language):

    """
    Start the medical interview.
    """

    language = language.lower()

    if language not in QUESTIONS:
        language = "english"

    return QUESTIONS[language][0]


# ------------------------------------------------------------
# NEXT QUESTION
# ------------------------------------------------------------

def get_next_question(language, step, answer):

    """
    Return the next question according to
    the current interview step.

    step 0  -> problem
    step 1  -> duration
    step 2  -> symptoms
    step 3  -> severity
    step 4  -> onset
    step 5  -> trigger
    step 6  -> treatment
    step 7  -> medicines
    step 8  -> allergies
    step 9  -> medical history
    step 10 -> notes
    """

    language = language.lower()

    if language not in QUESTIONS:
        language = "english"


    # --------------------------------------------------------
    # TREATMENT QUESTION
    # --------------------------------------------------------

    if step == 6:

        answer_lower = answer.lower().strip()

        yes_answers = [
            "yes",
            "y",
            "haan",
            "ha"
        ]

        no_answers = [
            "no",
            "n",
            "na",
            "nahi",
            "nahin"
        ]


        # Treatment YES
        if answer_lower in yes_answers:

            return QUESTIONS[language][7]


        # Treatment NO
        if answer_lower in no_answers:

            # Skip medicine question
            return QUESTIONS[language][8]


        # If answer isn't clearly yes/no,
        # still move to medicine question
        return QUESTIONS[language][7]


    # --------------------------------------------------------
    # NORMAL NEXT QUESTION
    # --------------------------------------------------------

    next_step = step + 1


    if next_step < len(QUESTIONS[language]):

        return QUESTIONS[language][next_step]


    # --------------------------------------------------------
    # INTERVIEW FINISHED
    # --------------------------------------------------------

    return None


# ------------------------------------------------------------
# CREATE PATIENT DATA
# ------------------------------------------------------------

def create_patient_data(patient, interview_answers):

    """
    Combine patient information with
    information collected by the chatbot.
    """

    patient_data = {

        "Name":
            patient.get("fullName", ""),

        "Age":
            patient.get("age", ""),

        "Gender":
            patient.get("gender", ""),

        "Phone":
            patient.get("phone", ""),


        # ----------------------------------------------------
        # INTERVIEW DATA
        # ----------------------------------------------------

        "Main Problem":
            interview_answers.get(
                "problem",
                ""
            ),

        "Problem Since":
            interview_answers.get(
                "duration",
                ""
            ),

        "Symptoms":
            interview_answers.get(
                "symptoms",
                ""
            ),

        "Severity":
            interview_answers.get(
                "severity",
                ""
            ),

        "Onset":
            interview_answers.get(
                "onset",
                ""
            ),

        "Trigger":
            interview_answers.get(
                "trigger",
                ""
            ),

        "Medical Treatment":
            interview_answers.get(
                "treatment",
                ""
            ),

        "Medicines / Treatment Taken":
            interview_answers.get(
                "medicines",
                ""
            ),

        "Allergies":
            interview_answers.get(
                "allergies",
                ""
            ),

        "Medical History":
            interview_answers.get(
                "medicalHistory",
                ""
            ),

        "Additional Information":
            interview_answers.get(
                "notes",
                ""
            )

    }


    return patient_data