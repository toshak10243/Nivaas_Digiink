# Nivaas - one image: builds the React app, then runs the API which also serves it.
FROM node:20-alpine AS client
WORKDIR /app
COPY shared ./shared
COPY client/package*.json ./client/
RUN cd client && npm install --no-audit --no-fund
COPY client ./client
RUN cd client && npm run build

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY shared ./shared
COPY --from=client /app/client/dist ./client/dist
WORKDIR /app/server
EXPOSE 4100
# Creates/updates tables on every start (safe to repeat), then starts the API
CMD ["sh", "-c", "node db/init.js && node src/index.js"]
