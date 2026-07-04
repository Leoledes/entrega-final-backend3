import { expect } from 'chai';
import sinon from 'sinon';
import supertest from 'supertest';
import mongoose from 'mongoose';

import app from '../src/app.js';
import { adoptionsService, petsService, usersService } from '../src/services/index.js';

const requester = supertest(app);

describe('Router: /api/adoptions (adoption.router.js)', () => {

    // Restauramos todos los stubs/mocks despues de cada test para que no se
    // contaminen entre si.
    afterEach(() => {
        sinon.restore();
    });

    after(() => {
        // Si en algun momento se abre una conexion real a mongoose la cerramos,
        // para que el proceso de mocha pueda terminar limpio.
        if (mongoose.connection.readyState !== 0) {
            mongoose.connection.close();
        }
    });

    // ---------------------------------------------------------------
    // GET /api/adoptions
    // ---------------------------------------------------------------
    describe('GET /api/adoptions', () => {

        it('debe devolver status 200 y el listado de adopciones (caso exitoso)', async () => {
            const fakeAdoptions = [
                { _id: '64a000000000000000000001', owner: '64a000000000000000000010', pet: '64a000000000000000000020' },
                { _id: '64a000000000000000000002', owner: '64a000000000000000000011', pet: '64a000000000000000000021' }
            ];

            const getAllStub = sinon.stub(adoptionsService, 'getAll').resolves(fakeAdoptions);

            const { statusCode, body } = await requester.get('/api/adoptions');

            expect(statusCode).to.equal(200);
            expect(body.status).to.equal('success');
            expect(body.payload).to.be.an('array').with.lengthOf(2);
            expect(getAllStub.calledOnce).to.be.true;
        });

        it('debe devolver un payload vacio cuando no existen adopciones', async () => {
            sinon.stub(adoptionsService, 'getAll').resolves([]);

            const { statusCode, body } = await requester.get('/api/adoptions');

            expect(statusCode).to.equal(200);
            expect(body.status).to.equal('success');
            expect(body.payload).to.be.an('array').with.lengthOf(0);
        });

        it('debe propagar un error 500 si el servicio falla inesperadamente', async () => {
            sinon.stub(adoptionsService, 'getAll').rejects(new Error('DB caida'));

            // El controlador no tiene try/catch, por lo que el error es
            // capturado por el manejador de errores por defecto de Express.
            const response = await requester.get('/api/adoptions');
            expect(response.statusCode).to.equal(500);
        });
    });

    // ---------------------------------------------------------------
    // GET /api/adoptions/:aid
    // ---------------------------------------------------------------
    describe('GET /api/adoptions/:aid', () => {

        it('debe devolver status 200 y la adopcion cuando existe (caso exitoso)', async () => {
            const fakeAdoption = { _id: '64a000000000000000000001', owner: '64a000000000000000000010', pet: '64a000000000000000000020' };
            const getByStub = sinon.stub(adoptionsService, 'getBy').resolves(fakeAdoption);

            const { statusCode, body } = await requester.get('/api/adoptions/64a000000000000000000001');

            expect(statusCode).to.equal(200);
            expect(body.status).to.equal('success');
            expect(body.payload).to.deep.equal(fakeAdoption);
            expect(getByStub.calledOnceWith({ _id: '64a000000000000000000001' })).to.be.true;
        });

        it('debe devolver status 404 cuando la adopcion no existe (caso error)', async () => {
            sinon.stub(adoptionsService, 'getBy').resolves(null);

            const { statusCode, body } = await requester.get('/api/adoptions/64a000000000000000000099');

            expect(statusCode).to.equal(404);
            expect(body.status).to.equal('error');
            expect(body.error).to.equal('Adoption not found');
        });
    });

    // ---------------------------------------------------------------
    // POST /api/adoptions/:uid/:pid
    // ---------------------------------------------------------------
    describe('POST /api/adoptions/:uid/:pid', () => {

        const uid = '64a000000000000000000010';
        const pid = '64a000000000000000000020';

        it('debe crear la adopcion correctamente cuando user y pet existen y la mascota no esta adoptada (caso exitoso)', async () => {
            const fakeUser = { _id: uid, first_name: 'Juan', pets: [] };
            const fakePet = { _id: pid, name: 'Firulais', adopted: false };

            sinon.stub(usersService, 'getUserById').resolves(fakeUser);
            sinon.stub(petsService, 'getBy').resolves(fakePet);
            const updateUserStub = sinon.stub(usersService, 'update').resolves({ ...fakeUser, pets: [pid] });
            const updatePetStub = sinon.stub(petsService, 'update').resolves({ ...fakePet, adopted: true, owner: uid });
            const createAdoptionStub = sinon.stub(adoptionsService, 'create').resolves({ owner: uid, pet: pid });

            const { statusCode, body } = await requester.post(`/api/adoptions/${uid}/${pid}`);

            expect(statusCode).to.equal(200);
            expect(body.status).to.equal('success');
            expect(body.message).to.equal('Pet adopted');
            expect(updateUserStub.calledOnce).to.be.true;
            expect(updatePetStub.calledOnceWith(pid, { adopted: true, owner: uid })).to.be.true;
            expect(createAdoptionStub.calledOnceWith({ owner: uid, pet: pid })).to.be.true;
        });

        it('debe devolver status 404 cuando el usuario no existe (caso de validacion)', async () => {
            sinon.stub(usersService, 'getUserById').resolves(null);
            const getPetStub = sinon.stub(petsService, 'getBy');

            const { statusCode, body } = await requester.post(`/api/adoptions/${uid}/${pid}`);

            expect(statusCode).to.equal(404);
            expect(body.status).to.equal('error');
            expect(body.error).to.equal('user Not found');
            // Si el usuario no existe, jamas deberia buscarse la mascota.
            expect(getPetStub.called).to.be.false;
        });

        it('debe devolver status 404 cuando la mascota no existe (caso de validacion)', async () => {
            const fakeUser = { _id: uid, first_name: 'Juan', pets: [] };
            sinon.stub(usersService, 'getUserById').resolves(fakeUser);
            sinon.stub(petsService, 'getBy').resolves(null);

            const { statusCode, body } = await requester.post(`/api/adoptions/${uid}/${pid}`);

            expect(statusCode).to.equal(404);
            expect(body.status).to.equal('error');
            expect(body.error).to.equal('Pet not found');
        });

        it('debe devolver status 400 cuando la mascota ya fue adoptada (caso de error de negocio)', async () => {
            const fakeUser = { _id: uid, first_name: 'Juan', pets: [] };
            const fakePet = { _id: pid, name: 'Firulais', adopted: true };

            sinon.stub(usersService, 'getUserById').resolves(fakeUser);
            sinon.stub(petsService, 'getBy').resolves(fakePet);
            const createAdoptionStub = sinon.stub(adoptionsService, 'create');

            const { statusCode, body } = await requester.post(`/api/adoptions/${uid}/${pid}`);

            expect(statusCode).to.equal(400);
            expect(body.status).to.equal('error');
            expect(body.error).to.equal('Pet is already adopted');
            expect(createAdoptionStub.called).to.be.false;
        });
    });
});
