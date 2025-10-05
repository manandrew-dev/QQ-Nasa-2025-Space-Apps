import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import fetch from "node-fetch"; // ✅ 新增，用于请求 BigDataCloud API

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname);
const PY_SCRIPT = path.join(PROJECT_ROOT, "read_imerg.py");
const DATA_DIR = path.join(PROJECT_ROOT, "data");

console.log("✅ Project root:", PROJECT_ROOT);
console.log("✅ Python script path:", PY_SCRIPT);
console.log("✅ Data directory:", DATA_DIR);

// ============================================================
// 🧭 使用 BigDataCloud API 获取国家名称
// ============================================================
async function getCountryFromCoords(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const response = await fetch(url);
    const data = await response.json();

    if (data && data.countryName) {
      return data.countryName;
    }
    return null;
  } catch (err) {
    console.error("❌ Reverse geocode failed:", err);
    return null;
  }
}

// ============================================================
// 🕒 格式化 IMERG 文件日期
// ============================================================
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

// ============================================================
// 🚀 主路由：计算降水概率或机器学习预测
// ============================================================
router.post("/calculate_prob", async (req, res) => {
  try {
    const { coords, date, time, tzone } = req.body;
    if (!coords || !date || !time || !tzone) {
      return res.status(400).json({ error: "Missing coords/date/time/tzone" });
    }

    const [lat, lon] = coords;
    // 🌏 Step 1: 使用 BigDataCloud 判断国家
    const country = await getCountryFromCoords(lat, lon);
    console.log("🌍 Detected country:", country);

    // 🇦🇺 Step 2: 如果在澳大利亚，调用机器学习模型
    if (country && country.toLowerCase() === "australia") {
      console.log("🇦🇺 Using ML model (rand_forest.py) for Australian location");

      const PY_ML = path.join(PROJECT_ROOT, "model", "rand_forest.py");
      const python = spawn("python3", [PY_ML, lat, lon]);

      let output = "";
      python.stdout.on("data", (data) => (output += data.toString()));
      let errorOutput = "";
      python.stderr.on("data", (data) => (errorOutput += data.toString()));

      await new Promise((resolve) => python.on("close", resolve));

      if (errorOutput.trim()) {
        console.warn("[WARN] ML stderr:", errorOutput.trim());
      }

      try {
        // 🧹 清理 Python 输出：只取最可能是 JSON 的部分
        const possibleJSON = output
          .split("\n")
          .filter(line => line.trim().startsWith("{") && line.trim().endsWith("}"));
      
        // 如果没找到 JSON 行，就输出原始数据帮助调试
        if (possibleJSON.length === 0) {
          console.log("No JSON found in Python output. Raw output:");
          console.log(output);
        }
      
        const cleanedOutput = possibleJSON.length > 0 ? possibleJSON[possibleJSON.length - 1] : "{}";
        const result = JSON.parse(cleanedOutput);
      
        console.log("✅ Parsed ML result:", result);
      
        // 🔁 确保字段存在，防止 undefined
        return res.json({
          source: "machine_learning",
          location: result.location || "Unknown",
          prediction: result.prediction || "N/A",
          confidence: result.confidence ?? 0,
        });
      
      } catch (err) {
        console.error("❌ ML model parse error:", err);
        console.log("🔍 Raw Python output:\n", output);
        return res.status(500).json({ error: "Failed to parse ML output" });
      }
      
    }

    // 🌎 Step 3: 否则执行 NASA 历史数据统计
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

    // 📊 Step 4: 计算统计指标
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

    // 📈 Step 5: 绘制趋势图
    const width = 800;
    const height = 400;
    const chartCallback = (ChartJS) => {
      ChartJS.defaults.font.size = 14;
    };
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
          title: {
            display: true,
            text: `Historical Precipitation (${lat}, ${lon})`
          },
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

    // ✅ 返回结果
    res.json({
      source: "nasa_imerg",
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
