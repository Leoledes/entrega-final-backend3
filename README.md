# Adoptme API

API REST para la gestión de adopción de mascotas (proyecto base de Coderhouse,
adaptado con tests funcionales y Dockerización).

## Estructura del proyecto

```
.
├── Dockerfile
├── .dockerignore
├── .env.example
├── package.json
├── src/
│   ├── app.js                  # Configuración de Express, montaje de routers y conexión a Mongo
│   ├── controllers/            # Lógica de cada endpoint (adoptions, pets, users, sessions)
│   ├── dao/                    # Acceso a datos (Mongoose) y modelos (schemas)
│   ├── dto/                    # Data Transfer Objects
│   ├── repository/             # Capa Repository (patrón Repository sobre los DAO)
│   ├── routes/                 # Definición de routers de Express
│   ├── services/                # Instancias de los repositorios usadas por los controllers
│   └── utils/                  # Utilidades (uploader de imágenes con multer, etc.)
└── test/
    └── adoption.router.test.js # Tests funcionales del router de adopciones
```

Propósito de las carpetas principales:

- **`routes/`**: define las rutas HTTP y las conecta con su controller correspondiente.
- **`controllers/`**: reciben el `req`/`res`, llaman a los servicios y arman la respuesta HTTP.
- **`services/index.js`**: crea las instancias de los repositorios (`usersService`, `petsService`, `adoptionsService`) que usan los controllers. Es el punto que se mockea en los tests.
- **`repository/`**: capa intermedia entre el servicio y el DAO (patrón Repository).
- **`dao/`**: acceso directo a Mongoose/MongoDB.

## Arquitectura: Router → Controller → Service → Repository → DAO

```
adoption.router.js → adoptions.controller.js → services/index.js (adoptionsService, petsService, usersService) → repository/*.js → dao/*.js → MongoDB
```

Esto es lo que permite mockear únicamente la capa `services` en los tests, sin
necesitar una base de datos real.

## Variables de entorno

Copiar `.env.example` a `.env` y completar:

| Variable    | Descripción                              | Default                                  |
|-------------|-------------------------------------------|-------------------------------------------|
| `PORT`      | Puerto en el que escucha el servidor      | `8080`                                    |
| `MONGO_URL` | Cadena de conexión a MongoDB              | `mongodb://localhost:27017/adoptme`       |

> Nota: `src/app.js` solo se conecta a Mongo y levanta el servidor si
> `NODE_ENV !== 'test'`, para que los tests puedan importar la app con
> `supertest` sin necesitar una base de datos real.

## Tests funcionales

Stack utilizado: **Mocha** + **Chai** + **Supertest** + **Sinon**.

- **Supertest** levanta la app de Express en memoria y hace requests HTTP reales contra ella.
- **Sinon** mockea/stubea los métodos de `adoptionsService`, `petsService` y `usersService` (la capa `services/index.js`), de forma que los tests **no dependen de MongoDB** ni de ninguna conexión real.

### Endpoints cubiertos (`adoption.router.js`)

| Método | Endpoint                  | Casos cubiertos                                                                 |
|--------|----------------------------|----------------------------------------------------------------------------------|
| GET    | `/api/adoptions`           | listado exitoso, listado vacío, error 500 del servicio                          |
| GET    | `/api/adoptions/:aid`      | adopción encontrada (200), adopción no encontrada (404)                         |
| POST   | `/api/adoptions/:uid/:pid` | creación exitosa (200), usuario inexistente (404), mascota inexistente (404), mascota ya adoptada (400) |

### Qué valida cada grupo de tests

- **GET `/api/adoptions`**: que se devuelva `status: "success"` junto con el payload del servicio, que un listado vacío se maneje igual de bien, y que un error inesperado del servicio (rechazo de la promesa) sea capturado por el middleware de errores y devuelva `500` en lugar de colgar la request.
- **GET `/api/adoptions/:aid`**: que se devuelva la adopción cuando existe, y `404` con el mensaje de error correcto cuando no existe.
- **POST `/api/adoptions/:uid/:pid`**: el flujo completo de adopción exitosa (se actualiza el usuario, se marca la mascota como adoptada y se crea el registro de adopción), y las tres validaciones de negocio: usuario inexistente, mascota inexistente, mascota ya adoptada — verificando además que, en los casos de error, **no** se llegue a llamar a `create`.

### Cómo correr los tests

```bash
npm install
npm test
```

El script `test` corre:

```bash
cross-env NODE_ENV=test mocha test/**/*.test.js --timeout 10000
```

### Evidencia de ejecución (log real)

```
  Router: /api/adoptions (adoption.router.js)
    GET /api/adoptions
      ✔ debe devolver status 200 y el listado de adopciones (caso exitoso)
      ✔ debe devolver un payload vacio cuando no existen adopciones
      ✔ debe propagar un error 500 si el servicio falla inesperadamente
    GET /api/adoptions/:aid
      ✔ debe devolver status 200 y la adopcion cuando existe (caso exitoso)
      ✔ debe devolver status 404 cuando la adopcion no existe (caso error)
    POST /api/adoptions/:uid/:pid
      ✔ debe crear la adopcion correctamente cuando user y pet existen y la mascota no esta adoptada (caso exitoso)
      ✔ debe devolver status 404 cuando el usuario no existe (caso de validacion)
      ✔ debe devolver status 404 cuando la mascota no existe (caso de validacion)
      ✔ debe devolver status 400 cuando la mascota ya fue adoptada (caso de error de negocio)

  9 passing (62ms)
```

> Nota técnica: el proyecto original usa Express 4 con controllers `async`
> sin `try/catch`. En Express 4 eso hace que, si una promesa rechaza, la
> request **se cuelgue** en lugar de devolver un error. Para poder testear
> el caso de error 500 (y para que la API sea robusta en producción) se
> agregó un wrapper `asyncHandler` en `adoption.router.js` y un middleware
> de manejo de errores en `app.js`.

## Dockerización

### Decisiones de optimización del Dockerfile

- **Imagen base `node:18-alpine`**: alpine reduce drásticamente el tamaño de la imagen final frente a `node:18` (debian-based).
- **Multi-stage build**: una etapa `dependencies` instala `node_modules` y otra `production` copia solo lo necesario, evitando que herramientas de build queden en la imagen final.
- **`npm ci --omit=dev`**: instala solo dependencias de producción (no incluye `mocha`, `chai`, `sinon`), reduciendo tamaño y superficie de ataque.
- **Cache de capas**: se copian primero `package*.json` e instalan dependencias, y recién después se copia el código fuente — así, mientras no cambien las dependencias, Docker reutiliza la capa de `npm ci` en builds sucesivos.
- **Usuario no-root**: se crea `appuser`/`appgroup` y el proceso corre con ese usuario, no como `root` (buena práctica de seguridad).
- **`HEALTHCHECK`**: permite que Docker / un orquestador detecte si el contenedor sigue respondiendo.
- **`.dockerignore`**: excluye `node_modules`, `test`, `.git`, etc. del contexto de build, acelerando el build y evitando filtrar archivos innecesarios.

### Contenido del Dockerfile

```dockerfile
# --------------------------------------------------------------------------
# Etapa 1: dependencias
# --------------------------------------------------------------------------
FROM node:18-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --------------------------------------------------------------------------
# Etapa 2: imagen final de ejecucion
# --------------------------------------------------------------------------
FROM node:18-alpine AS production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

RUN mkdir -p /app/src/public/img && chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/api/adoptions', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/app.js"]
```

### Construir la imagen localmente

```bash
docker build -t adoptme-api:latest .
```

### Ejecutar el contenedor

```bash
docker run -d \
  --name adoptme-api \
  -p 8080:8080 \
  -e MONGO_URL="mongodb+srv://usuario:password@cluster.mongodb.net/adoptme" \
  adoptme-api:latest
```

Verificar que responde:

```bash
curl http://localhost:8080/api/adoptions
docker logs adoptme-api
```

## Imagen en DockerHub

> **Completar con tus propios datos al subir la imagen:**

- Repositorio: `https://hub.docker.com/r/<tu-usuario>/adoptme-api`
- Nombre y tag de la imagen: `<tu-usuario>/adoptme-api:1.0.0` (y `:latest`)

### Etiquetar y subir la imagen

```bash
docker login

docker tag adoptme-api:latest <tu-usuario>/adoptme-api:1.0.0
docker tag adoptme-api:latest <tu-usuario>/adoptme-api:latest

docker push <tu-usuario>/adoptme-api:1.0.0
docker push <tu-usuario>/adoptme-api:latest
```

### Escaneo básico de seguridad

Con Docker Scout (incluido en Docker Desktop):

```bash
docker scout quickview adoptme-api:latest
docker scout cves adoptme-api:latest
```

Alternativa con Trivy:

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image <tu-usuario>/adoptme-api:latest
```

### Ejecutar la imagen publicada desde DockerHub

```bash
docker pull <tu-usuario>/adoptme-api:latest

docker run -d \
  --name adoptme-api \
  -p 8080:8080 \
  -e MONGO_URL="mongodb+srv://usuario:password@cluster.mongodb.net/adoptme" \
  <tu-usuario>/adoptme-api:latest
```

## Resumen de comandos (ejecución end-to-end)

```bash
# 1. Instalar dependencias y correr tests
npm install
npm test

# 2. Construir la imagen Docker
docker build -t adoptme-api:latest .

# 3. Probar el contenedor localmente
docker run -d --name adoptme-api -p 8080:8080 -e MONGO_URL="<tu-uri-de-mongo>" adoptme-api:latest
curl http://localhost:8080/api/adoptions
docker logs adoptme-api

# 4. Subir a DockerHub
docker login
docker tag adoptme-api:latest <tu-usuario>/adoptme-api:1.0.0
docker push <tu-usuario>/adoptme-api:1.0.0
```
