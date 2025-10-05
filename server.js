import express from "express";
import cors from "cors";
import { calcRouter } from "./Calculations.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("✅ NASA Space Apps Backend is running");
});

// 主功能路由
app.use("/api", calcRouter);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🌎 Server running at http://localhost:${PORT}`);
});

