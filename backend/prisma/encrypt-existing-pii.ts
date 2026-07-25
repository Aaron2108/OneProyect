/**
 * Migración única de datos: cifra en reposo el contenido de conversaciones
 * (Message.content, ConversationNote.body, Contact.notes) que se guardó en
 * claro antes de introducir el cifrado (ver docs/DECISIONS.md, 2026-07-23).
 * Idempotente: si un valor ya tiene el formato cifrado (`iv:tag:cifrado`, todo
 * hex), lo deja igual — se puede correr más de una vez sin riesgo.
 *
 * Uso: npx ts-node prisma/encrypt-existing-pii.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encryptSecret } from '../src/common/crypto.util';

const ENCRYPTED_FORMAT = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/;

async function main(): Promise<void> {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('Falta TOKEN_ENCRYPTION_KEY en el entorno');
  }
  const prisma = new PrismaClient();

  try {
    const messages = await prisma.message.findMany({ select: { id: true, content: true } });
    let migratedMessages = 0;
    for (const m of messages) {
      if (ENCRYPTED_FORMAT.test(m.content)) continue;
      await prisma.message.update({ where: { id: m.id }, data: { content: encryptSecret(m.content, key) } });
      migratedMessages++;
    }

    const notes = await prisma.conversationNote.findMany({ select: { id: true, body: true } });
    let migratedNotes = 0;
    for (const n of notes) {
      if (ENCRYPTED_FORMAT.test(n.body)) continue;
      await prisma.conversationNote.update({ where: { id: n.id }, data: { body: encryptSecret(n.body, key) } });
      migratedNotes++;
    }

    const contacts = await prisma.contact.findMany({
      where: { notes: { not: null } },
      select: { id: true, notes: true },
    });
    let migratedContacts = 0;
    for (const c of contacts) {
      if (!c.notes || ENCRYPTED_FORMAT.test(c.notes)) continue;
      await prisma.contact.update({ where: { id: c.id }, data: { notes: encryptSecret(c.notes, key) } });
      migratedContacts++;
    }

    console.log(`Mensajes cifrados: ${migratedMessages}/${messages.length}`);
    console.log(`Notas de conversación cifradas: ${migratedNotes}/${notes.length}`);
    console.log(`Notas de contacto cifradas: ${migratedContacts}/${contacts.length}`);
    await prisma.$disconnect();
  } catch (err) {
    await prisma.$disconnect();
    throw err;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
