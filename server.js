import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

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
Extract the graduate application.

Return ONLY JSON.

{
 "application":{
   "university":"",
   "program":"",
   "deadline":"",
   "application_fee":"",
   "country":""
 },
 "documents":[],
 "referees_required":0
}

Opportunity:

${content}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });

    res.send(response.text);

  } catch(err) {

    console.error(err);

    res.status(500).send(err.message);

  }

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});