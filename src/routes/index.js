const { Router } = require('express');
const router = Router();
const db = require('../database');

const path = require('path');

router.get('/repositorio', (req, res) => {
  const { q, bankArea, category, dateFrom, dateTo } = req.query;

  const guides = db.searchGuides({ q, bankArea, category, dateFrom, dateTo });
  const bankAreas = db.getBankAreas();
  const categories = db.getCategories();

  res.render(path.join(__dirname, '../views/layout'), {
    currentTab: 'repositorio',
    pageTemplate: path.join(__dirname, '../views/repositorio'),
    pageData: { guides, bankAreas, categories, filters: { q, bankArea, category, dateFrom, dateTo } },
  });
});

router.get('/guia/:id', (req, res) => {
  const guide = db.getGuide(Number(req.params.id));
  if (!guide) return res.redirect('/repositorio');

  res.render(path.join(__dirname, '../views/layout'), {
    currentTab: 'repositorio',
    pageTemplate: path.join(__dirname, '../views/guia'),
    pageData: { guide },
  });
});

router.get('/tutorial', (req, res) => {
  res.render(path.join(__dirname, '../views/layout'), {
    currentTab: 'tutorial',
    pageTemplate: path.join(__dirname, '../views/tutorial'),
    pageData: {},
  });
});

router.get('/mis-proyectos', (req, res) => {
  res.render(path.join(__dirname, '../views/layout'), {
    currentTab: 'mis-proyectos',
    pageTemplate: path.join(__dirname, '../views/mis-proyectos'),
    pageData: {},
  });
});

router.get('/', (req, res) => {
  res.redirect('/repositorio');
});

module.exports = router;
