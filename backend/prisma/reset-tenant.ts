/**
 * Vacía las conversaciones y el catálogo de UN negocio, dejándolo como recién
 * dado de alta.
 *
 *   npm run reset:tenant -- correo@del.propietario           (solo enseña qué borraría)
 *   npm run reset:tenant -- correo@del.propietario --confirm (borra de verdad)
 *
 * Para qué: `seed:demo` llena el panel de clientes que no existen, y al pasar a
 * probar con WhatsApp de verdad esos datos estorban — enmascaran los mensajes
 * reales, inflan las métricas y ocultan la pantalla de bienvenida de la bandeja,
 * que solo aparece cuando no hay ninguna conversación.
 *
 * Sin `--confirm` no borra nada: solo cuenta. Un script que borra al invocarlo
 * es un accidente esperando a pasar, y aquí lo que se pierde son conversaciones.
 *
 * Lo que NO toca, porque no es dato de prueba:
 *   - El negocio y su equipo (usuarios, contraseñas, roles).
 *   - El perfil del negocio y los documentos de conocimiento: es configuración
 *     que costó escribir y que se quiere conservar entre pruebas.
 *   - La conexión con Google Calendar: es una cuenta real del propietario.
 * Para esos casos existe `--todo`, que además vacía perfil, conocimiento y
 * respuestas rápidas.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const [email, ...banderas] = process.argv.slice(2);
  if (!email) {
    throw new Error(
      'Falta el correo del propietario: npm run reset:tenant -- correo@ejemplo.com [--confirm] [--todo]',
    );
  }
  const confirmar = banderas.includes('--confirm');
  const todo = banderas.includes('--todo');

  const usuario = await prisma.user.findFirst({
    where: { email },
    select: { tenantId: true, tenant: { select: { name: true } } },
  });
  if (!usuario) throw new Error(`No existe ningún usuario con el correo ${email}.`);
  const tenantId = usuario.tenantId;

  console.log(`Negocio: "${usuario.tenant.name}" (${email})`);
  console.log(confirmar ? 'Modo: BORRADO REAL\n' : 'Modo: solo lectura (añade --confirm para borrar)\n');

  // El orden importa aunque haya cascadas: borrar los contactos se lleva por
  // delante conversaciones, mensajes, citas y recordatorios, y entonces los
  // recuentos que se imprimen ya no dirían la verdad. Se cuenta antes.
  const conteos = {
    mensajes: await prisma.message.count({ where: { tenantId } }),
    conversaciones: await prisma.conversation.count({ where: { tenantId } }),
    contactos: await prisma.contact.count({ where: { tenantId } }),
    citas: await prisma.appointment.count({ where: { tenantId } }),
    recordatorios: await prisma.reminder.count({ where: { tenantId } }),
    productos: await prisma.product.count({ where: { tenantId } }),
    'consumo de IA': await prisma.aiUsage.count({ where: { tenantId } }),
    'sesión de WhatsApp': await prisma.whatsappInstance.count({ where: { tenantId } }),
    ...(todo
      ? {
          'respuestas rápidas': await prisma.quickReply.count({ where: { tenantId } }),
          'documentos de conocimiento': await prisma.knowledgeDocument.count({ where: { tenantId } }),
          'perfil del negocio': await prisma.businessProfile.count({ where: { tenantId } }),
        }
      : {}),
  };

  for (const [etiqueta, n] of Object.entries(conteos)) {
    console.log(`  ${String(n).padStart(5)}  ${etiqueta}`);
  }

  const total = Object.values(conteos).reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log('\nNo hay nada que borrar: el negocio ya está limpio.');
    return;
  }

  if (!confirmar) {
    console.log('\nNada borrado. Repite con --confirm si es lo que quieres.');
    return;
  }

  // Una transacción: si algo falla a medias, el negocio no se queda con
  // conversaciones sin sus mensajes ni con citas de contactos que ya no existen.
  await prisma.$transaction(async (tx) => {
    // Los contactos arrastran en cascada conversaciones, mensajes, notas,
    // citas, recordatorios, consentimiento y memoria de la IA.
    await tx.contact.deleteMany({ where: { tenantId } });
    // Las que no cuelgan de ningún contacto van explícitas.
    await tx.appointment.deleteMany({ where: { tenantId } });
    await tx.reminder.deleteMany({ where: { tenantId } });
    await tx.product.deleteMany({ where: { tenantId } });
    // El consumo de IA de las pruebas falsearía el panel de métricas.
    await tx.aiUsage.deleteMany({ where: { tenantId } });
    // La sesión queda desvinculada aquí, pero sigue viva en el proveedor: para
    // cerrarla del todo hay que usar "Desconectar" en Canales.
    await tx.whatsappInstance.deleteMany({ where: { tenantId } });

    if (todo) {
      await tx.quickReply.deleteMany({ where: { tenantId } });
      await tx.knowledgeDocument.deleteMany({ where: { tenantId } });
      await tx.businessProfile.deleteMany({ where: { tenantId } });
    }
  });

  console.log('\nListo. El negocio queda como recién creado.');
  console.log('Se conservan el equipo y la conexión con Google Calendar.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
