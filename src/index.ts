import 'dotenv/config';
import express from 'express';
import path from 'path';
import routes from './routes';
import chatRoutes from './routes/chat';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.engine('ejs', require('ejs').renderFile);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(routes);
app.use(chatRoutes);

app.listen(PORT, () => {
  console.log(`quipudoc corriendo en http://localhost:${PORT}`);
});
