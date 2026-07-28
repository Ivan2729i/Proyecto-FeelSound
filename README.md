# 🎧 FeelSound

**FeelSound** es una plataforma web musical que conecta las canciones con las emociones del usuario.

Permite descubrir música según el estado de ánimo, reproducir canciones, crear playlists, guardar favoritos y consultar el historial de reproducción desde una interfaz moderna y responsive.

---

## 🎵 Características principales

* 🔐 Registro e inicio de sesión de usuarios.
* 🔑 Autenticación mediante Google.
* 🔎 Búsqueda de canciones, artistas y álbumes.
* ▶️ Reproductor musical integrado.
* 😊 Selección de música según emociones.
* ❤️ Sistema de canciones favoritas.
* 📂 Creación y administración de playlists.
* 🕒 Historial de canciones reproducidas.
* 👤 Perfil personalizado para cada usuario.
* 📱 Diseño responsive para dispositivos móviles.
* 🔗 Comunicación entre frontend y backend mediante una API REST.
* 🐳 Ejecución completa mediante Docker Compose.

---

## 😊 Sistema de emociones

FeelSound relaciona la música con diferentes estados emocionales para ofrecer una experiencia más personalizada.

Entre las emociones disponibles se encuentran:

```txt
Alegría
Tristeza
Calma
Energía
Amor
Nostalgia
```

El usuario selecciona cómo se siente y la plataforma muestra contenido musical relacionado con esa emoción.

---

## 🛠️ Tecnologías utilizadas

### Backend

* **Python**
* **Django**
* **Django REST Framework**
* **Django Allauth**
* **Gunicorn**

### Frontend

* **HTML5**
* **CSS3**
* **JavaScript**
* **Nginx**

### Base de datos e infraestructura

* **MySQL**
* **Docker**
* **Docker Compose**

### Servicios externos

* **Deezer API**
* **Google OAuth**

---

## 📁 Estructura del proyecto

```text
FeelSound/
│
├── backend/
│   ├── accounts/
│   ├── api/
│   ├── FeelSound/
│   ├── home/
│   ├── manage.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .dockerignore
│   └── .env.example
│
├── frontend/
│   ├── pages/
│   ├── static/
│   ├── Dockerfile
│   └── nginx.conf
│
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## ⚙️ Instalación y ejecución

### 1. Clonar el repositorio

```bash
git clone URL_DEL_REPOSITORIO
cd FeelSound
```

### 2. Crear el archivo de variables de entorno

En Windows:

```bash
copy backend\.env.example backend\.env
```

En Linux o macOS:

```bash
cp backend/.env.example backend/.env
```

Configura dentro de `backend/.env` las credenciales de la base de datos, Django y los servicios externos.

---

### 3. Construir e iniciar los contenedores

```bash
docker compose up -d --build
```

Este comando inicia los servicios de:

```txt
Frontend
Backend
MySQL
```

---

### 4. Aplicar las migraciones

```bash
docker compose exec backend python manage.py migrate
```

### 5. Crear un superusuario

```bash
docker compose exec backend python manage.py createsuperuser
```

### 6. Abrir la aplicación

```txt
Frontend: http://localhost
Backend:  http://localhost:8000
Admin:    http://localhost:8000/admin/
```

---

## 🔧 Comandos útiles

Detener los contenedores:

```bash
docker compose down
```

Ver los contenedores activos:

```bash
docker compose ps
```

Ver los registros del backend:

```bash
docker compose logs -f backend
```

Reconstruir el proyecto después de realizar cambios:

```bash
docker compose up -d --build
```

---

## 🔐 Variables de entorno

El proyecto incluye el archivo:

```txt
backend/.env.example
```

Después de clonar el repositorio debe copiarse como:

```txt
backend/.env
```

El archivo `.env` contiene información privada y no debe subirse al repositorio.

---

## 👨‍💻👤 Contacto

Desarrollado por **Ivan Paz Valladares**.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-blue?style=for-the-badge\&logo=linkedin\&logoColor=white)](https://www.linkedin.com/in/ivan-paz-valladares-b8886a343)

---
