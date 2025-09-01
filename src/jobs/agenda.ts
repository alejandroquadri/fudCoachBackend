import Agenda from 'agenda';

// Build your URL however you prefer. If you already have a util, import it.
// Example builder (replace if you have one elsewhere):
const getMongoUrl = (): string => {
  const user = process.env.DB_USER!;
  const password = process.env.DB_PASSWORD!;
  const dbName = process.env.DB_NAME!;
  // same cluster host you use in connection.ts
  return `mongodb+srv://${user}:${password}@cluster0.c6fei51.mongodb.net/${dbName}?retryWrites=true&w=majority`;
};

let agenda: Agenda | null = null;

export async function getAgenda(): Promise<Agenda> {
  if (agenda) return agenda;
  agenda = new Agenda({
    db: { address: getMongoUrl(), collection: 'agendaJobs' },
    processEvery: '30 seconds',
  });
  await agenda.start(); // start once
  return agenda;
}

export async function stopAgenda() {
  if (!agenda) return;
  await agenda.stop();
  agenda = null;
}
