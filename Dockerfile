FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN mkdir -p logs

RUN apk add --no-cache wget

EXPOSE 3000

# Khởi động ứng dụng trực tiếp với Node.js
CMD ["node", "index.js"] 