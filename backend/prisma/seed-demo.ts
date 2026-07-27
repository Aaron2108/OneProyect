/**
 * Datos de ejemplo para mirar el panel con contenido.
 *
 *   npm run seed:demo -- correo@del.propietario
 *
 * Rellena el negocio de ESE usuario (nunca los demás) con contactos,
 * conversaciones, productos, citas y consumo de IA, para poder recorrer todas
 * las pantallas sin depender de Meta ni de créditos de API.
 *
 * Es repetible: antes de sembrar borra lo que sembró la vez anterior, que se
 * reconoce por el prefijo de teléfono. Nada creado a mano se toca.
 *
 * NO usar contra una base con datos reales: crea contactos y conversaciones que
 * parecen de clientes y no lo son.
 */
import {
  AppointmentStatus,
  ConsentStatus,
  ConversationHandler,
  ConversationStatus,
  MessageDirection,
  MessageSender,
  PrismaClient,
  ReminderStatus,
} from '@prisma/client';
import { encryptSecret } from '../src/common/crypto.util';

const prisma = new PrismaClient();

/** Los contactos de ejemplo comparten prefijo: así se distinguen para poder rehacerlos. */
const PREFIJO_DEMO = '5215590000';

const AUTOR_DEMO = { id: 'equipo-demo', nombre: 'Equipo' };

const dias = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const horas = (n: number): Date => new Date(Date.now() + n * 60 * 60 * 1000);

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    throw new Error('Falta el correo del propietario: npm run seed:demo -- correo@ejemplo.com');
  }
  const clave = process.env.TOKEN_ENCRYPTION_KEY ?? '';
  if (!clave) throw new Error('Falta TOKEN_ENCRYPTION_KEY: los mensajes se guardan cifrados.');
  const cifrar = (texto: string): string => encryptSecret(texto, clave);

  const usuario = await prisma.user.findFirst({
    where: { email },
    select: { tenantId: true, tenant: { select: { name: true } } },
  });
  if (!usuario) throw new Error(`No existe ningún usuario con el correo ${email}.`);
  const tenantId = usuario.tenantId;
  console.log(`Sembrando en "${usuario.tenant.name}" (${email})\n`);

  // Borra la siembra anterior para poder repetir sin duplicar.
  const previos = await prisma.contact.deleteMany({
    where: { tenantId, phone: { startsWith: PREFIJO_DEMO } },
  });
  if (previos.count > 0) console.log(`Limpiados ${previos.count} contactos de ejemplo anteriores.`);

  // --- Contactos -----------------------------------------------------------
  const personas = [
    { sufijo: '01', nombre: 'Marta Ríos', notas: 'Prefiere los viernes por la tarde. Alérgica a los tintes con amoníaco.' },
    { sufijo: '02', nombre: 'Diego Salas', notas: null },
    { sufijo: '03', nombre: 'Lucía Fernández', notas: 'Vino recomendada por Marta.' },
    { sufijo: '04', nombre: null, notas: null },
  ];
  const contactos = [];
  for (const p of personas) {
    const c = await prisma.contact.create({
      data: {
        tenantId,
        phone: `${PREFIJO_DEMO}${p.sufijo}`,
        name: p.nombre,
        notes: p.notas ? cifrar(p.notas) : null,
        consent: {
          create: {
            tenantId,
            status: ConsentStatus.GRANTED,
            source: 'primer mensaje entrante',
            grantedAt: dias(-20),
          },
        },
      },
    });
    contactos.push(c);
  }
  console.log(`Contactos: ${contactos.length}`);

  // --- Conversaciones ------------------------------------------------------
  // Guion por conversación: [quién habla, texto, hace cuántas horas].
  type Turno = [MessageSender, string, number];
  const guiones: Array<{
    contacto: number;
    handledBy: ConversationHandler;
    status: ConversationStatus;
    turnos: Turno[];
    nota?: string;
    resumen?: string;
  }> = [
    {
      contacto: 0,
      handledBy: ConversationHandler.AI,
      status: ConversationStatus.OPEN,
      turnos: [
        [MessageSender.CONTACT, 'Hola! ¿Tienen turno para corte el viernes por la tarde?', 26],
        [MessageSender.AI, '¡Hola Marta! Sí, el viernes tenemos libre a las 16:00 y a las 18:30. ¿Cuál te viene mejor?', 26],
        [MessageSender.CONTACT, 'A las 16:00 perfecto', 25],
        [MessageSender.AI, 'Listo, te dejé agendada el viernes a las 16:00. ¡Nos vemos!', 25],
        [MessageSender.CONTACT, 'Gracias! Una cosa más, ¿aceptan tarjeta?', 2],
      ],
      resumen:
        'Marta pidió turno para corte y quedó agendada el viernes a las 16:00. Preguntó si se acepta tarjeta y todavía no se le respondió: queda pendiente confirmárselo.',
    },
    {
      contacto: 1,
      handledBy: ConversationHandler.HUMAN,
      status: ConversationStatus.OPEN,
      turnos: [
        [MessageSender.CONTACT, 'Buenas, quería reclamar por el color del tinte de la semana pasada', 5],
        [MessageSender.AI, 'Lamento mucho lo que pasó, Diego. Le paso la conversación a una persona del equipo para que lo revise contigo.', 5],
      ],
      nota: 'Escalado automático: el cliente reclama por un trabajo anterior, no es algo que deba resolver la IA.',
    },
    {
      contacto: 2,
      handledBy: ConversationHandler.AI,
      status: ConversationStatus.OPEN,
      turnos: [
        [MessageSender.CONTACT, '¿Cuánto sale el tratamiento de keratina?', 30],
        [MessageSender.AI, '¡Hola Lucía! El tratamiento de keratina está 45.00. Dura entre dos y tres meses según el cuidado. ¿Querés que te agende?', 30],
        [MessageSender.CONTACT, 'Lo pienso y te aviso, gracias', 29],
      ],
    },
    {
      contacto: 3,
      handledBy: ConversationHandler.AI,
      status: ConversationStatus.CLOSED,
      turnos: [
        [MessageSender.CONTACT, 'hola, están abiertos hoy?', 72],
        [MessageSender.AI, '¡Hola! Sí, hoy atendemos de 9:00 a 18:00. ¿Te agendo algo?', 72],
        [MessageSender.CONTACT, 'no gracias, solo preguntaba', 71],
      ],
    },
  ];

  let totalMensajes = 0;
  for (const g of guiones) {
    const contacto = contactos[g.contacto];
    const ultimo = g.turnos[g.turnos.length - 1];
    const conversacion = await prisma.conversation.create({
      data: {
        tenantId,
        contactId: contacto.id,
        handledBy: g.handledBy,
        status: g.status,
        // Sin leer solo lo que dejó el cliente sin respuesta.
        unreadCount: ultimo[0] === MessageSender.CONTACT ? 1 : 0,
        lastInboundAt: horas(-g.turnos.filter((t) => t[0] === MessageSender.CONTACT).slice(-1)[0][2]),
        lastMessageAt: horas(-ultimo[2]),
        ...(g.resumen ? { summary: cifrar(g.resumen), summaryAt: horas(-1) } : {}),
      },
    });

    for (const [quien, texto, hace] of g.turnos) {
      await prisma.message.create({
        data: {
          tenantId,
          conversationId: conversacion.id,
          direction:
            quien === MessageSender.CONTACT ? MessageDirection.INBOUND : MessageDirection.OUTBOUND,
          sender: quien,
          type: 'text',
          content: cifrar(texto),
          createdAt: horas(-hace),
        },
      });
      totalMensajes++;
    }

    if (g.nota) {
      await prisma.conversationNote.create({
        data: {
          tenantId,
          conversationId: conversacion.id,
          authorId: AUTOR_DEMO.id,
          authorName: 'Agente IA',
          body: cifrar(g.nota),
        },
      });
    }
  }
  console.log(`Conversaciones: ${guiones.length} (${totalMensajes} mensajes)`);

  // --- Citas y recordatorios ----------------------------------------------
  const cita = await prisma.appointment.create({
    data: {
      tenantId,
      contactId: contactos[0].id,
      title: 'Corte + peinado',
      scheduledAt: dias(2),
      status: AppointmentStatus.CONFIRMED,
    },
  });
  await prisma.appointment.create({
    data: {
      tenantId,
      contactId: contactos[2].id,
      title: 'Tratamiento de keratina',
      scheduledAt: dias(5),
      status: AppointmentStatus.SCHEDULED,
    },
  });
  await prisma.appointment.create({
    data: {
      tenantId,
      contactId: contactos[1].id,
      title: 'Retoque de color',
      scheduledAt: dias(-3),
      status: AppointmentStatus.COMPLETED,
    },
  });
  await prisma.reminder.create({
    data: {
      tenantId,
      contactId: contactos[0].id,
      appointmentId: cita.id,
      message: 'Recordatorio: mañana a las 16:00 te esperamos para tu corte.',
      remindAt: dias(1),
      status: ReminderStatus.PENDING,
    },
  });
  console.log('Citas: 3 · Recordatorios: 1');

  // --- Catálogo ------------------------------------------------------------
  await prisma.product.deleteMany({ where: { tenantId, sku: { startsWith: 'DEMO-' } } });
  const productos = [
    ['DEMO-01', 'Shampoo hidratante 500ml', 'Para cabello seco o teñido.', 1890, 12],
    ['DEMO-02', 'Acondicionador reparador 500ml', null, 1890, 8],
    ['DEMO-03', 'Cera modeladora mate', 'Fijación fuerte, acabado sin brillo.', 1250, 0],
    ['DEMO-04', 'Aceite de argán 100ml', 'Puntas y frizz.', 2400, 5],
    ['DEMO-05', 'Tratamiento de keratina', 'Servicio en salón, no es producto de venta.', 4500, 99],
  ] as const;
  for (const [sku, nombre, descripcion, centimos, stock] of productos) {
    const searchText = [nombre, sku, descripcion ?? '']
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    await prisma.product.create({
      data: {
        tenantId,
        sku,
        name: nombre,
        description: descripcion,
        priceCents: centimos,
        currency: 'PEN',
        stock,
        searchText,
      },
    });
  }
  console.log(`Productos: ${productos.length} (uno sin stock, a propósito)`);

  // --- Consumo de IA (la tarjeta de Métricas) ------------------------------
  await prisma.aiUsage.deleteMany({ where: { tenantId } });
  const consumo: Array<[string, number, number, number]> = [
    ['respond', 24, 4200, 380],
    ['summarize', 3, 900, 60],
    ['team-summary', 1, 1100, 90],
    ['follow-up', 2, 700, 50],
  ];
  for (const [purpose, veces, entrada, salida] of consumo) {
    for (let i = 0; i < veces; i++) {
      await prisma.aiUsage.create({
        data: {
          tenantId,
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          purpose,
          inputTokens: entrada + i * 37,
          outputTokens: salida + i * 5,
          createdAt: horas(-(i * 3 + 1)),
        },
      });
    }
  }
  console.log('Consumo de IA: 30 llamadas repartidas en las cuatro finalidades');

  console.log('\nListo. Entra al panel y recorre Bandeja, Contactos, Calendario, Productos y Métricas.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(`\n${(err as Error).message}`);
  await prisma.$disconnect();
  process.exit(1);
});
