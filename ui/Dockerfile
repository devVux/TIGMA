FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build
RUN cp -r .next/static .next/standalone/.next/static
RUN cp -r public .next/standalone/public
EXPOSE 3000
ENV HOSTNAME=0.0.0.0
CMD ["node", ".next/standalone/server.js"]
