FROM node:22.18.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/nexo.sqlite
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY dist ./dist
COPY public ./public
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--disable-warning=ExperimentalWarning","dist/server.js"]
