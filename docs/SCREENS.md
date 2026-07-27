# Pantallas del panel

Qué hay en cada pantalla de WhatsFlow AI y para qué sirve. Es un mapa funcional
del panel web (`/frontend`), no documentación técnica: para la arquitectura ver
[`ARCHITECTURE.md`](ARCHITECTURE.md) y para los endpoints [`API.md`](API.md).

El panel tiene **un solo modo visual (oscuro)** y todas las secciones cuelgan de
una misma estructura: barra lateral fija a la izquierda con las siete secciones,
barra superior con el título de la sección actual, el estado del sistema y el
menú de la cuenta.

Las rutas están declaradas en `frontend/src/components/layout/AppShell.tsx`.

| Ruta | Sección | Quién la ve |
|---|---|---|
| `/bandeja` · `/bandeja/:id` | Bandeja | Todo el equipo |
| `/metricas` | Métricas | Todo el equipo |
| `/contactos` | Contactos | Todo el equipo |
| `/calendario` | Calendario | Todo el equipo (la integración con Google, solo el propietario) |
| `/productos` | Productos | Todo el equipo |
| `/agente` | Agente IA | Todo el equipo lo consulta; **solo el propietario edita** |
| `/equipo` | Equipo | Todo el equipo |

Cualquier ruta desconocida cae en la Bandeja, que es la pantalla de trabajo.

---

## Acceso

La pantalla previa a entrar, para quien no tiene sesión.

A la izquierda, la presentación del producto con una demo animada de una
conversación. A la derecha, el formulario, que alterna entre **entrar** y **crear
cuenta**: al registrarse pide además el nombre de la empresa y el nombre de la
persona, porque una cuenta nueva crea también el negocio.

Incluye **Continuar con Google**. Si esa cuenta de Google todavía no tiene
negocio, se pide el nombre de la empresa antes de terminar el alta.

---

## Bandeja

La pantalla donde se trabaja. Tres columnas.

**Lista de conversaciones (izquierda).** Ordenadas por actividad, con el nombre o
teléfono del contacto, un adelanto del último mensaje y un contador de mensajes
sin leer. Se filtra por estado (*todas / abiertas / cerradas*) y por quién
atiende (*IA y humano / atiende la IA / atiende un humano*), y se busca por
nombre o teléfono. Carga por páginas con un botón al final.

**Hilo (centro).** La conversación completa, distinguiendo lo que escribió el
cliente, lo que respondió la IA y lo que escribió una persona del equipo. En la
cabecera, el contacto, una etiqueta de quién lleva la conversación y cinco
acciones:

- **Resumir** — pide a la IA un resumen del hilo, útil cuando alguien retoma una
  conversación larga que no siguió.
- **Notas** — notas internas del equipo sobre esa conversación; el cliente no las
  ve. El botón muestra cuántas hay.
- **Tomar la conversación / Devolver a la IA** — el traspaso entre el agente
  automático y una persona.
- **Cerrar / Reabrir** — dar la conversación por resuelta o volver a abrirla.

Abajo, el cuadro para responder, con **respuestas rápidas**: plantillas de texto
que el equipo guarda y reutiliza (crear, insertar y borrar desde ahí mismo).

La conversación abierta va en la dirección (`/bandeja/:id`), así que se puede
enlazar y el botón "atrás" del navegador cierra el hilo.

**Ficha del contacto (derecha).** Teléfono, desde cuándo es cliente, y sus notas.

---

## Métricas

Cómo está funcionando el negocio en el período elegido: **7, 30 o 90 días**.

Arriba, cuatro cifras: **conversaciones**, **mensajes**, **citas** y **contactos**.

Debajo, dos tarjetas que son las que explican el valor del producto:

- **Automatización** — de las respuestas enviadas, cuántas resolvió la IA sin que
  interviniera nadie.
- **Consumo de la IA** — lo que cuesta tenerla trabajando.

Cierra con un **gráfico de actividad** de mensajes recibidos y enviados por día, y
la misma serie en tabla.

---

## Contactos

La agenda del negocio: las personas que han escrito por WhatsApp.

Un formulario arriba para añadir a mano (teléfono obligatorio, nombre opcional),
un buscador por nombre o teléfono, y la lista con el número de notas de cada uno
y desde cuándo es cliente. Se puede **exportar todo a CSV**.

Al abrir un contacto se editan sus datos.

---

## Calendario

Las citas agendadas con los contactos, ya las haya creado el equipo o la propia
IA hablando con el cliente.

Una **rejilla mensual** con navegación entre meses, marcando los días que tienen
citas. Al elegir un día, debajo aparecen sus citas y un botón para agregar una
nueva.

Cada cita tiene título, contacto, fecha y hora, y estado: *agendada, confirmada,
completada o cancelada*.

Arriba, solo para el propietario, la tarjeta de **Google Calendar**: conectar o
desconectar la cuenta del negocio para que las citas se reflejen como eventos.
Avisa si la conexión caducó y si hay citas que no se han podido enviar.

---

## Productos

El catálogo que la IA consulta cuando un cliente pregunta por precios o
disponibilidad. **Lo que hay aquí es lo que el agente responde**, así que es la
pantalla que mantiene al agente diciendo la verdad.

Un formulario para añadir (nombre, código opcional, precio y stock), un buscador
por nombre, código o descripción, y la tabla del catálogo. **El precio y el stock
se editan directamente sobre la tabla**, sin abrir nada.

Permite **importar el catálogo desde un CSV** con las columnas nombre, sku, precio
y stock — pensado para no cargar cientos de artículos a mano.

---

## Agente IA

Lo que la IA sabe del negocio antes de responder. Cuanto más completo, menos
genéricas son sus respuestas.

**Todo el equipo puede consultar esta pantalla, pero solo el propietario edita.**

**Configuración del negocio.** La zona horaria (determina a qué hora agenda la IA,
y sin ella las citas quedan corridas) y cinco campos en texto libre: horario de
atención, servicios o productos, políticas, tono con el que debe hablar e
instrucciones adicionales.

**Documentación del negocio.** Documentos que se suben para que la IA los use como
fuente: catálogos, listas de precios, condiciones. El sistema extrae su texto —
incluso de imágenes escaneadas— y avisa del estado de cada uno.

**Contexto que recibe la IA.** Muestra exactamente lo que se le está enviando al
agente antes de cada respuesta. Sirve para entender por qué contestó lo que
contestó.

**Probar el agente.** Un chat para hablar con la IA como si fueras un cliente,
sin gastar un mensaje real de WhatsApp. Es la forma de comprobar un cambio de
configuración antes de que lo vea nadie. La conversación de prueba se conserva
al moverse por el panel.

---

## Equipo

Las personas de la empresa que atienden conversaciones.

Un formulario para invitar (nombre, email, contraseña inicial y **rol**) y la
lista de miembros actuales.

Dos roles:

- **Propietario** — acceso completo, incluida la configuración del agente y las
  integraciones.
- **Agente** — atiende conversaciones y gestiona contactos, citas y productos.

---

## Mi cuenta

No es una sección de la barra lateral: se abre desde el menú del usuario, arriba
a la derecha. Contiene los datos de la persona y el cambio de contraseña.
