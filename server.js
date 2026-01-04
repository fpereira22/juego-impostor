const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

let usuarios = [];
let estadoJuego = {
    jugadorSecreto: "",
    impostorId: "",
    votos: {},
    jugadoresListos: [],
    partidaActiva: false // Trackear si hay una partida en curso
};
let disconnectTimeouts = {}; // Timeouts de desconexión
let jugadoresUsadosRecientes = []; // Historial de últimos jugadores usados

app.use(express.static('public'));

function obtenerJugadorAleatorio() {
    try {
        const data = fs.readFileSync('./jugadores.json', 'utf8');
        const jugadores = JSON.parse(data);

        // Filtrar jugadores que no se hayan usado recientemente
        let disponibles = jugadores.filter(j => !jugadoresUsadosRecientes.includes(j));

        // Si todos fueron usados, resetear el historial pero mantener el último
        if (disponibles.length === 0) {
            const ultimo = jugadoresUsadosRecientes[jugadoresUsadosRecientes.length - 1];
            jugadoresUsadosRecientes = [ultimo];
            disponibles = jugadores.filter(j => j !== ultimo);
        }

        // Seleccionar uno aleatorio de los disponibles
        const seleccionado = disponibles[Math.floor(Math.random() * disponibles.length)];

        // Agregar al historial (mantener últimos 10)
        jugadoresUsadosRecientes.push(seleccionado);
        if (jugadoresUsadosRecientes.length > 10) {
            jugadoresUsadosRecientes.shift();
        }

        return seleccionado;
    } catch (err) {
        return "Desconocido";
    }
}

io.on('connection', (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);

    // Enviar la lista actual de usuarios al cliente que se acaba de conectar
    socket.emit('update-users', usuarios);

    socket.on('join', (nombre) => {
        console.log(`${nombre} se unió con ID: ${socket.id}`);

        // Cancelar timeout de desconexión si existe (reconexión)
        if (disconnectTimeouts[socket.id]) {
            clearTimeout(disconnectTimeouts[socket.id]);
            delete disconnectTimeouts[socket.id];
            console.log(`Timeout de desconexión cancelado para ${nombre}`);
        }

        // Buscar si el usuario existe por nombre (reconexión con nuevo ID)
        const existentePorNombre = usuarios.find(u => u.nombre === nombre);
        if (existentePorNombre && existentePorNombre.id !== socket.id) {
            // Actualizar el ID del usuario existente
            const oldId = existentePorNombre.id;
            console.log(`Reconexión detectada: ${nombre} cambió de ${oldId} a ${socket.id}`);

            // 1. Actualizar ID en el objeto usuario
            existentePorNombre.id = socket.id;

            if (estadoJuego.partidaActiva) {
                // 2. Si era el impostor, actualizar la referencia del impostorId
                if (estadoJuego.impostorId === oldId) {
                    estadoJuego.impostorId = socket.id;
                    console.log(`Impostor ID actualizado a: ${socket.id}`);
                }

                // 3. Migrar votos recibidos (si alguien votó por él con el ID viejo)
                if (estadoJuego.votos[oldId]) {
                    estadoJuego.votos[socket.id] = estadoJuego.votos[oldId];
                    delete estadoJuego.votos[oldId];
                    console.log(`Votos migrados de ${oldId} a ${socket.id}`);
                }

                // 4. Actualizar lista de jugadores listos
                const readyIndex = estadoJuego.jugadoresListos.indexOf(oldId);
                if (readyIndex !== -1) {
                    estadoJuego.jugadoresListos[readyIndex] = socket.id;
                }

                console.log(`Reenviando rol a ${nombre} (partida activa)`);
                if (socket.id === estadoJuego.impostorId) {
                    io.to(socket.id).emit('role-assigned', { role: 'impostor', reconexion: true });
                } else {
                    io.to(socket.id).emit('role-assigned', {
                        role: 'legit',
                        data: estadoJuego.jugadorSecreto,
                        reconexion: true
                    });
                }
            }
        } else {
            // Verificar si ya existe por ID
            const existentePorId = usuarios.find(u => u.id === socket.id);
            if (!existentePorId) {
                // Al entrar, el jugador siempre empieza vivo
                usuarios.push({ id: socket.id, nombre, vivo: true });
            }
        }

        // Enviar la lista actualizada a TODOS los clientes
        io.emit('update-users', usuarios);
        console.log(`Total usuarios: ${usuarios.length}`);
    });

    socket.on('start-game', () => {
        if (usuarios.length < 3) return;

        estadoJuego.jugadorSecreto = obtenerJugadorAleatorio();
        estadoJuego.votos = {};
        estadoJuego.jugadoresListos = []; // Resetear jugadores listos
        estadoJuego.partidaActiva = true; // Marcar que hay partida en curso

        // Resetear salud de todos al iniciar
        usuarios.forEach(u => u.vivo = true);

        const vivos = usuarios.filter(u => u.vivo);

        let impostorIndex;
        let intentos = 0;
        const ultimoImpostorId = estadoJuego.impostorId; // Guardar el ID del impostor anterior

        // Intentar elegir un impostor diferente al anterior (si hay suficientes jugadores)
        do {
            impostorIndex = Math.floor(Math.random() * vivos.length);
            intentos++;
            // Si hay más de 3 jugadores, forzar cambio. Si son 3, aceptar repetición después de 3 intentos
        } while (vivos.length > 3 && vivos[impostorIndex].id === ultimoImpostorId && intentos < 10);

        estadoJuego.impostorId = vivos[impostorIndex].id;

        usuarios.forEach((u) => {
            if (u.id === estadoJuego.impostorId) {
                io.to(u.id).emit('role-assigned', { role: 'impostor' });
            } else {
                io.to(u.id).emit('role-assigned', { role: 'legit', data: estadoJuego.jugadorSecreto });
            }
        });
        io.emit('update-users', usuarios);
    });

    socket.on('open-voting', () => {
        // Validar que el jugador esté vivo
        const jugador = usuarios.find(u => u.id === socket.id);
        if (!jugador || !jugador.vivo) {
            return; // Ignorar solicitudes de jugadores muertos
        }

        // Agregar al jugador a la lista de listos si no está ya
        if (!estadoJuego.jugadoresListos.includes(socket.id)) {
            estadoJuego.jugadoresListos.push(socket.id);
        }

        const vivos = usuarios.filter(u => u.vivo);

        // Filtrar la lista de listos para asegurar que solo incluya jugadores vivos
        estadoJuego.jugadoresListos = estadoJuego.jugadoresListos.filter(id => {
            const user = usuarios.find(u => u.id === id);
            return user && user.vivo;
        });

        // Solo iniciar votación cuando TODOS los jugadores vivos estén listos
        if (estadoJuego.jugadoresListos.length >= vivos.length) {
            estadoJuego.jugadoresListos = []; // Resetear para la próxima ronda
            io.emit('voting-started', vivos);
        } else {
            // Notificar al jugador que está esperando a los demás
            io.to(socket.id).emit('waiting-for-others', {
                ready: estadoJuego.jugadoresListos.length,
                total: vivos.length
            });
        }
    });

    socket.on('cast-vote', (targetId) => {
        // Validar que el votante esté vivo
        const votante = usuarios.find(u => u.id === socket.id);
        if (!votante || !votante.vivo) {
            return; // Ignorar votos de jugadores muertos
        }

        estadoJuego.votos[targetId] = (estadoJuego.votos[targetId] || 0) + 1;

        const totalVotos = Object.values(estadoJuego.votos).reduce((a, b) => a + b, 0);
        const vivos = usuarios.filter(u => u.vivo);

        if (totalVotos >= vivos.length) {
            const eliminadoId = Object.keys(estadoJuego.votos).reduce((a, b) =>
                estadoJuego.votos[a] > estadoJuego.votos[b] ? a : b);

            const userEliminado = usuarios.find(u => u.id === eliminadoId);
            if (userEliminado) userEliminado.vivo = false;

            const esImpostor = eliminadoId === estadoJuego.impostorId;
            estadoJuego.votos = {};

            // Limpiar al jugador eliminado de la lista de listos
            estadoJuego.jugadoresListos = estadoJuego.jugadoresListos.filter(id => id !== eliminadoId);

            // Contar jugadores vivos sin contar al impostor si sigue vivo
            const vivosRestantes = usuarios.filter(u => u.vivo && u.id !== estadoJuego.impostorId);
            // El juego termina si:
            // 1. Eliminaron al impostor (esImpostor = true)
            // 2. Quedan solo 2 jugadores vivos en total (impostor + 1 inocente)
            const totalVivos = usuarios.filter(u => u.vivo).length;
            const finDelJuego = esImpostor || totalVivos <= 2;

            const impostorUser = usuarios.find(u => u.id === estadoJuego.impostorId);

            io.emit('elimination-result', {
                eliminadoId: eliminadoId,
                nombre: userEliminado ? userEliminado.nombre : "Alguien",
                esImpostor: esImpostor,
                finDelJuego: finDelJuego,
                ganador: esImpostor ? "CABROS" : (finDelJuego ? "IMPOSTOR" : null),
                nombreImpostor: impostorUser ? impostorUser.nombre : "Desconocido"
            });

            if (finDelJuego) {
                // Si el juego termina, reseteamos a todos a 'vivo' para el lobby
                estadoJuego.partidaActiva = false; // Marcar que la partida terminó
                usuarios.forEach(u => u.vivo = true);
            } else {
                // El juego continúa con la misma palabra secreta
                // Solo notificar que comienza una nueva ronda de votación
                usuarios.forEach((u) => {
                    if (u.vivo) {
                        if (u.id === estadoJuego.impostorId) {
                            io.to(u.id).emit('new-round', { role: 'impostor' });
                        } else {
                            io.to(u.id).emit('new-round', { role: 'legit', data: estadoJuego.jugadorSecreto });
                        }
                    } else {
                        // Jugadores eliminados se convierten en espectadores
                        io.to(u.id).emit('spectator-mode');
                    }
                });
            }

            io.emit('update-users', usuarios);
        }
    });

    socket.on('disconnect', () => {
        const usuario = usuarios.find(u => u.id === socket.id);
        console.log(`Cliente desconectado: ${socket.id} ${usuario ? `(${usuario.nombre})` : ''} - Esperando 15 segundos...`);

        // Crear un timeout de 15 segundos antes de eliminar al usuario
        disconnectTimeouts[socket.id] = setTimeout(() => {
            // Verificar si el usuario sigue desconectado
            const usuarioActual = usuarios.find(u => u.id === socket.id);
            if (usuarioActual) {
                console.log(`Usuario ${usuarioActual.nombre} no se reconectó. Eliminando...`);
                usuarios = usuarios.filter(u => u.id !== socket.id);
                io.emit('update-users', usuarios);
                console.log(`Total usuarios después de desconexión: ${usuarios.length}`);
            }
            delete disconnectTimeouts[socket.id];
        }, 15000); // 15 segundos
    });
});


server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const port = process.env.PORT || 3000;
    console.log('Servidor corriendo en:');
    console.log(`  - Puerto: ${port}`);
    console.log(`  - Local: http://localhost:${port}`);

    Object.keys(interfaces).forEach((interfaceName) => {
        interfaces[interfaceName].forEach((iface) => {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`  - Red: http://${iface.address}:${port}`);
            }
        });
    });
});