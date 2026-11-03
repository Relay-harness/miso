# Collector only: signed report ingestion + /api aggregates. The web page is served by Vercel.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server ./server
ENV MISO_HOST=0.0.0.0 MISO_DB=/data/community.sqlite MISO_CLIENT_IP_HEADER=x-real-ip NODE_ENV=production
# Mount a persistent volume at /data, or every redeploy wipes reports.
VOLUME ["/data"]
EXPOSE 8787
CMD ["node","--experimental-sqlite","server/index.mjs"]
