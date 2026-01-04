# ⚽ Impostor Futbolero

Juego multijugador en tiempo real inspirado en Among Us, pero con temática de fútbol chileno.

## 🎮 Descripción

Un juego social donde los jugadores reciben el nombre de un jugador de fútbol famoso, excepto uno: **el impostor**. Los jugadores deben descubrir quién es el impostor antes de que sea demasiado tarde.

## 🚀 Características

- ✅ Multijugador en tiempo real con Socket.IO
- ✅ Mínimo 3 jugadores para comenzar
- ✅ Pantallas animadas y diseño moderno
- ✅ Sistema de votación sincronizado
- ✅ Rondas múltiples con palabras diferentes
- ✅ Interfaz responsive y atractiva

## 📋 Requisitos

- Node.js (v14 o superior)
- npm

## 🛠️ Instalación

1. Clona el repositorio:
```bash
git clone https://github.com/fpereira22/juego-impostor.git
cd juego-impostor
```

2. Instala las dependencias:
```bash
npm install
```

3. Inicia el servidor:
```bash
node server.js
```

4. Abre tu navegador en `http://localhost:3000`

## 🎯 Cómo Jugar

1. **Conexión**: Cada jugador ingresa su nombre
2. **Inicio**: Cuando hay al menos 3 jugadores, cualquiera puede iniciar el juego
3. **Asignación**: Un jugador es elegido como impostor (no recibe palabra), los demás reciben el nombre de un jugador de fútbol
4. **Discusión**: Los jugadores discuten para descubrir quién es el impostor
5. **Votación**: Todos votan para eliminar a alguien
6. **Victoria**: 
   - Los cabros ganan si eliminan al impostor
   - El impostor gana si quedan solo 2 jugadores vivos

## 🏗️ Tecnologías

- **Backend**: Node.js + Express
- **WebSockets**: Socket.IO
- **Frontend**: HTML5 + CSS3 + JavaScript vanilla
- **Fuentes**: Google Fonts (Bebas Neue, Poppins)

## 📁 Estructura del Proyecto

```
juego-impostor/
├── public/
│   └── index.html      # Frontend del juego
├── server.js           # Servidor y lógica del juego
├── jugadores.json      # Base de datos de jugadores de fútbol
├── package.json        # Dependencias del proyecto
└── README.md          # Este archivo
```

## 🎨 Diseño

El juego cuenta con:
- Paleta de colores moderna (verde neón + rojo + negro)
- Animaciones suaves y transiciones
- Tipografía deportiva con Bebas Neue
- Pantallas de eliminación animadas

## 👥 Autor

Felipe Pereira - [@fpereira22](https://github.com/fpereira22)

## 📄 Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

---

¡Diviértete jugando! ⚽🎮
