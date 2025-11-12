FROM nginx:alpine

# Config personalizada
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Contenido del sitio
COPY pages/  /usr/share/nginx/html/pages/
COPY static/ /usr/share/nginx/html/static/
