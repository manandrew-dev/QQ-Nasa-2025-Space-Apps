import express from 'express';
import { buildURLIndex } from './buildURLIndex.js';
import { calcRouter } from './Calculations.js';
import { pythonRouter } from './pythonRouter.js';  
console.log("✅ pythonRouter successfully imported");

const app = express();
app.use(express.json());

const DATA_FILE = `./data/data.txt`;
await buildURLIndex(DATA_FILE);

// ✅ Mount your router under /api
app.use('/api', calcRouter);
app.use('/api', pythonRouter);
app.get('/', (req, res) => {
  res.send('Hello World!');
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
