import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const pythonRouter = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🚀 路由：运行 Python 并返回结果
pythonRouter.get("/analyze", (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ error: "Missing lat/lon query parameters" });
    }
  
    const scriptPath = path.join(__dirname, "read_imerg.py");
    const python = spawn("python3", [scriptPath, lat, lon]);
  
    let output = "";
    let errorOutput = "";
  
    python.stdout.on("data", (data) => {
      output += data.toString();
    });
  
    python.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
  
    python.on("close", (code) => {
      if (errorOutput) console.error("Python stderr:", errorOutput);
  
      try {
        const parsed = JSON.parse(output);
        res.json(parsed);
      } catch (err) {
        console.error("JSON parse error:", err);
        res.status(500).json({ error: "Invalid JSON from Python" });
      }
    });
  });
  

export { pythonRouter };
