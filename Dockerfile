FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8082

COPY package.json ./
RUN npm install --omit=dev --package-lock=false --no-audit --no-fund

COPY src ./src
COPY public ./public

EXPOSE 8082

CMD ["npm", "start"]
