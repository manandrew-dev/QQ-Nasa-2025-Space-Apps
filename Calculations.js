import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import fetch from "node-fetch";

export const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname);
const PY_SCRIPT = path.join(PROJECT_ROOT, "read_imerg.py");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const PY_ML = path.join(PROJECT_ROOT, "model", "rand_forest.py");

console.log("✅ Project root:", PROJECT_ROOT);
console.log("✅ Python script path:", PY_SCRIPT);
console.log("✅ Data directory:", DATA_DIR);
console.log("✅ ML script path:", PY_ML);

// ----------------------- helpers -----------------------
async function getCountryFromCoords(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const response = await fetch(url);
    const data = await response.json();
    return data?.countryName || null;
  } catch (err) {
    console.error("❌ Reverse geocode failed:", err);
    return null;
  }
}

function isFuture(date, time, tzone) {
  try {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const tzHours = Number(tzone);
    const local = new Date(Date.UTC(y, m - 1, d, hh, mm));
    const asUTCms = local.getTime() - tzHours * 60 * 60 * 1000;
    const targetUTC = new Date(asUTCms);
    const nowUTC = new Date();
    return targetUTC.getTime() > nowUTC.getTime();
  } catch {
    return false;
  }
}

function formatIMERGDate(date, time, tzone) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const offsetMinutes = parseInt(tzone, 10) * 60;

  const local = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const utc = new Date(local.getTime() - offsetMinutes * 60000);

  const utcMonth = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const utcDay = String(utc.getUTCDate()).padStart(2, "0");
  const utcHour = utc.getUTCHours();
  const utcMinute = utc.getUTCMinutes();

  const block = Math.floor(utcMinute / 30) * 30;
  const start = `S${String(utcHour).padStart(2, "0")}${String(block).padStart(2, "0")}00`;
  const end = `E${String(utcHour).padStart(2, "0")}${String(block + 29).padStart(2, "0")}59`;
  const fileIndex = String(utcHour * 60 + block).padStart(4, "0");

  return { utcMonth, utcDay, start, end, fileIndex };
}

function runPythonJSON(args, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", args, { env: process.env });
    let stdout = "";
    let stderr = "";
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { py.kill("SIGKILL"); } catch {}
      reject(new Error(`Python timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    py.stdout.on("data", (d) => (stdout += d.toString()));
    py.stderr.on("data", (d) => (stderr += d.toString()));

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);

      const lines = (stdout || "").trim().split(/\r?\n/);
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          const obj = JSON.parse(t);
          return resolve({ data: obj, stderr });
        } catch {}
      }
      reject(new Error(`No JSON found in Python output. stderr: ${stderr || "n/a"}`));
    }

    py.on("close", finish);
    py.on("exit", finish);
    py.on("error", (err) => { if (!done) { clearTimeout(timer); reject(err); } });
  });
}

// ----------------------- route -----------------------
router.post("/calculate_prob", async (req, res) => {
  try {
    const { coords, date, time, tzone, city } = req.body || {};
    if (!Array.isArray(coords) || coords.length !== 2 || !date || !time || typeof tzone === "undefined") {
      return res.status(400).json({ error: "Missing required fields: coords [lat,lng], date, time, tzone" });
    }

    const [lat, lon] = coords.map(Number);

    // Decide path: ML only if Australia + future target; otherwise NASA
    const country = await getCountryFromCoords(lat, lon);
    console.log("🌍 Detected country:", country);

    const useML = (country?.toLowerCase() === "australia") && isFuture(date, time, tzone);
    console.log(`⚖️ Strategy: ${useML ? "ML model" : "NASA IMERG"}`);

    if (useML) {
      // ----- ML path -----
      const args = [
        PY_ML,
        String(lat),
        String(lon),
        String(tzone),
        String(date),
        String(time),
        city ? String(city) : ""
      ];

      try {
        const { data, stderr } = await runPythonJSON(args, { timeoutMs: 30000 });
        if (stderr?.trim()) console.warn("[WARN] ML stderr:", stderr.trim().slice(0, 1000));

        return res.json({
          source: "machine_learning",
          average_precipitation_mm_per_hr: typeof data.average_precipitation_mm_per_hr === "number"
            ? data.average_precipitation_mm_per_hr : 0,
          rain_probability_percent: typeof data.rain_probability_percent === "number"
            ? data.rain_probability_percent
            : (typeof data.confidence === "number" ? Math.round(data.confidence * 100) : 0),
          rain_intensity_category: data.rain_intensity_category || data.prediction || "Unknown",
          chart_image_base64: data.chart_image_base64 || null,
          location: data.location || city || "Unknown"
        });
      } catch (err) {
        console.error("❌ ML model error:", err);
        // fall through to NASA as a safe fallback
      }
    }

    // ----- NASA IMERG path -----
    const { utcMonth, utcDay, start, end, fileIndex } = formatIMERGDate(date, time, tzone);
    const baseName = `3B-HHR.MS.MRG.3IMERG`;
    const version = `V07B.HDF5`;
    const results = [];

    for (let year = 1998; year <= 2024; year++) {
      const filename = `${baseName}.${year}${utcMonth}${utcDay}-${start}-${end}.${fileIndex}.${version}`;
      const filePath = path.join(DATA_DIR, filename);
      console.log(`🟢 Checking file: ${filePath}`);

      const py = spawn("python3", [PY_SCRIPT, lat, lon, filePath]);
      let output = "";
      let errorOutput = "";

      py.stdout.on("data", (d) => (output += d.toString()));
      py.stderr.on("data", (d) => (errorOutput += d.toString()));

      await new Promise((resolve) => py.on("close", resolve));

      if (errorOutput.trim()) {
        console.warn(`[WARN] Python stderr for ${year}:`, errorOutput.trim().slice(0, 500));
      }

      try {
        const parsed = JSON.parse(output);
        if (!isNaN(parsed.precip_mm_per_hr)) {
          results.push({ year, precip: parsed.precip_mm_per_hr });
          console.log(`✅ Year ${year} data: ${parsed.precip_mm_per_hr}`);
        }
      } catch {
        console.warn(`[WARN] Invalid output for ${year}: ${output}`);
      }
    }

    if (results.length === 0) {
      return res.json({ message: "No valid data found for this location/time" });
    }

    // Stats
    const precipValues = results.map((r) => r.precip);
    const rainValues = precipValues.filter((v) => v > 0);
    const rainProb = (rainValues.length / precipValues.length) * 100;
    const avg = rainValues.length > 0
      ? rainValues.reduce((a, b) => a + b, 0) / rainValues.length
      : 0;

    let category;
    if (avg === 0) category = "no rain";
    else if (avg < 2.5) category = "light rain";
    else if (avg < 10) category = "moderate rain";
    else category = "heavy rain";

    // Chart
    const width = 800;
    const height = 400;
    const chartCallback = (ChartJS) => { ChartJS.defaults.font.size = 14; };
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, chartCallback });

    const labels = results.map((r) => r.year);
    const values = results.map((r) => r.precip);

    const config = {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Precipitation (mm/hr)",
          data: values,
          borderColor: "rgba(54, 162, 235, 1)",
          backgroundColor: "rgba(54, 162, 235, 0.2)",
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        plugins: {
          title: { display: true, text: `Historical Precipitation (${lat}, ${lon})` },
          legend: { display: false }
        },
        scales: {
          x: { title: { display: true, text: "Year" } },
          y: { title: { display: true, text: "mm/hr" }, beginAtZero: true }
        }
      }
    };

    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(config);
    const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;

    return res.json({
      source: "nasa_imerg",
      years_used: results.length,
      average_precipitation_mm_per_hr: Number(avg.toFixed(4)),
      rain_probability_percent: Number(rainProb.toFixed(1)),
      rain_intensity_category: category,
      chart_image_base64: base64Image
    });

  } catch (err) {
    console.error("💥 ERROR in /calculate_prob:", err);
    return res.status(500).json({ error: err.message });
  }
});
