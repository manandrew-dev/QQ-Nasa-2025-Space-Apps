import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

export const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON = process.env.PYTHON_BIN || "python3";
const PY_ML = path.join(__dirname, "model", "rand_forest.py");

function runPythonJSON(args, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const py = spawn(PYTHON, args, { env: process.env });
    let stdout = "";
    let stderr = "";
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { py.kill("SIGKILL"); } catch {}
      reject(new Error(`Python timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    py.stdout.on("data", (d) => { stdout += d.toString(); });
    py.stderr.on("data", (d) => { stderr += d.toString(); });

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const lines = (stdout || "").trim().split(/\r?\n/);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          return resolve({ data: obj, stderr });
        } catch {}
      }
      reject(new Error(`No JSON found in Python output`));
    }

    py.on("close", finish);
    py.on("exit", finish);
    py.on("error", (err) => { if (!done) { clearTimeout(timer); reject(err); } });
  });
}

router.post("/calculate_prob", async (req, res) => {
  try {
    const { coords, date, time, tzone, city } = req.body || {};
    if (!Array.isArray(coords) || coords.length !== 2 || !date || !time || typeof tzone === "undefined") {
      return res.status(400).json({ error: "Missing required fields: coords [lat,lng], date, time, tzone" });
    }
    const [lat, lng] = coords.map(Number);

    const args = [
      PY_ML,
      String(lat),
      String(lng),
      String(tzone),
      String(date),
      String(time),
      city ? String(city) : ""
    ];

    const { data, stderr } = await runPythonJSON(args);
    if (stderr?.trim()) console.warn("[ML stderr]", stderr.slice(0, 1000));

    return res.json({
      average_precipitation_mm_per_hr:
        typeof data.average_precipitation_mm_per_hr === "number" ? data.average_precipitation_mm_per_hr : 0,
      rain_probability_percent:
        typeof data.rain_probability_percent === "number" ? data.rain_probability_percent
          : (typeof data.confidence === "number" ? Math.round(data.confidence * 100) : 0),
      rain_intensity_category: data.rain_intensity_category || data.prediction || "Unknown",
      chart_image_base64: data.chart_image_base64 || null,
      debug: { location: data.location || city || null }
    });
  } catch (err) {
    console.error("[/calculate_prob ERROR]", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
});
