import express from 'express';
import { buildURLIndex } from './buildURLIndex.js';
import { calcRouter } from './calculations.js';

const app = express();
app.use(express.json());
app.use('/api', calcRouter);

const DATA_FILE = `./data/data.txt`;
await buildURLIndex(DATA_FILE);

app.get ('/', (req, res) => {
    res.send('Hello World!');
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});