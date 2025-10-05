import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname);
const PY_SCRIPT = path.join(PROJECT_ROOT, "read_imerg.py");
const DATA_DIR = path.join(PROJECT_ROOT, "data");

console.log("✅ Project root:", PROJECT_ROOT);
console.log("✅ Python script path:", PY_SCRIPT);
console.log("✅ Data directory:", DATA_DIR);

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

router.post("/calculate_prob", async (req, res) => {
  try {
    const { coords, date, time, tzone } = req.body;
    if (!coords || !date || !time || !tzone) {
      return res.status(400).json({ error: "Missing coords/date/time/tzone" });
    }

    const [lat, lon] = coords;
    const { utcMonth, utcDay, start, end, fileIndex } = formatIMERGDate(date, time, tzone);

    const baseName = `3B-HHR.MS.MRG.3IMERG`;
    const version = `V07B.HDF5`;
    const results = [];

    for (let year = 1998; year <= 2024; year++) {
      const filename = `${baseName}.${year}${utcMonth}${utcDay}-${start}-${end}.${fileIndex}.${version}`;
      const filePath = path.join(DATA_DIR, filename);

      console.log(`🟢 Checking file: ${filePath}`);

      const python = spawn("python3", [PY_SCRIPT, lat, lon, filePath]);

      let output = "";
      let errorOutput = "";

      python.stdout.on("data", (data) => (output += data.toString()));
      python.stderr.on("data", (data) => (errorOutput += data.toString()));

      await new Promise((resolve) => python.on("close", resolve));

      if (errorOutput.trim()) {
        console.warn(`[WARN] Python stderr for ${year}:`, errorOutput.trim());
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

    const precipValues = results.map((r) => r.precip);
    const rainValues = precipValues.filter((v) => v > 0);
    const rainProb = (rainValues.length / precipValues.length) * 100;

    const avg = rainValues.length > 0
      ? rainValues.reduce((a, b) => a + b, 0) / rainValues.length
      : 0;

    let category;
    if (avg === 0) {
      category = "no rain";
    } else if (avg < 2.5) {
      category = "light rain";
    } else if (avg < 10) {
      category = "moderate rain";
    } else {
      category = "heavy rain";
    }


    const width = 800;
    const height = 400;
    const chartCallback = (ChartJS) => {
      ChartJS.defaults.font.size = 14;
    };
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, chartCallback });

    const labels = results.map(r => r.year);
    const values = results.map(r => r.precip);

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
          title: {
            display: true,
            text: `Historical Precipitation (${lat}, ${lon})`
          },
          legend: {
            display: false
          }
        },
        scales: {
          x: { title: { display: true, text: "Year" } },
          y: { title: { display: true, text: "mm/hr" }, beginAtZero: true }
        }
      }
    };

    // Base64
    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(config);
    const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;


    res.json({
      years_used: results.length,
      average_precipitation_mm_per_hr: avg.toFixed(4),
      rain_probability_percent: rainProb.toFixed(1),
      rain_intensity_category: category,
      chart_image_base64: base64Image,
    });

  } catch (err) {
    console.error("💥 ERROR in /calculate_prob:", err);
    res.status(500).json({ error: err.message });
  }
});

export { router as calcRouter };
