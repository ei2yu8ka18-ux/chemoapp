import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth';
import treatmentsRouter from './routes/treatments';
import interventionsRouter from './routes/interventions';
import usersRouter from './routes/users';
import workdiariesRouter from './routes/workdiaries';
import monthlyRouter from './routes/monthly';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: process.env.NODE_ENV === 'production'
      ? false
      : /^http:\/\/localhost:\d+$/,  // 開発環境: localhostの全ポートを許可
    credentials: true,
  })
);
app.use(express.json());

// Health check
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/treatments', treatmentsRouter);
app.use('/api/interventions', interventionsRouter);
app.use('/api/users', usersRouter);
app.use('/api/workdiaries', workdiariesRouter);
app.use('/api/monthly', monthlyRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
