import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";

dotenv.config();
console.log("CLIENT ID =", process.env.GOOGLE_CLIENT_ID);
console.log("CLIENT SECRET =", process.env.GOOGLE_CLIENT_SECRET ? "FOUND" : "MISSING");
console.log("REDIRECT =", process.env.GOOGLE_REDIRECT_URI);

/* ==========================================================
   GOOGLE OAUTH
========================================================== */

const oauth2Client = new google.auth.OAuth2(

    process.env.GOOGLE_CLIENT_ID,

    process.env.GOOGLE_CLIENT_SECRET,

    process.env.GOOGLE_REDIRECT_URI

);

/* ==========================================================
   EXPRESS
========================================================== */

const app = express();

app.use(cors());
app.use(express.json());

/* ==========================================================
   GEMINI
========================================================== */

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

app.get("/", (req, res) => {

    res.send("GradOS AI Backend Running 🚀");

});

/* ==========================================================
   GOOGLE LOGIN
========================================================== */

app.get("/google/login", (req, res) => {


    console.log("CLIENT ID:", process.env.GOOGLE_CLIENT_ID);

    const url = oauth2Client.generateAuthUrl({

        access_type: "offline",

        prompt: "consent",

        scope: [
            "https://www.googleapis.com/auth/drive.file"
        ]

    });

    console.log("Generated URL:");
    console.log(url);

    res.redirect(url);

});

/* ==========================================================
   OAUTH CALLBACK
========================================================== */

app.get("/oauth2callback", async (req, res) => {

    try {

        const { code } = req.query;

        console.log("Received code:", code);

        const { tokens } = await oauth2Client.getToken(code);

        oauth2Client.setCredentials(tokens);

        console.log("================================");
        console.log("GOOGLE TOKENS");
        console.dir(tokens, { depth: null });
        console.log("================================");

        res.send("OAuth Success");

    }
    catch (err) {

        console.log("========== OAUTH ERROR ==========");
        console.dir(err, { depth: null });

        if (err.response?.data) {
            console.log("Google response:");
            console.dir(err.response.data, { depth: null });
        }

        res.status(500).json({
            message: err.message,
            response: err.response?.data || null
        });

    }
});
/* ==========================================================
   SMART IMPORT
========================================================== */

app.post("/ai/import", async (req, res) => {

    try {

        const { content } = req.body;

        const prompt = `
You are extracting graduate application information.

Return ONLY valid JSON.

{
  "application": {
    "university": "",
    "program": "",
    "deadline": "",
    "feeRequired": "No",
    "feeAmount": "",
    "feeCurrency": "USD",
    "status": "Researching",
    "cv": "Not Started",
    "sop": "Not Started",
    "coverLetter": "Not Required",
    "motivationLetter": "Not Required",
    "referees": "Not Started",
    "applicationForm": "Not Started",
    "transcript": "Not Started",
    "englishTest": "Not Started"
  },
  "referees_required": 0,
  "country": "",
  "documents": [],
  "notes": ""
}

Rules:

- Deadline MUST be DD-MM-YYYY.
- If unavailable return "".
- Return ONLY JSON.

Opportunity:

${content}
`;

        const response = await ai.models.generateContent({

            model: "gemini-2.0-flash",

            contents: prompt

        });

        const text = response.text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        res.json(JSON.parse(text));

    }

    catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

/* ==========================================================
   CREATE SHARE SHEET
========================================================== */
        /* ==========================================================
        CREATE SHARE SHEET
        ========================================================== */

        app.post("/share/create", (req, res) => {

            res.json({

                success: true,

                message: "OAuth connected successfully. Sheet creation comes next."

            });

        });

        

/* ==========================================================
   START SERVER
========================================================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(`🚀 Server running on port ${PORT}`);

});