import { Router, Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import * as db from '../database';
import { buildGuideFormConfig } from '../models/guide.model';
import { createGuide } from '../services/guide.service';

const router = Router();

const storage = multer.diskStorage({
  destination: path.resolve(process.cwd(), 'uploads'),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.includes('pdf') || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

router.get('/repositorio', (req: Request, res: Response) => {
  const { q, bankArea, category, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

  const guides = db.searchGuides({ q, bankArea, category, dateFrom, dateTo });
  const bankAreas = db.getBankAreas();
  const categories = db.getCategories();

  res.render(path.join(__dirname, '../views/layout'), {
    currentTab: 'repositorio',
    pageTemplate: path.join(__dirname, '../views/repositorio'),
    pageData: { guides, bankAreas, categories, filters: { q, bankArea, category, dateFrom, dateTo } },
  });
});

router.get('/guia/nueva', (req: Request, res: Response) => {
  const bankAreas = db.getBankAreas();
  const categories = db.getCategories();
  const formModel = buildGuideFormConfig(bankAreas, categories);

  res.render(path.join(__dirname, '../views/layout'), {
    currentTab: 'repositorio',
    pageTemplate: path.join(__dirname, '../views/insert'),
    pageData: { formModel },
  });
});

router.post('/guia/nueva', upload.array('documents'), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).send('Debe subir al menos un archivo PDF.');
      return;
    }

    const { title, summary, bankArea, category, question, content_md } = req.body as Record<string, string | undefined>;

    if (!title || !question) {
      res.status(400).send('Los campos Título y Pregunta son obligatorios.');
      return;
    }

    const guideId = await createGuide(
      {
        title,
        summary: summary || '',
        bankArea: bankArea || '',
        category: category || '',
        question,
        contentMd: content_md || '',
      },
      files,
    );

    res.redirect(`/guia/${guideId}`);
  } catch (err) {
    console.error('Error creando guía:', err);
    res.status(500).send(`Error al crear la guía: ${err instanceof Error ? err.message : 'Error desconocido'}`);
  }
});

router.get('/guia/:id', (req: Request, res: Response) => {
  const guide = db.getGuide(Number(req.params.id));
  if (!guide) {
    res.redirect('/repositorio');
    return;
  }

  res.render(path.join(__dirname, '../views/layout'), {
    currentTab: 'repositorio',
    pageTemplate: path.join(__dirname, '../views/guia'),
    pageData: { guide },
  });
});

router.get('/tutorial', (req: Request, res: Response) => {
  res.render(path.join(__dirname, '../views/layout'), {
    currentTab: 'tutorial',
    pageTemplate: path.join(__dirname, '../views/tutorial'),
    pageData: {},
  });
});

router.get('/mis-proyectos', (req: Request, res: Response) => {
  const { q, bankArea, category, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

  const guides = db.searchGuides({ q, bankArea, category, dateFrom, dateTo });
  const bankAreas = db.getBankAreas();
  const categories = db.getCategories();

  res.render(path.join(__dirname, '../views/layout'), {
    currentTab: 'mis-proyectos',
    pageTemplate: path.join(__dirname, '../views/repositorio'),
    pageData: { guides, bankAreas, categories, filters: { q, bankArea, category, dateFrom, dateTo } },
  });
});

router.get('/', (req: Request, res: Response) => {
  res.redirect('/repositorio');
});

export default router;
