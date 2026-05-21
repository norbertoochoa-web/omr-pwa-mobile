import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FORMAT'));
    }
  },
});

const mockDataPath = path.join(__dirname, 'data', 'mock_data.json');
let mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));

const uploadsDir = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function simulateDelay(min = 1000, max = 2000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function generateJWT(userId) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    })
  ).toString('base64url');
  const signature = Buffer.from('mock-signature').toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided', code: 'NO_TOKEN' });
  }

  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (payload.exp < Date.now() / 1000) {
      return res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}

// Test endpoint to verify connectivity
app.get('/api/v1/health', (req, res) => {
  console.log('Health check received from:', req.ip);
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/v1/auth/login', async (req, res) => {
  console.log('Login request received from:', req.ip);
  console.log('Request body:', req.body);
  await simulateDelay();

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required', code: 'MISSING_FIELDS' });
  }

  const user = mockData.users.find((u) => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials', code: 'INVALID_CRED' });
  }

  const token = generateJWT(user.id);

  res.json({
    token,
    user_id: user.id,
    subscription: user.subscription,
  });
});

app.get('/api/v1/subscription/:userId', authenticateToken, async (req, res) => {
  await simulateDelay();

  const { userId } = req.params;

  if (userId !== req.userId) {
    return res.status(403).json({ message: 'Access denied', code: 'FORBIDDEN' });
  }

  const user = mockData.users.find((u) => u.id === userId);

  if (!user) {
    return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
  }

  res.json({
    status: user.subscription.status,
    max_images: user.subscription.max_images,
    expires: user.subscription.expires,
  });
});

app.post('/api/v1/sessions', authenticateToken, async (req, res) => {
  await simulateDelay();

  const { session_id, user_id } = req.body;

  if (!session_id || !user_id) {
    return res.status(400).json({ message: 'Missing fields', code: 'MISSING_FIELDS' });
  }

  const existing = mockData.sessions.find((s) => s.session_id === session_id);
  if (existing) {
    return res.status(409).json({ message: 'Duplicate session', code: 'DUPLICATE_SESSION' });
  }

  const session = {
    session_id,
    user_id,
    status: 'OPEN',
    created_at: new Date().toISOString(),
    images: [],
  };

  mockData.sessions.push(session);

  res.status(201).json({
    session_token: `session_${session_id}`,
    status: 'OPEN',
  });
});

app.post('/api/v1/upload', authenticateToken, upload.single('image'), async (req, res) => {
  await simulateDelay();

  if (!req.file) {
    return res.status(400).json({ message: 'No image provided', code: 'INVALID_FORMAT' });
  }

  const { session_id, timestamp } = req.body;

  if (!session_id) {
    return res.status(400).json({ message: 'Missing session_id', code: 'MISSING_SESSION' });
  }

  const session = mockData.sessions.find((s) => s.session_id === session_id);
  if (!session) {
    return res.status(404).json({ message: 'Session not found', code: 'SESSION_NOT_FOUND' });
  }

  const imageId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const imagePath = path.join(uploadsDir, `${imageId}.jpg`);
  fs.writeFileSync(imagePath, req.file.buffer);

  session.images.push({
    image_id: imageId,
    timestamp: timestamp || new Date().toISOString(),
    status: 'RECEIVED',
  });

  res.json({
    image_id: imageId,
    status: 'RECEIVED',
  });
});

app.get('/api/v1/sessions/:sessionId/download', authenticateToken, async (req, res) => {
  await simulateDelay(500, 1000);

  const { sessionId } = req.params;

  const session = mockData.sessions.find((s) => s.session_id === sessionId);
  if (!session) {
    return res.status(404).json({ message: 'Session not found', code: 'SESSION_NOT_FOUND' });
  }

  const now = new Date();
  const fecha = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  let txt = '[SESSION]\r\n';
  txt += `ID=${session.session_id}\r\n`;
  txt += `PROFESOR=${session.user_id}\r\n`;
  txt += `FECHA=${fecha}\r\n`;
  txt += '[DATA]\r\n';

  let errores = 0;
  let total = session.images.length;

  for (let i = 0; i < total; i++) {
    const img = session.images[i];
    const id = `A${String(i + 1).padStart(3, '0')}`;
    const respuestas = ['A', 'B', 'C', 'D'];
    const randomAnswers = Array.from({ length: 5 }, () => respuestas[Math.floor(Math.random() * respuestas.length)]);
    const hasError = Math.random() < 0.15;
    const status = hasError ? 'ERR_BLANK' : 'OK';

    if (hasError) {
      errores++;
      const blankIdx = Math.floor(Math.random() * 5);
      randomAnswers[blankIdx] = '';
    }

    txt += `${id};${randomAnswers[0]};${randomAnswers[1]};${randomAnswers[2]};${randomAnswers[3]};${randomAnswers[4]};${status}\r\n`;
  }

  txt += '[END]\r\n';
  txt += `TOTAL=${total}\r\n`;
  txt += `ERRORES=${errores}\r\n`;

  const txtBuffer = Buffer.from(txt, 'utf-8');

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${session.session_id}.txt"`);
  res.setHeader('Content-Length', txtBuffer.length);
  res.send(txtBuffer);
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: 'File upload error', code: 'UPLOAD_ERROR' });
  }
  if (err.message === 'INVALID_FORMAT') {
    return res.status(400).json({ message: 'Invalid file format', code: 'INVALID_FORMAT' });
  }
  console.error(err);
  res.status(500).json({ message: 'Internal server error', code: 'INTERNAL_ERROR' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock API running on http://0.0.0.0:${PORT}/api/v1`);
  console.log('Available endpoints:');
  console.log('  POST   /api/v1/auth/login');
  console.log('  GET    /api/v1/subscription/:userId');
  console.log('  POST   /api/v1/sessions');
  console.log('  POST   /api/v1/upload');
  console.log('  GET    /api/v1/sessions/:sessionId/download');
});
