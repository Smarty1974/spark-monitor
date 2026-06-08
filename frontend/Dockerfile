FROM node:20-alpine AS build
WORKDIR /app
# Copia package.json e installa tutte le dipendenze (inclusi @types/react)
COPY package.json ./
RUN npm install --silent
COPY . .
# "npm run build" esegue solo "vite build" — Vite 5 transpila TS
# senza invocare tsc, quindi @types non devono essere pre-scaricati
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
