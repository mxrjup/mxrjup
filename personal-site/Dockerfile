# Stage 1: Build the Angular application
FROM node:20-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

RUN npm run build:angular

# Stage 2: Serve the application with Nginx
FROM nginx:alpine

COPY --from=build /app/dist/personal-site/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
EXPOSE 443
