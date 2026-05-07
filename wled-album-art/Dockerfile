FROM node:20-alpine

RUN apk add --no-cache \
    vips-dev \
    fftw-dev \
    build-base \
    python3

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --production

COPY server/ ./server/
COPY public/ ./public/

RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && mkdir -p /app/data \
    && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "server/index.js"]
