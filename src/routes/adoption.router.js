import { Router} from 'express';
import adoptionsController from '../controllers/adoptions.controller.js';

const router = Router();

// Envuelve los handlers async para que, si la promesa rechaza, el error
// llegue al middleware de manejo de errores en lugar de dejar la request
// colgada (limitacion conocida de Express 4 con async/await).
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/',asyncHandler(adoptionsController.getAllAdoptions));
router.get('/:aid',asyncHandler(adoptionsController.getAdoption));
router.post('/:uid/:pid',asyncHandler(adoptionsController.createAdoption));

export default router;