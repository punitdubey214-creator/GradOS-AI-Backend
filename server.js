import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";

dotenv.config();

/* ==========================================================
   GOOGLE AUTH
========================================================== */

if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT not found.");
}

const serviceAccount = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT
);

const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
});

const sheets = google.sheets({
    version: "v4",
    auth
});

const drive = google.drive({
    version: "v3",
    auth
});

try {

    const about = await drive.about.get({
        fields: "user"
    });

    console.log("Logged in as:");
    console.log(about.data.user);

} catch (err) {

    console.error("Google authentication failed");
    console.error(err);

}

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

app.post("/share/create", async (req, res) => {

    try {

        const { userName } = req.body;

        console.log("STEP 1 - Creating Spreadsheet");

        const spreadsheet = await sheets.spreadsheets.create({

            requestBody: {

                properties: {

                    title: `${userName || "GradOS"} - Applications`

                }

            }

        });

        console.log("STEP 1 COMPLETE");

        const spreadsheetId =
            spreadsheet.data.spreadsheetId;

        console.log("Spreadsheet ID:", spreadsheetId);

        console.log("STEP 2 - Moving Spreadsheet");

        await drive.files.update({

            fileId: spreadsheetId,

            addParents:
                process.env.GOOGLE_DRIVE_FOLDER_ID,

            removeParents: "root",

            fields: "id,parents"

        });

        console.log("STEP 2 COMPLETE");

        console.log("STEP 3 - Writing Headers");

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

        console.log("STEP 3 COMPLETE");

        console.log("STEP 4 - Public Permission");

        await drive.permissions.create({

            fileId: spreadsheetId,

            requestBody: {

                type: "anyone",

                role: "reader"

            }

        });

        console.log("STEP 4 COMPLETE");

        res.json({

            success: true,

            sheetId: spreadsheetId,

            sheetUrl:
                `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

        });

    }

    catch (err) {

        console.log("=================================");
        console.log("GOOGLE FULL ERROR");
        console.log("=================================");

        console.log("Status:", err.code);
        console.log("Message:", err.message);

        if (err.response) {

            console.log("Google Response:");

            console.dir(
                err.response.data,
                {
                    depth: null
                }
            );

        } else {

            console.error(err);

        }

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