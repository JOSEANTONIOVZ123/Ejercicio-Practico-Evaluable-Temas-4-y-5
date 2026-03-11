const path = require('path');
const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'malaga-secret-examen',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 4
    }
  })
);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.render('index', {
    pageTitle: 'Monumentos de Málaga',
    user: req.session.user || null
  });
});

app.get('/api/session', (req, res) => {
  res.json({
    loggedIn: Boolean(req.session.user),
    user: req.session.user || null
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (username === 'admin' && password === '1234') {
    req.session.user = { username: 'admin' };

    return res.json({
      ok: true,
      message: 'Login correcto',
      user: req.session.user
    });
  }

  return res.status(401).json({
    ok: false,
    message: 'Usuario o contraseña incorrectos'
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        ok: false,
        message: 'No se pudo cerrar la sesión'
      });
    }

    res.clearCookie('connect.sid');
    return res.json({
      ok: true,
      message: 'Sesión cerrada'
    });
  });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});