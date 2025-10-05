import express from "express";
import { calcRouter } from "./Calculations.js";

const app = express();

app.use(express.json());

// Default route
app.get("/", (req, res) => {
  res.send("🌍 NASA API is running");
});
// Example endpoint: http://localhost:3000/api/calculate_prob?date=2025-10-04&time=17:15&tzone=-7
app.use("/api", calcRouter);

// Server start
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
