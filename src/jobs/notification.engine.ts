import type { Job } from 'agenda';
import { getAgenda } from './agenda';
import { NotificationController } from '../controllers';
import {
  DAILY_PLANNER_MESSAGES,
  LUNCH_LOG_MESSAGES,
  DINNER_LOG_MESSAGES,
} from './notification-messages';

export type NotificationKey =
  | 'dailyPlanner'
  | 'lunchLogReminder'
  | 'dinnerLogReminder';

export const JOB_NAME = 'notification.send';

const pickRandom = <T>(items: T[]): T =>
  items[Math.floor(Math.random() * items.length)];

export const registerNotificationJobs = async () => {
  const ag = await getAgenda();

  ag.define(JOB_NAME, async (job: Job) => {
    const { userId, key } = job.attrs.data as {
      userId: string;
      key: NotificationKey;
    };

    const nc = new NotificationController();

    switch (key) {
      case 'dailyPlanner': {
        const msg = pickRandom(DAILY_PLANNER_MESSAGES);
        await nc.sendNotificationToUser(userId, {
          ...msg,
          data: { type: 'dailyPlanner' },
        });
        break;
      }
      case 'lunchLogReminder': {
        const msg = pickRandom(LUNCH_LOG_MESSAGES);
        await nc.sendNotificationToUser(userId, {
          ...msg,
          data: { type: 'lunchLogReminder' },
        });
        break;
      }
      case 'dinnerLogReminder': {
        const msg = pickRandom(DINNER_LOG_MESSAGES);
        await nc.sendNotificationToUser(userId, {
          ...msg,
          data: { type: 'dinnerLogReminder' },
        });
        break;
      }
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
