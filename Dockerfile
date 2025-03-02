FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN mkdir -p logs

RUN apk add --no-cache wget

EXPOSE 3000

CMD ["npm", "run", "start:pm2"] 