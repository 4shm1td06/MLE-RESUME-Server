FROM node:22-slim
RUN apt-get update && apt-get install -y \
    chromium \
    poppler-utils \
    --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*
RUN groupadd -r appuser && useradd -r -g appuser -m appuser
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN chown -R appuser:appuser /app
USER appuser
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PORT=5050
EXPOSE 5050
CMD ["node", "src/index.js"]
