import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';

import usersRouter from './routes/users.router.js';
import petsRouter from './routes/pets.router.js';
import adoptionsRouter from './routes/adoption.router.js';
import sessionsRouter from './routes/sessions.router.js';

const app = express();
const PORT = process.env.PORT || 8080;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/adoptme';

app.use(express.json());
app.use(cookieParser());

app.use('/api/users',usersRouter);
app.use('/api/pets',petsRouter);
app.use('/api/adoptions',adoptionsRouter);
app.use('/api/sessions',sessionsRouter);

// Middleware de manejo de errores: captura cualquier error pasado con next(err)
// (incluidos los de los handlers async envueltos con asyncHandler) y responde
// con un 500 controlado en lugar de dejar la request colgada.
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send({ status: 'error', error: 'Internal server error' });
});

// Solo conecta a Mongo y levanta el server si este archivo se ejecuta directamente
// (no cuando es importado por los tests con supertest).
if (process.env.NODE_ENV !== 'test') {
    mongoose.connect(MONGO_URL)
        .then(() => console.log('Mongo conectado'))
        .catch(err => console.error('Error al conectar a Mongo:', err));

    app.listen(PORT, () => console.log(`Listening on ${PORT}`));
}

export default app;
