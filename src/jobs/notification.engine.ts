import type { Job } from 'agenda';
import { getAgenda } from './agenda';
import { NotificationController } from '../controllers';

export type NotificationKey =
  | 'dailyPlanner'
  | 'lunchLogReminder'
  | 'dinnerLogReminder';
export const JOB_NAME = 'notification.send';

export const registerNotificationJobs = async () => {
  const ag = await getAgenda();
  ag.define(JOB_NAME, async (job: Job) => {
    const { userId, key } = job.attrs.data as {
      userId: string;
      key: NotificationKey;
    };
    const nc = new NotificationController();

    switch (key) {
      case 'dailyPlanner':
        await nc.sendNotificationToUser(userId, {
          title: 'Plan your day ✍️',
          body: 'Pequeño plan, grandes resultados. ¿Qué vas a comer hoy? ¿Algún desafío a la vista?',
          data: { type: 'dailyPlanner' },
        });
        break;
      case 'lunchLogReminder':
        await nc.sendNotificationToUser(userId, {
          title: 'Lunch time 🍽️',
          body: 'Anotá tu almuerzo ahora. Dos toques y listo.',
          data: { type: 'lunchLogReminder' },
        });
        break;
      case 'dinnerLogReminder':
        await nc.sendNotificationToUser(userId, {
          title: 'Dinner check-in 🌙',
          body: 'Antes de cerrar el día, registrá tu cena y cómo te fue.',
          data: { type: 'dinnerLogReminder' },
        });
        break;
      default:
        break;
    }
  });
};

// utils
const isHHmm = (s: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(s);
const toCron = (hhmm: string) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return `${mm} ${hh} * * *`;
};

export const cancelUserJob = async (userId: string, key: NotificationKey) => {
  const ag = await getAgenda();
  await ag.cancel({ name: JOB_NAME, 'data.userId': userId, 'data.key': key });
};

export const scheduleUserDailyJob = async (
  userId: string,
  key: NotificationKey,
  hourLocal: string,
  timezone: string
) => {
  if (!isHHmm(hourLocal))
    throw new Error('hourLocal must be "HH:mm" 24h format');
  const ag = await getAgenda();
  const cron = toCron(hourLocal);

  const job = ag.create(JOB_NAME, { userId, key });
  job.repeatEvery(cron, { timezone, skipImmediate: true });
  await job.save();
};
