import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();
/* ==========================================================
   FIREBASE ADMIN
========================================================== */

const serviceAccount = JSON.parse(
    process.env.FIREBASE_ADMIN
);

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

console.log("✅ Firebase Connected");

console.log("✅ Firebase Connected");
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

    const uid = req.query.uid;

    if (!uid) {

        return res.status(400).send("Missing Firebase UID");

    }

    console.log("Firebase UID:", uid);

    const url = oauth2Client.generateAuthUrl({

        access_type: "offline",

        prompt: "consent",

        scope: [
            "https://www.googleapis.com/auth/drive.file"
        ],

        state: uid

    });

    console.log("Generated URL:");
    console.log(url);

    res.redirect(url);

});

// /* ==========================================================
//    OAUTH CALLBACK
// ========================================================== */

// app.get("/oauth2callback", async (req, res) => {

//     try {

//         const { code } = req.query;

//         console.log("Received code:", code);

//         const { tokens } = await oauth2Client.getToken(code);

//         oauth2Client.setCredentials(tokens);

//         console.log("================================");
//         console.log("GOOGLE TOKENS");
//         console.dir(tokens, { depth: null });
//         console.log("================================");

//         res.send("OAuth Success");

//     }
//     catch (err) {

//         console.log("========== OAUTH ERROR ==========");
//         console.dir(err, { depth: null });

//         if (err.response?.data) {
//             console.log("Google response:");
//             console.dir(err.response.data, { depth: null });
//         }

//         res.status(500).json({
//             message: err.message,
//             response: err.response?.data || null
//         });

//     }
// });
app.get("/oauth2callback", async (req, res) => {

    try {

        const uid = req.query.state;

        console.log("Firebase UID:", uid);

        const { tokens } = await oauth2Client.getToken({

            code: req.query.code,

            redirect_uri: process.env.GOOGLE_REDIRECT_URI

        });

        console.log("Google Tokens:");
        console.dir(tokens, { depth: null });

        await db.collection("sheets")
            .doc(uid)
            .set({

                accessToken: tokens.access_token || "",

                refreshToken: tokens.refresh_token || "",

                connectedAt: new Date()

            });

        console.log("Tokens saved.");

        res.send("Google Drive Connected Successfully!");

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

app.post("/share/create", async (req, res) => {

    try {

        const { uid } = req.body;

        if (!uid) {

            return res.status(400).json({
                success: false,
                error: "Missing Firebase UID"
            });

        }

        const doc = await db.collection("sheets").doc(uid).get();

        if (!doc.exists) {

            return res.status(404).json({
                success: false,
                error: "Google account not connected."
            });

        }

        const data = doc.data();

        oauth2Client.setCredentials({

            refresh_token: data.refreshToken

        });

        const drive = google.drive({

            version: "v3",
            auth: oauth2Client

        });

        const sheets = google.sheets({

            version: "v4",
            auth: oauth2Client

        });
        // Create spreadsheet

        const spreadsheet = await sheets.spreadsheets.create({

            requestBody: {

                properties: {

                    title: "GradOS Applications"

                }

            }

        });

        const spreadsheetId = spreadsheet.data.spreadsheetId;

        // Write headers

        await sheets.spreadsheets.values.update({

            spreadsheetId,

            range: "Sheet1!A1:D1",

            valueInputOption: "RAW",

            requestBody: {

                values: [[

                    "University",
                    "Program",
                    "Deadline",
                    "Status"

                ]]

            }

        });

        // Make sheet public

        await drive.permissions.create({

            fileId: spreadsheetId,

            requestBody: {

                type: "anyone",

                role: "reader"

            }

        });

        // Save sheet info in Firebase

        await db.collection("sheets")
        .doc(uid)
        .update({

            spreadsheetId,

            spreadsheetUrl:
                `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

        });

        // Return URL

        res.json({

            success: true,

            spreadsheetId,

            spreadsheetUrl:
                `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

        });

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
   START SERVER
========================================================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(`🚀 Server running on port ${PORT}`);

});