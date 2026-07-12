import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";

dotenv.config();

/* ===========================
   GOOGLE SHEETS
=========================== */

const serviceAccount = JSON.parse(
  process.env.GOOGLE_SERVICE_ACCOUNT
);

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets"
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
const authClient = await auth.getClient();

const about = await drive.about.get({
  fields: "user"
});

console.log("Logged in as:");
console.log(about.data.user);
const app = express();

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

app.get("/", (req, res) => {
  res.send("GradOS AI Backend Running 🚀");
});

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

- application_deadline: Must always be in DD-MM-YYYY format.
- Example: 02-07-2026.
- If no deadline is found, return an empty string 
- Detect required documents.
- Detect application deadline.
- Detect university.
- Detect program.
- Detect number of referees.
- If a document is required, set it to "Not Started".
- If not required, set it to "Not Required".
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

  } catch(err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});
/* ===========================
   CREATE SHARE SHEET
=========================== */

app.post("/share/create", async (req, res) => {

  try {

    const { userName } = req.body;

    console.log("STEP 1 - Creating spreadsheet");

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: `${userName || "GradOS"} - Applications`
        }
      }
    });

    console.log("✅ STEP 1 Complete");

    const spreadsheetId = spreadsheet.data.spreadsheetId;

    console.log("STEP 2 - Moving into folder");

    await drive.files.update({
      fileId: spreadsheetId,
      addParents: process.env.GOOGLE_DRIVE_FOLDER_ID,
      removeParents: "root",
      fields: "id, parents"
    });

    console.log("✅ STEP 2 Complete");

    console.log("STEP 3 - Writing headers");

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

    console.log("✅ STEP 3 Complete");

    console.log("STEP 4 - Making public");

    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        type: "anyone",
        role: "reader"
      }
    });

    console.log("✅ STEP 4 Complete");

    res.json({
      success: true,
      sheetId: spreadsheetId,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
    });

  } catch (err) {

    console.error("SHARE ERROR:");
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message
    });

  }

});
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

    // Make public
    await drive.permissions.create({

      fileId: spreadsheetId,

      requestBody: {

        type: "anyone",

        role: "reader"

      }

    });

    res.json({

      success: true,

      sheetId: spreadsheetId,

      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

    });

  }

  catch(err){

    console.error(err);

    res.status(500).json({

      success:false,

      error:err.message

    });

  }

});
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});