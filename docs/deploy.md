# Deploy — calvopa-landing

Dos servicios: `calvopa-landing` (nginx:alpine sirviendo el sitio estático,
con `/api/` proxyeado) y `calvopa-api` (Node/Express mínimo que recibe el
formulario de contacto y lo reenvía a un webhook de n8n). Pensado para
levantarse manualmente en `srv-hometainer` (192.168.232.60) vía Portainer,
con dominio `calvopa.net`.

## 0. Webhook de n8n — ya configurado

El form de contacto no manda email directo — pega el POST a `calvopa-api`,
que lo reenvía a un workflow de n8n (así no se mantienen credenciales SMTP
en este contenedor y se reusa el stack de automatización ya conocido).

- **Instancia**: n8n personal en `n8n.calvopa.net` (srv-hometainer,
  192.168.232.60), separada de la de GCS. Owner account: `pablocalvo1@gmail.com`.
- **Workflow**: `Calvopa — Contacto web` → `Webhook` (POST `/calvopa-contact`)
  → `Append row in sheet` (Google Sheets).
- **Destino**: Google Sheet "Calvopa — Contactos" (compartido entre
  `pablo@grupocesa.net` y `pablocalvo1@gmail.com`), una fila por mensaje:
  Fecha, Nombre, Email, Mensaje.
- **Credencial Google**: OAuth Client propio en Google Cloud Console
  (proyecto `gpt-project`, cliente "n8n personal - Google Sheets"), porque
  este n8n es self-hosted y no tiene el flujo simplificado de n8n cloud.
- **Workflow activo** (Published) — el webhook de producción ya responde en
  `https://n8n.calvopa.net/webhook/calvopa-contact`.

Solo falta copiar `server/.env.example` a `server/.env` (ya trae la URL
correcta) y, si se quiere, setear `N8N_WEBHOOK_SECRET` + agregar esa misma
validación de header en el nodo Webhook de n8n:

```bash
cp server/.env.example server/.env
```

`server/.env` no se versiona (agregalo a tu `.gitignore` si vas a pushear
este repo).

## 1. Levantar los contenedores

Build + run local (para probar antes de subir):

```bash
docker compose up -d --build
```

Sitio en `http://localhost:8090` (el form postea a `/api/contact`, que nginx
reenvía internamente a `calvopa-api`). Si el puerto 8090 ya está en uso en
el server, cambiá el mapeo en `docker-compose.yml` antes de desplegar.

Health check de la API: `curl http://localhost:8090/api/healthz`

## 2. Subir el stack a Portainer (srv-hometainer)

- Repo/carpeta: subir este directorio a `/opt/stacks/calvopa-landing/` en
  `192.168.232.60` (o crear el stack en Portainer apuntando a este
  `docker-compose.yml`).
- Levantar el stack desde la UI de Portainer o:
  ```bash
  ssh pablo@192.168.232.60 "cd /opt/stacks/calvopa-landing && docker compose up -d --build"
  ```

## 3. Nginx Proxy Manager (acceso LAN / proxy host)

En NPM de hometainer (`192.168.232.60:81`, login en memoria `server_npm_credentials`):

- **Proxy Host nuevo:**
  - Domain Names: `calvopa.net`, `www.calvopa.net`
  - Scheme: `http`
  - Forward Hostname/IP: `192.168.232.60` (o el nombre del contenedor si NPM
    está en la misma red Docker: `calvopa-landing`)
  - Forward Port: `8090` (el host port del compose) o `80` si usás el nombre
    del contenedor dentro de la red Docker.
  - Cache Assets: on
  - Block Common Exploits: on
  - SSL: pedir certificado Let's Encrypt (DNS challenge si `calvopa.net` no
    resuelve públicamente a este server todavía, o HTTP challenge si ya
    apunta acá) + Force SSL + HTTP/2.

## 4. Dominio (calvopa.net)

Dominio ya comprado — solo falta apuntar el DNS (A/AAAA o CNAME, según cómo
esté el resto de la infra personal) al punto de entrada público del
homelab. Esto el usuario lo conecta manualmente; no está automatizado acá.

## 5. Notas del backend de contacto

- `calvopa-api` no se expone al host (sin `ports:` en el compose) — solo es
  alcanzable desde `calvopa-landing` dentro de la red interna de Docker, vía
  el proxy `/api/` de nginx. No hace falta abrir ni mapear el puerto 3001.
- Rate limit: 5 envíos cada 10 minutos por IP (`server/server.js`).
- Honeypot anti-spam: el form tiene un campo oculto `company` — si llega
  completo, la API responde OK pero no reenvía nada a n8n.
- Si `N8N_WEBHOOK_URL` no está seteada, la API arranca igual pero responde
  503 en `/api/contact` (se loguea un warning al iniciar).
