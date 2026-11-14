# Nivaas - one image: builds the React app, then runs the API which also serves it.
FROM node:20-alpine AS client
WORKDIR /app
COPY shared ./shared
COPY client/package*.json ./client/
RUN cd client && npm ci --no-audit --no-fund
COPY client ./client
RUN cd client && npm run build

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache su-exec
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY shared ./shared
COPY --from=client /app/client/dist ./client/dist
RUN addgroup -S nivaas && adduser -S nivaas -G nivaas \
  && mkdir -p /data/uploads \
  && chown nivaas:nivaas /data/uploads
COPY deploy/docker-entrypoint.sh /usr/local/bin/nivaas-entrypoint
RUN chmod +x /usr/local/bin/nivaas-entrypoint
WORKDIR /app/server
EXPOSE 4100
# The API initializes the schema and applies migrations before it listens.
ENTRYPOINT ["/usr/local/bin/nivaas-entrypoint"]
CMD ["node", "src/index.js"]
